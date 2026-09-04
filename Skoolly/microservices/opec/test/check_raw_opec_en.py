import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from fetch_opec import fetch_all_opec_schools

def dummy_progress(status, cur, total, msg):
    print(f"[{cur}/{total}] {status} - {msg}")

raw_schools = fetch_all_opec_schools(dummy_progress)
print(f"\nTotal raw OPEC schools fetched: {len(raw_schools)}")

missing_or_garbled_en = []
from enrich_school_data import is_garbled_name

for s in raw_schools:
    en = str(s.get("school_name_en") or "").strip()
    if not en or is_garbled_name(en):
        missing_or_garbled_en.append(s)

print(f"\nFound {len(missing_or_garbled_en)} schools with missing/garbled EN in pure OPEC data:")
for idx, s in enumerate(missing_or_garbled_en, 1):
    print(f"{idx}. Code: {s.get('school_code')} | TH: {s.get('school_name_th')} | EN: '{s.get('school_name_en')}' | Web: {s.get('website')}")
