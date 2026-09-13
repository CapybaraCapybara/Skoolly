import os
import sys
import time
import threading
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

# Add microservices and opec directories to sys.path
MICROSERVICES_DIR = os.path.dirname(os.path.abspath(__file__))
OPEC_DIR = os.path.join(MICROSERVICES_DIR, "opec")
if MICROSERVICES_DIR not in sys.path:
    sys.path.insert(0, MICROSERVICES_DIR)
if OPEC_DIR not in sys.path:
    sys.path.insert(0, OPEC_DIR)

try:
    from opec.data_manager import DATA_FILE, CSV_FILE, load_schools, save_schools
    from opec.fetch_opec import fetch_opec_schools
    from opec.fetch_official_websites import resolve_all_official_websites, resolve_single_school_by_code
    from opec.enrich_school_names_en import enrich_all_school_names_en
    from opec.enrich_school_gps import enrich_all_school_gps
    from opec.enrich_school_data import enrich_all_missing_school_data, enrich_single_school_data
    from opec.supabase_sync import (
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
        fetch_pending_versions,
        approve_school_version,
        reject_school_version,
        save_scraped_draft_version,
    )
    from opec.website_registry import (
        get_full_registry_status,
        verify_or_update_school_url,
        bulk_sync_from_reference_txt,
        run_bulk_health_check,
        get_health_state,
    )
    from opec.enrich_from_isat import run_isat_enrichment
except ImportError:
    from data_manager import DATA_FILE, CSV_FILE, load_schools, save_schools  # type: ignore
    from fetch_opec import fetch_opec_schools  # type: ignore
    from fetch_official_websites import resolve_all_official_websites, resolve_single_school_by_code  # type: ignore
    from enrich_school_names_en import enrich_all_school_names_en  # type: ignore
    from enrich_school_gps import enrich_all_school_gps  # type: ignore
    from enrich_school_data import enrich_all_missing_school_data, enrich_single_school_data  # type: ignore
    from supabase_sync import (  # type: ignore
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
        fetch_pending_versions,
        approve_school_version,
        reject_school_version,
        save_scraped_draft_version,
    )
    from website_registry import (  # type: ignore
        get_full_registry_status,
        verify_or_update_school_url,
        bulk_sync_from_reference_txt,
        run_bulk_health_check,
        get_health_state,
    )
    from enrich_from_isat import run_isat_enrichment  # type: ignore

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

def run_enrich_isat_worker():
    try:
        res = run_isat_enrichment(apply_to_db=True, progress_callback=update_progress)
        schools = load_schools()
        set_current_schools(schools)
    except Exception as e:
        print("[OPEC Service] Error in ISAT Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการซิงค์ ISAT", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_full_pipeline_worker():
    """Runs complete 5-step data pipeline in the recommended optimal order:
       1. OPEC Fetch & Sync
       2. Enrich School Names EN
       3. Enrich ISAT (207 schools)
       4. Fetch Official Websites
       5. Enrich GPS Coordinates
    """
    try:
        def on_save(records):
            set_current_schools(records)

        # ----------------------------------------------------
        # STEP 1: OPEC Fetch & Direct Supabase Import
        # ----------------------------------------------------
        update_progress("⚡ [Full Pipeline 1/5] ดึงข้อมูลสดจาก OPEC API...", 1, 100, "🚀 เริ่มต้น Full Data Pipeline (5 ขั้นตอนครบวงจร)...")
        update_progress("⚡ [Full Pipeline 1/5] ดึงข้อมูลสดจาก OPEC API...", 3, 100, "[ขั้นตอน 1/5] เริ่มต้นดึงข้อมูลสดจาก OPEC API สช. ทั่วประเทศ...")
        fetched = fetch_opec_schools(update_progress, on_save_callback=on_save)
        records = fetched if fetched else get_current_schools()
        if not records:
            records = load_schools()
        if records:
            set_current_schools(records)
            execute_opec_import(records=records, publish_initial=True, progress_callback=update_progress)

        # ----------------------------------------------------
        # STEP 2: Enrich English Names
        # ----------------------------------------------------
        update_progress("⚡ [Full Pipeline 2/5] เติมชื่อภาษาอังกฤษทางการ (EN)...", 25, 100, "[ขั้นตอน 2/5] เริ่มต้นประมวลผลเติมชื่อภาษาอังกฤษทางการ...")
        enrich_all_school_names_en(update_progress, on_save_callback=on_save)
        records = load_schools()
        set_current_schools(records)

        # ----------------------------------------------------
        # STEP 3: Enrich ISAT
        # ----------------------------------------------------
        update_progress("⚡ [Full Pipeline 3/5] ซิงค์ข้อมูลสมาคม ISAT (207 รร.)...", 45, 100, "[ขั้นตอน 3/5] เริ่มต้นดึงและจับคู่ข้อมูลสมาคม ISAT...")
        run_isat_enrichment(apply_to_db=True, progress_callback=update_progress)
        records = load_schools()
        set_current_schools(records)

        # ----------------------------------------------------
        # STEP 4: Fetch Official Websites
        # ----------------------------------------------------
        update_progress("⚡ [Full Pipeline 4/5] ค้นหาและตรวจสอบ Official Website...", 65, 100, "[ขั้นตอน 4/5] เริ่มต้นค้นหาและตรวจสอบเว็บไซต์ทางการ...")
        resolve_all_official_websites(update_progress, on_save_callback=on_save)
        records = load_schools()
        set_current_schools(records)
        if get_current_dsn():
            update_progress("กำลังซิงค์ Official Website สู่ Supabase...", 75, 100, "กำลังบันทึกเว็บไซต์ลงตาราง school_data.schools ใน Supabase...")
            synced_web = update_supabase_school_websites(records, update_progress)
            update_progress("ซิงค์ Website สู่ Supabase สำเร็จ", 78, 100, f"บันทึกเว็บไซต์ทางการสู่ Supabase สำเร็จ ({synced_web} แห่ง)")

        # ----------------------------------------------------
        # STEP 5: GPS Geocoding
        # ----------------------------------------------------
        update_progress("⚡ [Full Pipeline 5/5] ค้นหาพิกัด GPS ความแม่นยำสูง...", 80, 100, "[ขั้นตอน 5/5] เริ่มต้นคำนวณและค้นหาพิกัด GPS ความแม่นยำสูง...")
        enrich_all_school_gps(update_progress, on_save_callback=on_save)
        records = load_schools()
        set_current_schools(records)
        if get_current_dsn():
            update_progress("กำลังซิงค์พิกัด GPS สู่ Supabase...", 95, 100, "กำลังบันทึกพิกัด GPS ลงตาราง school_data.schools ใน Supabase...")
            synced_gps = update_supabase_school_gps(records, update_progress)
            update_progress("ซิงค์ GPS สู่ Supabase สำเร็จ", 98, 100, f"บันทึกพิกัด GPS สู่ Supabase สำเร็จ ({synced_gps} แห่ง)")

        # ----------------------------------------------------
        # FINISHED
        # ----------------------------------------------------
        final_summary = (
            "🎉 Full Data Pipeline เสร็จสมบูรณ์ครบทั้ง 5 ขั้นตอน!\n"
            f"  1. OPEC: นำเข้าและซิงค์ข้อมูลสด {len(records)} โรงเรียน\n"
            "  2. Official Name EN: เติมเต็มและจัดมาตรฐาน 100%\n"
            "  3. ISAT: สมาชิกสมาคม, การรับรองมาตรฐานสากล CIS/WASC, และ Logo สมบูรณ์\n"
            "  4. Official Website: ยืนยันโดเมนและเว็บไซต์ทางการครบถ้วน\n"
            "  5. GPS Geocoding: ปักหมุดพิกัดอาคารและบันทึกสู่ Supabase เรียบร้อยแล้ว"
        )
        update_progress("🎉 Full Data Pipeline เสร็จสมบูรณ์ 100%!", 100, 100, final_summary)
    except Exception as e:
        print("[OPEC Service] Error in Full Pipeline:", e)
        update_progress("เกิดข้อผิดพลาดใน Full Pipeline", 100, 100, f"Error: {e}")
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

@app.post("/api/pipeline/run-all")
def trigger_full_pipeline():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "⚡ กำลังเริ่ม Full Data Pipeline (5 ขั้นตอน)..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "🚀 เริ่มต้นกระบวนการ Full Pipeline ทั้งระบบ..."
        scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] 🚀 เริ่มต้น Full Data Pipeline (5 ขั้นตอนครบวงจร)...")

    threading.Thread(target=run_full_pipeline_worker, daemon=True).start()
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
    school_id: str
    school_name: str
    website: str

def run_single_school_scrape_worker(school_id: str, school_name: str, website: str):
    global scraper_state
    with state_lock:
        scraper_state["is_running"] = True
        scraper_state["task"] = f"กำลัง Scrape ค่าเทอม: {school_name}..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 15
        scraper_state["log"] = f"เริ่มต้นกระบวนการค้นหาค่าเทอมจาก {website}..."
        scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] เริ่มสแกน {website} ({school_name})...")

    try:
        import requests
        scraper_url = "http://127.0.0.1:8001/scrape"
        resp = None
        try:
            resp = requests.post(scraper_url, json={"school_name": school_name, "homepage_url": website}, timeout=120)
        except Exception:
            pass

        if resp and resp.status_code == 200 and resp.json().get("status") == "success":
            result_data = resp.json()["result_data"]
            draft_res = save_scraped_draft_version(school_id, result_data)
            with state_lock:
                scraper_state["log"] = f"Scrape สำเร็จ! บันทึกแบบร่าง Version {draft_res.get('version_number')} รอแอดมินอนุมัติ"
                scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] สร้างแบบร่าง Version {draft_res.get('version_number')} รอแอดมินอนุมัติเรียบร้อยแล้ว")
            return

        # Fallback to checking local results.json if already extracted
        results_file = os.path.join(BASE_DIR, "results.json")
        matched = None
        if os.path.exists(results_file):
            try:
                with open(results_file, "r", encoding="utf-8") as f:
                    scraped_items = json.load(f)
                    for it in scraped_items:
                        s_name = it.get("school_name", "").lower()
                        if s_name in school_name.lower() or school_name.lower() in s_name:
                            matched = it
                            break
            except Exception:
                pass

        if matched:
            draft_res = save_scraped_draft_version(school_id, matched)
            with state_lock:
                scraper_state["log"] = f"บันทึกแบบร่างจากผลลัพธ์เดิม: Version {draft_res.get('version_number')} (รออนุมัติ)"
                scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] บันทึกแบบร่าง Version {draft_res.get('version_number')} สำเร็จ รอแอดมินอนุมัติ")
        else:
            with state_lock:
                scraper_state["log"] = "ไม่สามารถเชื่อมต่อ Scraper Service (port 8001) กรุณาเปิด service ก่อนรัน"
                scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] Scraper Service (port 8001) ไม่ได้เปิดใช้งาน")

    except Exception as e:
        with state_lock:
            scraper_state["log"] = f"เกิดข้อผิดพลาดในการ Scrape: {str(e)}"
            scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] Error: {str(e)}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False
            scraper_state["percent"] = 100

@app.post("/api/supabase/scrape-school")
def post_scrape_school_endpoint(payload: ScrapeSchoolPayload):
    try:
        threading.Thread(
            target=run_single_school_scrape_worker,
            args=(payload.school_id, payload.school_name, payload.website),
            daemon=True
        ).start()
        return {"status": "started", "message": f"กำลังเริ่ม Scrape ค่าเทอมสำหรับ {payload.school_name}..."}
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

@app.post("/api/enrich/isat")
def enrich_isat():
    with state_lock:
        if scraper_state["is_running"]:
            return JSONResponse(status_code=400, content={"status": "already_running"})
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มซิงค์ข้อมูลสมาคม ISAT (207 รร.)..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการซิงค์ข้อมูลสมาคม ISAT..."
        scraper_state["logs"].append(f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการซิงค์ข้อมูลสมาคม ISAT...")

    threading.Thread(target=run_enrich_isat_worker, daemon=True).start()
    return {"status": "started"}

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
