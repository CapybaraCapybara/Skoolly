import json
import urllib.parse
import requests
import re
import sys
import io
import os
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from enrich_school_data import (
    is_imprecise_centroid, is_coords_in_province, clean_thai_addr, PROVINCE_BOUNDS
)

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(
    pool_connections=15, 
    pool_maxsize=15,
    max_retries=requests.adapters.Retry(total=2, backoff_factor=0.3)
)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
})

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
    'krabi', 'surat', 'chiangrai', 'branch', 'the', 'and', 'for', 'ltd', 'co'
}

def extract_core_brand_tokens(name_th, name_en):
    """Extracts distinctive brand tokens (e.g. DBS, Aster, Raintree, Denla, KIS)"""
    tokens_en = set()
    for w in re.findall(r'[A-Za-z]{3,}', name_en or ''):
        w_low = w.lower()
        if w_low not in GENERIC_EN_WORDS:
            tokens_en.add(w_low)

    tokens_th = set()
    # Strip prefixes
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', name_th or '').strip()
    clean_th = re.sub(r'^อนุบาล(นานาชาติ)?\s*', '', clean_th).strip()
    clean_th = re.sub(r'^ประถม(นานาชาติ)?\s*', '', clean_th).strip()
    
    for w in re.findall(r'[\u0E00-\u0E7F]{3,}', clean_th):
        if w not in GENERIC_THAI_WORDS:
            tokens_th.add(w)

    return tokens_th, tokens_en

def is_strict_poi_match(matched_addr, name_th, name_en):
    """Strictly validates if a POI match contains the school's unique brand token"""
    if not matched_addr:
        return False
    matched_low = matched_addr.lower()
    
    tokens_th, tokens_en = extract_core_brand_tokens(name_th, name_en)
    if not tokens_th and not tokens_en:
        return False

    # For English tokens: At least one distinctive token must match
    for t in tokens_en:
        if len(t) >= 4 and t in matched_low:
            return True
        elif len(t) == 3 and re.search(r'\b' + re.escape(t) + r'\b', matched_low):
            return True

    # For Thai tokens:
    for t in tokens_th:
        if len(t) >= 4 and t in matched_addr:
            return True

    return False

def is_street_level_address(matched_addr):
    """
    Checks if a matched address actually pinpoints a Street, Road, Soi, or House Number.
    If it's just a postal code, subdistrict, district, or province (e.g. '84330, แม่น้ำ, เกาะสมุย'),
    it is NOT a street-level exact pin!
    """
    if not matched_addr:
        return False
    
    # Must have specific street/road/soi/house indicator
    has_street_kw = any(kw in matched_addr for kw in ['ถนน', 'ซอย', 'ซ.', 'ถ.', 'แยก', 'หมู่บ้าน', 'อาคาร', 'เลขที่'])
    has_en_street = any(kw in matched_addr.lower() for kw in ['road', ' rd', 'soi', 'street', 'st.', 'lane', 'avenue', 'ave', 'bldg', 'building'])
    has_house_num = bool(re.search(r'\b\d+[\d\/\-]*\s+(ถนน|ซอย|ถ\.|ซ\.|road|soi)', matched_addr, re.IGNORECASE))

    # Reject if it's purely postal codes + tambon/amphoe
    if not (has_street_kw or has_en_street or has_house_num):
        return False

    return True

def geocode_strict_precision(school_name_th, school_name_en, address, district, province, subdistrict=""):
    clean_th = re.sub(r'^(โรงเรียน)?นานาชาติ\s*', '', school_name_th).strip()
    clean_en = str(school_name_en or "").strip()
    raw_addr = str(address or "").strip()
    cleaned_addr = clean_thai_addr(raw_addr)

    # -------------------------------------------------------------------------
    # Tier 1: Strict ArcGIS POI Campus Match
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

    # -------------------------------------------------------------------------
    # Tier 2: Strict Street / Soi Match
    # -------------------------------------------------------------------------
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
                    
                    if lat and lon and score >= 75 and is_coords_in_province(lat, lon, province):
                        # Verify if this is actually a Street level match or merely a Tambon/Postal Centroid!
                        if is_street_level_address(matched_addr):
                            return lat, lon, f"ArcGIS Street Address ({score}%) - {matched_addr}", "Exact"
                        else:
                            # It's a postal code/tambon centroid -> Approximate!
                            return lat, lon, f"ArcGIS Area/Subdistrict Centroid ({matched_addr[:30]}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    # -------------------------------------------------------------------------
    # Tier 3: Open-Meteo District Fallback -> Approximate
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

# Test on the specific schools the user mentioned
user_specific_schools = [
    ("นานาชาติจีน", "China International School", "88 ซอยรามอินทรา 65 ถนนรามอินทรา แขวงท่าแร้ง เขตบางเขน กรุงเทพมหานคร 10230", "บางเขน", "กรุงเทพมหานคร"),
    ("นานาชาติรีเจ้นท์-หลังสวน", "Regent's International School Lang Suan", "หลังสวน ลุมพินี ปทุมวัน กรุงเทพมหานคร 10330", "ปทุมวัน", "กรุงเทพมหานคร"),
    ("นานาชาติบ้านอินทนิล", "Baan Inthanin International School", "ตำบลแม่น้ำ อำเภอเกาะสมุย จังหวัดสุราษฎร์ธานี 84330", "เกาะสมุย", "สุราษฎร์ธานี"),
    ("นานาชาติเด่นหล้า บริติช", "DBS Denla British School", "58 หมู่ 2 ถนนราชพฤกษ์ ตำบลอ้อมเกร็ด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120", "ปากเกร็ด", "นนทบุรี"),
    ("เด่นหล้า พระราม 5", "Denla Rama 5", "บางขุนกอง บางกรวย นนทบุรี", "บางกรวย", "นนทบุรี"),
    ("นานาชาติเคไอเอสเรนวูดปาร์ค", "KIS International School Reignwood Park", "ลำลูกกา ปทุมธานี", "ลำลูกกา", "ปทุมธานี"),
    ("นานาชาติสิงคโปร์ระยอง", "Singapore International School Rayong", "บ้านค่าย ระยอง", "บ้านค่าย", "ระยอง"),
    ("นานาชาติ ดัลลิช คอลเลจ กรุงเทพ", "Dulwich College Bangkok", "กรุงเทพมหานคร", "วัฒนา", "กรุงเทพมหานคร"),
    ("นานาชาติเดอะแพสชั่น", "The Passion International School", "ทุ่งสง นครศรีธรรมราช", "ทุ่งสง", "นครศรีธรรมราช")
]

print("=== TESTING STRICT PRECISION GEOCODER ===")
for th, en, addr, d, p in user_specific_schools:
    lat, lon, src, prec = geocode_strict_precision(th, en, addr, d, p)
    print(f"\n[{prec}] {th} ({en})")
    print(f"  -> Lat/Lon: {lat}, {lon}")
    print(f"  -> Source:  {src}")
