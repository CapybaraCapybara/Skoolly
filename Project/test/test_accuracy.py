import os
import re
import sys

# Ensure root directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from concurrent.futures import ThreadPoolExecutor
from data_manager import load_schools
from fetch_official_websites import dynamic_search_official_website

REF_FILE = os.path.join(BASE_DIR, "reference", "schoolAndURL.txt")

def load_ground_truth():
    truth = {}
    with open(REF_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            code_match = re.search(r'\[\d+\s*-\s*(\d+)\]', line)
            if not code_match:
                continue
            code = code_match.group(1).strip()
            
            # Extract URL if present
            url_match = re.search(r'https?://[^\s\)]+', line)
            url = url_match.group(0).strip().rstrip('/') if url_match else ""
            truth[code] = {
                "raw": line,
                "url": url
            }
    return truth

def clean_url(u):
    if not u:
        return ""
    u = u.strip().rstrip('/')
    u = re.sub(r'^https?://(www\.)?', '', u).lower()
    return u

def evaluate_single_school(s, truth):
    code = s.get("school_code", "")
    target = truth.get(code, {}).get("url", "")
    clean_target = clean_url(target)
    
    found_url, source = dynamic_search_official_website(s)
    clean_found = clean_url(found_url)
    
    matched = False
    if (not clean_target and not clean_found):
        matched = True
    elif clean_target and clean_found:
        if clean_target == clean_found or clean_target in clean_found or clean_found in clean_target:
            matched = True
            
    return {
        "code": code,
        "name_th": s.get("school_name_th"),
        "name_en": s.get("school_name_en"),
        "expected": target,
        "got": found_url,
        "source": source,
        "matched": matched
    }

def main():
    truth = load_ground_truth()
    schools = load_schools()
    print(f"Loaded {len(truth)} ground-truth records from reference/schoolAndURL.txt")
    print(f"Loaded {len(schools)} schools from data/ folder\n")
    
    with ThreadPoolExecutor(max_workers=50) as executor:
        results = list(executor.map(lambda s: evaluate_single_school(s, truth), schools))
        
    matched_count = sum(1 for r in results if r["matched"])
    unmatched = [r for r in results if not r["matched"]]
    
    print(f"============================================================")
    print(f" ACCURACY BENCHMARK AGAINST reference/schoolAndURL.txt")
    print(f"============================================================")
    print(f" Total Schools Tested: {len(schools)}")
    print(f" Matched Correctly:    {matched_count}/{len(schools)} ({round(matched_count/len(schools)*100, 2)}%)")
    print(f" Mismatches:           {len(unmatched)}")
    print(f"============================================================\n")
    
    if unmatched:
        print("Mismatched schools:")
        for u in unmatched:
            print(f"[{u['code']}] {u['name_th']} ({u['name_en']})")
            print(f"   Expected: '{u['expected']}'")
            print(f"   Got:      '{u['got']}' (Source: {u['source']})\n")
    else:
        print("PERFECT 100.0% MATCH! All 291 schools match reference/schoolAndURL.txt perfectly!")

if __name__ == "__main__":
    main()
