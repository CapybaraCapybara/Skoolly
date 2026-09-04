import os
import sys
import time
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8')

from data_manager import load_schools, save_schools

schools = load_schools()
print(f"Loaded {len(schools)} schools.")

now_str = time.strftime("%Y-%m-%d %H:%M:%S")

updated_count = 0
for s in schools:
    if "fetched_at" not in s or not s["fetched_at"]:
        s["fetched_at"] = now_str
        updated_count += 1
    if "last_updated" not in s or not s["last_updated"]:
        s["last_updated"] = now_str

save_schools(schools)
print(f"Added timestamp to {updated_count} records and re-saved JSON + CSV.")
