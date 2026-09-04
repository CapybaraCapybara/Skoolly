import json
import urllib.parse
import requests
import re
import sys
import io
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant, clean_thai_addr, PROVINCE_BOUNDS, extract_coordinates_from_web

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=30, pool_maxsize=30)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate"
})

def geocode_arcgis_precision_fast(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # 1. POI Queries (ArcGIS) - Clean EN and TH
    poi_queries = []
    if clean_en:
        poi_queries.append(f"{clean_en}")
        if district:
            poi_queries.append(f"{clean_en}, {district}")
    if clean_th:
        poi_queries.append(f"โรงเรียน{clean_th}")
        poi_queries.append(f"{clean_th} {province}")

    for q in poi_queries:
        if not q or len(q) < 3: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=2.0)
            if r.status_code == 200:
                candidates = r.json().get("candidates", [])
                if candidates:
                    c = candidates[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 60 and is_poi_name_relevant(matched_addr, school_name_th, school_name_en):
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # 2. Cleaned Street Address & Soi Variations (ArcGIS)
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
    elif road_match and district and province:
        street_queries.append(f"{clean_thai_addr(road_match.group(1))} {district} {province}")

    for q in street_queries:
        if not q or len(q) < 4: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=2.0)
            if r.status_code == 200:
                candidates = r.json().get("candidates", [])
                if candidates:
                    c = candidates[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 70 and is_coords_in_province(lat, lon, province):
                        return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # 3. Open-Meteo District Fallback
    for place in [district, subdistrict, province]:
        if not place: continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = web_session.get(url, timeout=1.5)
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    res = results[0]
                    lat, lon = str(res.get("latitude")), str(res.get("longitude"))
                    if is_coords_in_province(lat, lon, province):
                        return lat, lon, f"District Centroid ({place}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    return None, None, None, "None"

def process_item(s):
    th_name = s.get("school_name_th", "")
    en_name = s.get("school_name_en", "")
    p = s.get("province", "")
    d = s.get("district", "")
    sd = s.get("subdistrict", "")
    address = s.get("address", "")
    web = str(s.get("website") or "").strip()

    # 1. Website Map Embed (Fast 1.5s)
    if web:
        w_lat, w_lon = extract_coordinates_from_web(web, p)
        if w_lat and w_lon:
            return s, w_lat, w_lon, "Website Map Embed", "Exact"

    # 2. Fast Geocoder
    lat, lon, src, prec = geocode_arcgis_precision_fast(th_name, en_name, address, d, p, sd)
    return s, lat, lon, src, prec

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

# Select the 72 schools that were missing GPS initially
targets = [s for s in schools if s.get('gps_source') or is_imprecise_centroid(s.get('latitude'), s.get('longitude'))]
print(f"Total target schools: {len(targets)}")

start = time.time()
exact_count = 0
approx_count = 0

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(process_item, s) for s in targets]
    for fut in as_completed(futures):
        s, lat, lon, src, prec = fut.result()
        if prec == "Exact":
            exact_count += 1
            print(f"  ✅ [EXACT] {s.get('school_name_th')[:25]} -> {src[:45]}")
        else:
            approx_count += 1
            print(f"  ⚠️ [APPROX] {s.get('school_name_th')[:25]} -> {src[:45]}")

elapsed = time.time() - start
print(f"\n=======================================================")
print(f"Total Time Taken: {round(elapsed, 2)} seconds")
print(f"Exact Matches:    {exact_count}/{len(targets)} ({round(exact_count/len(targets)*100, 1)}%)")
print(f"Approx Matches:   {approx_count}/{len(targets)} ({round(approx_count/len(targets)*100, 1)}%)")
print(f"=======================================================")
