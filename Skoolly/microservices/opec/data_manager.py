"""
data_manager.py
โมดูลสำหรับโหลดและบันทึกข้อมูลโรงเรียน (JSON / CSV)
จัดการข้อมูลแบบ Atomic Write ในโฟลเดอร์ data/ เท่านั้น 
ไม่ดึงไฟล์ dump เก่ากลับมาทับซ้ำ
"""

import os
import json
import csv

# Directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.json")
CSV_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.csv")
PUBLIC_DATA_DIR = os.path.join(BASE_DIR, "public", "data")
PUBLIC_DATA_FILE = os.path.join(PUBLIC_DATA_DIR, "international_schools_thailand_opec.json")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)

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

def save_schools(data):
    """
    Atomically writes international schools data into both JSON and CSV files in data/.
    """
    os.makedirs(DATA_DIR, exist_ok=True)

    if data is None:
        data = []

    # 1. Safe write for JSON (.json)
    tmp_json = DATA_FILE + ".tmp"
    try:
        with open(tmp_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        try:
            if os.path.exists(DATA_FILE):
                os.replace(tmp_json, DATA_FILE)
            else:
                os.rename(tmp_json, DATA_FILE)
            # Sync to public/data for frontend static fallback
            try:
                import shutil
                shutil.copy2(DATA_FILE, PUBLIC_DATA_FILE)
            except Exception:
                pass
        except Exception:
            if os.path.exists(tmp_json):
                try:
                    with open(tmp_json, "r", encoding="utf-8") as src_f:
                        content = src_f.read()
                    with open(DATA_FILE, "w", encoding="utf-8") as dst_f:
                        dst_f.write(content)
                    os.remove(tmp_json)
                except Exception:
                    pass
    except Exception:
        pass

    # 2. Safe write for CSV (.csv)
    tmp_csv = CSV_FILE + ".tmp"
    try:
        with open(tmp_csv, "w", encoding="utf-8-sig", newline="") as f:
            if data:
                all_fieldnames = []
                for item in data:
                    for k in item.keys():
                        if k not in all_fieldnames:
                            all_fieldnames.append(k)
                writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction='ignore')
                writer.writeheader()
                writer.writerows(data)
            else:
                writer = csv.writer(f)
                writer.writerow(["no", "school_code", "school_name_th", "school_name_en", "province", "district", "subdistrict", "address", "website", "website_source", "facebook", "telephone", "mobile", "email", "latitude", "longitude", "gps_source", "gps_precision", "opec_profile_url", "fetched_at", "last_updated"])
        try:
            if os.path.exists(CSV_FILE):
                os.replace(tmp_csv, CSV_FILE)
            else:
                os.rename(tmp_csv, CSV_FILE)
        except Exception:
            # Direct overwrite fallback if file is held open
            if os.path.exists(tmp_csv):
                try:
                    with open(tmp_csv, "r", encoding="utf-8-sig") as src_f:
                        content = src_f.read()
                    with open(CSV_FILE, "w", encoding="utf-8-sig") as dst_f:
                        dst_f.write(content)
                    os.remove(tmp_csv)
                except Exception:
                    pass
    except Exception as e:
        pass
