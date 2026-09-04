import os
import time
import threading
from flask import Flask, render_template, jsonify, request, send_file

# Import from separated, dedicated modules
from data_manager import DATA_FILE, CSV_FILE, load_schools, save_schools
from fetch_opec import fetch_opec_schools
from fetch_official_websites import resolve_all_official_websites, resolve_single_school_by_code
from enrich_school_names_en import enrich_all_school_names_en, enrich_single_school_name_en
from enrich_school_gps import enrich_all_school_gps, enrich_single_school_gps
from enrich_school_data import enrich_all_missing_school_data, enrich_single_school_data

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.jinja_env.auto_reload = True

# State
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
    """Worker for Button 1: OPEC Scraper"""
    try:
        def on_save(records):
            set_current_schools(records)
        result = fetch_opec_schools(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[App] Error in OPEC fetch:", e)
        update_progress("เกิดข้อผิดพลาดในการดึง OPEC", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_names_en_worker():
    """Worker for Button 2: Enrich English Names"""
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_school_names_en(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[App] Error in EN Name Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการเติมชื่อภาษาอังกฤษ", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_gps_worker():
    """Worker for Button 3: Enrich GPS Coordinates"""
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_school_gps(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[App] Error in GPS Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการค้นหาพิกัด GPS", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_fetch_websites_worker():
    """Worker for Button 4: Official Website Resolver"""
    try:
        def on_save(records):
            set_current_schools(records)
        result = resolve_all_official_websites(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[App] Error in Website fetch:", e)
        update_progress("เกิดข้อผิดพลาดในการดึง Official Website", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

def run_enrich_data_worker():
    """Worker for Combined EN & GPS Data (Backward Compatibility)"""
    try:
        def on_save(records):
            set_current_schools(records)
        result = enrich_all_missing_school_data(update_progress, on_save_callback=on_save)
        if result:
            set_current_schools(result)
    except Exception as e:
        print("[App] Error in Data Enrichment:", e)
        update_progress("เกิดข้อผิดพลาดในการเติมข้อมูล", 100, 100, f"Error: {e}")
    finally:
        with state_lock:
            scraper_state["is_running"] = False

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Web Routes
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/schools", methods=["GET"])
def get_schools():
    data = get_current_schools()
    if not data:
        data = load_schools()
        if data:
            set_current_schools(data)
    return jsonify(data)

@app.route("/api/progress", methods=["GET"])
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
    return jsonify(snapshot)

@app.route("/api/fetch-opec", methods=["POST"])
def trigger_fetch_opec():
    with state_lock:
        if scraper_state["is_running"]:
            return jsonify({"status": "already_running"}), 400
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มดึงข้อมูลจาก OPEC API..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการดึงข้อมูล..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการดึงข้อมูล..."]
    
    threading.Thread(target=run_fetch_opec_worker, daemon=True).start()
    return jsonify({"status": "started"})

@app.route("/api/enrich-names-en", methods=["POST"])
def trigger_enrich_names_en():
    with state_lock:
        if scraper_state["is_running"]:
            return jsonify({"status": "already_running"}), 400
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มเติมชื่อภาษาอังกฤษ..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการเติมชื่อภาษาอังกฤษ..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการเติมชื่อภาษาอังกฤษทางการ..."]

    threading.Thread(target=run_enrich_names_en_worker, daemon=True).start()
    return jsonify({"status": "started"})

@app.route("/api/enrich-gps", methods=["POST"])
def trigger_enrich_gps():
    with state_lock:
        if scraper_state["is_running"]:
            return jsonify({"status": "already_running"}), 400
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มค้นหาพิกัด GPS..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการค้นหาพิกัด GPS ความแม่นยำสูง..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการค้นหาพิกัด GPS ความแม่นยำสูง..."]

    threading.Thread(target=run_enrich_gps_worker, daemon=True).start()
    return jsonify({"status": "started"})

@app.route("/api/fetch-official-websites", methods=["POST"])
def trigger_fetch_websites():
    with state_lock:
        if scraper_state["is_running"]:
            return jsonify({"status": "already_running"}), 400
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มค้นหา Official Website..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นประมวลผลเว็บไซต์..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นประมวลผลเว็บไซต์..."]

    threading.Thread(target=run_fetch_websites_worker, daemon=True).start()
    return jsonify({"status": "started"})

@app.route("/api/enrich-data", methods=["POST"])
def trigger_enrich_data():
    with state_lock:
        if scraper_state["is_running"]:
            return jsonify({"status": "already_running"}), 400
        scraper_state["is_running"] = True
        scraper_state["task"] = "กำลังเริ่มเติมเต็มข้อมูล EN และ GPS..."
        scraper_state["current"] = 1
        scraper_state["total"] = 100
        scraper_state["percent"] = 1
        scraper_state["log"] = "เริ่มต้นกระบวนการ Auto-Enrich..."
        scraper_state["logs"] = [f"[{time.strftime('%H:%M:%S')}] เริ่มต้นกระบวนการ Auto-Enrich (ชื่อ EN และพิกัด GPS)..."]

    threading.Thread(target=run_enrich_data_worker, daemon=True).start()
    return jsonify({"status": "started"})

@app.route("/api/clear-data", methods=["POST"])
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
    return jsonify({"status": "cleared"})

@app.route("/api/clear-logs", methods=["POST"])
def clear_logs():
    with state_lock:
        scraper_state["logs"] = []
        scraper_state["log"] = ""
    return jsonify({"status": "logs_cleared"})

@app.route("/api/school/<school_code>", methods=["PUT"])
def update_school(school_code):
    data = request.json
    schools = get_current_schools()
    found = False
    for s in schools:
        if s["school_code"] == school_code:
            s["website"] = data.get("website", data.get("official_website", s.get("website", "")))
            s["website_source"] = data.get("website_source", "Manual Edit")
            s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
            found = True
            break
    if found:
        set_current_schools(schools)
        save_schools(schools)
        return jsonify({"status": "updated"})
    return jsonify({"error": "not found"}), 404

@app.route("/api/school/<school_code>/resolve", methods=["POST"])
def resolve_one_school(school_code):
    updated = resolve_single_school_by_code(school_code)
    if updated:
        updated["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        schools = get_current_schools()
        for idx, s in enumerate(schools):
            if s["school_code"] == school_code:
                schools[idx] = updated
                break
        set_current_schools(schools)
        save_schools(schools)
        return jsonify(updated)
    return jsonify({"error": "not found"}), 404

@app.route("/api/school/<school_code>/enrich", methods=["POST"])
def enrich_one_school(school_code):
    schools = get_current_schools()
    target = None
    target_idx = -1
    for idx, s in enumerate(schools):
        if s["school_code"] == school_code:
            target = s
            target_idx = idx
            break
    if target:
        enriched_s, changes = enrich_single_school_data(target)
        enriched_s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        schools[target_idx] = enriched_s
        set_current_schools(schools)
        save_schools(schools)
        return jsonify({"school": enriched_s, "changes": changes})
    return jsonify({"error": "not found"}), 404

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    if os.path.exists(CSV_FILE):
        return send_file(CSV_FILE, as_attachment=True, download_name="international_schools_thailand_opec.csv")
    return jsonify({"error": "file not found"}), 404

@app.route("/api/export/json", methods=["GET"])
def export_json():
    if os.path.exists(DATA_FILE):
        return send_file(DATA_FILE, as_attachment=True, download_name="international_schools_thailand_opec.json")
    return jsonify({"error": "file not found"}), 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Server running at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
