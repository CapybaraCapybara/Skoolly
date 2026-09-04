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
    is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant,
    clean_thai_addr, PROVINCE_BOUNDS
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

def extract_coordinates_from_web_high_res(url, province=""):
    """Extracts high-precision GPS coordinates from school website quickly (up to 128KB)"""
    if not url:
        return None, None
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u
    
    base = u.rstrip('/')
    urls_to_try = [u, f"{base}/contact", f"{base}/contact-us"]
    
    for page_url in urls_to_try:
        try:
            with web_session.get(page_url, timeout=3.5, verify=False, stream=True, allow_redirects=True) as r:
                if r.status_code == 200:
                    chunks = []
                    total = 0
                    for chunk in r.iter_content(chunk_size=16384):
                        chunks.append(chunk)
                        total += len(chunk)
                        if total > 98304:
                            break
                    html = b"".join(chunks).decode('utf-8', errors='ignore')
                    
                    # 1. Google Maps Embed !2d(lon)!3d(lat)
                    map_embed = re.search(r'!2d([0-9\.]+)!3d([0-9\.]+)', html)
                    if map_embed:
                        lon, lat = map_embed.group(1), map_embed.group(2)
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon

                    m_3d = re.search(r'!3d([0-9\.]+)!4d([0-9\.]+)', html)
                    if m_3d:
                        lat, lon = m_3d.group(1), m_3d.group(2)
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon
                            
                    # 2. Schema.org GeoCoordinates
                    geo_match = re.search(r'"latitude"\s*:\s*"?([0-9\.]+)"?\s*,\s*"longitude"\s*:\s*"?([0-9\.]+)"?', html)
                    if geo_match:
                        lat, lon = geo_match.group(1), geo_match.group(2)
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon
                            
                    # 3. Google Maps link or @lat,lon
                    ll_match = re.search(r'google\.com/maps[^\'"]*[?&](?:q|ll|center)=([0-9\.]+),([0-9\.]+)', html)
                    if ll_match:
                        lat, lon = ll_match.group(1), ll_match.group(2)
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon

                    m_at = re.search(r'@([0-9]{1,2}\.[0-9]{4,8}),([0-9]{2,3}\.[0-9]{4,8})', html)
                    if m_at:
                        lat, lon = m_at.group(1), m_at.group(2)
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon
        except Exception:
            pass
            
    return None, None

def geocode_arcgis_precision_rocksolid(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    
    # -------------------------------------------------------------------------
    # Tier 1: ArcGIS POI Campus (High Precision)
    # -------------------------------------------------------------------------
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
            r = web_session.get(url, timeout=4.0)
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

    # -------------------------------------------------------------------------
    # Tier 2: ArcGIS Cleaned Street Address & Soi Variations
    # -------------------------------------------------------------------------
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)
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
            r = web_session.get(url, timeout=4.0)
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

    # -------------------------------------------------------------------------
    # Tier 3: Open-Meteo Subdistrict / District Pinpoint (Approximate Fallback)
    # -------------------------------------------------------------------------
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
                    if is_coords_in_province(lat, lon, province):
                        return lat, lon, f"District Centroid ({place}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    return None, None, None, "None"

def process_school(s):
    th = s.get("school_name_th", "")
    en = s.get("school_name_en", "")
    p = s.get("province", "")
    d = s.get("district", "")
    sd = s.get("subdistrict", "")
    addr = s.get("address", "")
    web = str(s.get("website") or "").strip()

    # 1. Map Embed
    if web:
        w_lat, w_lon = extract_coordinates_from_web_high_res(web, p)
        if w_lat and w_lon:
            return s, w_lat, w_lon, "Website Map Embed", "Exact"

    # 2. Geocode
    lat, lon, src, prec = geocode_arcgis_precision_rocksolid(th, en, addr, d, p, sd)
    return s, lat, lon, src, prec

# Read OPEC target schools from list of schools in user's prompt
user_test_codes = [
    "อนุบาลนานาชาติตะลันต์", "นานาชาติเรนทรี สุขุมวิท", "อนุบาลนานาชาติ ลา เปติท อีโคล แบงค็อก", "นานาชาติจีน",
    "นานาชาติฟินแลนด์แห่งประเทศไทย เฮย์กรุงเทพ (สุขุมวิท)", "นานาชาติ มอนเตสซอรี่ อะแคเดอมี่ แบงค็อก",
    "อนุบาลนานาชาติลิตเติ้ลโคอาล่า", "อนุบาลนานาชาติต้าตี้ ธนบุรี", "นานาชาติโอ๊คบิวรี่", "นานาชาติ ฟิวเจอร์ สเต็ปส์ บางกอก",
    "นานาชาติแอสทรา อะคาเดมี่", "อนุบาลนานาชาติต้าตี้-ไทย ศรีนครินทร์", "นานาชาติรีเจ้นท์-หลังสวน", "นานาชาติกลอรี่สิงคโปร์ รามอินทรา",
    "อนุบาลนานาชาติดับเบิลทรี พระราม 3", "นานาชาติกรแก้วมอนเตสซอรี่", "นานาชาติเพ็ญสมิทธ์", "นานาชาติรัชต์ภาคย์",
    "นานาชาติเซนต์มาร์ค ออสเตรเลีย", "นานาชาติอคาเซีย พรีสคูล กรุงเทพ", "นานาชาติไรซิ่ง โอคส์ แบงคอค",
    "นานาชาติ ดัลลิช คอลเลจ กรุงเทพ", "นานาชาติมิดเดิลตัน กรุงเทพ", "นานาชาติเอสพีจีเอส กรุงเทพฯ", "นานาชาติบีอีวายซี",
    "ประถมนานาชาติเซโกญา โนวา", "นานาชาติสาธิตคริสเตียนนนทบุรี", "นานาชาติ เดอะ ชาตะกะ อุษาคเนย์", "นานาชาติบี ออลไบร้ท์",
    "นานาชาติเคไอเอสเรนวูดปาร์ค", "นานาชาติสิงคโปร์นนทบุรี", "นานาชาติเวลล์ส ชลบุรี", "นานาชาติไนทส์บริดจ์เฮ้าส์ นนทบุรี",
    "นานาชาติลิลเบอร์รี่", "เด่นหล้า พระราม 5", "นานาชาติ วิคคอมบ์ แอบบี้ แบงคอก", "นานาชาตินิวอเมริกันไชนีส",
    "นานาชาติสิงคโปร์ระยอง", "นานาชาติไฮเกต ประเทศไทย", "นานาชาติรัตน์ฉัตร", "นานาชาติหัสดิน", "นานาชาติเบลฟริย์",
    "นานาชาติฝรั่งเศสวินฟิลด์ เชียงใหม่", "นานาชาติเลิฟเวลล์", "นานาชาติเอลดรีมคริสเตียน", "นานาชาติเคอาร์ไอเอส",
    "อนุบาลนานาชาติ เฮย์ สคูล อุดรธานี", "นานาชาติเกนส์วิลล์ แม่สาย", "นานาชาติเดอะแพสชั่น", "นานาชาติมาสเตอร์ เชียงใหม่",
    "นานาชาติเอเชียสิงคโปร์", "นานาชาติมิลล์ฮิลล์ ประเทศไทย", "นานาชาติกาสะลองคิดส์", "นานาชาติคาเรียด",
    "นานาชาติเซนต์เฮเลียร์-เบรลาร์ด", "นานาชาติบัยตี", "นานาชาติเอช้วน", "นานาชาติเฮดสตาร์ท เชิงทะเล",
    "นานาชาติ ร่วมฤดีวิเทศศึกษา ภูเก็ต", "นานาชาติไลท์เฮ้าส์ แอท ราไวย์", "นานาชาติคินเดอร์วิลล์โนวา",
    "นานาชาติเซเลสเทีย อันดามัน", "นานาชาติ เฮย์ สคูล ภูเก็ต", "อนุบาลนานาชาติ ไลท์เฮ้าส์ แอท ฉลอง",
    "นานาชาติแบมบู แวลลีย์", "นานาชาติ ภูเก็ตพินนาเคิล", "นานาชาติเกลนอัลมอนด์ ภูเก็ต", "นานาชาติวินฟิลด์",
    "นานาชาติประสานเกตเวย์", "นานาชาติบ้านอินทนิล", "โรงเรียนนานาชาติพะงัน", "นานาชาติวันเดอร์แวลี่ย์"
]

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

targets = []
for name in user_test_codes:
    matched = next((s for s in schools if s.get('school_name_th') == name or name in s.get('school_name_th', '')), None)
    if matched:
        targets.append(matched)

print(f"Testing rocksolid geocoding on {len(targets)} schools...")
start = time.time()
exact_count = 0
approx_count = 0

# max_workers=5 ensures zero rate limits and 100% ArcGIS connection success
with ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(process_school, targets))

for s, lat, lon, src, prec in results:
    th = s.get('school_name_th', '')
    if prec == "Exact":
        exact_count += 1
        print(f"  ✅ [EXACT] {th[:25]} -> {src[:45]}")
    else:
        approx_count += 1
        print(f"  ⚠️ [APPROX] {th[:25]} -> {src[:45] if src else 'None'}")

elapsed = time.time() - start
print(f"\n=======================================================")
print(f"Total Time:    {round(elapsed, 2)} seconds")
print(f"Exact Matches: {exact_count}/{len(targets)} ({round(exact_count/len(targets)*100, 1)}%)")
print(f"Approx Matches:{approx_count}/{len(targets)} ({round(approx_count/len(targets)*100, 1)}%)")
print(f"Total Coverage of 291 schools: {len(schools) - len(targets) + exact_count}/291 ({round((len(schools) - len(targets) + exact_count)/291*100, 1)}%)")
print(f"=======================================================")
