import json
import urllib.parse
import requests
import re
import os
import sys
import io
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import is_imprecise_centroid, is_coords_in_province, format_full_thai_address, is_poi_name_relevant, extract_coordinates_from_web

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=60, pool_maxsize=60)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)

def geocode_arcgis_precision_full(school_name_th, school_name_en, address, district, province):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    
    # 1. POI Campus Queries
    queries = []
    if clean_en:
        queries.append(f"{clean_en} {province} Thailand")
        queries.append(f"{clean_en} {district} {province}")
        queries.append(f"{clean_en}")
    if clean_th:
        queries.append(f"{school_name_th} {province}")
        queries.append(f"{clean_th} {province}")
        
    for q in queries:
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
                    
                    if lat and lon and score >= 70 and is_poi_name_relevant(matched_addr, school_name_th, school_name_en):
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched_addr}"
        except Exception:
            pass

    # 2. Exact Street Address Query
    if address and len(address) > 10:
        addr_q = f"{school_name_th} {address}"
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(addr_q)}&f=json&maxLocations=1"
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
                    if lat and lon and score >= 80 and is_coords_in_province(lat, lon, province):
                        return lat, lon, f"ArcGIS Address ({score}%) - {matched_addr}"
        except Exception:
            pass

    # 3. Photon OSM POI
    if clean_en or school_name_th:
        for q in [f"{clean_en} {province}", f"{school_name_th} {province}"]:
            if not q.strip(): continue
            try:
                url = f"https://photon.komoot.io/api/?q={urllib.parse.quote(q)}&limit=1"
                r = web_session.get(url, timeout=2.0)
                if r.status_code == 200:
                    features = r.json().get("features", [])
                    if features:
                        f = features[0]
                        coords = f.get("geometry", {}).get("coordinates", [])
                        if len(coords) >= 2:
                            lon, lat = str(coords[0]), str(coords[1])
                            if is_coords_in_province(lat, lon, province):
                                return lat, lon, f"Photon OSM POI - {f.get('properties', {}).get('name', '')}"
            except Exception:
                pass

    return None, None, None

def process_single(s):
    th = s.get('school_name_th', '')
    en = s.get('school_name_en', '')
    addr = format_full_thai_address(s)
    d = s.get('district', '')
    p = s.get('province', '')
    web = s.get('website', '')

    lat, lon, src = None, None, None
    if web:
        lat, lon = extract_coordinates_from_web(web, p)
        if lat and lon:
            src = "Website Map Embed"

    if not lat:
        lat, lon, src = geocode_arcgis_precision_full(th, en, addr, d, p)

    return s, lat, lon, src

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

targets = [s for s in schools if is_imprecise_centroid(s.get('latitude'), s.get('longitude'))]
print(f"Total targets needing GPS: {len(targets)}")

with ThreadPoolExecutor(max_workers=30) as executor:
    results = list(executor.map(process_single, targets))

found = 0
not_found = []
for s, lat, lon, src in results:
    th = s.get('school_name_th', '')
    en = s.get('school_name_en', '')
    if lat and lon:
        found += 1
        print(f"[{s.get('school_code')}] FOUND: {th} ({en}) -> {lat[:9]}, {lon[:10]} ({src})")
    else:
        not_found.append((s.get('school_code'), th, en))

print(f"\n=======================================================")
print(f"Total Schools in DB: {len(schools)}")
print(f"Total with OPEC GPS: {len(schools) - len(targets)}")
print(f"Enriched by Geocoder: {found}/{len(targets)}")
print(f"Total Coverage: {len(schools) - len(targets) + found}/{len(schools)} ({round((len(schools) - len(targets) + found)/len(schools)*100, 1)}%)")
print(f"=======================================================")
