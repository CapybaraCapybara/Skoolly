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

from enrich_school_data import is_imprecise_centroid, is_coords_in_province, is_poi_name_relevant, clean_thai_addr

session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=35, pool_maxsize=35)
session.mount("https://", adapter)
session.mount("http://", adapter)
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate"
})

def extract_map_fast(url, province=""):
    if not url: return None, None
    u = url.strip()
    if not u.startswith("http"): u = "https://" + u
    try:
        with session.get(u, timeout=1.2, stream=True, allow_redirects=True) as r:
            if r.status_code == 200:
                chunks = []
                total = 0
                for chunk in r.iter_content(chunk_size=16384):
                    chunks.append(chunk)
                    total += len(chunk)
                    if total > 49152: break
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

def geocode_fast(th, en, addr, d, p, sd=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', th).strip()
    clean_en = str(en or "").strip()
    raw_addr = str(addr or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # 1. POI Query
    poi_queries = []
    if clean_en: poi_queries.append(clean_en)
    if clean_th: poi_queries.append(f"โรงเรียน{clean_th}")
    if clean_en and d: poi_queries.append(f"{clean_en}, {d}")
    if clean_th and p: poi_queries.append(f"{clean_th} {p}")

    for q in poi_queries:
        if not q or len(q) < 3: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = session.get(url, timeout=1.5)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched = c.get("address", "").strip()
                    if lat and lon and score >= 60 and is_poi_name_relevant(matched, th, en):
                        if is_coords_in_province(lat, lon, p):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched}", "Exact"
        except Exception:
            pass

    # 2. Street Query
    street_queries = []
    if cleaned_addr:
        street_queries.append(cleaned_addr)
        no_house = re.sub(r'^\d+[\d\/\-]*\s*', '', cleaned_addr).strip()
        if no_house and no_house != cleaned_addr:
            street_queries.append(no_house)

    soi_m = re.search(r'(ซอย\s*[^,\s]+)', raw_addr)
    road_m = re.search(r'(ถนน\s*[^,\s]+)', raw_addr)
    if soi_m and road_m and d and p:
        street_queries.append(f"{clean_thai_addr(soi_m.group(1))} {clean_thai_addr(road_m.group(1))} {d} {p}")
    elif road_m and d and p:
        street_queries.append(f"{clean_thai_addr(road_m.group(1))} {d} {p}")

    for q in street_queries:
        if not q or len(q) < 4: continue
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
        try:
            r = session.get(url, timeout=1.5)
            if r.status_code == 200:
                cands = r.json().get("candidates", [])
                if cands:
                    c = cands[0]
                    score = c.get("score", 0)
                    loc = c.get("location", {})
                    lat, lon = str(loc.get("y")), str(loc.get("x"))
                    matched = c.get("address", "").strip()
                    if lat and lon and score >= 70 and is_coords_in_province(lat, lon, p):
                        return lat, lon, f"ArcGIS Street Address ({score}%) - {matched}", "Exact"
        except Exception:
            pass

    # 3. District Fallback (1 Fast Centroid Query)
    for place in [d, sd, p]:
        if not place: continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = session.get(url, timeout=1.0)
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    lat, lon = str(results[0].get("latitude")), str(results[0].get("longitude"))
                    if is_coords_in_province(lat, lon, p):
                        return lat, lon, f"District Centroid ({place}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    return None, None, None, "None"

def process_one(s):
    th = s.get("school_name_th", "")
    en = s.get("school_name_en", "")
    p = s.get("province", "")
    d = s.get("district", "")
    sd = s.get("subdistrict", "")
    addr = s.get("address", "")
    web = str(s.get("website") or "").strip()

    # 1. Map Embed
    if web:
        w_lat, w_lon = extract_map_fast(web, p)
        if w_lat and w_lon:
            return s, w_lat, w_lon, "Website Map Embed", "Exact"

    # 2. Geocode
    lat, lon, src, prec = geocode_fast(th, en, addr, d, p, sd)
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

print(f"Loaded {len(targets)} exact target schools from user run.")

start = time.time()
exact_count = 0
approx_count = 0

with ThreadPoolExecutor(max_workers=14) as executor:
    results = list(executor.map(process_one, targets))

for s, lat, lon, src, prec in results:
    th = s.get('school_name_th', '')
    if prec == "Exact":
        exact_count += 1
        print(f"  ✅ [EXACT] {th[:25]} -> {src[:45]}")
    else:
        approx_count += 1
        print(f"  ⚠️ [APPROX] {th[:25]} -> {src[:45]}")

elapsed = time.time() - start
print(f"\n=======================================================")
print(f"Total Time:    {round(elapsed, 2)} seconds (Previously 321 seconds)")
print(f"Exact Matches: {exact_count}/{len(targets)} ({round(exact_count/len(targets)*100, 1)}%)")
print(f"Approx Matches:{approx_count}/{len(targets)} ({round(approx_count/len(targets)*100, 1)}%)")
print(f"Speedup:       {round(321 / max(elapsed, 1), 1)}x Faster!")
print(f"=======================================================")
