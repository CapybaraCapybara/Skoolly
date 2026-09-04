import json
import sys
import io
import os
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import enrich_all_missing_school_data, load_schools, save_schools

# Reset the 72 schools so they get freshly geocoded with the strict precision system
schools = load_schools()
reset_count = 0
for s in schools:
    if s.get("gps_source") != "OPEC Official":
        s["latitude"] = None
        s["longitude"] = None
        s["gps_source"] = None
        s["gps_precision"] = None
        reset_count += 1

save_schools(schools)
print(f"Reset {reset_count} non-OPEC schools for fresh strict geocoding.")

def progress_cb(task, cur, total, msg):
    if msg:
        print(f"[{cur}/{total}] {msg}")

updated_schools = enrich_all_missing_school_data(progress_cb)

exact = sum(1 for s in updated_schools if s.get("gps_precision") == "Exact")
approx = sum(1 for s in updated_schools if s.get("gps_precision") == "Approximate")
print("\n=== FINAL ENRICHMENT SUMMARY ===")
print(f"Total Schools: {len(updated_schools)}")
print(f"Exact Coordinates: {exact} ({round(exact/len(updated_schools)*100, 1)}%)")
print(f"Approximate Coordinates: {approx} ({round(approx/len(updated_schools)*100, 1)}%)")
