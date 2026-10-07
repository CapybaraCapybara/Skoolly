import re
import urllib.parse
from difflib import SequenceMatcher
from typing import Dict, Any, List, Optional, Tuple
from isat_scraper import fetch_isat_schools
from data_manager import load_schools, save_schools
from supabase_sync import get_current_dsn, psycopg, dict_row, db_connect

# คำทั่วไปที่ไม่ช่วยแยกโรงเรียน (รวมคำสะกดผิดที่พบจริงในชื่อ EN ของ สช.)
# ตั้งใจไม่ตัดคำบอกที่ตั้ง เช่น bangkok / sukhumvit / thonburi เพราะเป็นตัวแยกวิทยาเขตของโรงเรียนเครือเดียวกัน
_GENERIC_WORDS = {
    "international", "internatiomal", "internaional", "intemational", "internatopnal", "internation",
    "school", "schools", "the", "of", "and", "at", "campus", "section",
    "kindergarten", "kinderga", "kinder", "preschool", "pre",
}

_THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")

# เกณฑ์ขั้นต่ำของคะแนนรวมที่จะยอมรับว่าเป็นโรงเรียนเดียวกัน (ปรับจากผลจริงของรายชื่อ ISAT เทียบ สช. เมื่อ 2026-10-04: จับคู่ได้ 206/207)
MATCH_THRESHOLD = 0.62


def normalize_name(s: str) -> str:
    """ชื่อโรงเรียนเป็นตัวพิมพ์เล็ก ตัดเครื่องหมาย และรวมอักษรเดี่ยวติดกัน ("q s i" -> "qsi")"""
    if not s:
        return ""
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b((?:[a-z] ){1,}[a-z])\b", lambda m: m.group(1).replace(" ", ""), s)
    return re.sub(r"\s+", " ", s).strip()


def name_tokens(s: str) -> List[str]:
    return [t for t in normalize_name(s).split() if t not in _GENERIC_WORDS]


def extract_domain(url: str) -> str:
    if not url:
        return ""
    try:
        if not url.startswith("http"):
            url = "https://" + url
        netloc = urllib.parse.urlparse(url).netloc.lower()
        return re.sub(r"^www\.", "", netloc)
    except Exception:
        return ""


def extract_postcode(address: str) -> str:
    """รหัสไปรษณีย์ 5 หลักตัวสุดท้ายในที่อยู่ (รองรับเลขไทย)"""
    if not address:
        return ""
    codes = re.findall(r"(?<!\d)(\d{5})(?!\d)", address.translate(_THAI_DIGITS))
    return codes[-1] if codes else ""


def _name_similarity(a: List[str], b: List[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    # token เดียวกันถ้าสะกดเหมือน หรือรวมคำแล้วเหมือน ("chiang rai" vs "chiangrai")
    common = len(sa & sb)
    if "".join(a) == "".join(b):
        return 1.0
    containment = common / min(len(sa), len(sb))
    jaccard = common / len(sa | sb)
    ratio = SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()
    return 0.4 * containment + 0.3 * jaccard + 0.3 * ratio


def score_pair(isat: Dict[str, Any], opec: Dict[str, Any]) -> float:
    """คะแนนว่าโรงเรียน ISAT กับ สช. เป็นแห่งเดียวกัน: ชื่อเป็นหลัก ปรับด้วยรหัสไปรษณีย์และโดเมน

    โดเมนให้น้ำหนักน้อยโดยตั้งใจ — โรงเรียนเครือ (SISB, Wells, Anglo Singapore ฯลฯ) ใช้โดเมนเดียวกันทุกวิทยาเขต
    ถ้าใช้โดเมนเป็นตัวตัดสินจะทำให้ทุกวิทยาเขตไปลงที่ สช. แถวเดียว
    """
    score = _name_similarity(isat["_tokens"], opec["_tokens"])

    pi, po = isat["_postcode"], opec["_postcode"]
    if pi and po:
        if pi == po:
            score += 0.3
        elif pi[:2] == po[:2]:
            score += 0.05
        else:
            score -= 0.4  # คนละจังหวัด: แทบเป็นไปไม่ได้ที่จะเป็นแห่งเดียวกัน

    di, do = isat["_domain"], opec["_domain"]
    if di and do and di == do:
        score += 0.1
    return score


def match_isat_to_opec(
    isat_schools: List[Dict[str, Any]], opec_schools: List[Dict[str, Any]]
) -> Tuple[List[Tuple[Dict[str, Any], Dict[str, Any], float]], List[Dict[str, Any]]]:
    """จับคู่แบบหนึ่งต่อหนึ่ง: เรียงทุกคู่ตามคะแนนแล้วเลือกคู่ที่ดีที่สุดก่อน
    โรงเรียน สช. หนึ่งแห่งรับสมาชิก ISAT ได้รายการเดียว (กันหลายวิทยาเขตไปลงแถวเดียวกัน)

    คืนค่า (รายการคู่ (isat, opec, score), รายการ ISAT ที่จับคู่ไม่ได้)
    """
    for i in isat_schools:
        i["_tokens"] = name_tokens(i.get("name", ""))
        i["_postcode"] = extract_postcode(i.get("address", ""))
        i["_domain"] = extract_domain(i.get("website", ""))
    for o in opec_schools:
        o["_tokens"] = name_tokens(o.get("school_name_en", ""))
        o["_postcode"] = extract_postcode(o.get("address", ""))
        o["_domain"] = extract_domain(o.get("website", ""))

    candidates = []
    for ii, i in enumerate(isat_schools):
        for oi, o in enumerate(opec_schools):
            s = score_pair(i, o)
            if s >= MATCH_THRESHOLD:
                candidates.append((s, ii, oi))
    candidates.sort(key=lambda c: c[0], reverse=True)

    used_isat, used_opec = set(), set()
    pairs = []
    for s, ii, oi in candidates:
        if ii in used_isat or oi in used_opec:
            continue
        used_isat.add(ii)
        used_opec.add(oi)
        pairs.append((isat_schools[ii], opec_schools[oi], s))

    unmatched = [i for ii, i in enumerate(isat_schools) if ii not in used_isat]

    for rec in isat_schools + opec_schools:
        for k in ("_tokens", "_postcode", "_domain"):
            rec.pop(k, None)
    return pairs, unmatched


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


def _fill_from_supabase(opec_schools: List[Dict[str, Any]], dsn: Optional[str]) -> None:
    """ไฟล์ในเครื่องมักมีเว็บไซต์ไม่ครบ (เว็บไซต์ที่ค้นเจอภายหลังอยู่ใน Supabase) — เติมช่องที่ว่างจาก DB ก่อนจับคู่"""
    if not (dsn and psycopg):
        return
    try:
        with db_connect(dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT opec_school_code, name_en, official_website_url, address FROM school_data.schools"
                )
                rows = {r["opec_school_code"]: r for r in cur.fetchall()}
    except Exception as e:
        print(f"[ISAT] อ่านข้อมูลจาก Supabase ไม่ได้ ใช้ไฟล์ในเครื่องอย่างเดียว: {e}")
        return
    for s in opec_schools:
        r = rows.get(s.get("school_code"))
        if not r:
            continue
        if not s.get("website") and r.get("official_website_url"):
            s["website"] = r["official_website_url"]
        if not s.get("school_name_en") and r.get("name_en"):
            s["school_name_en"] = r["name_en"]
        if not s.get("address") and r.get("address"):
            s["address"] = r["address"]


def _fill_from_registry(opec_schools: List[Dict[str, Any]]) -> None:
    """เว็บไซต์ที่ยังว่าง เติมจากทะเบียนเว็บไซต์ที่ยืนยันแล้ว (ใช้ได้แม้ไม่มี Supabase และก่อนรันขั้นค้นหา Website)"""
    try:
        from fetch_official_websites import load_verified_registry
        registry = load_verified_registry()
    except Exception as e:
        print(f"[ISAT] อ่านทะเบียนเว็บไซต์ไม่ได้: {e}")
        return
    for s in opec_schools:
        url = registry.get(s.get("school_code"))
        if url and not s.get("website"):
            s["website"] = url


def run_isat_enrichment(apply_to_db: bool = True, progress_callback=None) -> Dict[str, Any]:
    """
    ดึงรายชื่อสมาชิก ISAT ทั้งหมด จับคู่กับโรงเรียน สช. แบบหนึ่งต่อหนึ่ง
    แล้วอัปเดตทั้งไฟล์ในเครื่องและ Supabase (รวมถึงล้างธงสมาชิกของโรงเรียนที่ไม่ได้อยู่ใน ISAT แล้ว)
    """
    def log(msg, cur=0, tot=100, task="กำลังซิงค์ข้อมูลสมาคม ISAT..."):
        print(msg)
        if progress_callback:
            progress_callback(task, cur, tot, msg)

    log("กำลังดึงข้อมูลโรงเรียนสมาชิกจากสมาคม ISAT (isat.or.th)...", 10, 100)
    isat_schools = fetch_isat_schools()
    log(f"ดึงข้อมูลสมาคม ISAT สำเร็จ: พบทั้งหมด {len(isat_schools)} โรงเรียน", 30, 100)

    opec_schools = load_schools()
    # Every member missing from this list loses its flag below, here and in Supabase. A list
    # far shorter than what we already flag means the ISAT page changed, not that half the
    # association left overnight.
    flagged = sum(1 for s in opec_schools if s.get("is_isat_member"))
    if not isat_schools or len(isat_schools) < 0.5 * flagged:
        raise RuntimeError(f"ISAT ส่งรายชื่อมา {len(isat_schools)} โรงเรียน แต่ตอนนี้มีสมาชิกที่จับคู่ไว้ {flagged} แห่ง "
                           "ดูผิดปกติ (หน้าเว็บ ISAT อาจเปลี่ยน) จึงไม่ล้างธงสมาชิก")
    dsn = get_current_dsn() if apply_to_db else None
    # จับคู่บนสำเนา: ช่องที่เติมจาก Supabase ใช้ช่วยจับคู่เท่านั้น ไม่ถูกบันทึกทับไฟล์ในเครื่อง
    match_view = [dict(s) for s in opec_schools]
    _fill_from_supabase(match_view, dsn)
    _fill_from_registry(match_view)
    by_code = {s.get("school_code"): s for s in opec_schools}
    log(f"โหลดข้อมูล สช.: {len(opec_schools)} โรงเรียน", 40, 100)

    pairs, unmatched = match_isat_to_opec(isat_schools, match_view)
    matched_count = len(pairs)

    matched_codes = set()
    matched_results: List[Dict[str, Any]] = []
    for isat, view, score in pairs:
        opec = by_code[view.get("school_code")]
        matched_codes.add(opec.get("school_code"))
        opec["is_isat_member"] = True
        opec["isat_school_name"] = isat["name"]
        opec["is_boarding"] = isat.get("is_boarding", False)
        if isat.get("year_established"):
            opec["year_established"] = isat["year_established"]
        opec["accreditations"] = isat.get("accreditations") or []
        if isat.get("logo_url") and not opec.get("school_logo_url"):
            opec["school_logo_url"] = isat["logo_url"]

        matched_results.append({
            "school_code": opec.get("school_code"),
            "opec_name_en": view.get("school_name_en"),
            "isat_name": isat["name"],
            "score": round(score, 2),
            "accreditations": isat.get("accreditations"),
            "year_established": isat.get("year_established"),
            "is_boarding": isat.get("is_boarding"),
            "logo_url": isat.get("logo_url"),
            "website": isat.get("website"),
        })

    # โรงเรียนที่เคยถูกติดธงแต่รอบนี้ไม่ตรงกับ ISAT รายการใด: ล้างข้อมูลที่มาจาก ISAT ออก
    for s in opec_schools:
        if s.get("school_code") not in matched_codes and s.get("is_isat_member"):
            s["is_isat_member"] = False
            s["isat_school_name"] = None
            s["is_boarding"] = False
            s["accreditations"] = []

    log(f"จับคู่โรงเรียน ISAT กับ สช. สำเร็จ: {matched_count} / {len(isat_schools)} โรงเรียน", 60, 100)
    for u in unmatched:
        log(f"  ไม่พบใน สช.: {u['name']} ({u.get('address', '')})", 60, 100)

    save_schools(opec_schools)
    log("บันทึกข้อมูลสมาชิก ISAT ลงไฟล์ในเครื่องเรียบร้อยแล้ว", 70, 100)

    db_updated = 0
    db_cleared = 0
    if apply_to_db and dsn and psycopg:
        try:
            log("กำลังบันทึกข้อมูลสมาชิก ISAT, การรับรองมาตรฐาน และโลโก้สู่ Supabase...", 80, 100)
            with db_connect(dsn, row_factory=dict_row) as conn:
                ensure_isat_columns_in_supabase(conn)
                with conn.cursor() as cur:
                    # ล้างธงของแถวที่ไม่อยู่ในผลจับคู่รอบนี้ (ผลผิดจากรอบก่อน หรือโรงเรียนที่ออกจากสมาคม)
                    cur.execute("""
                        UPDATE school_data.schools
                        SET is_isat_member = FALSE,
                            isat_school_name = NULL,
                            is_boarding = FALSE,
                            accreditations = '{}',
                            updated_at = NOW()
                        WHERE is_isat_member = TRUE
                          AND NOT (opec_school_code = ANY(%s));
                    """, (list(matched_codes),))
                    db_cleared = cur.rowcount

                    for m in matched_results:
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
                            m["is_boarding"],
                            m["year_established"],
                            m["accreditations"] or [],
                            m["isat_name"],
                            m["logo_url"],
                            m["school_code"],
                        ))
                        if cur.rowcount > 0:
                            db_updated += 1
                    conn.commit()
            log(f"บันทึกข้อมูล ISAT สู่ Supabase สำเร็จ: อัปเดต {db_updated} โรงเรียน, ล้างธงเดิม {db_cleared} โรงเรียน", 100, 100)
        except Exception as e:
            log(f"เกิดข้อผิดพลาดในการบันทึก Supabase: {e}", 100, 100)

    supabase_note = (f"Supabase: อัปเดต {db_updated} / ล้างธง {db_cleared}" if apply_to_db and dsn and psycopg
                     else "ไม่ได้บันทึก Supabase")
    log(
        f"ซิงค์ ISAT เสร็จแล้ว (จับคู่ได้ {matched_count} จาก {len(isat_schools)} รร., "
        f"ไม่พบใน สช. {len(unmatched)} รร., {supabase_note})",
        100, 100,
    )

    return {
        "isat_total": len(isat_schools),
        "matched_count": matched_count,
        "unmatched": [{"name": u["name"], "address": u.get("address", "")} for u in unmatched],
        "db_updated": db_updated,
        "db_cleared": db_cleared,
        "samples": matched_results[:5],
    }


if __name__ == "__main__":
    res = run_isat_enrichment(apply_to_db=True)
    print("Result summary:", {k: v for k, v in res.items() if k != "samples"})
