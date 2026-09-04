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

from enrich_school_data import is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant, clean_thai_addr, PROVINCE_BOUNDS

# High performance connection pool
fast_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(
    pool_connections=50, 
    pool_maxsize=50, 
    max_retries=requests.adapters.Retry(total=1, backoff_factor=0.1)
)
fast_session.mount("https://", adapter)
fast_session.mount("http://", adapter)
fast_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate"
})

def fast_extract_coordinates_from_web(url, province=""):
    if not url:
        return None, None
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u
    try:
        # Fast streaming get (read max 100KB to find map embeds fast)
        with fast_session.get(u, timeout=1.8, stream=True, allow_redirects=True) as r:
            if r.status_code == 200:
                chunks = []
                total = 0
                for chunk in r.iter_content(chunk_size=16384):
                    chunks.append(chunk)
                    total += len(chunk)
                    if total > 98304: # 96 KB is plenty for head/footer/embeds
                        break
                text = b"".join(chunks).decode('utf-8', errors='ignore')
                
                # 1. maps.google.com/maps?q=lat,lon or !3dlat!4dlon or @lat,lon
                m_q = re.search(r'google\.com/maps[^\s"\'<>]*?[?&]q=([0-9\.]+),([0-9\.]+)', text)
                if m_q:
                    lat, lon = m_q.group(1), m_q.group(2)
                    if is_coords_in_province(lat, lon, province):
                        return lat, lon
                
                m_3d = re.search(r'!3d([0-9\.]+)!4d([0-9\.]+)', text)
                if m_3d:
                    lat, lon = m_3d.group(1), m_3d.group(2)
                    if is_coords_in_province(lat, lon, province):
                        return lat, lon

                m_at = re.search(r'@([0-9]{1,2}\.[0-9]{4,8}),([0-9]{2,3}\.[0-9]{4,8})', text)
                if m_at:
                    lat, lon = m_at.group(1), m_at.group(2)
                    if is_coords_in_province(lat, lon, province):
                        return lat, lon
    except Exception:
        pass
    return None, None

def fast_geocode_precision(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # -------------------------------------------------------------
    # Tier 1: Fast Targeted POI Queries (Highest Confidence First)
    # -------------------------------------------------------------
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
            r = fast_session.get(url, timeout=1.8)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 60 and is_poi_name_relevant(matched_addr, school_name_th, school_name_en):
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # -------------------------------------------------------------
    # Tier 2: Cleaned Street Address & Road Variations (ArcGIS)
    # -------------------------------------------------------------
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

    for q in street_queries:
        if not q or len(q) < 4: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = fast_session.get(url, timeout=1.8)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 70 and is_coords_in_province(lat, lon, province):
                        return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # -------------------------------------------------------------
    # Tier 3: District / Subdistrict Fallback (Open-Meteo Centroid)
    # -------------------------------------------------------------
    for place in [subdistrict, district, province]:
        if not place: continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = fast_session.get(url, timeout=1.5)
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

def process_single(s):
    th_name = s.get("school_name_th", "")
    en_name = s.get("school_name_en", "")
    p = s.get("province", "")
    d = s.get("district", "")
    sd = s.get("subdistrict", "")
    address = s.get("address", "")
    web = str(s.get("website") or "").strip()

    # 1. Website Map Embed
    if web:
        w_lat, w_lon = fast_extract_coordinates_from_web(web, p)
        if w_lat and w_lon:
            return s, w_lat, w_lon, "Website Map Embed", "Exact"

    # 2. Fast Geocoder
    lat, lon, src, prec = fast_geocode_precision(th_name, en_name, address, d, p, sd)
    return s, lat, lon, src, prec

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

targets = [s for s in schools if is_imprecise_centroid(s.get('latitude'), s.get('longitude'))]
print(f"Total targets: {len(targets)}")

start_time = time.time()
exact_count = 0
approx_count = 0

with ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(process_single, s) for s in targets]
    for fut in as_completed(futures):
        s, lat, lon, src, prec = fut.result()
        if prec == "Exact":
            exact_count += 1
            print(f"  [EXACT] {s.get('school_name_th')[:25]} -> {src[:35]}")
        else:
            approx_count += 1
            print(f"  [APPROX] {s.get('school_name_th')[:25]} -> {src}")

elapsed = time.time() - start_time
print(f"\n=======================================================")
print(f"Time Taken: {round(elapsed, 2)} seconds")
print(f"Exact Matches: {exact_count}/{len(targets)} ({round(exact_count/len(targets)*100, 1)}%)")
print(f"Approx Matches: {approx_count}/{len(targets)} ({round(approx_count/len(targets)*100, 1)}%)")
print(f"=======================================================")
