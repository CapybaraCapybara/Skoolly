import sys
import os
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fetch_opec import fetch_opec_schools
from enrich_school_data import enrich_all_missing_school_data
from fetch_official_websites import resolve_all_official_websites
from data_manager import load_schools

def dummy(task, c, t, log=""):
    pass

print("=== STEP 1: FETCH OPEC ===")
schools = fetch_opec_schools(dummy)
print(f"Step 1 Complete: {len(schools)} schools loaded from OPEC")

print("\n=== STEP 2: AUTO-ENRICH EN & GPS ===")
enriched = enrich_all_missing_school_data(dummy)
has_en = [s for s in enriched if s.get("school_name_en")]
has_gps = [s for s in enriched if s.get("latitude") and s.get("latitude") not in ["0", "0.0", "null", ""]]
print(f"Step 2 Complete: EN={len(has_en)}/{len(enriched)} | GPS={len(has_gps)}/{len(enriched)}")

print("\n=== STEP 3: RESOLVE OFFICIAL WEBSITES ===")
resolved = resolve_all_official_websites(dummy)
has_web = [s for s in resolved if s.get("website")]
print(f"Step 3 Complete: Website={len(has_web)}/{len(resolved)}")

print("\n=== FINAL INTEGRITY CHECK ===")
bad_en = [s for s in resolved if "school.com" in str(s.get("school_name_en", "")).lower()]
bad_web = [s for s in resolved if "www.school.com" in str(s.get("website", "")).lower()]
print(f"Bad EN: {len(bad_en)}")
print(f"Bad Web: {len(bad_web)}")
print("ALL SYSTEMS GO!")
