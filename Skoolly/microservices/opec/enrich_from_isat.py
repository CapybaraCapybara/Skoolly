import os
import re
import urllib.parse
from typing import Dict, Any, List, Optional
from isat_scraper import fetch_isat_schools
from data_manager import load_schools, save_schools
from supabase_sync import get_current_dsn, psycopg, dict_row, db_connect

def normalize_name(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r'[\'\".,\(\)\-\_]', ' ', s)
    s = re.sub(r'\b(international|school|bangkok|campus|academy|the)\b', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def extract_domain(url: str) -> str:
    if not url:
        return ""
    try:
        if not url.startswith('http'):
            url = 'https://' + url
        netloc = urllib.parse.urlparse(url).netloc.lower()
        netloc = re.sub(r'^www\.', '', netloc)
        return netloc
    except Exception:
        return ""

def ensure_isat_columns_in_supabase(conn) -> None:
    """Safety net เท่านั้น — คอลัมน์ชุดนี้ประกาศไว้ใน db/schema.sql แล้วตั้งแต่ v6.5

    เดิมฟังก์ชันนี้เป็นที่เดียวที่สร้างคอลัมน์ ISAT ทำให้ schema จริงกับ db/schema.sql
    ไม่ตรงกัน (schema drift) ตอนนี้ db/schema.sql เป็นแหล่งความจริงเดียวแล้ว
    คงฟังก์ชันไว้เพื่อให้ฐานข้อมูลเก่าที่ยังไม่ได้รัน schema ใหม่ยังทำงานต่อได้
    """
    sql = """
    ALTER TABLE school_data.schools 
    ADD COLUMN IF NOT EXISTS is_isat_member BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_boarding BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS year_established INTEGER,
    ADD COLUMN IF NOT EXISTS accreditations TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS isat_school_name TEXT;
    """
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

def run_isat_enrichment(apply_to_db: bool = True, progress_callback=None) -> Dict[str, Any]:
    """
    Fetches all 207 ISAT schools, matches with OPEC 291 schools,
    and updates both local dataset and Supabase Database.
    """
    def log(msg, cur=0, tot=100, task="กำลังซิงค์ข้อมูล ISAT (207 รร.)..."):
        print(msg)
        if progress_callback:
            progress_callback(task, cur, tot, msg)

    log("กำลังดึงข้อมูลโรงเรียนสมาชิกจากสมาคม ISAT (isat.or.th)...", 10, 100)
    isat_schools = fetch_isat_schools()
    log(f"ดึงข้อมูลสมาคม ISAT สำเร็จ: พบทั้งหมด {len(isat_schools)} โรงเรียน", 30, 100)

    opec_schools = load_schools()
    log(f"โหลดข้อมูล OPEC ในเครื่อง: {len(opec_schools)} โรงเรียน", 40, 100)

    # Index OPEC schools by domain and normalized name
    domain_map: Dict[str, Dict[str, Any]] = {}
    for s in opec_schools:
        d = extract_domain(s.get("website", ""))
        if d:
            domain_map[d] = s

    matched_count = 0
    matched_results: List[Dict[str, Any]] = []

    for isat in isat_schools:
        isat_name = isat['name']
        isat_norm = normalize_name(isat_name)
        isat_domain = extract_domain(isat.get('website', ''))
        
        matched_opec: Optional[Dict[str, Any]] = None

        # 1. Match by domain
        if isat_domain and isat_domain in domain_map:
            matched_opec = domain_map[isat_domain]
        
        # 2. Match by exact normalized name or alias
        if not matched_opec and isat_norm:
            for s in opec_schools:
                en_norm = normalize_name(s.get("school_name_en", ""))
                if not en_norm:
                    continue
                # Exact or prefix match
                if en_norm == isat_norm or en_norm.startswith(isat_norm) or isat_norm.startswith(en_norm):
                    matched_opec = s
                    break
                # Compact match (handles "hat yai" vs "hatyai", "q s i" vs "qsi")
                if en_norm.replace(' ', '') == isat_norm.replace(' ', ''):
                    matched_opec = s
                    break
                if ('qsi' in isat_norm and 'phuket' in isat_norm) and (s.get('school_code') == '1183700002' or 'q s i' in en_norm or 'qsi' in en_norm):
                    matched_opec = s
                    break
                if 'southern' in isat_norm and 'hatyai' in isat_norm.replace(' ', '') and 'southern' in en_norm and 'hatyai' in en_norm.replace(' ', ''):
                    matched_opec = s
                    break

        if matched_opec:
            matched_count += 1
            # Update local record
            matched_opec['is_isat_member'] = True
            matched_opec['is_boarding'] = isat.get('is_boarding', False)
            if isat.get('year_established'):
                matched_opec['year_established'] = isat['year_established']
            if isat.get('accreditations'):
                matched_opec['accreditations'] = isat['accreditations']
            if isat.get('logo_url') and not matched_opec.get('school_logo_url'):
                matched_opec['school_logo_url'] = isat['logo_url']

            matched_results.append({
                'school_code': matched_opec.get('school_code'),
                'opec_name_en': matched_opec.get('school_name_en'),
                'isat_name': isat_name,
                'accreditations': isat.get('accreditations'),
                'year_established': isat.get('year_established'),
                'is_boarding': isat.get('is_boarding'),
                'logo_url': isat.get('logo_url'),
                'website': isat.get('website')
            })

    log(f"วิเคราะห์และจับคู่โรงเรียน ISAT กับ OPEC สำเร็จ: {matched_count} / {len(isat_schools)} โรงเรียน", 60, 100)

    # Save to local files (JSON & CSV)
    save_schools(opec_schools)
    log("บันทึกข้อมูลและสัญลักษณ์ ISAT ลง Local Dataset เรียบร้อยแล้ว", 70, 100)

    # Update Supabase if requested
    db_updated = 0
    if apply_to_db:
        dsn = get_current_dsn()
        if dsn and psycopg:
            try:
                log("กำลังบันทึกข้อมูลสมาชิก ISAT, เครื่องหมายรับรอง, และ Logo สู่ Supabase...", 80, 100)
                with db_connect(dsn, row_factory=dict_row) as conn:
                    ensure_isat_columns_in_supabase(conn)
                    with conn.cursor() as cur:
                        for m in matched_results:
                            code = m['school_code']
                            cur.execute("""
                                UPDATE school_data.schools
                                SET is_isat_member = TRUE,
                                    is_boarding = %s,
                                    year_established = COALESCE(%s, year_established),
                                    accreditations = %s,
                                    isat_school_name = %s,
                                    logo_url = COALESCE(logo_url, %s),
                                    updated_at = NOW()
                                WHERE opec_school_code = %s;
                            """, (
                                m['is_boarding'],
                                m['year_established'],
                                m['accreditations'] or [],
                                m['isat_name'],
                                m['logo_url'],
                                code
                            ))
                            if cur.rowcount > 0:
                                db_updated += 1
                        conn.commit()
                log(f"บันทึกข้อมูล ISAT สู่ Supabase สำเร็จ: อัปเดต {db_updated} โรงเรียน", 100, 100)
            except Exception as e:
                log(f"เกิดข้อผิดพลาดในการบันทึก Supabase: {e}", 100, 100)

    log(f"กระบวนการซิงค์ ISAT เสร็จสมบูรณ์! (จับคู่ได้ {matched_count} จาก {len(isat_schools)} รร., Supabase: +{db_updated})", 100, 100)

    return {
        "isat_total": len(isat_schools),
        "matched_count": matched_count,
        "db_updated": db_updated,
        "samples": matched_results[:5]
    }

if __name__ == '__main__':
    res = run_isat_enrichment(apply_to_db=True)
    print("Result summary:", res)
