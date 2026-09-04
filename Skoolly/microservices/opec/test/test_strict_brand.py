import json
import urllib.parse
import requests
import re
import sys
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import is_coords_in_province, clean_thai_addr

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
})

GENERIC_THAI_WORDS = {
    'โรงเรียน', 'นานาชาติ', 'อนุบาล', 'ประถม', 'มัธยม', 'วิทยาลัย', 'คอลเลจ',
    'อินเตอร์', 'อินเตอร์เนชั่นแนล', 'สคูล', 'สาขา', 'ศึกษา', 'วิเทศศึกษา',
    'พัฒนา', 'แห่งประเทศไทย', 'ประเทศไทย', 'ไทย', 'กรุงเทพมหานคร', 'กรุงเทพ',
    'ภูเก็ต', 'เชียงใหม่', 'พัทยา', 'สมุย', 'เกาะสมุย', 'ระยอง', 'นนทบุรี', 'ชลบุรี',
    'ขอนแก่น', 'อุดรธานี', 'ลำปาง', 'ลำพูน', 'สงขลา', 'หาดใหญ่', 'กระบี่',
    'สุราษฎร์ธานี', 'เชียงราย', 'แม่สาย', 'แม่สอด', 'ตาก', 'สุขุมวิท', 'พระราม',
    'หลังสวน', 'ชิดลม', 'พร้อมพงษ์', 'ทองหล่อ', 'เอกมัย', 'สาทร', 'สีลม',
    'อโศก', 'พญาไท', 'อารีย์', 'บางนา', 'ลาดพร้าว', 'รามอินทรา', 'รามคำแหง',
    'ปิ่นเกล้า', 'บางกอก', 'บางกอกน้อย', 'พระนคร', 'ยานนาวา', 'คลองเตย',
    'วัฒนา', 'ห้วยขวาง', 'จตุจักร', 'บางกะปิ', 'บางแค', 'ทวีวัฒนา', 'บางพลัด',
    'ปากเกร็ด', 'บางกรวย', 'เมือง', 'ในเมือง', 'นอกเมือง', 'เกาะ', 'อ่าว',
    'หาด', 'เชิงทะเล', 'ถลาง', 'ฉลอง', 'ราไวย์', 'กะทู้', 'ป่าตอง', 'วิชิต',
    'ไม้ขาว', 'ป่าคลอก', 'แม่น้ำ', 'บ่อผุด', 'มะเร็ต', 'หน้าทอน', 'แม่ปะ',
    'หนองควาย', 'หางดง', 'สารภี', 'สันทราย', 'สันกำแพง', 'แม่ริม', 'ดอยสะเก็ด'
}

GENERIC_EN_WORDS = {
    'international', 'school', 'schools', 'kindergarten', 'preschool', 'academy',
    'college', 'prep', 'preparatory', 'early', 'years', 'learning', 'center',
    'centre', 'campus', 'education', 'educational', 'community', 'thailand',
    'bangkok', 'phuket', 'pattaya', 'chiangmai', 'chiang', 'mai', 'samui',
    'rayong', 'nonthaburi', 'chonburi', 'khonkaen', 'udon', 'thani', 'lampang',
    'krabi', 'surat', 'chiangrai', 'branch', 'the', 'and', 'for', 'ltd', 'co',
    'city', 'north', 'south', 'east', 'west', 'road', 'street', 'lane',
    'langsuan', 'lang', 'suan', 'sukhumvit', 'rama', 'sathorn', 'silom',
    'asoke', 'phayathai', 'ari', 'bangna', 'ladprao', 'ramintra', 'ramkhamhaeng',
    'pinklao', 'pakkret', 'hangdong', 'saraphi', 'thalang', 'chalong', 'rawai'
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
        if len(t) >= 3 and t in matched_addr:
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

def geocode_ultimate(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # 1. Exact Street Address with House Number & Soi/Road (Most specific localized pin!)
    if cleaned_addr and bool(re.search(r'\b\d+[\d\/\-]*', cleaned_addr)):
        url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(cleaned_addr)}&f=json&maxLocations=1"
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
                    if lat and lon and score >= 85 and is_street_level_address(matched_addr) and is_coords_in_province(lat, lon, province):
                        return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # 2. POI Campus
    poi_queries = []
    if clean_en:
        if district:
            poi_queries.append(f"{clean_en}, {district}")
        poi_queries.append(f"{clean_en}")
        poi_queries.append(f"{clean_en}, Thailand")
    if clean_th:
        if district:
            poi_queries.append(f"โรงเรียน{clean_th} {district}")
        poi_queries.append(f"โรงเรียน{clean_th}")
        poi_queries.append(f"{school_name_th}")

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
                        if is_coords_in_province(lat, lon, province):
                            return lat, lon, f"ArcGIS POI Campus ({score}%) - {matched_addr}", "Exact"
        except Exception:
            pass

    # 3. Soi / Street without House Number
    street_queries = []
    if cleaned_addr:
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
                    
                    if lat and lon and score >= 75 and is_coords_in_province(lat, lon, province):
                        if is_street_level_address(matched_addr):
                            return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
                        else:
                            return lat, lon, f"ArcGIS Area Centroid ({matched_addr[:30]}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    # 4. Open-Meteo District Centroid (Approximate Fallback)
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

test_cases = [
    ("นานาชาติจีน", "China International School", "88 ซอยรามอินทรา 65 ถนนรามอินทรา แขวงท่าแร้ง เขตบางเขน กรุงเทพมหานคร 10230", "บางเขน", "กรุงเทพมหานคร"),
    ("นานาชาติรีเจ้นท์-หลังสวน", "Regent's International School Lang Suan", "หลังสวน ลุมพินี ปทุมวัน กรุงเทพมหานคร 10330", "ปทุมวัน", "กรุงเทพมหานคร"),
    ("นานาชาติบ้านอินทนิล", "Baan Inthanin International School", "ตำบลแม่น้ำ อำเภอเกาะสมุย จังหวัดสุราษฎร์ธานี 84330", "เกาะสมุย", "สุราษฎร์ธานี"),
    ("นานาชาติอคาเซีย พรีสคูล กรุงเทพ", "Acacia Preschool Bangkok", "4/2 ซอยประสาทสุข แขวงช่องนนทรี เขตยานนาวา กรุงเทพมหานคร 10120", "ยานนาวา", "กรุงเทพมหานคร")
]

for th, en, addr, d, p in test_cases:
    lat, lon, src, prec = geocode_ultimate(th, en, addr, d, p)
    print(f"\n[{prec}] {th} ({en})")
    print(f"  -> Lat/Lon: {lat}, {lon}")
    print(f"  -> Source:  {src}")
