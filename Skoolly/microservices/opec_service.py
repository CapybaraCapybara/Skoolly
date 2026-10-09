import json
import os
import sys
import time
import uuid
import threading
from typing import List, Dict, Any, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

MICROSERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(MICROSERVICES_DIR)
OPEC_DIR = os.path.join(MICROSERVICES_DIR, "opec")
# The opec modules import each other by bare name (`from data_manager import ...`), so this
# file does too. Importing them as `opec.x` as well loaded every module twice, each copy with
# its own caches, locks and database connections. Editors only find these modules with
# microservices/opec on their search path, hence the `type: ignore` on the imports below.
if OPEC_DIR not in sys.path:
    sys.path.insert(0, OPEC_DIR)

from data_manager import DATA_FILE, CSV_FILE, load_schools, save_schools, set_manual_pin, clear_manual_pin, apply_manual_pins  # type: ignore
from fetch_opec import fetch_opec_schools  # type: ignore
from fetch_official_websites import resolve_all_official_websites, resolve_single_school_by_code  # type: ignore
from enrich_school_names_en import enrich_all_school_names_en  # type: ignore
from enrich_school_gps import enrich_all_school_gps, is_coords_in_province  # type: ignore
from enrich_school_data import enrich_single_school_data  # type: ignore
from supabase_sync import (  # type: ignore
    test_database_connection,
    initialize_schema_on_supabase,
    execute_opec_import,
    get_current_dsn,
    fetch_supabase_schools,
    clear_supabase_data,
    insert_supabase_school,
    update_supabase_school,
    delete_supabase_school,
    update_supabase_school_gps,
    update_supabase_school_websites,
    sync_single_school_to_supabase,
    fetch_pending_versions,
    approve_school_version,
    reject_school_version,
    save_scraped_draft_version,
    fetch_scrape_logs,
    log_school_scrape,
)
from website_registry import (  # type: ignore
    get_full_registry_status,
    verify_or_update_school_url,
    bulk_sync_from_reference_txt,
    run_bulk_health_check,
    get_health_state,
)
from enrich_from_isat import run_isat_enrichment  # type: ignore
from public_queries import fetch_published_fees, fetch_forum_posts, fetch_school_sources  # type: ignore

app = FastAPI(
    title="OPEC International Schools Admin Service",
    description="Microservice managing OPEC data scraping, official website resolving, GPS geocoding, and enrichment"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Scraper Service (scraper_service.py). Not started by start-dev.bat: run it on its own when
# scraping tuition. A scrape can wait out several Gemini rate-limit back-offs, hence the timeout.
SCRAPER_URL = os.environ.get("SCRAPER_URL", "http://127.0.0.1:8001/scrape")
SCRAPE_TIMEOUT_S = 300
# Results the batch scraper saved through the Saga pipeline (db_service.py)
RESULTS_FILE = os.path.join(BASE_DIR, "results.json")

# In-memory Scraper State
scraper_state = {
    "is_running": False,
    "task": "",
    "current": 0,
    "total": 0,
    "percent": 0,
    "log": "",
    "logs": []
}
state_lock = threading.Lock()

# Thread-safe in-memory master copy
_current_schools = load_schools()
_current_schools_lock = threading.Lock()
_last_mtime = os.path.getmtime(DATA_FILE) if os.path.exists(DATA_FILE) else 0

def get_current_schools():
    global _current_schools, _last_mtime
    with _current_schools_lock:
        if os.path.exists(DATA_FILE):
            mtime = os.path.getmtime(DATA_FILE)
            if mtime != _last_mtime:
                _current_schools = load_schools()
                _last_mtime = mtime
        else:
            _current_schools = []
        return list(_current_schools)

def set_current_schools(data):
    global _current_schools, _last_mtime
    with _current_schools_lock:
        _current_schools = list(data) if data else []
        if os.path.exists(DATA_FILE):
            _last_mtime = os.path.getmtime(DATA_FILE)

def update_progress(task, current, total, log=""):
    with state_lock:
        scraper_state["task"] = task
        scraper_state["current"] = current
        scraper_state["total"] = total
        scraper_state["percent"] = round((current / total * 100), 1) if total > 0 else (100 if "เสร็จ" in task else 0)
        if log:
            scraper_state["log"] = log
            scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] {log}")
            if len(scraper_state["logs"]) > 5000:
                scraper_state["logs"].pop(0)

# ─── background jobs ─────────────────────────────────────────────────────────
# One job at a time: every job rewrites the dataset file, and a second writer would save
# over the first one's changes.

BUSY = {"status": "already_running", "detail": "มีงานอื่นกำลังทำงานอยู่ รอให้เสร็จก่อนแล้วค่อยสั่งใหม่"}


def _require_idle():
    """Single-school edits save the whole dataset too, so they wait for a running job."""
    with state_lock:
        if scraper_state["is_running"]:
            raise HTTPException(status_code=409, detail=BUSY["detail"])


def _scaled_progress(prefix, lo, hi):
    """Maps one step's own 0..total onto lo..hi of a multi-step job, so the bar only moves forward."""
    def progress(task, current, total, log=""):
        frac = min(max(current / total, 0), 1) if total else 1
        update_progress(prefix + task, lo + round((hi - lo) * frac), 100, log)
    return progress


def _run_job(steps):
    label = steps[0][0]
    try:
        if len(steps) == 1:
            steps[0][1](update_progress)
        else:
            n = len(steps)
            for i, (label, step) in enumerate(steps):
                step(_scaled_progress(f"[ขั้น {i + 1}/{n}] ", i * 100 // n, (i + 1) * 100 // n))
            update_progress("รันครบทุกขั้นตอนแล้ว", 100, 100,
                            f"รันครบ {n} ขั้นตอน: " + " -> ".join(name for name, _ in steps))
    except Exception as e:
        print(f"[OPEC Service] Error in {label}:", e)
        update_progress(f"เกิดข้อผิดพลาด: {label}", 100, 100, f"Error ({label}): {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False


def _start_job(task, first_log, steps):
    """Runs `steps` ([(label, fn(progress))]) in a background thread unless a job is running."""
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content=BUSY)
        scraper_state.update(is_running=True, task=task, current=0, total=100, percent=0, log=first_log,
                             logs=[f"[{time.strftime('%H:%M:%S')}] {first_log}"])
    threading.Thread(target=_run_job, args=(steps,), daemon=True).start()
    return {"status": "started"}


def _sync(progress, what, sync_fn, records):
    if not records or not get_current_dsn():
        return
    progress(f"กำลังบันทึก{what}ลง Supabase...", 100, 100, f"กำลังบันทึก{what}ลงตาราง school_data.schools...")
    changed = sync_fn(records, progress)
    progress(f"บันทึก{what}ลง Supabase แล้ว", 100, 100, f"บันทึก{what}ลง Supabase: เปลี่ยน {changed} แห่ง")


def step_fetch_opec(progress, import_to_supabase=True):
    """Refreshes OPEC's own fields; English names, websites, GPS and ISAT data are kept."""
    records = fetch_opec_schools(progress)
    set_current_schools(records)
    if not import_to_supabase:
        return
    if not get_current_dsn():
        progress("ข้ามการนำเข้า Supabase", 100, 100, "ยังไม่ได้ตั้งค่า DATABASE_URL จึงบันทึกเฉพาะไฟล์ในเครื่อง")
        return
    execute_opec_import(records=records, publish_initial=True, progress_callback=progress)


def step_import(progress):
    """Imports the dataset already on disk, without asking OPEC again."""
    records = get_current_schools()
    if not records:
        raise RuntimeError("ยังไม่มีข้อมูลโรงเรียนในเครื่อง กดดึงข้อมูล OPEC ก่อน")
    execute_opec_import(records=records, publish_initial=True, progress_callback=progress)


def step_names_en(progress):
    set_current_schools(enrich_all_school_names_en(progress))   # syncs EN names to Supabase itself


def step_isat(progress):
    run_isat_enrichment(apply_to_db=True, progress_callback=progress)
    set_current_schools(load_schools())


def step_websites(progress):
    records = resolve_all_official_websites(progress)
    set_current_schools(records)
    _sync(progress, "เว็บไซต์", update_supabase_school_websites, records)


def step_gps(progress):
    records = enrich_all_school_gps(progress)
    set_current_schools(records)
    _sync(progress, "พิกัด GPS", update_supabase_school_gps, records)


FETCH = ("ดึงข้อมูล OPEC", step_fetch_opec)
NAMES = ("เติมชื่อ EN", step_names_en)
ISAT = ("ซิงค์ ISAT", step_isat)
WEBSITES = ("ค้นหา Website", step_websites)
# GPS goes after websites: pins the school publishes on its own site are one of its sources
GPS = ("ปักหมุด GPS", step_gps)


def _previous_scrape_result(school_name, website):
    """What the batch scraper already saved for this school in results.json, if anything."""
    try:
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            items = json.load(f)
    except (OSError, ValueError):
        return None
    name = (school_name or "").strip().casefold()
    site = (website or "").strip().rstrip("/").casefold()
    for it in items if isinstance(items, list) else []:
        if name and str(it.get("school_name") or "").strip().casefold() == name:
            return it
        if site and str(it.get("homepage_url") or "").strip().rstrip("/").casefold() == site:
            return it
    return None


def step_scrape_school(progress, school_id, school_name, website):
    """Scrapes one school's fees into a pending_review version for an admin to approve."""
    progress(f"กำลัง scrape ค่าเทอม: {school_name}", 15, 100, f"เริ่มสแกน {website} ({school_name})")
    result, problem = None, ""
    try:
        resp = requests.post(SCRAPER_URL, json={"school_name": school_name, "homepage_url": website},
                             timeout=SCRAPE_TIMEOUT_S)
        body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        if resp.ok and body.get("status") == "success":
            result = body.get("result_data")
        else:
            problem = f"Scraper ทำไม่สำเร็จ: {body.get('error') or body.get('detail') or f'HTTP {resp.status_code}'}"
    except requests.RequestException as e:
        problem = ("เชื่อมต่อ Scraper Service (พอร์ต 8001) ไม่ได้ เปิดด้วย python microservices/scraper_service.py"
                   if isinstance(e, requests.ConnectionError) else f"Scraper ไม่ตอบกลับ: {e}")

    if result is None:
        result = _previous_scrape_result(school_name, website)
        if result is None:
            raise RuntimeError(problem)
        progress(f"กำลังบันทึกแบบร่าง: {school_name}", 80, 100, f"{problem} จึงใช้ผลที่เคย scrape ไว้ใน results.json แทน")

    draft = save_scraped_draft_version(school_id, result)
    progress(f"บันทึกแบบร่างแล้ว: {school_name}", 100, 100,
             f"บันทึกแบบร่าง version {draft.get('version_number')} ของ {school_name} รอแอดมินอนุมัติ")


def step_batch_scrape_websites(progress, max_schools: Optional[int] = None):
    """Batch scrapes all schools that have an official website into draft versions and records logs."""
    try:
        supa_data = fetch_supabase_schools(limit=1000)
        schools = supa_data.get("schools", [])
    except Exception as e:
        print(f"[OPEC Service] Warning: Could not fetch from Supabase ({e}), falling back to local JSON")
        schools = get_current_schools()
        
    with_websites = [
        s for s in schools 
        if str(s.get("website") or s.get("official_website_url") or s.get("official_website") or "").strip()
    ]
    if max_schools and max_schools > 0:
        with_websites = with_websites[:max_schools]
    
    total = len(with_websites)
    if total == 0:
        progress("ไม่พบโรงเรียนที่มีเว็บไซต์", 100, 100, "ไม่มีโรงเรียนที่มีเว็บไซต์ทางการในระบบ OPEC")
        return

    progress(f"เริ่ม Batch Scrape ทั้งหมด {total} โรงเรียน...", 0, total, f"ตรวจพบโรงเรียนที่มีเว็บไซต์ทางการ {total} แห่ง")
    success_count = 0
    fail_count = 0
    batch_run_id = str(uuid.uuid4())

    for idx, s in enumerate(with_websites):
        name = s.get("school_name_en") or s.get("school_name_th") or "Unknown"
        website = str(s.get("website") or s.get("official_website") or "").strip()
        school_id = s.get("school_id") or s.get("school_code")
        curr_num = idx + 1

        progress(f"กำลัง Scrape: {name} ({curr_num}/{total})", curr_num, total, f"[{curr_num}/{total}] กำลังสแกน {website}")

        result = None
        error_msg = ""
        try:
            resp = requests.post(SCRAPER_URL, json={"school_name": name, "homepage_url": website}, timeout=SCRAPE_TIMEOUT_S)
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            if resp.ok and body.get("status") == "success":
                result = body.get("result_data")
            elif body.get("error"):
                error_msg = body.get("error")
            elif not resp.ok:
                error_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as ex:
            error_msg = str(ex)

        if result is None:
            result = _previous_scrape_result(name, website)

        if result:
            result["run_id"] = batch_run_id
            try:
                save_scraped_draft_version(school_id, result)
                success_count += 1
            except Exception as e:
                fail_count += 1
                log_school_scrape(
                    school_id=school_id,
                    phase="extract",
                    status="error",
                    run_id=batch_run_id,
                    page_scraped=website,
                    error_message=f"บันทึกแบบร่างไม่สำเร็จ: {e}",
                )
        else:
            fail_count += 1
            log_school_scrape(
                school_id=school_id,
                phase="extract",
                status="nav_failed",
                run_id=batch_run_id,
                page_scraped=website,
                error_message=error_msg or "Could not connect to website or scraper service",
            )

        time.sleep(1.0)

    progress(
        f"Batch Scrape เสร็จสิ้น (สำเร็จ {success_count}, ไม่สำเร็จ {fail_count})",
        total,
        total,
        f"บันทึกแบบร่าง {success_count} โรงเรียนลง Supabase และ school_scrape_log รอแอดมินอนุมัติ",
    )


# API Routes
@app.get("/api/schools")
def get_schools():
    return get_current_schools()

@app.get("/api/progress")
def get_progress():
    with state_lock:
        snapshot = {
            "is_running": scraper_state["is_running"],
            "task": scraper_state["task"],
            "current": scraper_state["current"],
            "total": scraper_state["total"],
            "percent": scraper_state["percent"],
            "log": scraper_state["log"],
            "logs": list(scraper_state["logs"])
        }
    return snapshot

@app.post("/api/clear-logs")
def clear_logs():
    with state_lock:
        scraper_state["logs"] = []
        scraper_state["log"] = ""
    return {"status": "cleared"}

@app.post("/api/fetch-opec")
def trigger_fetch_opec():
    """Fetch from OPEC into the local dataset only (no Supabase import)."""
    return _start_job("กำลังดึงข้อมูลจาก OPEC API...", "เริ่มดึงข้อมูลโรงเรียนนานาชาติจาก OPEC",
                      [(FETCH[0], lambda p: step_fetch_opec(p, import_to_supabase=False))])

@app.post("/api/enrich-names-en")
def trigger_enrich_names_en():
    return _start_job("กำลังเริ่มเติมชื่อภาษาอังกฤษ...", "เริ่มเติมชื่อภาษาอังกฤษทางการ", [NAMES])

@app.post("/api/enrich-gps")
def trigger_enrich_gps():
    return _start_job("กำลังเริ่มค้นหาพิกัด GPS...", "เริ่มตรวจพิกัด GPS แบบเทียบหลายแหล่ง", [GPS])

@app.post("/api/fetch-official-websites")
def trigger_fetch_websites():
    return _start_job("กำลังเริ่มค้นหา Official Website...", "เริ่มค้นหาและตรวจสอบเว็บไซต์ทางการ", [WEBSITES])

@app.post("/api/enrich-data")
def trigger_enrich_data():
    """Auto-Enrich: every step after the OPEC fetch that works from the local dataset."""
    return _start_job("กำลังเริ่ม Auto-Enrich...", "เริ่ม Auto-Enrich: เติมชื่อ EN -> ค้นหา Website -> ปักหมุด GPS",
                      [NAMES, WEBSITES, GPS])

@app.post("/api/pipeline/run-all")
def trigger_full_pipeline():
    return _start_job("กำลังเริ่มรันครบทุกขั้นตอน...",
                      "เริ่มรันครบทุกขั้นตอน: OPEC -> เติมชื่อ EN -> ซิงค์ ISAT -> ค้นหา Website -> ปักหมุด GPS",
                      [FETCH, NAMES, ISAT, WEBSITES, GPS])

# Website Registry & Audit Endpoints
@app.get("/api/websites/registry")
def api_get_website_registry():
    return get_full_registry_status()

class VerifyWebsitePayload(BaseModel):
    school_code: str
    website: str
    is_verified: Optional[bool] = True

@app.post("/api/websites/verify")
def api_verify_website(payload: VerifyWebsitePayload):
    _require_idle()
    return verify_or_update_school_url(payload.school_code, payload.website, payload.is_verified)

@app.post("/api/websites/sync-registry")
def api_sync_registry():
    _require_idle()
    return bulk_sync_from_reference_txt()

@app.post("/api/websites/health-check")
def api_start_health_check():
    threading.Thread(target=run_bulk_health_check, daemon=True).start()
    return {"status": "started"}

@app.get("/api/websites/health-check/status")
def api_get_health_check_status():
    return get_health_state()

class SyncSupabasePayload(BaseModel):
    fetch_fresh: bool = True
    publish_initial: bool = True

@app.get("/api/supabase/status")
def get_supabase_status():
    return test_database_connection()

@app.post("/api/supabase/init-schema")
def run_init_schema():
    try:
        res = initialize_schema_on_supabase()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync-to-supabase")
def trigger_sync_to_supabase(payload: Optional[SyncSupabasePayload] = None):
    payload = payload or SyncSupabasePayload()
    if payload.fetch_fresh:
        step = (FETCH[0], step_fetch_opec)
    else:
        step = ("นำเข้า Supabase", step_import)
    return _start_job("กำลังเตรียมนำเข้าข้อมูลสู่ Supabase...", "เริ่มดึงข้อมูลและนำเข้า Supabase", [step])

@app.get("/api/public/fees")
def get_public_fees():
    """Published tuition / extra fees per school for the Cost Calculator."""
    try:
        return fetch_published_fees()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/public/schools/{school_code}/sources")
def get_public_school_sources(school_code: str):
    """Where a school's data came from and when, plus its published safety details."""
    try:
        data = fetch_school_sources(school_code.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if data is None:
        raise HTTPException(status_code=404, detail="ไม่พบโรงเรียนนี้")
    return data

@app.get("/api/public/forum/posts")
def get_public_forum_posts(limit: int = 100):
    """Approved forum posts with comments, plus community stats."""
    try:
        return fetch_forum_posts(limit=min(max(limit, 1), 500))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/supabase/schools")
def get_supabase_schools_endpoint(
    search: Optional[str] = None,
    province: Optional[str] = None,
    curriculum: Optional[str] = None,
    level: Optional[str] = None,
    limit: int = 1000,
    offset: int = 0,
):
    try:
        return fetch_supabase_schools(
            search=search,
            province=province,
            curriculum=curriculum,
            level=level,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/supabase/clear-data")
def post_clear_supabase_data():
    try:
        return clear_supabase_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CreateSupabaseSchoolPayload(BaseModel):
    name_th: str
    name_en: Optional[str] = None
    province: Optional[str] = "กรุงเทพมหานคร"
    district: Optional[str] = None
    subdistrict: Optional[str] = None
    address: Optional[str] = None
    official_website_url: Optional[str] = None
    official_phone: Optional[str] = None
    official_mobile: Optional[str] = None
    official_email: Optional[str] = None
    facebook_url: Optional[str] = None
    line_id: Optional[str] = None
    instagram_url: Optional[str] = None
    youtube_url: Optional[str] = None
    curriculums: Optional[List[str]] = []
    levels_offered: Optional[List[str]] = []
    level_range: Optional[str] = None
    student_count: Optional[int] = None
    teacher_count: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_precision: Optional[str] = "Approximate"

@app.post("/api/supabase/schools")
def post_create_supabase_school(payload: CreateSupabaseSchoolPayload):
    try:
        return insert_supabase_school(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/supabase/schools/{school_id}")
def put_update_supabase_school(school_id: str, payload: Dict[str, Any]):
    try:
        return update_supabase_school(school_id, payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/supabase/schools/{school_id}")
def delete_supabase_school_endpoint(school_id: str):
    try:
        return delete_supabase_school(school_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/supabase/pending-versions")
def get_pending_versions_endpoint():
    try:
        return fetch_pending_versions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RejectVersionPayload(BaseModel):
    reason: Optional[str] = "ไม่ผ่านเกณฑ์การตรวจสอบของแอดมิน"

@app.post("/api/supabase/versions/{version_id}/approve")
def post_approve_version_endpoint(version_id: str):
    try:
        return approve_school_version(version_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/supabase/versions/{version_id}/reject")
def post_reject_version_endpoint(version_id: str, payload: Optional[RejectVersionPayload] = None):
    try:
        reason = payload.reason if payload else None
        return reject_school_version(version_id, reason=reason)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ScrapeSchoolPayload(BaseModel):
    school_id: str   # schools.school_id (uuid) or the OPEC school code
    school_name: str
    website: str

@app.post("/api/supabase/scrape-school")
def post_scrape_school_endpoint(payload: ScrapeSchoolPayload):
    return _start_job(f"กำลัง scrape ค่าเทอม: {payload.school_name}", f"เริ่ม scrape ค่าเทอมของ {payload.school_name}",
                      [("scrape ค่าเทอม", lambda p: step_scrape_school(p, payload.school_id, payload.school_name,
                                                                       payload.website))])

@app.get("/api/supabase/scrape-logs")
def get_supabase_scrape_logs_endpoint(limit: int = 150, offset: int = 0):
    try:
        return fetch_scrape_logs(limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BatchScrapePayload(BaseModel):
    max_schools: Optional[int] = None

@app.post("/api/scraper/batch-run")
def trigger_batch_scrape(payload: Optional[BatchScrapePayload] = None):
    max_count = payload.max_schools if payload else None
    return _start_job(
        "กำลังรัน Batch Scrape โรงเรียนที่มีเว็บไซต์...",
        "เริ่มกระบวนการ Scrape ข้อมูลโรงเรียนนานาชาติทั้งหมดที่มีลิงก์ทางการใน Database",
        [("Batch Scrape Websites", lambda p: step_batch_scrape_websites(p, max_count))]
    )

class UpdateSchoolPayload(BaseModel):
    website: Optional[str] = None
    official_website: Optional[str] = None
    website_source: Optional[str] = "Manual Edit"

@app.put("/api/school/{school_code}")
def update_school(school_code: str, payload: UpdateSchoolPayload):
    _require_idle()
    schools = get_current_schools()
    found = False
    new_website = payload.website or payload.official_website or ""
    matched_school = None
    for s in schools:
        if s.get("school_code") == school_code:
            s["website"] = new_website
            s["website_source"] = payload.website_source or "Manual Edit"
            s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
            matched_school = s
            found = True
            break
    if found:
        set_current_schools(schools)
        save_schools(schools)
        if matched_school:
            sync_single_school_to_supabase(matched_school)
        return {"status": "updated"}
    raise HTTPException(status_code=404, detail="School not found")

class ManualGpsPayload(BaseModel):
    latitude: float
    longitude: float
    # Where the coordinate came from, e.g. "OpenStreetMap way/123456 (วาดจากภาพ Esri World
    # Imagery ใน iD)". Required: it is the licence record for a pin we publish.
    source: str
    note: Optional[str] = ""
    by: Optional[str] = ""
    allow_outside_province: bool = False

# Coordinates read off Google Maps / Earth / Street View may not be stored or shown on our map.
_FORBIDDEN_GPS_SOURCES = ("google", "goo.gl", "g.page", "street view", "streetview")

def _find_school(schools, school_code):
    for s in schools:
        if s.get("school_code") == school_code:
            return s
    return None

@app.put("/api/school/{school_code}/gps")
def set_school_gps(school_code: str, payload: ManualGpsPayload):
    """Pins a school by hand and locks it: no GPS run, OPEC fetch or sync will move it."""
    _require_idle()
    schools = get_current_schools()
    school = _find_school(schools, school_code)
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    source = (payload.source or "").strip()
    if not source:
        raise HTTPException(status_code=422, detail="ต้องระบุแหล่งที่มาของพิกัด (source) เช่น OpenStreetMap way/123")
    if any(w in source.lower() for w in _FORBIDDEN_GPS_SOURCES):
        raise HTTPException(status_code=422, detail="ใช้พิกัดจาก Google ไม่ได้: เงื่อนไขของ Google ห้ามเก็บพิกัดและห้ามแสดงบนแผนที่อื่น")
    if not is_coords_in_province(payload.latitude, payload.longitude, ""):
        raise HTTPException(status_code=422, detail="พิกัดอยู่นอกประเทศไทย (ตรวจว่าไม่ได้สลับ lat กับ long)")
    if not payload.allow_outside_province and not is_coords_in_province(payload.latitude, payload.longitude, school.get("province")):
        raise HTTPException(status_code=422, detail=f"พิกัดอยู่นอกจังหวัด{school.get('province', '')} ที่จดทะเบียน "
                                                    "(ถ้าตั้งใจ ส่ง allow_outside_province=true)")
    set_manual_pin(school_code, payload.latitude, payload.longitude, source, payload.note or "", payload.by or "")
    apply_manual_pins(schools)
    school["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    set_current_schools(schools)
    save_schools(schools)
    sync_single_school_to_supabase(school)
    return {k: school.get(k) for k in ("school_code", "latitude", "longitude", "gps_precision", "gps_source",
                                       "gps_locked", "gps_manual")}

@app.delete("/api/school/{school_code}/gps")
def clear_school_gps(school_code: str):
    """Removes a hand-placed pin; the next GPS run decides this school again."""
    _require_idle()
    schools = get_current_schools()
    school = _find_school(schools, school_code)
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    if not clear_manual_pin(school_code):
        raise HTTPException(status_code=404, detail="โรงเรียนนี้ไม่มีหมุดที่ปักด้วยมือ")
    apply_manual_pins(schools)
    set_current_schools(schools)
    save_schools(schools)
    sync_single_school_to_supabase(school)
    return {k: school.get(k) for k in ("school_code", "latitude", "longitude", "gps_precision", "gps_source", "gps_locked")}

@app.post("/api/school/{school_code}/resolve")
def resolve_one_school(school_code: str):
    _require_idle()
    updated = resolve_single_school_by_code(school_code)
    if updated:
        updated["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        schools = get_current_schools()
        for idx, s in enumerate(schools):
            if s.get("school_code") == school_code:
                schools[idx] = updated
                break
        set_current_schools(schools)
        save_schools(schools)
        sync_single_school_to_supabase(updated)
        return updated
    raise HTTPException(status_code=404, detail="School not found or website unresolved")

@app.post("/api/school/{school_code}/enrich")
def enrich_one_school(school_code: str):
    _require_idle()
    schools = get_current_schools()
    target = None
    target_idx = -1
    for idx, s in enumerate(schools):
        if s.get("school_code") == school_code:
            target = s
            target_idx = idx
            break
    if target:
        enriched_s, changes = enrich_single_school_data(target)
        enriched_s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        schools[target_idx] = enriched_s
        set_current_schools(schools)
        save_schools(schools)
        sync_single_school_to_supabase(enriched_s)
        # the admin page lists the changed field names
        return {"school": enriched_s, "changes": sorted(changes)}
    raise HTTPException(status_code=404, detail="School not found")

@app.post("/api/enrich/isat")
def enrich_isat():
    return _start_job("กำลังเริ่มซิงค์ข้อมูลสมาคม ISAT...", "เริ่มซิงค์ข้อมูลสมาคม ISAT", [ISAT])

@app.get("/api/export/csv")
def export_csv():
    if os.path.exists(CSV_FILE):
        return FileResponse(CSV_FILE, media_type="text/csv", filename="international_schools_thailand_opec.csv")
    raise HTTPException(status_code=404, detail="CSV file not found")

@app.get("/api/export/json")
def export_json():
    if os.path.exists(DATA_FILE):
        return FileResponse(DATA_FILE, media_type="application/json", filename="international_schools_thailand_opec.json")
    raise HTTPException(status_code=404, detail="JSON file not found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8004))
    uvicorn.run(app, host="127.0.0.1", port=port)
