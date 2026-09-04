import json
import urllib.parse
import requests
import re
import sys
import io
import os
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant, extract_coordinates_from_web, clean_thai_addr

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
})

def geocode_maximum_drill(s):
    th = str(s.get('school_name_th', '') or '').strip()
    en = str(s.get('school_name_en', '') or '').strip()
    raw_addr = str(s.get('address', '') or '').strip()
    p = str(s.get('province', '') or '').strip()
    d = str(s.get('district', '') or '').strip()
    sd = str(s.get('subdistrict', '') or '').strip()
    web = str(s.get('website', '') or '').strip()

    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', th).strip()
    clean_en = str(en or "").strip()

    # Tier 1: Website Map Embed (100% building pin)
    if web:
        lat, lon = extract_coordinates_from_web(web, p)
        if lat and lon:
            return lat, lon, "Website Map Embed", "Exact Building"

    # Tier 2: Pure POI Campus Queries (ArcGIS + Nominatim)
    poi_queries = []
    if clean_en:
        poi_queries.append(clean_en)
        poi_queries.append(f"{clean_en}, Thailand")
        if d: poi_queries.append(f"{clean_en}, {d}")
    if th:
        poi_queries.append(f"โรงเรียน{clean_th}")
        poi_queries.append(f"{th}")
        if p: poi_queries.append(f"{clean_th} {p}")

    for q in poi_queries:
        if not q or len(q) < 3: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=3.5)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 60 and is_poi_name_relevant(matched_addr, th, en) and is_coords_in_province(lat, lon, p):
                        return lat, lon, f"ArcGIS POI ({score}%) - {matched_addr}", "Exact Campus"
        except Exception:
            pass

    # Tier 3: Cleaned Street Address & Road Variations (ArcGIS)
    cleaned_addr = clean_thai_addr(raw_addr)
    street_queries = []
    if cleaned_addr:
        street_queries.append(cleaned_addr)
        no_house = re.sub(r'^\d+[\d\/\-]*\s*', '', cleaned_addr).strip()
        if no_house and no_house != cleaned_addr:
            street_queries.append(no_house)

    soi_match = re.search(r'(ซอย\s*[^,\s]+)', raw_addr)
    road_match = re.search(r'(ถนน\s*[^,\s]+)', raw_addr)
    if soi_match and road_match and d and p:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {clean_thai_addr(road_match.group(1))} {d} {p}")
    if road_match and d and p:
        street_queries.append(f"{clean_thai_addr(road_match.group(1))} {d} {p}")
    if soi_match and d and p:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {d} {p}")

    for q in street_queries:
        if not q or len(q) < 4: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = web_session.get(url, timeout=3.5)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched_addr = c.get("address", "").strip()
                    if lat and lon and score >= 70 and is_coords_in_province(lat, lon, p):
                        return lat, lon, f"ArcGIS Street ({score}%) - {matched_addr}", "Street Level"
        except Exception:
            pass

    # Tier 4: OpenStreetMap Nominatim Search (Fallback for Thailand Roads)
    osm_queries = []
    if road_match and p:
        osm_queries.append(f"{road_match.group(1)}, {d or ''}, {p}")
    if clean_th and p:
        osm_queries.append(f"{clean_th}, {p}")
    for q in osm_queries:
        if not q or len(q) < 4: continue
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&format=json&limit=1&countrycodes=th"
        try:
            r = web_session.get(url, timeout=3.0, headers={"User-Agent": "SchoolDataEnricher/3.0"})
            if r.status_code == 200:
                items = r.json()
                if items:
                    it = items[0]
                    lat, lon = str(it.get("lat")), str(it.get("lon"))
                    d_name = it.get("display_name", "")
                    if lat and lon and is_coords_in_province(lat, lon, p):
                        return lat, lon, f"OSM Road/POI - {d_name[:35]}", "Street Level"
        except Exception:
            pass

    # Tier 5: District / Subdistrict Fallback (Marked as Approx)
    for place in [sd, d, p]:
        if not place: continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = web_session.get(url, timeout=3.0)
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    res = results[0]
                    lat, lon = str(res.get("latitude")), str(res.get("longitude"))
                    if is_coords_in_province(lat, lon, p):
                        return lat, lon, f"District Centroid ({place})", "Approximate (District Level)"
        except Exception:
            pass

    return None, None, None, "Unknown"

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

targets = [s for s in schools if is_imprecise_centroid(s.get('latitude'), s.get('longitude'))]
print(f"Total target schools needing precision geocoding: {len(targets)}")

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(geocode_maximum_drill, targets))

exact_count = 0
approx_count = 0
not_found = 0

for s, (lat, lon, src, precision_type) in zip(targets, results):
    th = s.get('school_name_th', '')
    if precision_type in ["Exact Building", "Exact Campus", "Street Level"]:
        exact_count += 1
        print(f"✅ [EXACT: {precision_type}] {th} -> {lat[:9]}, {lon[:10]} | {src}")
    elif precision_type.startswith("Approximate"):
        approx_count += 1
        print(f"⚠️ [APPROX] {th} -> {lat[:9]}, {lon[:10]} | {src}")
    else:
        not_found += 1
        print(f"❌ [NOT FOUND] {th}")

print(f"\n=======================================================")
print(f"Exact Building/Street Pins: {exact_count}/{len(targets)} ({round(exact_count/len(targets)*100, 1)}%)")
print(f"Approximate District Pins:  {approx_count}/{len(targets)} ({round(approx_count/len(targets)*100, 1)}%)")
print(f"Total Database Exact Coverage: {len(schools) - len(targets) + exact_count}/{len(schools)} ({round((len(schools) - len(targets) + exact_count)/len(schools)*100, 1)}%)")
print(f"=======================================================")
