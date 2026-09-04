import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import re
import requests
import urllib.parse
from bs4 import BeautifulSoup
from enrich_school_data import is_garbled_name, clean_school_en_name, extract_english_name_from_web

with open("reference/schoolAndURL.txt", "r", encoding="utf-8") as f:
    ref_lines = [l.strip() for l in f if l.strip()]

ref_dict = {}
for line in ref_lines:
    m = re.match(r'\[\d+\s*-\s*(\d+)\]\s*(.*?)\s*\((.*?)\)\s*-\s*(.*)', line)
    if m:
        code = m.group(1).strip()
        en = m.group(2).strip()
        th = m.group(3).strip()
        url = m.group(4).strip()
        ref_dict[code] = {"en": en, "th": th, "url": url}

print(f"Loaded {len(ref_dict)} schools from schoolAndURL.txt")

with open("data/international_schools_thailand_opec.json", "r", encoding="utf-8") as f:
    schools = json.load(f)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

def search_arcgis_poi_en(name_th, province=""):
    """Check if ArcGIS POI has the English name registered"""
    url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(name_th + ' ' + province)}&f=json&maxLocations=5"
    try:
        r = session.get(url, timeout=4.0)
        if r.status_code == 200:
            cands = r.json().get("candidates", [])
            for c in cands:
                addr = c.get("address", "")
                en_match = re.findall(r'([A-Za-z0-9\s\.\,\'\-–]{4,}(?:International School|International Kindergarten|International Preschool|International Academy|International College|School|Preschool|Kindergarten|Academy|College))', addr, re.IGNORECASE)
                if en_match:
                    cand = clean_school_en_name(en_match[0].strip())
                    if cand and not is_garbled_name(cand):
                        return cand
    except Exception:
        pass
    return None

def search_duckduckgo_en(name_th, province=""):
    """Search DuckDuckGo HTML for official school English name"""
    q = f'"{name_th}"'
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(q)}"
    try:
        r = session.get(url, timeout=5.0)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a", class_="result__url"):
                href = a.get("href", "")
                # check domain name
            for s in soup.find_all("a", class_="result__snippet"):
                text = s.get_text()
                m = re.findall(r'([A-Za-z0-9\s\.\,\'\-–]{4,}(?:International School|International Kindergarten|International Preschool|International Academy|International College))', text, re.IGNORECASE)
                if m:
                    cand = clean_school_en_name(m[0].strip())
                    if cand and not is_garbled_name(cand):
                        return cand
    except Exception:
        pass
    return None

# Let's inspect all schools and find which ones relied on reference
print("\n" + "="*80)
print("TESTING DYNAMIC RESOLUTION FOR ALL 291 SCHOOLS (WITHOUT REFERENCE FILE)")
print("="*80)

missing_count = 0
found_via_opec_count = 0
found_via_web_count = 0
found_via_arcgis_count = 0
found_via_search_count = 0
unresolved = []

for idx, s in enumerate(schools, 1):
    code = str(s.get("school_code", "")).strip()
    th_name = s.get("school_name_th", "")
    prov = s.get("province", "")
    web = s.get("website", "")
    history = str(s.get("school_history") or "")
    tags = str(s.get("tags") or "")
    cur_en = s.get("school_name_en", "")
    
    # Let's see if we can resolve without reference:
    # Source 1: OPEC Tags / History
    en_in_paren = re.findall(r'\(([A-Za-z0-9\s\.\,\'\-–]+(?:School|Kindergarten|Preschool|Academy|College|Prep|International)[A-Za-z0-9\s\.\,\'\-–]*)\)', history + " " + tags)
    from_opec = clean_school_en_name(en_in_paren[0].strip()) if en_in_paren else None
    
    # Source 2: Web
    from_web = extract_english_name_from_web(web, th_name) if web else None
    
    # Source 3: ArcGIS POI
    from_arcgis = None
    if not from_opec and not from_web:
        from_arcgis = search_arcgis_poi_en(th_name, prov)
        
    resolved = from_opec or from_web or from_arcgis
    
    # Compare with current EN
    if from_opec:
        found_via_opec_count += 1
    elif from_web:
        found_via_web_count += 1
    elif from_arcgis:
        found_via_arcgis_count += 1
    else:
        unresolved.append((code, th_name, cur_en, web))

print(f"\nSummary of Dynamic Sources (Without Reference File):")
print(f"  - Found via OPEC Tags/History: {found_via_opec_count}")
print(f"  - Found via School Website:    {found_via_web_count}")
print(f"  - Found via ArcGIS POI:        {found_via_arcgis_count}")
print(f"  - Unresolved schools:          {len(unresolved)}")

print("\n--- UNRESOLVED SCHOOLS LIST ---")
for code, th, en, web in unresolved:
    print(f"Code: {code} | TH: {th} | Current EN: '{en}' | Web: '{web}'")
