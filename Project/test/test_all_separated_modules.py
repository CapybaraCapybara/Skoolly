import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8')

import json
from enrich_school_names_en import enrich_all_school_names_en, is_garbled_name
from enrich_school_gps import enrich_all_school_gps, is_imprecise_centroid

print("="*80)
print("TESTING SEPARATED MODULES: EN NAMES & GPS ENRICHMENT")
print("="*80)

def dummy_progress(task, current, total, log=""):
    if log and ("สำเร็จ" in log or "เสร็จ" in log or current == total):
        print(f"[{current}/{total}] {log}")

print("\n--- 1. Testing enrich_school_names_en ---")
schools = enrich_all_school_names_en(dummy_progress)

missing_en = [s for s in schools if not s.get("school_name_en") or is_garbled_name(s.get("school_name_en"))]
print(f"Total Schools: {len(schools)}")
print(f"Missing / Garbled EN: {len(missing_en)}")
assert len(missing_en) == 0, f"Found {len(missing_en)} missing EN names!"

print("\n--- 2. Testing enrich_school_gps ---")
schools = enrich_all_school_gps(dummy_progress)

missing_gps = [s for s in schools if not s.get("latitude") or not s.get("longitude") or is_imprecise_centroid(s.get("latitude"), s.get("longitude"))]
exact_gps = [s for s in schools if s.get("gps_precision") == "Exact" or s.get("gps_source") == "OPEC Official"]
approx_gps = [s for s in schools if s.get("gps_precision") == "Approximate"]

print(f"Exact GPS Pins: {len(exact_gps)} ({len(exact_gps)/len(schools)*100:.1f}%)")
print(f"Approximate GPS Pins: {len(approx_gps)} ({len(approx_gps)/len(schools)*100:.1f}%)")
print(f"Missing GPS: {len(missing_gps)}")
assert len(missing_gps) == 0, f"Found {len(missing_gps)} missing GPS coordinates!"

print("\n" + "="*80)
print("ALL TESTS PASSED WITH 100% SUCCESS!")
print("="*80)
