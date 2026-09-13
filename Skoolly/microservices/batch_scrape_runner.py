"""
batch_scrape_runner.py
เครื่องมือสำหรับรัน Batch Scrape โรงเรียนนานาชาติทั้งหมด (~291 โรงเรียน) ผ่าน Saga Orchestrator:
- โหลดรายชื่อโรงเรียนจาก data_manager.load_schools() และคัดกรองเฉพาะที่มี website
- ควบคุม Concurrency (ค่าเริ่มต้น 3 workers, สูงสุด 4-5) ป้องกัน RAM ล้นและลด Rate Limit
- เรียกผ่าน Saga Orchestrator (POST http://127.0.0.1:8000/saga/scrape-school) เพื่อรักษา Saga Transaction
- บันทึก Progress แบบเรียลไทม์ และแยกผลลัพธ์ลง scrape_batch_success.json กับ scrape_batch_failed.json
- มี Delay เล็กน้อยระหว่างคำขอเพื่อลดภาระฝั่ง AI API
- รองรับ flag --retry-failed เพื่อรันซ้ำเฉพาะโรงเรียนที่เคยล้มเหลว
"""

import os
import sys
import json
import time
import argparse
import threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

# Ensure imports resolve regardless of cwd
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
OPEC_DIR = os.path.join(CURRENT_DIR, "opec")

for p in [CURRENT_DIR, BASE_DIR, OPEC_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from data_manager import load_schools
except ImportError:
    try:
        from opec.data_manager import load_schools
    except ImportError:
        def load_schools():
            path = os.path.join(BASE_DIR, "data", "international_schools_thailand_opec.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            return []

ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://127.0.0.1:8000/saga/scrape-school")
ORCHESTRATOR_HEALTH = "http://127.0.0.1:8000/docs"

SUCCESS_FILE = os.path.join(BASE_DIR, "scrape_batch_success.json")
FAILED_FILE = os.path.join(BASE_DIR, "scrape_batch_failed.json")

def load_json_file(filepath):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read().strip()
                return json.loads(content) if content else []
        except Exception:
            return []
    return []

def atomic_save_json(filepath, data):
    tmp = filepath + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, filepath)
    except Exception as e:
        # Fallback for Windows file lock
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception as ex2:
            print(f"    [Error saving {filepath}]: {ex2}")

def check_orchestrator():
    """Checks if the Saga orchestrator microservice is online."""
    try:
        r = requests.get(ORCHESTRATOR_HEALTH, timeout=3)
        return r.status_code == 200
    except Exception:
        return False

def scrape_single_school(school, session, delay_between_requests=1.5):
    """Sends a single school scrape request to the Saga Orchestrator."""
    school_name = school.get("school_name_en") or school.get("school_name_th") or "Unknown School"
    homepage_url = str(school.get("website") or "").strip()
    school_code = str(school.get("school_code") or school.get("no") or "")

    payload = {
        "school_name": school_name,
        "homepage_url": homepage_url
    }

    t0 = time.time()
    try:
        resp = session.post(ORCHESTRATOR_URL, json=payload, timeout=120)
        elapsed = round(time.time() - t0, 1)

        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "saga_success":
                result = data.get("result", {})
                time.sleep(delay_between_requests)
                return {
                    "ok": True,
                    "school_code": school_code,
                    "school_name": school_name,
                    "homepage_url": homepage_url,
                    "status": "saga_success",
                    "elapsed_sec": elapsed,
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                    "curriculum": result.get("curriculum"),
                    "tuition_found": result.get("tuition_found"),
                    "fee_page_discovery": result.get("fee_page_discovery"),
                    "identity_verified": result.get("identity_verified"),
                    "confidence": result.get("confidence")
                }
            else:
                time.sleep(delay_between_requests)
                return {
                    "ok": False,
                    "school_code": school_code,
                    "school_name": school_name,
                    "homepage_url": homepage_url,
                    "status": data.get("status", "saga_failed"),
                    "failed_at": data.get("failed_at", "unknown"),
                    "error": data.get("error") or str(data.get("errors") or "Saga failure"),
                    "attempted_at": datetime.now(timezone.utc).isoformat(),
                    "elapsed_sec": elapsed
                }
        else:
            time.sleep(delay_between_requests)
            return {
                "ok": False,
                "school_code": school_code,
                "school_name": school_name,
                "homepage_url": homepage_url,
                "status": f"http_{resp.status_code}",
                "error": resp.text[:200],
                "attempted_at": datetime.now(timezone.utc).isoformat(),
                "elapsed_sec": elapsed
            }

    except Exception as e:
        time.sleep(delay_between_requests)
        return {
            "ok": False,
            "school_code": school_code,
            "school_name": school_name,
            "homepage_url": homepage_url,
            "status": "request_exception",
            "error": str(e),
            "attempted_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_sec": round(time.time() - t0, 1)
        }

def run_batch_scrape(
    concurrency=3,
    delay=1.5,
    limit=None,
    retry_failed_only=False,
    skip_existing_success=True
):
    print("=" * 70)
    print("   [SKOOLLY BATCH SCRAPER RUNNER - Saga Orchestrator Pipeline]")
    print("=" * 70)

    # 1. Health check orchestrator
    print("[1/4] Checking Saga Orchestrator status (http://127.0.0.1:8000)...")
    if not check_orchestrator():
        print("Warning: Orchestrator service does not seem to be responding on http://127.0.0.1:8000")
        print("   Make sure to start the orchestrator and dependent services:")
        print("   Run: python microservices/run_all.py")
        sys.exit(1)
    print("Saga Orchestrator is ONLINE.")

    # 2. Load schools
    print("[2/4] Loading school registry...")
    all_schools = load_schools()
    if not all_schools:
        print("Error: No schools loaded from data_manager. Check data/ directory.")
        sys.exit(1)
    print(f"Loaded {len(all_schools)} total schools from registry.")

    # Filter schools with valid websites
    schools_with_web = [
        s for s in all_schools
        if s.get("website") and str(s.get("website")).strip().startswith("http")
    ]
    print(f"Found {len(schools_with_web)} schools with official website URLs.")

    # 3. Handle previous run history
    success_records = load_json_file(SUCCESS_FILE)
    failed_records = load_json_file(FAILED_FILE)
    success_urls = {r.get("homepage_url") for r in success_records if r.get("homepage_url")}
    failed_urls = {r.get("homepage_url") for r in failed_records if r.get("homepage_url")}

    if retry_failed_only:
        targets = [s for s in schools_with_web if s.get("website") in failed_urls]
        print(f"Mode: --retry-failed -> Queued {len(targets)} previously failed schools.")
    elif skip_existing_success:
        targets = [s for s in schools_with_web if s.get("website") not in success_urls]
        print(f"Mode: Normal (Resume) -> Skipping {len(success_urls)} already scraped. Queued {len(targets)} schools.")
    else:
        targets = schools_with_web
        print(f"Mode: Full Overwrite -> Queued {len(targets)} schools.")

    if limit and limit > 0:
        targets = targets[:limit]
        print(f"Limit applied: Processing first {len(targets)} schools only.")

    total_targets = len(targets)
    if total_targets == 0:
        print("No pending schools to scrape! All targets are up to date.")
        return

    # 4. Execute concurrently
    print(f"[3/4] Starting concurrent execution (Workers: {concurrency}, Inter-request delay: {delay}s)...")
    completed_count = 0
    lock = threading.Lock()

    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=1)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    def update_progress(item_res, current_idx, total_count):
        name = item_res["school_name"]
        status_tag = "[SUCCESS]" if item_res["ok"] else "[FAILED]"
        pct = round((current_idx / total_count) * 100, 1)

        print(f"[{current_idx}/{total_count}] ({pct}%) {status_tag} | {name} ({item_res.get('elapsed_sec', 0)}s)")
        if not item_res["ok"]:
            print(f"    Reason: {item_res.get('error', 'unknown error')[:100]}")

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(scrape_single_school, s, session, delay): s for s in targets}

        for future in as_completed(futures):
            res = future.result()
            with lock:
                completed_count += 1
                if res["ok"]:
                    # Remove from failed records if previously failed
                    failed_records = [f for f in failed_records if f.get("homepage_url") != res["homepage_url"]]
                    # Update or append to success records
                    success_records = [s for s in success_records if s.get("homepage_url") != res["homepage_url"]]
                    success_records.append(res)
                else:
                    # Update or append to failed records
                    failed_records = [f for f in failed_records if f.get("homepage_url") != res["homepage_url"]]
                    failed_records.append(res)

                # Incremental atomic save every 3 completions or on finish
                if completed_count % 3 == 0 or completed_count == total_targets:
                    atomic_save_json(SUCCESS_FILE, success_records)
                    atomic_save_json(FAILED_FILE, failed_records)

                update_progress(res, completed_count, total_targets)

    # Final save
    atomic_save_json(SUCCESS_FILE, success_records)
    atomic_save_json(FAILED_FILE, failed_records)

    print("=" * 70)
    print("   [BATCH SCRAPE RUN COMPLETED]")
    print(f"   - Processed this run: {completed_count}")
    print(f"   - Total Successful (Saved to {os.path.basename(SUCCESS_FILE)}): {len(success_records)}")
    print(f"   - Total Failed (Saved to {os.path.basename(FAILED_FILE)}): {len(failed_records)}")
    print("=" * 70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Batch School Scraping via Saga Orchestrator")
    parser.add_argument("--concurrency", type=int, default=3, help="Max parallel requests (3-5 recommended)")
    parser.add_argument("--delay", type=float, default=1.5, help="Inter-request delay in seconds (default 1.5)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of schools to process")
    parser.add_argument("--retry-failed", action="store_true", help="Only process previously failed schools")
    parser.add_argument("--force-all", action="store_true", help="Re-scrape all schools, do not skip already successful")

    args = parser.parse_args()
    
    # Cap concurrency at 5 to protect memory and Gemini quotas
    concurrency = min(max(args.concurrency, 1), 5)
    
    run_batch_scrape(
        concurrency=concurrency,
        delay=args.delay,
        limit=args.limit,
        retry_failed_only=args.retry_failed,
        skip_existing_success=not args.force_all
    )
