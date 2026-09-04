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
    except Exception as e:
        print("[OPEC Service] Error in Data Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการเติมข้อมูล", 100, 100, f"Error: {e}")
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
    for s in schools:
        if s.get("school_code") == school_code:
            s["website"] = new_website
            s["website_source"] = payload.website_source or "Manual Edit"
            s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
            found = True
            break
    if found:
        set_current_schools(schools)
        save_schools(schools)
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
