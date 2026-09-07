"""
data_manager.py
โมดูลสำหรับโหลดและบันทึกข้อมูลโรงเรียน (JSON / CSV)
จัดการข้อมูลแบบ Atomic Write ในโฟลเดอร์ data/ เท่านั้น 
ไม่ดึงไฟล์ dump เก่ากลับมาทับซ้ำ
"""

import os
import json
import csv
import shutil

# Directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.json")
CSV_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.csv")
# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def load_schools():
    """
    Loads international schools list from data/international_schools_thailand_opec.json.
    Returns an empty list if file doesn't exist or is empty.
    """
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    return []
                data = json.loads(content)
                return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[DataManager] Error loading {DATA_FILE}:", e)
            return []
    return []

def _atomic_write(path, write_fn, encoding, newline=None):
    """
    Writes via a temp file and swaps it in. Falls back to overwriting in place
    when the target is held open (common on Windows while the file is served).
    """
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding=encoding, newline=newline) as f:
            write_fn(f)
    except Exception as e:
        print(f"[DataManager] Error writing {tmp}: {e}")
        return

    try:
        os.replace(tmp, path)
    except Exception as e:
        print(f"[DataManager] Atomic swap failed for {path} ({e}); overwriting in place")
        try:
            shutil.copyfile(tmp, path)
            os.remove(tmp)
        except Exception as e2:
            print(f"[DataManager] Fallback overwrite failed for {path}: {e2}")


CSV_FALLBACK_HEADER = [
    "no", "school_code", "school_name_th", "school_name_en", "province", "district",
    "subdistrict", "address", "website", "website_source", "facebook", "telephone",
    "mobile", "email", "latitude", "longitude", "gps_source", "gps_precision",
    "opec_profile_url", "fetched_at", "last_updated",
]


def save_schools(data):
    """
    Atomically writes international schools data into both JSON and CSV files in data/.
    Only data/ is written — the Vite dev middleware serves it directly, so there is
    no second copy under public/.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    data = data or []

    _atomic_write(
        DATA_FILE,
        lambda f: json.dump(data, f, ensure_ascii=False, indent=2),
        "utf-8",
    )

    # Union of every record's keys, in first-seen order.
    fieldnames = list(dict.fromkeys(k for item in data for k in item)) or CSV_FALLBACK_HEADER

    def write_csv(f):
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data)

    # csv needs newline="" so the writer emits CRLF exactly once per row.
    _atomic_write(CSV_FILE, write_csv, "utf-8-sig", newline="")
