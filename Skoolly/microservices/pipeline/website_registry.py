"""
website_registry.py
Module for managing the Verified Official Website Registry:
- Dual-sync with reference/schoolAndURL.txt and Supabase Database (school_data.schools)
- Auditable status: Verified Official, OPEC Profile, AI Probed, or Missing
- Real-time live URL ping / verification
"""

import os
import re
import threading
import time
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import load_schools, save_schools
from supabase_sync import get_current_dsn, psycopg, dict_row, db_connect, admin_edit, tag_versions
from fetch_official_websites import reset_verified_registry, check_link

health_lock = threading.Lock()
health_state: Dict[str, Any] = {
    "is_running": False,
    "current": 0,
    "total": 0,
    "percent": 0,
    "broken_count": 0,
    "healthy_count": 0,
    "message": "",
    "last_run_at": None,
}

def find_reference_file() -> str:
    """Locates reference/schoolAndURL.txt relative to repository root."""
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        for candidate in (os.path.join(d, "reference", "schoolAndURL.txt"),
                          os.path.join(d, "schoolAndURL.txt")):
            if os.path.exists(candidate):
                return candidate
        d = os.path.dirname(d)
    return ""

REFERENCE_FILE = find_reference_file()

def read_school_and_url_txt() -> Dict[str, Dict[str, str]]:
    """
    Parses reference/schoolAndURL.txt into a dict:
    code -> { 'index': int, 'name_en': str, 'name_th': str, 'url': str }
    """
    entries: Dict[str, Dict[str, str]] = {}
    if not REFERENCE_FILE or not os.path.exists(REFERENCE_FILE):
        return entries

    with open(REFERENCE_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            m = re.search(r'\[(\d+)\s*-\s*(\d+)\]\s*(.*?)\s*\((.*?)\)\s*-\s*(https?://[^\s\)]+)?', line)
            if m:
                idx = m.group(1).strip()
                code = m.group(2).strip()
                name_en = m.group(3).strip()
                name_th = m.group(4).strip()
                url = (m.group(5) or "").strip().rstrip('/')
                entries[code] = {
                    "index": idx,
                    "code": code,
                    "name_en": name_en,
                    "name_th": name_th,
                    "url": url,
                }
            else:
                # Fallback pattern without URL
                m2 = re.search(r'\[(\d+)\s*-\s*(\d+)\]\s*(.*?)\s*\((.*?)\)', line)
                if m2:
                    idx = m2.group(1).strip()
                    code = m2.group(2).strip()
                    name_en = m2.group(3).strip()
                    name_th = m2.group(4).strip()
                    entries[code] = {
                        "index": idx,
                        "code": code,
                        "name_en": name_en,
                        "name_th": name_th,
                        "url": "",
                    }
    return entries

def write_school_and_url_txt(entries: Dict[str, Dict[str, str]]) -> bool:
    """Persists entries back to reference/schoolAndURL.txt maintaining clean formatting."""
    if not REFERENCE_FILE:
        return False
    try:
        # Sort by integer index if possible
        sorted_keys = sorted(entries.keys(), key=lambda k: int(entries[k].get("index", 9999)))
        lines = []
        for k in sorted_keys:
            e = entries[k]
            idx = e.get("index", "0")
            code = e.get("code", k)
            en = e.get("name_en", "")
            th = e.get("name_th", "")
            url = e.get("url", "").strip()
            if url:
                lines.append(f"[{idx} - {code}] {en} ({th}) - {url}")
            else:
                lines.append(f"[{idx} - {code}] {en} ({th}) - ")
        with open(REFERENCE_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        return True
    except Exception as e:
        print("[Website Registry] Error writing schoolAndURL.txt:", e)
        return False

def get_full_registry_status() -> Dict[str, Any]:
    """
    Returns full audit status of all schools' URLs from Supabase & reference list.
    """
    txt_entries = read_school_and_url_txt()
    schools = load_schools() or []
    
    # Also fetch from Supabase if connected
    dsn = get_current_dsn()
    db_schools_map = {}
    db_registry_map = {}
    if dsn and psycopg:
        try:
            with db_connect(dsn, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    # 1. Active schools
                    cur.execute("SELECT opec_school_code, name_th, name_en, official_website_url, website_source, province, "
                                "current_published_version_id::text AS version_id FROM school_data.schools")
                    for row in cur.fetchall():
                        db_schools_map[row["opec_school_code"]] = row
                    
                    # 2. Permanent Official Website Registry
                    cur.execute("SELECT school_code, school_name_th, school_name_en, website_url, is_verified, source, verified_at, verified_by, http_status, last_checked_at, is_broken, error_reason FROM school_data.official_website_registry")
                    for row in cur.fetchall():
                        db_registry_map[row["school_code"]] = row
        except Exception as e:
            print("[Website Registry] Error reading Supabase:", e)

    items = []
    verified_count = 0
    opec_count = 0
    probed_count = 0
    missing_count = 0

    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "")
        db_s = db_schools_map.get(code, {})
        db_reg = db_registry_map.get(code, {})
        txt_e = txt_entries.get(code, {})

        # Priority of URLs: what the site uses now (the website step's decision, health-checked on
        # the same run), then the registry, the local JSON and the reference text
        current_url = db_s.get("official_website_url") or db_reg.get("website_url") or s.get("website") or txt_e.get("url") or ""
        source = db_s.get("website_source") or db_reg.get("source") or s.get("website_source") or ("Verified Official Registry" if txt_e.get("url") else "Not Checked")
        
        # Determine verified status from permanent registry first
        is_verified = bool(db_reg.get("is_verified")) or "Verified" in source or (bool(txt_e.get("url")) and txt_e.get("url") == current_url)
        if is_verified and current_url:
            status = "verified"
            verified_count += 1
        elif "OPEC" in source:
            status = "opec"
            opec_count += 1
        elif current_url:
            status = "probed"
            probed_count += 1
        else:
            status = "missing"
            missing_count += 1

        v_at = db_reg.get("verified_at")
        v_at_str = ""
        v_at_display = ""
        if v_at:
            try:
                v_at_str = v_at.isoformat()
                v_at_display = v_at.strftime("%d/%m/%Y %H:%M:%S")
            except Exception:
                v_at_str = str(v_at)
                v_at_display = str(v_at)

        # Health Check data
        is_broken = bool(db_reg.get("is_broken"))
        http_status = db_reg.get("http_status")
        error_reason = db_reg.get("error_reason") or ""
        last_chk = db_reg.get("last_checked_at")
        last_chk_str = ""
        last_chk_display = ""
        if last_chk:
            try:
                last_chk_str = last_chk.isoformat()
                last_chk_display = last_chk.strftime("%d/%m/%Y %H:%M:%S")
            except Exception:
                last_chk_str = str(last_chk)
                last_chk_display = str(last_chk)

        items.append({
            "school_code": code,
            "school_name_th": s.get("school_name_th") or db_s.get("name_th") or db_reg.get("school_name_th") or txt_e.get("name_th") or "",
            "school_name_en": s.get("school_name_en") or db_s.get("name_en") or db_reg.get("school_name_en") or txt_e.get("name_en") or "",
            "province": s.get("province") or db_s.get("province") or "",
            "website": current_url,
            "website_source": source,
            "is_verified": is_verified,
            "status": status,
            "ref_url": txt_e.get("url", ""),
            "verified_at": v_at_str,
            "verified_at_display": v_at_display,
            "verified_by": db_reg.get("verified_by") or ("Admin" if is_verified else ""),
            "http_status": http_status,
            "is_broken": is_broken,
            "error_reason": error_reason,
            "last_checked_at": last_chk_str,
            "last_checked_at_display": last_chk_display,
            "version_id": db_s.get("version_id"),   # the published version the page shows; sent back on save
        })

    broken_count = sum(1 for i in items if i.get("is_broken"))
    healthy_count = sum(1 for i in items if i.get("website") and not i.get("is_broken") and i.get("http_status") is not None)

    return {
        "total": len(items),
        "with_website": verified_count + opec_count + probed_count,
        "verified_count": verified_count,
        "opec_count": opec_count,
        "probed_count": probed_count,
        "missing_count": missing_count,
        "broken_count": broken_count,
        "healthy_count": healthy_count,
        "health_state": get_health_state(),
        "items": items,
    }

# The admin-confirmed URL of one school; every later website run keeps it (fetch_official_websites)
_REGISTRY_UPSERT = """
    INSERT INTO school_data.official_website_registry
        (school_code, school_name_th, school_name_en, website_url, is_verified, source, verified_at, verified_by, updated_at)
    VALUES
        (%(code)s, %(name_th)s, %(name_en)s, %(web)s, %(is_verified)s, %(src)s,
         CASE WHEN %(is_verified)s THEN NOW() ELSE NULL END, 'Admin', NOW())
    ON CONFLICT (school_code) DO UPDATE
    SET
        website_url = EXCLUDED.website_url,
        is_verified = EXCLUDED.is_verified,
        source = EXCLUDED.source,
        verified_at = CASE WHEN EXCLUDED.is_verified THEN NOW() ELSE school_data.official_website_registry.verified_at END,
        verified_by = 'Admin',
        updated_at = NOW()
    RETURNING verified_at
"""


def _keep_local_copies(school_code: str, website: str, source: str) -> None:
    """The local dataset and reference/schoolAndURL.txt follow the link the database now holds, and the
    website step drops its cached registry so its next run does not put the old URL back."""
    schools = load_schools()
    name_th = name_en = ""
    for s in schools:
        if s.get("school_code") == school_code:
            s["website"] = website
            s["website_source"] = source
            s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
            name_th = s.get("school_name_th", "")
            name_en = s.get("school_name_en", "")
            save_schools(schools)
            break

    txt_entries = read_school_and_url_txt()
    if school_code in txt_entries:
        txt_entries[school_code]["url"] = website
        if name_en:
            txt_entries[school_code]["name_en"] = name_en
        if name_th:
            txt_entries[school_code]["name_th"] = name_th
        write_school_and_url_txt(txt_entries)
    reset_verified_registry()


def verify_or_update_school_url(school_code: str, website: str, is_verified: bool = True,
                                expected_version_id: str | None = None) -> Dict[str, Any]:
    """An admin's link for one school. The URL registry and schools change in one transaction, which makes an
    'admin' version (admin_edit; VersionConflict when the page showed an older published version), then the
    local copies follow."""
    school_code = str(school_code).strip()
    website = (website or "").strip().rstrip('/')
    source = "Verified Official Registry" if is_verified else "Manual Edit"

    with admin_edit(school_code, "edit_website", expected_version_id) as (cur, school):
        verified_at = cur.execute(_REGISTRY_UPSERT, {
            "code": school_code, "name_th": school["name_th"], "name_en": school["name_en"] or "",
            "web": website, "is_verified": is_verified, "src": source,
        }).fetchone()["verified_at"]
        version_id = cur.execute(
            """
            UPDATE school_data.schools
            SET official_website_url = %(web)s,
                website_source = %(src)s,
                website_confirmed_at = CASE WHEN %(is_verified)s THEN NOW() ELSE website_confirmed_at END,
                updated_at = NOW()
            WHERE school_id = %(id)s
            RETURNING current_published_version_id::text AS version_id
            """,
            {"web": website, "src": source, "id": school["school_id"], "is_verified": is_verified},
        ).fetchone()["version_id"]
    _keep_local_copies(school_code, website, source)

    return {
        "status": "success",
        "school_code": school_code,
        "website": website,
        "website_source": source,
        "is_verified": is_verified,
        "verified_at": verified_at.isoformat() if verified_at else "",
        "verified_at_display": verified_at.strftime("%d/%m/%Y %H:%M:%S") if verified_at else "",
        "verified_by": "Admin",
        "version_id": version_id,
    }


def remember_restored_url(school_code: str, website: str, source: str) -> None:
    """After a rollback brought back an older link: the registry and the local copies follow it, as they do
    for a link an admin typed, so the next website run does not undo the rollback."""
    with db_connect(get_current_dsn(), row_factory=dict_row) as conn:
        names = conn.execute("SELECT name_th, name_en FROM school_data.schools WHERE opec_school_code = %s",
                             (school_code,)).fetchone() or {}
        conn.execute(_REGISTRY_UPSERT, {"code": school_code, "name_th": names.get("name_th") or "",
                                        "name_en": names.get("name_en") or "", "web": website or "",
                                        "is_verified": True, "src": "Verified Official Registry"})
        conn.commit()
    _keep_local_copies(school_code, website or "", source or "Verified Official Registry")

def bulk_sync_from_reference_txt() -> Dict[str, Any]:
    """
    Imports all 284 URLs from reference/schoolAndURL.txt directly into Supabase and local JSON
    as 'Verified Official Registry'.
    """
    txt_entries = read_school_and_url_txt()
    if not txt_entries:
        return {"status": "error", "message": "ไม่พบไฟล์ reference/schoolAndURL.txt"}

    schools = load_schools() or []
    synced_local = 0
    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "").strip()
        if code in txt_entries:
            ref_url = txt_entries[code].get("url", "").strip()
            if ref_url:
                s["website"] = ref_url
                s["website_source"] = "Verified Official Registry"
                s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
                synced_local += 1
    save_schools(schools)

    # Sync to Supabase
    dsn = get_current_dsn()
    synced_supabase = 0
    if dsn and psycopg:
        try:
            with db_connect(dsn) as conn:
                with conn.cursor() as cur:
                    tag_versions(cur, "bulk_import", "registry_sync")   # a changed link becomes a version
                    for code, e in txt_entries.items():
                        url = e.get("url", "").strip()
                        if url:
                            cur.execute(
                                """
                                UPDATE school_data.schools
                                SET official_website_url = %(web)s,
                                    website_source = 'Verified Official Registry',
                                    updated_at = NOW()
                                WHERE opec_school_code = %(code)s
                                """,
                                {"web": url, "code": code}
                            )
                            synced_supabase += 1
                    conn.commit()
        except Exception as e:
            print("[Website Registry] Supabase bulk sync error:", e)
    reset_verified_registry()

    return {
        "status": "success",
        "synced_local": synced_local,
        "synced_supabase": synced_supabase,
        "total_in_file": len(txt_entries),
    }

def get_health_state() -> Dict[str, Any]:
    """Returns the current state of the health check background task."""
    return dict(health_state)

# check_link state -> (is_broken, reason shown in the admin link check)
HEALTH = {
    "ok": (False, "OK"),
    "blocked": (False, "Protected (Bot Shield)"),
    "chain": (False, "Incomplete Certificate Chain (browsers open it)"),
    "busy": (True, "Timeout / Server Error"),
    "cert": (True, "SSL Certificate Error"),
    "dead": (True, "Dead Link"),
    "": (False, "No URL"),   # the website step left this school without a link
}


def check_single_url_health(url: str, name_en: str = "") -> tuple[int, bool, str]:
    """
    Opens a school URL like a visitor would (GET, certificate checked; HEAD misreported pages that load),
    the same way the website step does: with the school's name, a "coming soon" page that names it is fine.
    Returns: (http_status, is_broken, reason)
    """
    if not url or not url.strip():
        return (0, False, "No URL")
    page = check_link(url, name_en)
    return (page.get("code") or 0, *HEALTH[page["state"]])


def save_link_health(schools, progress=None) -> int:
    """Stores what the website step saw when it opened each school's link (website_check) in the registry.
    An empty check on a school that still has a link means its lookup failed: its old result stays."""
    rows = [(s["school_code"], s.get("website_http_status") or 0, *HEALTH[s["website_check"]])
            for s in schools if s.get("website_check") in HEALTH and (s["website_check"] or not s.get("website"))]
    dsn = get_current_dsn()
    if not rows or not dsn or not psycopg:
        return 0
    try:
        return _write_health(dsn, rows)
    except Exception as e:   # like the other sync steps: report it, don't stop the steps after this one
        print("[Health Check] Error saving link checks:", e)
        if progress:
            progress("เกิดข้อผิดพลาดในการบันทึกผลตรวจลิงก์", 100, 100, f"Supabase error: {e}")
        return 0


def _write_health(dsn, rows) -> int:
    with db_connect(dsn) as conn:
        with conn.cursor() as cur:
            changed = 0
            for code, status_code, is_broken, reason in rows:
                cur.execute("""
                    UPDATE school_data.official_website_registry
                    SET http_status = %(status)s,
                        is_broken = %(broken)s,
                        error_reason = %(reason)s,
                        last_checked_at = NOW()
                    WHERE school_code = %(code)s
                """, {"status": status_code, "broken": is_broken, "reason": reason, "code": code})
                changed += cur.rowcount
        conn.commit()
    return changed

def run_bulk_health_check() -> Dict[str, Any]:
    """
    Scans all registered school URLs in parallel using ThreadPoolExecutor,
    detecting dead links, 404s, timeouts, and updates Supabase.
    """
    with health_lock:
        if health_state["is_running"]:
            return {"status": "already_running"}
        health_state["is_running"] = True
    try:
        return _bulk_health_check()
    finally:
        health_state["is_running"] = False


def _bulk_health_check() -> Dict[str, Any]:
    dsn = get_current_dsn()
    if not dsn or not psycopg:
        return {"status": "error", "message": "Supabase not connected"}

    targets = []
    try:
        with db_connect(dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT r.school_code, s.name_en,
                           -- the link the site shows, which the website step may have replaced
                           COALESCE(NULLIF(s.official_website_url, ''), r.website_url) AS website_url
                    FROM school_data.official_website_registry r
                    LEFT JOIN school_data.schools s ON s.opec_school_code = r.school_code
                    WHERE COALESCE(NULLIF(s.official_website_url, ''), r.website_url, '') != ''
                """)
                targets = cur.fetchall()
    except Exception as e:
        print("[Health Check] Error fetching targets:", e)
        return {"status": "error", "message": str(e)}

    total = len(targets)
    if total == 0:
        return {"status": "empty", "message": "No websites in registry to check"}

    health_state["current"] = 0
    health_state["total"] = total
    health_state["percent"] = 0
    health_state["broken_count"] = 0
    health_state["healthy_count"] = 0
    health_state["message"] = f"เริ่มต้นตรวจสุขภาพ {total} เว็บไซต์..."

    results = []
    def worker(item):
        code = item["school_code"]
        url = item["website_url"]
        status_code, is_broken, reason = check_single_url_health(url, item.get("name_en") or "")
        return code, status_code, is_broken, reason

    try:
        with ThreadPoolExecutor(max_workers=20) as executor:
            future_to_code = {executor.submit(worker, t): t["school_code"] for t in targets}
            for future in as_completed(future_to_code):
                code, status_code, is_broken, reason = future.result()
                results.append((code, status_code, is_broken, reason))
                health_state["current"] = len(results)
                health_state["percent"] = int((len(results) / total) * 100)
                if is_broken:
                    health_state["broken_count"] += 1
                else:
                    health_state["healthy_count"] += 1
                health_state["message"] = f"ตรวจแล้ว {len(results)}/{total} แห่ง (พบปัญหา: {health_state['broken_count']} แห่ง)"

        _write_health(dsn, results)

        health_state["message"] = f"ตรวจเสร็จสมบูรณ์ {total} แห่ง! ปกติ {health_state['healthy_count']} แห่ง, มีปัญหา {health_state['broken_count']} แห่ง"
        health_state["last_run_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        print("[Health Check] Error during bulk check:", e)
        health_state["message"] = f"เกิดข้อผิดพลาด: {e}"

    return {
        "status": "completed",
        "total": total,
        "healthy_count": health_state["healthy_count"],
        "broken_count": health_state["broken_count"],
    }
