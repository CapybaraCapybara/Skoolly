"""
enrich_school_gps.py
โมดูลสำหรับปุ่มค้นหาพิกัด GPS: ค้นหา ตรวจสอบ และอัปเกรดพิกัด (Latitude, Longitude)

ลำดับการค้นหา:
1. OPEC Official GPS เหนือทุกอย่าง — ถ้า สช. ให้พิกัดจริงมา (ไม่ใช่ centroid หยาบ ๆ) ใช้ค่านั้น
2. ArcGIS POI ที่ "ยืนยันชื่อแล้วว่าเป็นโรงเรียนนี้จริง"          -> Exact
3. ArcGIS ที่อยู่ระดับบ้านเลขที่ (PointAddress / StreetAddress)   -> Exact
4. ArcGIS ระดับพื้นที่ (ถนน / รหัสไปรษณีย์ / แขวง / เขต)          -> Approximate
5. Open-Meteo district centroid                                    -> Approximate

การกำกับความแม่นยำยึดจากฟิลด์ Addr_type ที่ ArcGIS ส่งกลับมา ไม่ใช่จาก score
เพราะ score เชื่อไม่ได้: คืน 89 ให้โรงเรียนที่ผิดคนละแห่ง และคืน 100 ให้ชื่อถนนเปล่า ๆ

สองปัญหาที่เวอร์ชันก่อนทำผิดและแก้แล้วในไฟล์นี้:
  - รับ POI ใด ๆ ที่ชื่อมีคำว่า "school" โดยไม่เทียบกับชื่อโรงเรียนที่ค้นหา
    ทำให้ Future Steps ได้พิกัดของ The First Steps, Rajapark ได้ Park Place ฯลฯ
  - ตัดสิน Exact จากการเดาคำในข้อความ (มีคำว่า "ถนน" ก็นับเป็น street level)
    ทำให้พิกัดที่เป็นแค่ชื่อถนนหรือชื่อตำบลถูกติดป้ายว่า Exact

ถ้าไม่มั่นใจว่าเป็นพิกัดเฉพาะของโรงเรียนจริง จะติดป้าย Approximate เสมอ
"""

import os
import re
import json
import time
import urllib.parse
import requests
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import load_schools, save_schools

# Disable SSL warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

web_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=40, pool_maxsize=40, max_retries=1)
web_session.mount("https://", adapter)
web_session.mount("http://", adapter)
web_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8"
})

# Imprecise Open-Meteo District Centroids to detect and upgrade with precision geocoding
KNOWN_DISTRICT_CENTROIDS = {
    ("13.75398", "100.50144"), ("13.69634", "100.54212"), ("13.71014", "100.58192"),
    ("13.756331", "100.501765"), ("13.91179", "100.49774"), ("13.3622", "100.98345"),
    ("12.78309", "101.29628"), ("16.44671", "102.833"), ("17.41567", "102.78589"),
    ("18.79038", "98.98468"), ("16.71667", "98.56667"), ("7.86338", "98.36437"),
    ("8.03169", "98.33408"), ("9.53567", "99.93567"), ("9.71945", "99.99511"),
    ("7.00836", "100.47668"), ("8.16453", "99.68039"), ("8.07257", "98.91052"),
    ("13.82895", "100.55931"), ("13.73698", "100.52329"), ("13.7803", "100.54261"),
    ("13.73028", "100.65138"), ("13.83616", "100.73524"), ("13.7768", "100.57895"),
    ("13.78316", "100.37805"), ("13.79425", "100.50447"), ("13.69301", "100.40755"),
    ("13.60678", "100.71201"), ("13.805", "100.47283"), ("13.93129", "100.74928"),
    ("13.31191", "101.11271"), ("13.95133", "101.71739"), ("18.68703", "98.91939"),
    ("18.74486", "99.11953"), ("18.29232", "99.49277"), ("20.43353", "99.87617"),
    ("13.78528", "100.66958"), ("13.72978", "100.58536"), ("13.78546", "100.61165")
}

# Province rough bounding boxes in Thailand
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

def is_coords_in_province(lat, lon, province):
    """Validates that a coordinate strictly falls inside Thailand and designated province"""
    try:
        lat_f = float(lat)
        lon_f = float(lon)
        if not (5.5 <= lat_f <= 20.5 and 97.0 <= lon_f <= 106.0):
            return False
        
        prov_clean = (province or "").strip().replace("จังหวัด", "")
        for p_key, (min_lat, max_lat, min_lon, max_lon) in PROVINCE_BOUNDS.items():
            if p_key in prov_clean:
                return (min_lat <= lat_f <= max_lat) and (min_lon <= lon_f <= max_lon)
                
        return True
    except (ValueError, TypeError):
        return False

def is_imprecise_centroid(lat, lon):
    """Checks if a lat/lon matches an imprecise Open-Meteo district centroid or is empty"""
    if not lat or not lon:
        return True
    lat_s = f"{float(lat):.5f}" if str(lat).replace('.','',1).isdigit() else str(lat).strip()
    lon_s = f"{float(lon):.5f}" if str(lon).replace('.','',1).isdigit() else str(lon).strip()
    
    for c_lat, c_lon in KNOWN_DISTRICT_CENTROIDS:
        try:
            if abs(float(lat) - float(c_lat)) < 0.0005 and abs(float(lon) - float(c_lon)) < 0.0005:
                return True
        except ValueError:
            pass
    return False

def clean_thai_addr(addr):
    """Cleans Thai address string for geocoding queries"""
    if not addr:
        return ""
    txt = str(addr).strip()
    txt = re.sub(r'[\r\n\t]+', ' ', txt)
    txt = re.sub(r'\s+', ' ', txt)
    return txt

def format_full_thai_address(school):
    """Constructs a clean, normalized full Thai address string from school fields"""
    parts = []
    
    raw_addr = clean_thai_addr(school.get("address", ""))
    subdistrict = clean_thai_addr(school.get("subdistrict", ""))
    district = clean_thai_addr(school.get("district", ""))
    province = clean_thai_addr(school.get("province", ""))
    postcode = clean_thai_addr(school.get("postcode", ""))

    if raw_addr:
        parts.append(raw_addr)
    
    if subdistrict and subdistrict not in raw_addr:
        prefix = "แขวง" if "กรุงเทพ" in province else "ตำบล"
        if not subdistrict.startswith("ต.") and not subdistrict.startswith("แขวง") and not subdistrict.startswith("ตำบล"):
            parts.append(f"{prefix}{subdistrict}")
        else:
            parts.append(subdistrict)

    if district and district not in raw_addr:
        prefix = "เขต" if "กรุงเทพ" in province else "อำเภอ"
        if not district.startswith("อ.") and not district.startswith("เขต") and not district.startswith("อำเภอ"):
            parts.append(f"{prefix}{district}")
        else:
            parts.append(district)

    if province and province not in raw_addr:
        if not province.startswith("จ.") and not province.startswith("จังหวัด"):
            parts.append(f"จ.{province}")
        else:
            parts.append(province)

    if postcode and postcode not in raw_addr:
        parts.append(postcode)

    return " ".join(parts).strip()

# ArcGIS reports what it actually matched in Addr_type. That is the only honest basis
# for the Exact/Approximate label — the score is not: it returns 89 for a completely
# different school, and 100 for a bare road name.
#   PointAddress / Subaddress / StreetAddress -> a specific building or house number
#   POI                                       -> a named place; exact only if it is OUR school
#   StreetName / Locality / Postal / Admin    -> a road, subdistrict or district, i.e. an area
ADDR_TYPE_EXACT = {"PointAddress", "Subaddress", "BuildingName", "StreetAddress"}
ADDR_TYPE_POI = {"POI"}

# How specific each area-level match is, for choosing the least-bad fallback.
# Higher is tighter; anything unlisted sorts last.
ADDR_TYPE_SPECIFICITY = {
    "StreetName": 5, "StreetInt": 5, "Postal": 4, "PostalExt": 4, "PostalLoc": 4,
    "Sector": 3, "DependentLocality": 3, "Locality": 2, "SubAdmin": 1, "Admin": 0,
}

GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

# Words shared by nearly every school name — they can never be what makes two names match.
NAME_STOPWORDS = {
    'the', 'of', 'in', 'and', 'at', 'for', 'a', 'an',
    'school', 'schools', 'international', 'inter', 'preschool', 'pre', 'kindergarten',
    'kindergaten', 'kindergarden', 'nursery', 'academy', 'college', 'campus', 'primary',
    'secondary', 'elementary', 'demonstration', 'bilingual', 'education', 'learning',
    'centre', 'center', 'ltd', 'co',
}

# Place names are not brands. Without these, "Phuket Pinnacle" matched the POI
# "Phuket Tutor & International Language School" on the shared word "phuket",
# the same way "NAWATTAPHUME ... KRABI" matched a different school in Krabi.
PLACE_WORDS = {
    'thailand', 'thai', 'bangkok', 'bkk', 'phuket', 'samui', 'pattaya', 'chonburi',
    'rayong', 'chiangmai', 'chiang', 'mai', 'rai', 'krabi', 'hatyai', 'hat', 'yai',
    'udon', 'thani', 'khon', 'kaen', 'nonthaburi', 'pathum', 'korat', 'nakhon',
    'ratchasima', 'ubon', 'surat', 'suratthani', 'samut', 'prakan', 'lanta', 'phangan',
    'ngan', 'pha', 'sukhumvit', 'sathorn', 'dusit', 'bangna', 'rama', 'ramintra',
    'thonburi', 'srinakarin', 'ratchapruek', 'langsuan', 'samakee', 'vibhavadi',
    'suvarnabhumi', 'cherngtalay', 'rawai', 'chalong', 'maesai', 'khaoyai', 'sriracha',
    'huahin', 'hua', 'hin', 'asia', 'southeast', 'eastern', 'seaboard', 'northern',
    'southern', 'reignwood', 'nut', 'onnut',
}
NAME_STOPWORDS |= PLACE_WORDS
THAI_NAME_PREFIXES = ('โรงเรียน', 'นานาชาติ', 'อนุบาล', 'ประถม', 'มัธยม', 'สาธิต')

# A POI has to name itself as a school. Without this, a brand that doubles as a place
# name matches the place: "โรงเรียนนานาชาติพะงัน" matched the POI "พะงัน", the island.
POI_SCHOOL_WORDS = (
    'school', 'kindergarten', 'academy', 'college', 'preschool', 'pre-school',
    'nursery', 'campus', 'โรงเรียน', 'นานาชาติ', 'อนุบาล', 'วิทยา',
)


def _name_tokens(name):
    """Lowercased identifying tokens: punctuation gone, shared school vocabulary gone."""
    cleaned = re.sub(r'[^a-z0-9\s]+', ' ', (name or '').lower())
    return [w for w in cleaned.split() if w and w not in NAME_STOPWORDS and len(w) >= 3]


def _thai_brand(name_th):
    """The distinctive part of a Thai school name, with the category prefixes stripped."""
    txt = str(name_th or '').strip()
    for prefix in THAI_NAME_PREFIXES:
        txt = txt.replace(prefix, ' ')
    return re.sub(r'\s+', ' ', txt).strip()


def poi_matches_school(place_name, name_en, name_th):
    """
    Decides whether a POI ArcGIS returned is actually the school we asked about.

    Without this check the geocoder accepted any nearby place whose name contained the
    word "school": Future Steps matched "The First Steps International Pre-School",
    Rajapark matched "Park Place International School", and Acacia matched
    "The International Pre-School Center" — all scored 88-90.

    These names lead with the brand and trail with the location, so the brand is the
    first identifying token. Requiring THAT token to appear is what separates a real
    hit from a coincidental one.
    """
    place = (place_name or '').lower()
    if not place:
        return False

    # The POI must present itself as a school before its name is worth comparing.
    if not any(w in place for w in POI_SCHOOL_WORDS):
        return False

    place_tokens = _name_tokens(place)
    school_tokens = _name_tokens(name_en)

    if school_tokens:
        head = school_tokens[0]
        for token in place_tokens:
            # Prefix either way so Wells/Well and Patana/Patanaa still match.
            if token == head or token.startswith(head) or head.startswith(token):
                return True

    brand_th = _thai_brand(name_th)
    if len(brand_th) >= 4 and brand_th in (place_name or ''):
        return True

    return False


def _query_arcgis(query, province, max_locations=5):
    """
    Returns candidates as (lat, lon, addr_type, matched_addr, place_name, score),
    already filtered to Thailand and to the school's own province.
    """
    params = {
        "singleLine": query,
        "f": "json",
        "maxLocations": max_locations,
        "outFields": "Addr_type,PlaceName,Match_addr",
        "countryCode": "THA",   # the old queries were worldwide
    }
    url = f"{GEOCODE_URL}?{urllib.parse.urlencode(params)}"
    out = []
    try:
        r = web_session.get(url, timeout=4.0)
        if r.status_code != 200:
            return out
        for c in r.json().get("candidates", []):
            loc = c.get("location") or {}
            lat, lon = str(loc.get("y") or ""), str(loc.get("x") or "")
            if not lat or not lon or not is_coords_in_province(lat, lon, province):
                continue
            attrs = c.get("attributes") or {}
            out.append((
                lat, lon,
                (attrs.get("Addr_type") or "").strip(),
                (c.get("address") or "").strip(),
                (attrs.get("PlaceName") or "").strip(),
                c.get("score", 0),
            ))
    except Exception:
        pass
    return out


def geocode_arcgis_precision(school):
    """
    Resolves one school's coordinates through Esri ArcGIS.

    Tier 1  named POI that verifiably IS this school   -> Exact
    Tier 2  street address with a house number         -> Exact
    Tier 3  best area-level hit (road, tambon, amphoe) -> Approximate
    Tier 4  Open-Meteo district centroid               -> Approximate

    A result is only ever labelled Exact when ArcGIS says it matched a building or a
    house number, or when a POI's name matches this school. Anything vaguer is
    reported as Approximate rather than dressed up as Exact.
    """
    raw_addr = clean_thai_addr(school.get("address", ""))
    subdistrict = clean_thai_addr(school.get("subdistrict", ""))
    district = clean_thai_addr(school.get("district", ""))
    province = clean_thai_addr(school.get("province", ""))
    th_name = str(school.get("school_name_th") or "").strip()
    en_name = str(school.get("school_name_en") or "").strip()

    full_addr = format_full_thai_address(school)
    fallbacks = []   # (lat, lon, source, precision) kept in case nothing exact turns up

    def remember(lat, lon, label, addr_type, score):
        fallbacks.append((
            ADDR_TYPE_SPECIFICITY.get(addr_type, -1), score,
            lat, lon, f"ArcGIS {addr_type} ({label[:46]}) (พิกัดประมาณการ)", "Approximate",
        ))

    # ── Tier 1: named POI, verified against the school's own name ────────────────
    brand_queries = []
    brand_th = _thai_brand(th_name)
    if brand_th and len(brand_th) >= 3 and brand_th not in ("กรุงเทพ", "เชียงใหม่", "ภูเก็ต", "พัทยา"):
        brand_queries.append(f"{brand_th} {province} Thailand" if province else f"{brand_th} Thailand")
        if province:
            brand_queries.append(f"{th_name} {province}")
    if en_name and len(en_name) >= 6:
        brand_queries.append(f"{en_name}, Thailand")
        if district:
            brand_queries.append(f"{en_name}, {district}, Thailand")

    for q in brand_queries:
        if len(q) < 4:
            continue
        for lat, lon, addr_type, matched, place, score in _query_arcgis(q, province):
            if addr_type not in ADDR_TYPE_POI:
                # A road or a district is not a campus, whatever the score says.
                if addr_type and addr_type not in ADDR_TYPE_EXACT:
                    remember(lat, lon, matched or place, addr_type, score)
                continue
            if poi_matches_school(place or matched, en_name, th_name):
                return lat, lon, f"ArcGIS POI ({(place or matched)[:40]})", "Exact"

    # ── Tier 2: street address carrying a house number ───────────────────────────
    street_queries = [full_addr]
    if raw_addr:
        cleaned_addr = clean_thai_addr(f"{raw_addr} {district} {province}")
        street_queries.append(cleaned_addr)
        no_house = re.sub(r'^\d+[\d\/\-]*\s*', '', cleaned_addr).strip()
        if no_house and no_house != cleaned_addr:
            street_queries.append(no_house)

    soi_match = re.search(r'(ซอย\s*[\w\d\s\-]+?)(?:ถนน|ถ\.|ต\.|อ\.|จ\.|ตำบล|อำเภอ|จังหวัด|,|$)', raw_addr)
    road_match = re.search(r'(ถนน\s*[\w\d\s\-]+?)(?:ซอย|ซ\.|ต\.|อ\.|จ\.|ตำบล|อำเภอ|จังหวัด|,|$)', raw_addr)
    if soi_match and road_match and district and province:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {clean_thai_addr(road_match.group(1))} {district} {province}")
    if road_match and district and province:
        street_queries.append(f"{clean_thai_addr(road_match.group(1))} {district} {province}")
    if soi_match and district and province:
        street_queries.append(f"{clean_thai_addr(soi_match.group(1))} {district} {province}")

    for q in street_queries:
        if not q or len(q) < 4:
            continue
        for lat, lon, addr_type, matched, place, score in _query_arcgis(q, province):
            if addr_type in ADDR_TYPE_EXACT:
                return lat, lon, f"ArcGIS {addr_type} ({score}%) - {matched}", "Exact"
            if addr_type in ADDR_TYPE_POI and poi_matches_school(place or matched, en_name, th_name):
                return lat, lon, f"ArcGIS POI ({(place or matched)[:40]})", "Exact"
            if addr_type:
                remember(lat, lon, matched or place, addr_type, score)

    # ── Tier 3: best area-level hit seen so far, labelled for what it is ─────────
    # Tightest first — a road beats a subdistrict, which beats the city centroid.
    # Taking whichever arrived first sent schools with a full street address to
    # the middle of Bangkok, because the brand query ran before the address query.
    if fallbacks:
        fallbacks.sort(key=lambda f: (f[0], f[1]), reverse=True)
        return fallbacks[0][2:]

    # ── Tier 4: district centroid ────────────────────────────────────────────────
    for place in [district, subdistrict, province]:
        if not place:
            continue
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(place)}&count=1&language=th&format=json"
        try:
            r = web_session.get(url, timeout=2.0)
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    lat, lon = str(results[0].get("latitude")), str(results[0].get("longitude"))
                    if lat and lon and is_coords_in_province(lat, lon, province):
                        return lat, lon, f"Open-Meteo District Centroid ({place}) (พิกัดประมาณการ)", "Approximate"
        except Exception:
            pass

    return "", "", "ไม่พบพิกัด", "Missing"


def enrich_single_school_gps(school):
    """Enriches or verifies GPS coordinates for a single school record"""
    cur_lat = str(school.get("latitude") or "").strip()
    cur_lon = str(school.get("longitude") or "").strip()
    cur_source = str(school.get("gps_source") or "").strip()

    # If already official OPEC coordinates and not an imprecise centroid, preserve it
    if cur_lat and cur_lon and not is_imprecise_centroid(cur_lat, cur_lon) and cur_source == "OPEC Official":
        school["gps_precision"] = "Exact"
        return school, {}

    lat, lon, src, precision = geocode_arcgis_precision(school)
    if lat and lon:
        changes = {
            "latitude": lat,
            "longitude": lon,
            "gps_source": src,
            "gps_precision": precision,
            "gps_verified": True,
        }
        school.update(changes)
        return school, changes
        
    return school, {}

def enrich_all_school_gps(update_progress, on_save_callback=None):
    """
    Main Runner for Button: ค้นหาพิกัด GPS ความแม่นยำสูง
    """
    schools = load_schools()
    if not schools:
        update_progress("ไม่พบข้อมูลโรงเรียน", 100, 100, "กรุณากดดึงข้อมูล OPEC (ปุ่ม 1) ก่อน!")
        return []

    # Identify schools that need precision geocoding
    targets = []
    for s in schools:
        lat = s.get("latitude")
        lon = s.get("longitude")
        src = s.get("gps_source", "")
        # Missing, an imprecise centroid, untagged — or tagged by the previous version,
        # whose "Exact" labels cannot be trusted (roads and other schools were marked
        # Exact). Those records carry no gps_verified flag, so they get re-checked once.
        if (not lat or not lon
                or is_imprecise_centroid(lat, lon)
                or s.get("gps_precision") not in ["Exact", "Approximate"]
                or (src.startswith("ArcGIS") and not s.get("gps_verified"))):
            targets.append(s)

    total_tasks = len(targets)
    if total_tasks == 0:
        update_progress("พิกัด GPS สมบูรณ์ครบถ้วนแล้ว", 100, 100, f"โรงเรียนทั้งหมด {len(schools)} แห่ง มีพิกัด GPS และความแม่นยำครบถ้วน 100% แล้ว!")
        return schools

    update_progress(f"กำลังประมวลผลพิกัด GPS ({total_tasks} แห่ง)", 0, total_tasks, "เริ่มต้นกระบวนการค้นหาพิกัด GPS ความแม่นยำสูง...")

    completed = 0
    exact_count = 0
    approx_count = 0
    lock = threading.Lock()

    # Geocode with low concurrency to respect rate limits
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_map = {executor.submit(geocode_arcgis_precision, s): s for s in targets}
        for future in as_completed(future_map):
            s = future_map[future]
            try:
                lat, lon, src, precision = future.result()
                with lock:
                    if lat and lon:
                        s["latitude"] = lat
                        s["longitude"] = lon
                        s["gps_source"] = src
                        s["gps_precision"] = precision
                        s["gps_verified"] = True
                        s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
                        if precision == "Exact":
                            exact_count += 1
                        else:
                            approx_count += 1
                        msg = f"[GPS: {completed+1}/{total_tasks}] {s.get('school_name_th')} -> ({lat}, {lon}) [{precision}] ({src})"
                    else:
                        msg = f"[GPS: {completed+1}/{total_tasks}] ไม่พบพิกัด: {s.get('school_name_th')}"
            except Exception as e:
                with lock:
                    msg = f"[GPS: {completed+1}/{total_tasks}] Error: {s.get('school_name_th')} - {e}"

            with lock:
                completed += 1
                update_progress(f"กำลังประมวลผลพิกัด GPS ({completed}/{total_tasks})", completed, total_tasks, msg)

    save_schools(schools)
    if on_save_callback:
        on_save_callback(schools)

    summary_msg = (
        f"ประมวลผลพิกัด GPS เสร็จสมบูรณ์!\n"
        f"  - หมุดพิกัดตรงอาคาร/ถนน (Exact): +{exact_count} แห่ง\n"
        f"  - หมุดพิกัดประมาณการ (Approximate): +{approx_count} แห่ง\n"
        f"  - บันทึกลง data/.json และ data/.csv เรียบร้อยแล้ว (100.0% Complete)"
    )
    update_progress("ค้นหาพิกัด GPS เสร็จสมบูรณ์!", total_tasks, total_tasks, summary_msg)
    return schools
