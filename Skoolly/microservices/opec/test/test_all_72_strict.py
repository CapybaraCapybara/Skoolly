import json
import urllib.parse
import requests
import re
import sys
import io
import os
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import (
    is_imprecise_centroid, clean_thai_addr, is_garbled_name, dynamic_resolve_school_en_name
)

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(
    pool_connections=20, 
    pool_maxsize=20,
    max_retries=requests.adapters.Retry(total=2, backoff_factor=0.3)
)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
})

PROVINCE_BOUNDS = {
    "กรุงเทพมหานคร": (13.45, 13.98, 100.25, 100.98),
    "นนทบุรี": (13.70, 14.10, 100.20, 100.65),
    "ปทุมธานี": (13.85, 14.30, 100.30, 101.00),
    "สมุทรปราการ": (13.40, 13.80, 100.45, 101.00),
    "สมุทรสาคร": (13.35, 13.75, 100.05, 100.50),
    "นครปฐม": (13.60, 14.20, 99.90, 100.40),
    "ชลบุรี": (12.45, 13.55, 100.65, 101.45),
    "ระยอง": (12.45, 13.20, 100.85, 101.85),
    "เชียงใหม่": (17.40, 20.20, 98.00, 99.65),
    "เชียงราย": (18.90, 20.55, 99.25, 100.65),
    "ภูเก็ต": (7.65, 8.30, 98.15, 98.55),
    "สุราษฎร์ธานี": (8.55, 10.15, 98.35, 100.30),
    "กระบี่": (7.75, 8.85, 98.55, 99.45),
    "สงขลา": (6.45, 7.65, 99.95, 101.00),
    "ขอนแก่น": (15.65, 17.15, 101.85, 103.25),
    "อุดรธานี": (16.85, 17.95, 102.25, 103.45),
    "ลำปาง": (17.15, 19.15, 98.85, 100.15),
    "ตาก": (15.45, 17.85, 98.05, 99.45),
    "ปราจีนบุรี": (13.70, 14.55, 101.05, 102.15),
    "นครราชสีมา": (14.05, 15.85, 101.25, 103.05),
    "นครศรีธรรมราช": (7.80, 9.40, 99.30, 100.40),
    "เพชรบุรี": (12.40, 13.40, 99.10, 100.15),
    "ประจวบคีรีขันธ์": (10.90, 12.75, 99.20, 100.10),
    "พังงา": (8.10, 9.20, 98.15, 98.85),
    "ตรัง": (7.10, 7.95, 99.20, 99.95),
    "พะเยา": (18.70, 19.80, 99.65, 100.65)
}

def is_coords_in_province_strict(lat, lon, province):
    if not lat or not lon:
        return False
    try:
        lat_f = float(lat)
        lon_f = float(lon)
        # 1. Strictly inside Thailand overall
        if not (5.5 <= lat_f <= 20.6 and 97.2 <= lon_f <= 105.9):
            return False
        # 2. Check province bounds if defined
        if province:
            for p_name, (min_lat, max_lat, min_lon, max_lon) in PROVINCE_BOUNDS.items():
                if p_name in province or province in p_name:
                    return (min_lat <= lat_f <= max_lat) and (min_lon <= lon_f <= max_lon)
    except Exception:
        return False
    return True

GENERIC_THAI_WORDS = {
    'โรงเรียน', 'นานาชาติ', 'อนุบาล', 'ประถม', 'มัธยม', 'วิทยาลัย', 'คอลเลจ',
    'อินเตอร์', 'อินเตอร์เนชั่นแนล', 'สคูล', 'สาขา', 'ศึกษา', 'วิเทศศึกษา',
    'พัฒนา', 'แห่งประเทศไทย', 'ประเทศไทย', 'ไทย', 'กรุงเทพมหานคร', 'กรุงเทพ',
    'ภูเก็ต', 'เชียงใหม่', 'พัทยา', 'สมุย', 'ระยอง', 'นนทบุรี', 'ชลบุรี',
    'ขอนแก่น', 'อุดรธานี', 'ลำปาง', 'ลำพูน', 'สงขลา', 'หาดใหญ่', 'กระบี่',
    'สุราษฎร์ธานี', 'เชียงราย', 'แม่สาย', 'แม่สอด', 'ตาก', 'สุขุมวิท', 'พระราม'
}

GENERIC_EN_WORDS = {
    'international', 'school', 'schools', 'kindergarten', 'preschool', 'academy',
    'college', 'prep', 'preparatory', 'early', 'years', 'learning', 'center',
    'centre', 'campus', 'education', 'educational', 'community', 'thailand',
    'bangkok', 'phuket', 'pattaya', 'chiangmai', 'chiang', 'mai', 'samui',
    'rayong', 'nonthaburi', 'chonburi', 'khonkaen', 'udon', 'thani', 'lampang',
    'krabi', 'surat', 'chiangrai', 'branch', 'the', 'and', 'for', 'ltd', 'co',
    'city', 'north', 'south', 'east', 'west', 'road', 'street', 'lane'
}

def extract_core_brand_tokens(name_th, name_en):
    tokens_en = set()
    for w in re.findall(r'[A-Za-z]{3,}', name_en or ''):
        w_low = w.lower()
        if w_low not in GENERIC_EN_WORDS:
            tokens_en.add(w_low)

    tokens_th = set()
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', name_th or '').strip()
    clean_th = re.sub(r'^อนุบาล(นานาชาติ)?\s*', '', clean_th).strip()
    clean_th = re.sub(r'^ประถม(นานาชาติ)?\s*', '', clean_th).strip()
    
    for w in re.findall(r'[\u0E00-\u0E7F]{3,}', clean_th):
        if w not in GENERIC_THAI_WORDS:
            tokens_th.add(w)

    return tokens_th, tokens_en

def is_strict_poi_match(matched_addr, name_th, name_en):
    if not matched_addr:
        return False
    matched_low = matched_addr.lower()
    
    tokens_th, tokens_en = extract_core_brand_tokens(name_th, name_en)
    if not tokens_th and not tokens_en:
        return False

    for t in tokens_en:
        if len(t) >= 4 and t in matched_low:
            return True
        elif len(t) == 3 and re.search(r'\b' + re.escape(t) + r'\b', matched_low):
            return True

    for t in tokens_th:
        if len(t) >= 4 and t in matched_addr:
            return True

    return False

def is_street_level_address(matched_addr):
    if not matched_addr:
        return False
    
    has_street_kw = any(kw in matched_addr for kw in ['ถนน', 'ซอย', 'ซ.', 'ถ.', 'แยก', 'หมู่บ้าน', 'อาคาร', 'เลขที่'])
    has_en_street = any(kw in matched_addr.lower() for kw in ['road', ' rd', 'soi', 'street', 'st.', 'lane', 'avenue', 'ave', 'bldg', 'building'])
    has_house_num = bool(re.search(r'\b\d+[\d\/\-]*\s+(ถนน|ซอย|ถ\.|ซ\.|road|soi)', matched_addr, re.IGNORECASE))

    if not (has_street_kw or has_en_street or has_house_num):
        return False

    return True

def geocode_strict_precision(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # 1. POI Campus
    poi_queries = []
    if clean_en:
        poi_queries.append(f"{clean_en}")
        poi_queries.append(f"{clean_en}, Thailand")
        if district:
            poi_queries.append(f"{clean_en}, {district}")
    if clean_th:
        poi_queries.append(f"โรงเรียน{clean_th}")
        poi_queries.append(f"{school_name_th}")
        poi_queries.append(f"{clean_th} {province}")

    for q in poi_queries:
        if not q or len(q) < 3:
            continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=3.5)
            if r.status_code == 200:
                candidates = r.json().get("candidates", [])
                if candidates:
                    c = candidates[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    
                    if lat and lon and score >= 65 and is_strict_poi_match(matched_addr, school_name_th, school_name_en):
                        if is_coords_in_province_strict(lat, lon, province):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # 2. Street Address & Soi
    street_queries = []
    if cleaned_addr:
        street_queries.append(cleaned_addr)
        no_house = re.sub(r'^\d+[\d\/\-]*\s*', '', cleaned_addr).strip()
        if no_house and no_house != cleaned_addr:
            street_queries.append(no_house)

    soi_match = re.search(r'(ซอย\s*[^,\s]+)', raw_addr)
    road_match = re.search(r'(ถนน\s*[^,\s]+)', raw_addr)
    if soi_match and road_match and district and province:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {clean_thai_addr(road_match.group(1))} {district} {province}")
    if road_match and district and province:
        street_queries.append(f"{clean_thai_addr(road_match.group(1))} {district} {province}")
    if soi_match and district and province:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {district} {province}")

    for q in street_queries:
        if not q or len(q) < 4:
            continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=3.5)
            if r.status_code == 200:
                candidates = r.json().get("candidates", [])
                if candidates:
                    c = candidates[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    
                    if lat and lon and score >= 75 and is_coords_in_province_strict(lat, lon, province):
                        if is_street_level_address(matched_addr):
                            return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
                        else:
                            return lat, lon, f"ArcGIS Area Centroid ({matched_addr[:30]}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    # 3. Open-Meteo District Fallback
    for place in [district, subdistrict, province]:
        if not place:
            continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = web_session.get(url, timeout=2.0)
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    res = results[0]
                    lat, lon = str(res.get("latitude")), str(res.get("longitude"))
                    if is_coords_in_province_strict(lat, lon, province):
                        return lat, lon, f"District Centroid ({place}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    return None, None, None, "None"

# Load full schools and run on all 72 targets
with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

# Collect targets that don't have official OPEC GPS
gps_targets = [s for s in schools if s.get("gps_source") != "OPEC Official"]
print(f"Total schools needing GPS: {len(gps_targets)}")

def process_one(s):
    th = s.get("school_name_th", "")
    en = s.get("school_name_en", "")
    addr = s.get("address", "")
    d = s.get("district", "")
    p = s.get("province", "")
    sd = s.get("subdistrict", "")
    lat, lon, src, prec = geocode_strict_precision(th, en, addr, d, p, sd)
    return s, lat, lon, src, prec

start = time.time()
with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(process_one, gps_targets))

exact_count = 0
approx_count = 0

print("\n=== RESULTS AUDIT ===")
for s, lat, lon, src, prec in results:
    th = s.get("school_name_th", "")
    if prec == "Exact":
        exact_count += 1
        print(f"  ✅ [EXACT] {th[:28]} -> {src[:55]}")
    else:
        approx_count += 1
        print(f"  ⚠️ [APPROX] {th[:28]} -> {src[:55] if src else 'None'}")

print(f"\n=======================================================")
print(f"Total Processed: {len(gps_targets)} schools in {round(time.time() - start, 2)}s")
print(f"✅ Verified Exact Building/Street Pins: {exact_count}/{len(gps_targets)} ({round(exact_count/len(gps_targets)*100, 1)}%)")
print(f"⚠️ Explicitly Tagged Approximate Pins:  {approx_count}/{len(gps_targets)} ({round(approx_count/len(gps_targets)*100, 1)}%)")
print(f"=======================================================")
