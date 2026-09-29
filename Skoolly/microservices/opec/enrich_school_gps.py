"""
enrich_school_gps.py
ปุ่มค้นหาพิกัด GPS: หาพิกัดของโรงเรียนจากหลายแหล่ง แล้วเทียบกันก่อนตัดสินว่า Exact จริงหรือไม่

แหล่งพิกัด (ดูรายละเอียดใน gps_sources.py) — ทั้งหมดฟรี ไม่ต้องมี API key:
  OPEC           หมุดที่โรงเรียนกรอกไว้ในระบบ สช.
  Overture Maps  เพจ Facebook ของโรงเรียน (ผ่าน Meta) จับคู่ด้วยโดเมนเว็บไซต์ เบอร์โทร หรือชื่อ
                 (คีย์เพจ Facebook แทบไม่ติด: Overture เก็บ page ID เป็นตัวเลข แต่ข้อมูลเราเป็นชื่อเพจ)
  OpenStreetMap  โรงเรียนใน OSM ที่ชื่อตรงกัน
  กรมการปกครอง   ข้อมูลเปิด gis-02 (สำรวจปี 2564 ไม่มีกรุงเทพฯ) ไฟล์ reference/dopa_gis02_schools.json
  เว็บไซต์โรงเรียน หมุดที่โรงเรียนเขียนเอง (JSON-LD, ลิงก์ที่พิมพ์พิกัด, OSM/Apple/Waze)
  ArcGIS         POI และบ้านเลขที่ — ใช้โหวตได้ แต่ไม่เก็บพิกัดของมัน (ดู LICENCE_MODE)

ความแม่นยำของแหล่งเดียว (วัดแบบ leave-one-source-out บนข้อมูลจริง ถูกภายใน 300 ม.):
  OSM ~91%  กรมการปกครอง ~90%  ArcGIS POI ~89%  Overture ~83%  หมุดบนเว็บโรงเรียน ~70%
  ไม่มีแหล่งไหนเชื่อได้เต็มที่ด้วยตัวเอง แต่ถ้าสองแหล่งที่เป็นอิสระต่อกันชี้ที่เดียวกัน โอกาสผิดพร้อมกันต่ำมาก

เกณฑ์:
  Exact / high    แหล่งจากอย่างน้อย 2 ผู้ให้บริการที่อิสระต่อกัน ห่างกันไม่เกิน ~350 ม. และต้องมี
                  สมาชิกของ OPEC เองหรืออยู่ในพื้นที่ที่จดทะเบียน (กันวิทยาเขตพี่น้อง)
  Exact / medium  POI ชื่อตรงแหล่งเดียว (OSM / Overture / กรมการปกครอง) อยู่ในพื้นที่ที่จดทะเบียน
                  ไม่มีหมุด OPEC แย้ง และแบรนด์มีวิทยาเขตเดียว
  Approximate     นอกนั้นทั้งหมด พร้อมเหตุผลใน gps_source และหลักฐานทุกแหล่งใน gps_evidence
  ถ้าหลายโรงเรียนได้ Exact ที่จุดเดียวกัน จะเหลือ Exact เฉพาะแห่งที่หมุด OPEC ของตัวเองยืนยัน

LICENCE_MODE "open" (ค่าเริ่มต้น): เก็บเฉพาะพิกัดที่สัญญาอนุญาตให้เก็บและแสดงบนแผนที่เราได้
  ไม่ใช้พิกัดที่มาจาก Google เลย (ข้อตกลง Google Maps ห้ามคัดลอกออกไปใช้ และห้ามแสดงบนแผนที่อื่น)
  ArcGIS แบบฟรีครอบคลุมเฉพาะการ geocode ที่ไม่เก็บผล จึงใช้โหวตได้แต่ไม่เก็บพิกัดของมัน
  หน้าเว็บที่แสดงแผนที่ต้องให้เครดิต OpenStreetMap, Overture Maps Foundation และกรมการปกครอง
"""

import io
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import gps_sources as src
from data_manager import load_schools, save_schools

GPS_METHOD = "consensus-v2"

AGREE_M = 350          # two pins this close are the same campus
AGREE_CAMERA_M = 450   # a Google embed camera centre sits up to ~300 m from its marker
AGREE_CAMPUS_M = 600   # OSM campus centre vs a gate pin, when the campus outline is unknown
CENTROID_M = 150       # an OPEC/address pin this close to a tambon/amphoe centre is that centre
# ~3 km slack around the registered area's ArcGIS extent. That extent is a symmetric box
# around the centroid, not the real outline, so a school on a district's far edge
# (Bromsgrove, Saen Saep on Min Buri's eastern border) needs the slack.
AREA_MARGIN_DEG = 0.027
SHARED_PINS_CACHE = os.path.join(src.CACHE_DIR, "gps_shared_pins.json")

# Overture's Thai school records are Facebook pages (Meta): their own family, independent
# of the OSM/ArcGIS "map" family.
FAMILY = {"opec": "opec", "website": "website", "osm": "map", "arcgis_poi": "map",
          "arcgis_address": "address", "overture": "overture", "dopa": "gov"}
SOURCE_NAME = {"opec": "OPEC", "website": "เว็บไซต์โรงเรียน", "osm": "OpenStreetMap",
               "arcgis_poi": "ArcGIS POI", "arcgis_address": "ArcGIS บ้านเลขที่",
               "overture": "Overture Maps", "dopa": "กรมการปกครอง"}

# "open" (default): only STORE coordinates whose licence allows it — OPEC, OpenStreetMap,
#   Overture, DOPA, and pins a school wrote itself. Google-derived pins (Maps embeds / place
#   URLs on school websites) are not used at all: Google's Maps terms forbid copying them out.
#   Esri ArcGIS may vote (its free tier covers geocodes that are not stored), but its
#   coordinates are never the stored point and are not written into gps_evidence.
# "all": use and store everything, as before.
LICENCE_MODE = os.environ.get("GPS_LICENCE_MODE", "open")
STORABLE_SOURCES = {"opec", "osm", "overture", "dopa"}


def _storable(c):
    if LICENCE_MODE != "open":
        return True
    return c["source"] in STORABLE_SOURCES or (c["source"] == "website" and c.get("origin") == "school")
OVERTURE_MIN_CONFIDENCE = 0.3
AREA_TYPES = {"Locality", "PostalLoc", "Postal", "DependentLocality", "SubAdmin", "Admin"}

# Province rough bounding boxes in Thailand — a cheap extra guard where listed
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
    "พะเยา": (18.70, 19.80, 99.65, 100.65),
}


def is_coords_in_province(lat, lon, province):
    """Validates that a coordinate strictly falls inside Thailand and designated province"""
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (ValueError, TypeError):
        return False
    if not src.in_thailand(lat_f, lon_f):
        return False
    prov_clean = (province or "").strip().replace("จังหวัด", "")
    for p_key, (min_lat, max_lat, min_lon, max_lon) in PROVINCE_BOUNDS.items():
        if p_key in prov_clean:
            return min_lat <= lat_f <= max_lat and min_lon <= lon_f <= max_lon
    return True


def clean_thai_addr(addr):
    """Cleans Thai address string for geocoding queries"""
    if not addr:
        return ""
    txt = re.sub(r'[\r\n\t]+', ' ', str(addr).strip())
    return re.sub(r'\s+', ' ', txt)


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
        parts.append(subdistrict if subdistrict.startswith(("ต.", "แขวง", "ตำบล")) else f"{prefix}{subdistrict}")
    if district and district not in raw_addr:
        prefix = "เขต" if "กรุงเทพ" in province else "อำเภอ"
        parts.append(district if district.startswith(("อ.", "เขต", "อำเภอ")) else f"{prefix}{district}")
    if province and province not in raw_addr:
        parts.append(province if province.startswith(("จ.", "จังหวัด")) else f"จ.{province}")
    if postcode and postcode not in raw_addr:
        parts.append(postcode)
    return " ".join(parts).strip()


def _radii(province, anchor):
    """
    (tight, loose) metres from the registered-area centre.

    tight: a lone pin is only trusted inside this. It depends on what the anchor is —
           ArcGIS has no khwaeng level for Bangkok, so there the anchor is always the
           whole khet (up to ~9 km centre-to-edge for Prawet or Lat Krabang).
    loose: beyond this it is another campus or another province, whoever says so.
    """
    bkk = "กรุงเทพ" in (province or "")
    level = (anchor or {}).get("level", "amphoe")
    if bkk:
        return 7000, 30000
    return (10000 if level == "tambon" else 20000), 60000


def _dist(a, b):
    return src.distance_m(a["lat"], a["lon"], b["lat"], b["lon"])


def _brand_key(school):
    """One key per school brand, so sister campuses do not look like strangers."""
    tokens = src.name_tokens(school.get("school_name_en") or "")
    key = tokens[0] if tokens else src.thai_brand(school.get("school_name_th") or "")
    return key.rstrip("s")


def _multi_campus_brands(schools):
    """Brand keys that more than one OPEC record carries (Wells, St Andrews, SISB ...)."""
    counts = {}
    for s in schools:
        key = _brand_key(s)
        if key:
            counts[key] = counts.get(key, 0) + 1
    return frozenset(k for k, n in counts.items() if n > 1)


def _pin_key(c):
    return f"{c['lat']:.4f},{c['lon']:.4f}"


# ─── collection ──────────────────────────────────────────────────────────────

def registered_areas(school):
    """
    ArcGIS centres of the school's registered tambon and amphoe (Bangkok: khet only —
    ArcGIS has no khwaeng level there). The first one is the anchor every lone pin is
    judged against: a campus sits in or near its registered area, a wrong pin usually
    does not.
    """
    prov = clean_thai_addr(school.get("province"))
    dist = clean_thai_addr(school.get("district"))
    sub = clean_thai_addr(school.get("subdistrict"))
    bkk = "กรุงเทพ" in prov
    queries = []
    if sub and dist and not bkk:
        queries.append(("tambon", f"ตำบล{sub} อำเภอ{dist} {prov}"))
    if dist:
        queries.append(("amphoe", f"{'เขต' if bkk else 'อำเภอ'}{dist} {prov}"))
    out = []
    for level, q in queries:
        for r in src.arcgis_records(q, 3):
            # The district must be named in the match, or ArcGIS picked a namesake elsewhere.
            if (r["addr_type"] in AREA_TYPES and (not dist or dist in r["match"])
                    and is_coords_in_province(r["lat"], r["lon"], prov)):
                out.append({"level": level, "lat": r["lat"], "lon": r["lon"], "label": r["match"],
                            "extent": r["extent"]})
                break
    return out


def _website_for(school, registry):
    code = str(school.get("school_code") or "").strip()
    return (school.get("website") or school.get("opec_website") or registry.get(code) or "").strip()


def _places_of(school):
    return tuple(clean_thai_addr(school.get(k)) for k in ("province", "district", "subdistrict") if school.get(k))


def overture_candidates(school, website_url, near, radius_m):
    """Overture places that are this school: by website domain, phone, Facebook page or name."""
    phones = [school.get("telephone"), school.get("mobile")]
    out = []
    for keys, score, r in src.overture_matches(
            school.get("school_name_en") or "", school.get("school_name_th") or "",
            website_url, [p for p in phones if p], school.get("facebook"), near, radius_m,
            _places_of(school))[:6]:
        if r["confidence"] < OVERTURE_MIN_CONFIDENCE:
            continue
        c = src.candidate(r["lat"], r["lon"], "overture", "campus", (r["names"] or [""])[0])
        c.update(score=score, keys=keys, confidence=r["confidence"], overture_id=r["id"],
                 category=r.get("category"))
        out.append(c)
    return out


def collect_candidates(school, website_url):
    """All candidate pins for one school, plus its registered-area centres."""
    en = (school.get("school_name_en") or "").strip()
    th = (school.get("school_name_th") or "").strip()
    prov = clean_thai_addr(school.get("province"))
    areas_ref = registered_areas(school)
    anchor = areas_ref[0] if areas_ref else None
    tight, loose = _radii(prov, anchor)
    cands, areas = [], []

    # The website crawl is the slowest step; run it alongside the ArcGIS queries.
    pin_pool = ThreadPoolExecutor(max_workers=1)
    pins_future = pin_pool.submit(src.website_pins, website_url)

    op = src.opec_point(school)
    if op:
        cands.append(op)

    near = (anchor["lat"], anchor["lon"]) if anchor else ((op["lat"], op["lon"]) if op else None)
    if near:
        for score, row in src.osm_matches(en, th, near, loose, _places_of(school))[:5]:
            c = src.candidate(row["lat"], row["lon"], "osm", "campus", " / ".join(row["names"][:2]))
            c.update(score=score, osm_id=row["id"], bbox=row.get("bbox"))
            cands.append(c)

    # The brand alone plus the school type ("Dadi International Kindergarten"): ArcGIS
    # misses some schools when the query also carries campus and place words.
    brand_only = " ".join(w for w in re.split(r'[\s\-,()]+', en)
                          if w and w.lower().replace("'s", "s") not in src.PLACE_WORDS)
    for c in overture_candidates(school, website_url, near, loose):
        cands.append(c)
    for score, r in src.dopa_matches(en, th, prov, _places_of(school))[:3]:
        c = src.candidate(r["lat"], r["lon"], "dopa", "campus", r["name"])
        c["score"] = score
        cands.append(c)

    seen = set()
    for q in (f"{en}, {prov}, Thailand" if en else "", f"{th} {prov}" if th else "",
              f"{brand_only}, Thailand" if brand_only and brand_only.lower() != en.lower() else ""):
        if not q:
            continue
        for lat, lon, at, match, place, score in src.arcgis(q):
            if at != "POI":
                continue
            s = src.name_match_score([place, match], en, th, _places_of(school))
            key = (round(lat, 5), round(lon, 5))
            if s and key not in seen:
                seen.add(key)
                c = src.candidate(lat, lon, "arcgis_poi", "campus", place or match)
                c["score"] = s
                cands.append(c)

    raw_addr = clean_thai_addr(school.get("address"))
    for q in (format_full_thai_address(school), re.sub(r'^\d+[\d/\-]*\s*', '', raw_addr)):
        if len(q) < 6:
            continue
        for lat, lon, at, match, place, score in src.arcgis(q, 3):
            if at in src.ADDR_TYPE_ADDRESS:
                cands.append(src.candidate(lat, lon, "arcgis_address", "address", f"{at}: {match}"))
            elif at in src.ADDR_TYPE_AREA_RANK:
                a = src.candidate(lat, lon, "area", "area", f"{at}: {match}")
                a["rank"] = src.ADDR_TYPE_AREA_RANK[at]
                areas.append(a)
        if any(c["source"] == "arcgis_address" for c in cands):
            break

    try:
        for lat, lon, kind, origin in pins_future.result(timeout=45):
            if origin == "google" and LICENCE_MODE == "open":
                continue
            c = src.candidate(lat, lon, "website", "campus", website_url)
            c["pin"], c["origin"] = kind, origin
            cands.append(c)
    except Exception:
        pass
    finally:
        pin_pool.shutdown(wait=False)

    # Guards: right province, not absurdly far from the registered tambon, and an
    # OPEC/address pin that IS the tambon/amphoe centre is an area, not a campus.
    kept = []
    for c in cands:
        if not is_coords_in_province(c["lat"], c["lon"], prov):
            continue
        if anchor:
            c["anchor_m"] = round(_dist(anchor, c))
            if c["anchor_m"] > loose:
                continue
        if c["source"] in ("opec", "arcgis_address", "overture") and any(_dist(a, c) < CENTROID_M for a in areas_ref):
            areas.append(dict(c, kind="area", rank=2, label=f"{SOURCE_NAME[c['source']]} = จุดกลางตำบล/อำเภอ"))
            continue
        kept.append(c)
    areas = [a for a in areas
             if is_coords_in_province(a["lat"], a["lon"], prov) and (not anchor or _dist(anchor, a) <= loose)]
    return {"anchor": anchor, "cands": kept, "areas": areas}


def find_shared_pins(collected, schools_by_code):
    """
    Pins that turn up for schools of different brands. On a website that is the web
    agency's default map (Koh Lanta and Chiang Mai both carried the same Bangkok pin);
    in OPEC it is a copy-paste between two unrelated schools.
    """
    # Compare by distance, not by rounded coordinates: the two Kids Kingdom records
    # carry OPEC pins 15 m apart, which rounding keeps apart but is plainly one spot.
    pins = {"website": [], "opec": []}
    for code, info in collected.items():
        brand = _brand_key(schools_by_code[code])
        for c in info["cands"]:
            if c["source"] in pins:
                pins[c["source"]].append((c, code, brand))

    def repeated(entries, owner_of):
        keys = set()
        for i, (a, code_a, brand_a) in enumerate(entries):
            for b, code_b, brand_b in entries[i + 1:]:
                if code_a != code_b and owner_of(brand_a, brand_b) and _dist(a, b) <= 60:
                    keys.update((_pin_key(a), _pin_key(b)))
        return sorted(keys)

    shared = {
        # websites: only across brands — a group site listing its own campuses is fine
        "website": repeated(pins["website"], lambda x, y: x != y),
        # OPEC: any repeat — one registration pin cannot be two campuses
        "opec": repeated(pins["opec"], lambda x, y: True),
    }

    # Merge with what earlier runs saw, so a single-school re-check still knows them.
    try:
        old = json.load(io.open(SHARED_PINS_CACHE, encoding="utf-8"))
        for k in shared:
            shared[k] = sorted(set(shared[k]) | set(old.get(k, [])))
    except Exception:
        pass
    try:
        os.makedirs(src.CACHE_DIR, exist_ok=True)
        io.open(SHARED_PINS_CACHE, "w", encoding="utf-8").write(json.dumps(shared))
    except Exception:
        pass
    return {k: set(v) for k, v in shared.items()}


def _load_shared_pins():
    try:
        return {k: set(v) for k, v in json.load(io.open(SHARED_PINS_CACHE, encoding="utf-8")).items()}
    except Exception:
        return {"website": set(), "opec": set()}


# ─── decision ────────────────────────────────────────────────────────────────

def _agree(a, b):
    """Same campus: close enough, or one pin lies inside the other's OSM campus outline."""
    limit = AGREE_CAMERA_M if "camera" in (a.get("pin"), b.get("pin")) else AGREE_M
    # An OSM campus polygon is represented by its centre; with the outline unknown,
    # allow for a big campus whose gate is 400+ m from that centre (ISB, Patana).
    if any(str(c.get("osm_id", "")).startswith(("w", "r")) and not c.get("bbox") for c in (a, b)):
        limit = max(limit, AGREE_CAMPUS_M)
    if _dist(a, b) <= limit:
        return True
    for outline, pin in ((a, b), (b, a)):
        bb = outline.get("bbox")
        if bb and bb[0] - 0.0005 <= pin["lat"] <= bb[2] + 0.0005 and bb[1] - 0.0005 <= pin["lon"] <= bb[3] + 0.0005:
            return True
    return False


def _identified(c):
    """
    A named candidate we can trust to BE this school on its own. Needs a full-strength name
    match (score >= 3; a match on descriptive words only scores 2, e.g. "Christian" + a town),
    or — for Overture — the school's own phone number or Facebook page. A shared website
    domain alone is not enough: it may be a sister campus (sisb.ac.th serves six).
    """
    if FAMILY[c["source"]] not in ("map", "overture", "gov"):
        return False
    if c.get("score", 0) >= 3:
        return True
    return c["source"] == "overture" and bool({"phone", "facebook"} & set(c.get("keys") or []))


def _map_rank(c):
    """Which member of an agreeing group goes on the map: the most precise one."""
    if c["source"] == "osm" and str(c.get("osm_id", "")).startswith(("w", "r")):
        return 0   # centre of the campus outline
    return {"arcgis_poi": 1, "osm": 2, "overture": 2, "dopa": 3, "opec": 4, "arcgis_address": 6}.get(
        c["source"], 3 if c.get("pin") == "place" else 5)


def _area_word(province, anchor):
    """What the anchor actually is, for the labels: tambon, amphoe, or Bangkok khet."""
    if (anchor or {}).get("level") == "tambon":
        return "ตำบล"
    return "เขต" if "กรุงเทพ" in (province or "") else "อำเภอ"


def _in_registered_area(c, anchor, tight):
    """
    Inside the school's registered area: within that area's ArcGIS extent plus ~2 km.
    The extent scales with the real district (Wattana is ~5 km across, Min Buri ~10,
    Nong Chok ~19), which a single radius cannot. Falls back to the radius when ArcGIS
    gave no extent.
    """
    if not anchor:
        return False
    ext = anchor.get("extent")
    if ext:
        m = AREA_MARGIN_DEG
        return ext[0] - m <= c["lat"] <= ext[2] + m and ext[1] - m <= c["lon"] <= ext[3] + m
    return c.get("anchor_m") is not None and c["anchor_m"] <= tight


def _evidence(cands, chosen):
    return [{"source": c["source"],
             **({"lat": c["lat"], "lon": c["lon"]} if _storable(c) else {}),
             "distance_m": round(_dist(c, chosen)), "label": str(c.get("label", ""))[:90],
             # the inputs decide() used, so a rule change can be re-checked offline
             **{k: c[k] for k in ("pin", "origin", "score", "osm_id", "anchor_m", "shared", "copy", "keys",
                                   "confidence", "overture_id", "category") if c.get(k) is not None}}
            for c in cands]


def _no_point(reason, cands, anchor=None):
    """Nothing we may store: no pin on the map rather than a coordinate nobody licensed us to keep."""
    return {"lat": "", "lon": "", "precision": "None", "confidence": "low", "source": reason,
            "confirmed_by": [], "anchor": anchor,
            "evidence": [dict(e, distance_m=None) for e in _evidence(cands, cands[0])] if cands else []}


def _result(chosen, precision, reason, cands, confirmed_by=(), anchor=None):
    # high: independent sources agree | medium: one name-verified POI | low: Approximate
    confidence = "low" if precision != "Exact" else ("high" if len(confirmed_by) >= 2 else "medium")
    return {"lat": f"{chosen['lat']:.7f}".rstrip("0"), "lon": f"{chosen['lon']:.7f}".rstrip("0"),
            "precision": precision, "confidence": confidence, "source": reason,
            "confirmed_by": list(confirmed_by), "evidence": _evidence(cands, chosen), "anchor": anchor}


def decide(school, info, shared, multi_campus_brands=frozenset()):
    """Turn a school's candidate pins into one coordinate and an honest precision label."""
    prov = clean_thai_addr(school.get("province"))
    anchor, areas = info["anchor"], info["areas"]
    tight, loose = _radii(prov, anchor)
    area = _area_word(prov, anchor)

    cands = []
    for c in info["cands"]:
        if c["source"] == "website" and _pin_key(c) in shared.get("website", set()):
            continue   # a template map, not this school's
        if c["source"] == "opec" and _pin_key(c) in shared.get("opec", set()):
            c = dict(c, shared=True)
        cands.append(c)

    # A pin within 3 m of another source's pin is a copy of it (OPEC and Overture coincide
    # to the metre for 8 schools): it stays in the evidence but does not count as a vote.
    for i, c in enumerate(cands):
        if any(o["source"] != c["source"] and _dist(o, c) < 3 for o in cands[:i]):
            cands[i] = dict(c, copy=True)

    # 1. Independent sources pointing at the same campus.
    best = None
    for seed in cands:
        members = [c for c in cands if _agree(seed, c)]
        # A shared OPEC pin belongs to two records at once, so it is evidence for neither.
        fams = {FAMILY[c["source"]] for c in members if not c.get("shared") and not c.get("copy")}
        strong = fams - {"address"}
        confirmed = len(strong) >= 2 or (len(strong) == 1 and "address" in fams and bool(strong & {"opec", "map"}))
        # Sister campuses share a brand, a website listing every campus pin, and an OSM
        # name, so website + map can agree on the WRONG campus. OPEC is registered per
        # campus: require it in the group, or require the group to sit in our tambon.
        own_opec = any(c["source"] == "opec" and not c.get("shared") for c in members)
        confirmed = confirmed and (own_opec or any(_in_registered_area(c, anchor, tight) for c in members))
        if LICENCE_MODE == "open":
            # ArcGIS POI + ArcGIS house number is one provider agreeing with itself, and a
            # point nobody may store cannot be published: need two distinct providers and
            # at least one member whose coordinate may be stored.
            providers = {"esri" if c["source"].startswith("arcgis") else FAMILY[c["source"]]
                         for c in members if not c.get("shared") and not c.get("copy")}
            confirmed = confirmed and len(providers) >= 2 and any(_storable(c) and not c.get("shared") for c in members)

        # A confirmed group inside the registered area beats one outside it: OPEC sometimes
        # pins a campus at its parent school, and the parent's own map entries then agree
        # with that pin (Beaconhouse Yamsaard, Phatthanakan 78, was pinned in Lat Phrao).
        in_area = any(_in_registered_area(c, anchor, tight) for c in members
                      if FAMILY[c["source"]] != "address" and not c.get("shared"))
        # On a tie, prefer the group holding the school's own OPEC registration.
        key = (confirmed, in_area, len(strong), own_opec, len(fams), -(seed.get("anchor_m") or 0))
        if best is None or key > best[0]:
            best = (key, members, fams)
    if best and best[0][0]:
        members, fams = best[1], best[2]
        chosen = min((c for c in members if _storable(c)), key=_map_rank, default=None) or min(members, key=_map_rank)
        within = max(_dist(chosen, c) for c in members)
        names = sorted({SOURCE_NAME[c["source"]] for c in members if not c.get("shared") and not c.get("copy")})
        reason = f"ยืนยันตรงกันหลายแหล่ง: {', '.join(names)} (ทุกแหล่งห่างจากจุดนี้ไม่เกิน {round(within)} ม.)"
        # Same-name points elsewhere, for a brand with only this one OPEC campus: the
        # school moved, or runs a site OPEC does not list. Worth a human look. For a
        # multi-campus brand they are simply its other campuses, so say nothing.
        elsewhere = [c for c in cands if _identified(c) and _dist(c, chosen) > 1000]
        if elsewhere and _brand_key(school) not in multi_campus_brands:
            far = min(_dist(c, chosen) for c in elsewhere) / 1000
            reason += f" — มีจุดชื่อเดียวกันอีก {len(elsewhere)} จุด ห่าง {far:.1f} กม.ขึ้นไป (วิทยาเขตอื่นหรือย้ายที่ตั้ง?)"
        return _result(chosen, "Exact", reason, cands, names, anchor=anchor)

    opec_in = [c for c in cands if c["source"] == "opec" and _in_registered_area(c, anchor, tight) and not c.get("shared")]

    # 2. A name-verified POI (OSM, ArcGIS or an identified Overture page) inside the
    # registered area that OPEC does not contradict.
    maps_in = sorted((c for c in cands if _identified(c) and _storable(c) and _in_registered_area(c, anchor, tight)),
                     key=lambda c: (-c.get("score", 0), c["anchor_m"]))
    # Measured leave-one-source-out, a lone named POI is right (<=300 m) 84-94% of the time
    # for single-campus brands, less for multi-campus ones, where it is too often the sister
    # campus. So it may stand alone only for a single-campus brand, and is marked "medium".
    lone_ok = _brand_key(school) not in multi_campus_brands
    pool, named_campus = maps_in, False
    if not lone_ok:
        # A sister campus rarely carries OUR campus word: a POI named "... @ Rawai" inside
        # the Rawai area is that campus. Leave-one-source-out on the confirmed multi-campus
        # schools: 16/16 within 300 m, median 45 m. Two such POIs at different places: no.
        words = src.campus_words(school.get("school_name_en") or "")
        pool = [m for m in maps_in if words and src.names_campus(m.get("label"), words)]
        if any(not _agree(pool[0], m) for m in pool[1:]):
            pool = []
        named_campus = True
    for m in pool:
        if all(_agree(m, o) for o in opec_in):
            what = "ชื่อตรงกับโรงเรียนและระบุวิทยาเขตเดียวกัน" if named_campus else "ชื่อตรงกับโรงเรียน"
            reason = f"{SOURCE_NAME[m['source']]} {what} ({m['label'][:40]}) และอยู่ใน{area}ที่จดทะเบียน"
            return _result(m, "Exact", reason, cands, [SOURCE_NAME[m["source"]]], anchor=anchor)

    # (A website pin on its own is not enough: measured alone, even the pins schools write
    # themselves land within 300 m only ~70% of the time. It counts as a vote in rule 1.)

    # Nothing confirms a building-level pin. Show the most credible point, say why.
    fallback_order = {"map": 0, "overture": 0, "gov": 0, "opec": 1, "website": 2, "address": 3}
    pool = sorted(cands, key=lambda c: (not _storable(c), not _in_registered_area(c, anchor, tight),
                                        fallback_order[FAMILY[c["source"]]],
                                        c.get("shared", False), c.get("anchor_m") or 0))
    if LICENCE_MODE == "open":
        # ArcGIS may vote, but its points (POI, house number, area centre) are not ours
        # to keep — not even as an Approximate fallback.
        pool = [c for c in pool if _storable(c)]
        if not pool:
            return _no_point("ยังไม่มีพิกัดจากแหล่งที่อนุญาตให้เก็บ (มีแต่ ArcGIS ซึ่งใช้ตรวจได้แต่เก็บไม่ได้) "
                             "— รอแอดมินปักหมุด", cands, anchor=anchor)
    if pool:
        c = pool[0]
        name = SOURCE_NAME[c["source"]]
        others = [o for o in cands if o is not c and FAMILY[o["source"]] != FAMILY[c["source"]]
                  and FAMILY[o["source"]] != "address"]
        if not _in_registered_area(c, anchor, tight) and c.get("anchor_m") is not None:
            why = f"{name} อยู่ห่างจากจุดกลาง{area}ที่จดทะเบียน {c['anchor_m'] / 1000:.1f} กม."
        elif others and not all(_agree(o, c) for o in others):
            nearest = min((o for o in others if not _agree(o, c)), key=lambda o: _dist(o, c))
            why = f"{name} ขัดกับ {SOURCE_NAME[nearest['source']]} (ห่างกัน {_dist(nearest, c) / 1000:.1f} กม.)"
        elif others:
            # The others agree, but cannot count: a shared OPEC pin, or a name/domain
            # match too weak to prove identity.
            names = sorted({SOURCE_NAME[o["source"]] + (" (หมุดใช้ร่วมกับโรงเรียนอื่น)" if o.get("shared") else "")
                            for o in others})
            why = f"{name} ตรงกับ {', '.join(names)} แต่ยังไม่นับเป็นหลักฐานอิสระ"
        elif c.get("pin") == "camera":
            why = f"{name}: จุดกลางกล้องของแผนที่ อาจคลาดจากหมุดจริงได้ ~300 ม."
        else:
            why = f"{name} ยังไม่มีแหล่งอื่นยืนยัน"
        return _result(c, "Approximate", f"{why} (พิกัดประมาณการ)", cands, anchor=anchor)

    if areas:
        a = max(areas, key=lambda a: a.get("rank", 0))
        return _result(a, "Approximate", f"ArcGIS {a['label'][:60]} (พิกัดประมาณการ)", cands, anchor=anchor)
    if anchor:
        return _result(anchor, "Approximate", f"จุดกลาง{area} {anchor['label'][:50]} (พิกัดประมาณการ)", cands, anchor=anchor)
    return None


def _apply(school, result):
    if school.get("gps_locked"):
        return   # an admin set this pin by hand (data_manager.set_manual_pin)
    school.update({
        "latitude": result["lat"],
        "longitude": result["lon"],
        "gps_source": result["source"],
        "gps_precision": result["precision"],
        "gps_confidence": result.get("confidence"),
        "gps_confirmed_by": result["confirmed_by"],
        "gps_evidence": result["evidence"],
        # ArcGIS-derived: keep only which area it is when LICENCE_MODE is "open"
        "gps_anchor": ({k: result["anchor"][k] for k in ("level", "label")} if LICENCE_MODE == "open"
                       and result.get("anchor") else result.get("anchor")),
        "gps_method": GPS_METHOD,
        # True only when the point is confirmed; every record carries gps_method once checked
        "gps_verified": result["precision"] == "Exact",
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
    })


def _mark_unverified(school):
    """
    Nothing could be checked. Keep the old coordinate for the map, but drop whatever
    label it carried — under the previous method that could be an unchecked "Exact".
    """
    if school.get("gps_locked"):
        return
    has_point = bool(school.get("latitude") and school.get("longitude"))
    school.update({
        "gps_precision": "Approximate" if has_point else "None",
        "gps_confidence": "low",
        "gps_source": "พิกัดเดิม ตรวจยืนยันจากแหล่งใดไม่ได้ (พิกัดประมาณการ)" if has_point else "",
        "gps_confirmed_by": [], "gps_evidence": [],
        "gps_method": GPS_METHOD, "gps_verified": False,
    })


def _own_opec_backs(school):
    """This record's own (unshared) OPEC pin is part of the evidence at its chosen point."""
    return any(e["source"] == "opec" and not e.get("shared") and e["distance_m"] <= AGREE_M
               for e in school.get("gps_evidence") or [])


def resolve_shared_points(schools, only=None):
    """
    One point cannot be two campuses. When several records end up Exact on the same
    spot (sister campuses whose POIs, OSM entries or website pins all name the brand),
    only a record whose own OPEC registration backs that spot keeps Exact; the others
    become Approximate with a note naming the school they collide with.

    `only`: restrict downgrades to these school codes (single-school re-check).
    Returns the number of records downgraded.
    """
    exact = [x for x in schools if x.get("gps_precision") == "Exact" and x.get("latitude")]
    groups, used = [], set()
    for i, a in enumerate(exact):
        if i in used:
            continue
        group = [a]
        for j in range(i + 1, len(exact)):
            if j in used:
                continue
            b = exact[j]
            if src.distance_m(float(a["latitude"]), float(a["longitude"]),
                              float(b["latitude"]), float(b["longitude"])) <= 60:
                group.append(b)
                used.add(j)
        if len(group) > 1:
            groups.append(group)

    downgraded = 0
    for group in groups:
        # A pin an admin placed by hand owns its spot; otherwise the one OPEC backs.
        keep = [x for x in group if x.get("gps_locked")] or [x for x in group if _own_opec_backs(x)]
        if len(keep) > 1 and not all(x.get("gps_locked") for x in keep):
            keep = []   # two registrations on one spot: cannot tell whose campus it is
        for x in group:
            if x.get("gps_locked") or x in keep or (only is not None and str(x.get("school_code")) not in only):
                continue
            others = [o.get("school_name_th", "") for o in group if o is not x]
            x["gps_precision"] = "Approximate"
            x["gps_confidence"] = "low"
            x["gps_verified"] = False
            x["gps_confirmed_by"] = []
            x["gps_source"] = (f"ตำแหน่งเดียวกับ {', '.join(others)[:60]} — "
                               f"อาจเป็นวิทยาเขตของอีกแห่ง (พิกัดประมาณการ)")
            downgraded += 1
    return downgraded


def _backfill_opec_coordinates(schools):
    """Recover raw OPEC pins that runs before opec_latitude existed overwrote."""
    if all("opec_latitude" in s for s in schools if s.get("school_code")):
        return
    try:
        from fetch_opec import fetch_opec_coordinates
        coords = fetch_opec_coordinates()
    except Exception as e:
        print(f"[GPS] could not fetch OPEC coordinates: {e}")
        return
    for s in schools:
        if "opec_latitude" in s:
            continue
        pt = coords.get(str(s.get("school_code") or "").strip())
        # "" records that OPEC has no pin, so we do not ask again next run
        s["opec_latitude"], s["opec_longitude"] = pt if pt else ("", "")


def _registry():
    try:
        from fetch_official_websites import load_verified_registry
        return load_verified_registry()
    except Exception:
        return {}


# ─── entry points ────────────────────────────────────────────────────────────

def enrich_single_school_gps(school):
    """Re-checks one school. Returns (school, changes)."""
    if school.get("gps_locked"):
        return school, {}   # pinned by hand: nothing to re-check
    _backfill_opec_coordinates([school])
    info = collect_candidates(school, _website_for(school, _registry()))
    result = decide(school, info, _load_shared_pins(), _multi_campus_brands(load_schools() or [school]))
    before = {k: school.get(k) for k in ("latitude", "longitude", "gps_source", "gps_precision")}
    if result:
        _apply(school, result)
        others = [o for o in (load_schools() or [])
                  if str(o.get("school_code")) != str(school.get("school_code"))]
        resolve_shared_points(others + [school], only={str(school.get("school_code"))})
    else:
        _mark_unverified(school)
    changes = {k: school.get(k) for k in before if school.get(k) != before[k]}
    return school, changes


def enrich_all_school_gps(update_progress, on_save_callback=None, force=False):
    """
    Main runner for the GPS button. Re-checks every school not yet resolved by this
    method (all of them on the first run), then only new or changed ones.
    """
    schools = load_schools()
    if not schools:
        update_progress("ไม่พบข้อมูลโรงเรียน", 100, 100, "กรุณากดดึงข้อมูล OPEC (ปุ่ม 1) ก่อน!")
        return []

    # Hand-placed pins are never re-checked, not even with force.
    targets = [s for s in schools if not s.get("gps_locked") and (
               force or s.get("gps_method") != GPS_METHOD or not (s.get("latitude") and s.get("longitude")))]
    total = len(targets)
    if total == 0:
        update_progress("พิกัด GPS สมบูรณ์ครบถ้วนแล้ว", 100, 100,
                        f"โรงเรียนทั้งหมด {len(schools)} แห่ง ผ่านการตรวจพิกัดแบบเทียบหลายแหล่งแล้ว")
        return schools

    update_progress(f"กำลังเตรียมแหล่งข้อมูลพิกัด ({total} แห่ง)", 0, total,
                    f"เริ่มตรวจพิกัด {total} แห่ง: OPEC, เว็บไซต์โรงเรียน, OpenStreetMap, ArcGIS")
    _backfill_opec_coordinates(schools)
    registry = _registry()
    src.load_osm_index()

    by_code = {str(s.get("school_code")).strip(): s for s in targets}
    collected, lock, done = {}, threading.Lock(), [0]

    def work(s):
        return str(s.get("school_code")).strip(), collect_candidates(s, _website_for(s, registry))

    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = [ex.submit(work, s) for s in targets]
        for f in as_completed(futures):
            try:
                code, info = f.result()
                collected[code] = info
            except Exception as e:
                print(f"[GPS] collect failed: {e}")
            with lock:
                done[0] += 1
                n = done[0]
            note = f"รวบรวมพิกัดแล้ว {n}/{total} แห่ง" if n % 25 == 0 or n == total else ""
            update_progress(f"กำลังรวบรวมพิกัดจากหลายแหล่ง ({n}/{total})", n, total, note)

    shared = find_shared_pins(collected, by_code)
    multi = _multi_campus_brands(schools)
    exact = approx = 0
    for i, s in enumerate(targets, 1):
        code = str(s.get("school_code")).strip()
        info = collected.get(code)
        result = decide(s, info, shared, multi) if info else None
        if result:
            _apply(s, result)
            exact += result["precision"] == "Exact"
            approx += result["precision"] != "Exact"
            msg = f"[GPS: {i}/{total}] {s.get('school_name_th')} -> ({result['lat']}, {result['lon']}) [{result['precision']}] {result['source']}"
        else:
            _mark_unverified(s)
            approx += bool(s.get("latitude"))
            msg = f"[GPS: {i}/{total}] ไม่พบพิกัดจากแหล่งใดเลย: {s.get('school_name_th')}"
        update_progress(f"ตัดสินพิกัด ({i}/{total})", i, total, msg)

    collided = resolve_shared_points(schools)
    exact -= collided
    approx += collided
    if collided:
        update_progress("ตรวจพิกัดซ้ำระหว่างวิทยาเขต", total, total,
                        f"ลด {collided} แห่งเป็น Approximate: ได้จุดเดียวกับวิทยาเขตอื่นของแบรนด์เดียวกัน")

    save_schools(schools)
    if on_save_callback:
        on_save_callback(schools)

    update_progress("ค้นหาพิกัด GPS เสร็จสมบูรณ์!", total, total, (
        f"ประมวลผลพิกัด GPS เสร็จสมบูรณ์! ({total} แห่ง)\n"
        f"  - Exact (มีหลักฐานยืนยันว่าเป็นตัวโรงเรียน): {exact} แห่ง\n"
        f"  - Approximate (ยังไม่มีหลักฐานพอ ดูเหตุผลใน gps_source): {approx} แห่ง\n"
        f"  - หลักฐานจากทุกแหล่งเก็บไว้ในฟิลด์ gps_evidence"))
    return schools
