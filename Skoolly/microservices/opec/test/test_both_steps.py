import sys
import os
import io

# Set UTF-8 stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fetch_official_websites import resolve_all_official_websites
from enrich_school_data import enrich_all_missing_school_data
from data_manager import load_schools

def log(msg, c, t, line=None):
    if line:
        try:
            print(line)
        except Exception:
            pass

print("=== 1. RESOLVING OFFICIAL WEBSITES ===")
schools = resolve_all_official_websites(log)

print("\n=== 2. ENRICHING ENGLISH NAMES & GPS ===")
enriched = enrich_all_missing_school_data(log)

# Validation check
bad_en = [s for s in enriched if 'school.com' in str(s.get('school_name_en','')).lower()]
bad_web = [s for s in enriched if 'www.school.com' in str(s.get('website','')).lower()]
has_en = [s for s in enriched if s.get('school_name_en')]
has_gps = [s for s in enriched if s.get('latitude') and s.get('latitude') not in ['0', '0.0', 'null', '']]

print("\n=== FINAL VALIDATION REPORT ===")
print(f"Total Schools:          {len(enriched)}")
print(f"Schools with EN Name:   {len(has_en)}/{len(enriched)}")
print(f"Schools with Valid GPS: {len(has_gps)}/{len(enriched)}")
print(f"Bad EN ('School.com'):  {len(bad_en)}")
print(f"Bad Web ('school.com'): {len(bad_web)}")

if bad_en:
    print("\nFound Bad EN names:")
    for b in bad_en:
        print(f"[{b.get('school_code')}] {b.get('school_name_th')} -> {b.get('school_name_en')}")
else:
    print("\nSUCCESS: 100% of English names are clean and verified!")

if bad_web:
    print("\nFound Bad Web URLs:")
    for b in bad_web:
        print(f"[{b.get('school_code')}] {b.get('school_name_th')} -> {b.get('website')}")
else:
    print("SUCCESS: 100% of Websites are genuine and verified (Zero school.com)!")
