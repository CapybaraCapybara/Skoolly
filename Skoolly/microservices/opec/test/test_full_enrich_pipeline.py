import json
import urllib.parse
import requests
import re
import sys
import io
import os
import time
import copy
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import (
    is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant,
    clean_thai_addr, dynamic_resolve_school_en_name, is_garbled_name,
    format_full_thai_address, PROVINCE_BOUNDS
)

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=35, pool_maxsize=35)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate"
})

def extract_coordinates_from_web_optimized(url, province=""):
    if not url:
        return None, None
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u
    try:
        with web_session.get(u, timeout=1.8, stream=True, allow_redirects=True) as r:
            if r.status_code == 200:
                chunks = []
                total = 0
                for chunk in r.iter_content(chunk_size=16384):
                    chunks.append(chunk)
                    total += len(chunk)
                    if total > 65536:
                        break
                text = b"".join(chunks).decode('utf-8', errors='ignore')
                
                m = re.search(r'google\.com/maps[^\s"\'<>]*?[?&]q=([0-9\.]+),([0-9\.]+)', text)
                if m and is_coords_in_province(m.group(1), m.group(2), province):
                    return m.group(1), m.group(2)
                m2 = re.search(r'!3d([0-9\.]+)!4d([0-9\.]+)', text)
                if m2 and is_coords_in_province(m2.group(1), m2.group(2), province):
                    return m2.group(1), m2.group(2)
                m3 = re.search(r'@([0-9]{1,2}\.[0-9]{4,8}),([0-9]{2,3}\.[0-9]{4,8})', text)
                if m3 and is_coords_in_province(m3.group(1), m3.group(2), province):
                    return m3.group(1), m3.group(2)
    except Exception:
        pass
    return None, None

def geocode_arcgis_precision_optimized(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # 1. Full POI Queries (ArcGIS)
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
        if not q or len(q) < 4:
            continue
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

    # 3. Open-Meteo District Fallback (Single fast query)
    for place in [district, subdistrict, province]:
        if not place:
            continue
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

# Let's load the raw OPEC data before enrichment
with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

test_schools = copy.deepcopy(schools)

# Reset the 16 missing English names and the 72 missing GPS coordinates to test full Auto-Enrich pipeline
missing_en_th_names = [
    "นานาชาติแอสเตอร์ กรุงเทพ", "นานาชาติสิงคโปร์สุวรรณภูมิ", "นานาชาติแฮมพ์ตั้น", "นานาชาติเด่นหล้า บริติช",
    "นานาชาติ จอห์น ไวแอท มอนเตสซอรี", "นานาชาติแอ๊ดเวนติสมิชชัน", "นานาชาติธาราพัฒนา", "นานาชาติมูลตรีภักดี",
    "นานาชาติบูรพาพัฒนศาสตร์", "อนุบาลนานาชาติฮานาคริสเตียน", "นานาชาติปัญญาเด่น", "นานาชาติอเมริกาน่า ไชนีส",
    "นานาชาติแครนเบอร์รี่", "นานาชาติสานฝัน", "นานาชาติ เฮดสตาร์ท", "นานาชาติอเมริกัน เพรพ"
]

for s in test_schools:
    if s.get("school_name_th") in missing_en_th_names:
        s["school_name_en"] = ""
    if s.get("gps_source") != "OPEC Official":
        s["latitude"] = "0"
        s["longitude"] = "0"

en_targets = [s for s in test_schools if not str(s.get("school_name_en") or "").strip() or is_garbled_name(s.get("school_name_en"))]
gps_targets = [s for s in test_schools if is_imprecise_centroid(s.get("latitude"), s.get("longitude"))]

print(f"Phase 1 EN Targets:  {len(en_targets)} schools")
print(f"Phase 2 GPS Targets: {len(gps_targets)} schools")

start_pipeline = time.time()

# ----------------- Phase 1: EN Names (max_workers=35) -----------------
def process_en(s):
    res_en = dynamic_resolve_school_en_name(s)
    if res_en:
        s["school_name_en"] = res_en

with ThreadPoolExecutor(max_workers=35) as executor:
    list(executor.map(process_en, en_targets))

time_phase1 = time.time() - start_pipeline
print(f"Phase 1 (EN Names) completed in {round(time_phase1, 2)}s")

# ----------------- Phase 2: GPS Coordinates (max_workers=12) -----------------
start_phase2 = time.time()

def process_gps(s):
    p = s.get("province", "")
    web = str(s.get("website") or "").strip()
    
    # 1. Website Map Embed
    if web:
        w_lat, w_lon = extract_coordinates_from_web_optimized(web, p)
        if w_lat and w_lon:
            s["latitude"] = w_lat
            s["longitude"] = w_lon
            s["gps_source"] = "Website Map Embed"
            s["gps_precision"] = "Exact"
            return s, "Exact", "Website Map Embed"

    # 2. Optimized Geocoder
    th = s.get("school_name_th", "")
    en = s.get("school_name_en", "")
    addr = s.get("address", "")
    d = s.get("district", "")
    sd = s.get("subdistrict", "")
    lat, lon, src, prec = geocode_arcgis_precision_optimized(th, en, addr, d, p, sd)
    if lat and lon:
        s["latitude"] = lat
        s["longitude"] = lon
        s["gps_source"] = src
        s["gps_precision"] = prec
        return s, prec, src
    return s, "None", "None"

with ThreadPoolExecutor(max_workers=12) as executor:
    results_gps = list(executor.map(process_gps, gps_targets))

time_phase2 = time.time() - start_phase2
total_time = time.time() - start_pipeline

exact_count = sum(1 for _, prec, _ in results_gps if prec == "Exact")
approx_count = sum(1 for _, prec, _ in results_gps if prec == "Approximate")

print(f"\n=======================================================")
print(f"Phase 1 Time (EN):      {round(time_phase1, 2)} seconds")
print(f"Phase 2 Time (GPS):     {round(time_phase2, 2)} seconds")
print(f"TOTAL PIPELINE TIME:    {round(total_time, 2)} seconds (vs 321 seconds previously!)")
print(f"Exact High-Precision:   {exact_count}/{len(gps_targets)} ({round(exact_count/len(gps_targets)*100, 1)}%)")
print(f"Approximate District:   {approx_count}/{len(gps_targets)} ({round(approx_count/len(gps_targets)*100, 1)}%)")
print(f"Total Full DB Coverage: {len(test_schools) - len(gps_targets) + exact_count}/{len(test_schools)} ({round((len(test_schools) - len(gps_targets) + exact_count)/len(test_schools)*100, 1)}%)")
print(f"SPEEDUP FACTOR:         {round(321 / max(total_time, 1), 1)}x Faster!")
print(f"=======================================================")
