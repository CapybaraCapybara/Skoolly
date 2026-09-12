import os
import sys
import time
import threading
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

# Add opec directory to sys.path
OPEC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opec")
if OPEC_DIR not in sys.path:
    sys.path.insert(0, OPEC_DIR)

from data_manager import DATA_FILE, CSV_FILE, load_schools, save_schools
from fetch_opec import fetch_opec_schools
from fetch_official_websites import resolve_all_official_websites, resolve_single_school_by_code
from enrich_school_names_en import enrich_all_school_names_en, enrich_single_school_name_en
from enrich_school_gps import enrich_all_school_gps, enrich_single_school_gps
from enrich_school_data import enrich_all_missing_school_data, enrich_single_school_data
from supabase_sync import (
    test_database_connection,
    save_database_url,
    initialize_schema_on_supabase,
    execute_opec_import,
    get_current_dsn,
    fetch_supabase_schools,
    clear_supabase_data,
    insert_supabase_school,
    update_supabase_school,
    delete_supabase_school,
    update_supabase_school_names_en,
    update_supabase_school_gps,
    update_supabase_school_websites,
    sync_single_school_to_supabase,
    slugify,
)
from website_registry import (
    get_full_registry_status,
    verify_or_update_school_url,
    bulk_sync_from_reference_txt,
    run_bulk_health_check,
    get_health_state,
)

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

# Background workers
def run_fetch_opec_worker():
    try:
        def on_save(records):
            set_current_schools(records)
        result = fetch_opec_schools(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[OPEC Service] Error in OPEC fetch:", e)
        update_progress("เกิดข้อผิดพลาดในการดึง OPEC", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_names_en_worker():
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_school_names_en(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[OPEC Service] Error in EN Name Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการเติมชื่อภาษาอังกฤษ", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_gps_worker():
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_school_gps(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
            try:
                if get_current_dsn():
                    update_progress("กำลังซิงค์พิกัด GPS สู่ Supabase...", 100, 100, "กำลังบันทึกพิกัด GPS ลงตาราง school_data.schools ใน Supabase...")
                    synced = update_supabase_school_gps(result, update_progress)
                    update_progress("ซิงค์ GPS สู่ Supabase สำเร็จ", 100, 100, f"บันทึกพิกัด GPS สู่ Supabase สำเร็จ ({synced} แห่ง)")
            except Exception as e_sb:
                print("[GPS Supabase Sync Error]", e_sb)
    except Exception as e:
        print("[OPEC Service] Error in GPS Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการค้นหาพิกัด GPS", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_fetch_websites_worker():
    try:
        def on_save(records):
            set_current_schools(records)
        result = resolve_all_official_websites(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
            try:
                if get_current_dsn():
                    update_progress("กำลังซิงค์ Official Website สู่ Supabase...", 100, 100, "กำลังบันทึกเว็บไซต์ลงตาราง school_data.schools ใน Supabase...")
                    synced = update_supabase_school_websites(result, update_progress)
                    update_progress("ซิงค์ Website สู่ Supabase สำเร็จ", 100, 100, f"บันทึกเว็บไซต์ทางการสู่ Supabase สำเร็จ ({synced} แห่ง)")
            except Exception as e_sb:
                print("[Websites Supabase Sync Error]", e_sb)
    except Exception as e:
        print("[OPEC Service] Error in Website fetch:", e)
        update_progress("เกิดข้อผิดพลาดในการดึง Official Website", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_data_worker():
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_missing_school_data(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
            try:
                if get_current_dsn():
                    update_progress("กำลังซิงค์ข้อมูล Auto-Enrich สู่ Supabase...", 100, 100, "กำลังบันทึกข้อมูลสมบูรณ์ลงตาราง school_data.schools ใน Supabase...")
                    s_en = update_supabase_school_names_en(result, update_progress)
                    s_gps = update_supabase_school_gps(result, update_progress)
                    update_progress("ซิงค์ข้อมูลสู่ Supabase สำเร็จ", 100, 100, f"บันทึก Supabase สมบูรณ์: ชื่อ EN ({s_en} แห่ง), พิกัด GPS ({s_gps} แห่ง)")
            except Exception as e_sb:
                print("[Auto-Enrich Supabase Sync Error]", e_sb)
    except Exception as e:
        print("[OPEC Service] Error in Data Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการเติมข้อมูล", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_sync_supabase_worker(fetch_fresh: bool = False, publish_initial: bool = True):
    try:
        if fetch_fresh:
            update_progress("กำลังดึงข้อมูลโรงเรียนสดจาก OPEC API...", 3, 100, "เริ่มต้นดึงข้อมูลสดจาก OPEC API...")
            def on_save(records):
                set_current_schools(records)
            fetched = fetch_opec_schools(update_progress, on_save_callback=on_save)
            records = fetched if fetched else get_current_schools()
        else:
            records = get_current_schools()
            if not records:
                records = load_schools()
                if records:
                    set_current_schools(records)

        def progress_cb(task, cur, tot, log_msg):
            update_progress(task, cur, tot, log_msg)

        execute_opec_import(
            records=records,
            publish_initial=publish_initial,
            progress_callback=progress_cb
        )
    except Exception as e:
        print("[OPEC Service] Error syncing to Supabase:", e)
        update_progress("เกิดข้อผิดพลาดในการนำเข้า Supabase", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

# API Routes
@app.get("/api/schools")
def get_schools():
    data = get_current_schools()
    if not data:
        data = load_schools()
        if data:
            set_current_schools(data)
    return data

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
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มดึงข้อมูลจาก OPEC API..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการดึงข้อมูล..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการดึงข้อมูล..."]
    
    threading.Thread(target=run_fetch_opec_worker, daemon=True).start()
    return {"status": "started"}

@app.post("/api/enrich-names-en")
def trigger_enrich_names_en():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มเติมชื่อภาษาอังกฤษ..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการเติมชื่อภาษาอังกฤษ..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการเติมชื่อภาษาอังกฤษทางการ..."]

    threading.Thread(target=run_enrich_names_en_worker, daemon=True).start()
    return {"status": "started"}

@app.post("/api/enrich-gps")
def trigger_enrich_gps():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มค้นหาพิกัด GPS..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการค้นหาพิกัด GPS ความแม่นยำสูง..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการค้นหาพิกัด GPS ความแม่นยำสูง..."]

    threading.Thread(target=run_enrich_gps_worker, daemon=True).start()
    return {"status": "started"}

@app.post("/api/fetch-official-websites")
def trigger_fetch_websites():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มค้นหา Official Website..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นประมวลผลเว็บไซต์..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นประมวลผลเว็บไซต์..."]

    threading.Thread(target=run_fetch_websites_worker, daemon=True).start()
    return {"status": "started"}

@app.post("/api/enrich-data")
def trigger_enrich_data():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มเติมเต็มข้อมูล EN และ GPS..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการ Auto-Enrich..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการ Auto-Enrich (ชื่อ EN และพิกัด GPS)..."]

    threading.Thread(target=run_enrich_data_worker, daemon=True).start()
    return {"status": "started"}

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
    return verify_or_update_school_url(payload.school_code, payload.website, payload.is_verified)

@app.post("/api/websites/sync-registry")
def api_sync_registry():
    return bulk_sync_from_reference_txt()

@app.post("/api/websites/health-check")
def api_start_health_check():
    threading.Thread(target=run_bulk_health_check, daemon=True).start()
    return {"status": "started"}

@app.get("/api/websites/health-check/status")
def api_get_health_check_status():
    return get_health_state()

class SupabaseConfigPayload(BaseModel):
    database_url: str

class SyncSupabasePayload(BaseModel):
    fetch_fresh: Optional[bool] = False
    publish_initial: Optional[bool] = True

@app.get("/api/supabase/status")
def get_supabase_status():
    return test_database_connection()

@app.post("/api/supabase/config")
def set_supabase_config(payload: SupabaseConfigPayload):
    save_database_url(payload.database_url)
    res = test_database_connection(payload.database_url)
    return {"status": "saved", "connection": res}

@app.post("/api/supabase/init-schema")
def run_init_schema():
    try:
        res = initialize_schema_on_supabase()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync-to-supabase")
def trigger_sync_to_supabase(payload: Optional[SyncSupabasePayload] = None):
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเตรียมนำเข้าข้อมูลสู่ Supabase..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นการนำเข้าข้อมูลสู่ Supabase Database..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการเชื่อมต่อ Supabase..."]

    fetch_fresh = payload.fetch_fresh if (payload and payload.fetch_fresh is not None) else True
    publish_initial = payload.publish_initial if (payload and payload.publish_initial is not None) else True
    threading.Thread(target=run_sync_supabase_worker, args=(fetch_fresh, publish_initial), daemon=True).start()
    return {"status": "started"}

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
        return insert_supabase_school(payload.dict())
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

@app.post("/api/clear-data")
def clear_all_data():
    with state_lock:
        scraper_state["is_running"] = False
        scraper_state["task"] = ""
        scraper_state["current"] = 0
        scraper_state["total"] = 0
        scraper_state["percent"] = 0
        scraper_state["log"] = ""
        scraper_state["logs"] = []

    set_current_schools([])
    save_schools([])
    return {"status": "cleared"}

@app.post("/api/clear-logs")
def clear_logs():
    with state_lock:
        scraper_state["logs"] = []
        scraper_state["log"] = ""
    return {"status": "logs_cleared"}

class UpdateSchoolPayload(BaseModel):
    website: Optional[str] = None
    official_website: Optional[str] = None
    website_source: Optional[str] = "Manual Edit"

@app.put("/api/school/{school_code}")
def update_school(school_code: str, payload: UpdateSchoolPayload):
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

@app.post("/api/school/{school_code}/resolve")
def resolve_one_school(school_code: str):
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
        return {"school": enriched_s, "changes": changes}
    raise HTTPException(status_code=404, detail="School not found")

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
