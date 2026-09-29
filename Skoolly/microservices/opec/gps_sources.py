"""
gps_sources.py
ตัวเก็บพิกัดผู้สมัคร (candidate) ของโรงเรียนจากหลายแหล่งที่เป็นอิสระต่อกัน
enrich_school_gps.py จะเอาผลจากที่นี่ไปเทียบกันก่อนตัดสินว่าพิกัดไหน "Exact" จริง

แหล่งที่ใช้ (ไม่ต้องมี API key ทั้งหมด):
  opec      พิกัดที่โรงเรียนกรอกไว้ในระบบ สช.
  website   หมุดบนเว็บไซต์ทางการ แยก origin: "school" (โรงเรียนเขียนเอง) กับ "google" (มาจาก Maps embed)
  osm       โรงเรียนใน OpenStreetMap ที่ชื่อตรงกับโรงเรียนนี้
  overture  Overture Maps places (ส่วนใหญ่คือเพจ Facebook ผ่าน Meta) แคชไว้ใน .cache รีเฟรชรายเดือน
            ด้วย DuckDB จาก S3 สาธารณะ จับคู่ด้วยโดเมนเว็บไซต์ เบอร์โทร หรือชื่อ (เพจ Facebook จับได้
            เฉพาะเมื่อเรารู้ page ID ตัวเลข — Overture ไม่เก็บชื่อเพจแบบ vanity URL)
  dopa      ข้อมูลเปิดกรมการปกครอง gis-02 (ไฟล์คงที่ reference/dopa_gis02_schools.json)
  arcgis    POI ที่ชื่อตรงกัน หรือที่อยู่ระดับบ้านเลขที่ จาก Esri ArcGIS (ใช้โหวต ไม่เก็บพิกัด)
  area      จุดกึ่งกลางถนน/ตำบล/อำเภอ — ใช้ได้แค่เป็น Approximate และเป็นตัวตรวจ centroid

แต่ละ candidate เป็น dict: {lat, lon, source, kind, label}
  kind = "campus"  หมุดที่ระบุตัวโรงเรียน
         "address" บ้านเลขที่ที่ geocode ได้ (ถูกตึกบ่อย แต่ไม่ได้ยืนยันชื่อโรงเรียน)
         "area"    พื้นที่กว้าง
"""

import gzip
import io
import json
import math
import os
import re
import time
import threading
import urllib.parse
from urllib.parse import unquote, urljoin

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

session = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=40, pool_maxsize=40, max_retries=1)
session.mount("https://", _adapter)
session.mount("http://", _adapter)
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
})

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")


# ─── geometry ────────────────────────────────────────────────────────────────

def distance_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres."""
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742000 * math.asin(math.sqrt(a))


def in_thailand(lat, lon):
    return 5.5 <= lat <= 20.6 and 97.3 <= lon <= 105.7


def candidate(lat, lon, source, kind, label):
    return {"lat": round(float(lat), 7), "lon": round(float(lon), 7),
            "source": source, "kind": kind, "label": label}


# ─── name matching ───────────────────────────────────────────────────────────

# Vocabulary nearly every school name shares. None of it can make two names match.
GENERIC_WORDS = {
    'the', 'of', 'in', 'and', 'at', 'for', 'a', 'an', 'de', 'la', 'le', 'du', 'des', 'by',
    'school', 'schools', 'international', 'internation', 'internaional', 'internatioal',
    'internatiomal', 'internatopnal', 'inter', 'intl', 'preschool', 'pre', 'playschool',
    'kindergarten', 'kindergaten', 'kindergarden', 'kinderga', 'nursery', 'academy',
    'college', 'campus', 'primary', 'secondary', 'elementary', 'demonstration', 'bilingual',
    'education', 'educational', 'centre', 'center', 'ltd', 'co', 'group',
    'section', 'program', 'programme',
}

# Descriptive words. They identify a school only when its name has nothing more specific:
# "Kids' Academy" is its brand, but in "Kids Kingdom" the brand is "kingdom".
SOFT_WORDS = {
    'early', 'years', 'year', 'new', 'little', 'child', 'children', 'kids', 'kid',
    'english', 'british', 'american', 'christian', 'montessori', 'learning',
    # nationalities: "New American Chinese" must not match "Thai-Chinese" on "chinese"
    'chinese', 'china', 'japanese', 'korean', 'french', 'german', 'australian',
    'canadian', 'indian', 'finnish', 'swiss', 'singapore', 'singaporean', 'mandarin',
}

# Place and campus words. Never a brand, but when BOTH names carry them they must agree —
# that is what separates the Rama 9 campus from the Lang Suan campus of the same school.
PLACE_WORDS = {
    'thailand', 'thai', 'bangkok', 'bkk', 'phuket', 'samui', 'koh', 'pattaya', 'chonburi',
    'rayong', 'chiangmai', 'chiang', 'mai', 'rai', 'krabi', 'hatyai', 'hat', 'yai',
    'udon', 'thani', 'khon', 'kaen', 'nonthaburi', 'pathum', 'korat', 'nakhon',
    'ratchasima', 'ubon', 'surat', 'suratthani', 'samut', 'prakan', 'lanta', 'phangan',
    'ngan', 'pha', 'sukhumvit', 'sathorn', 'dusit', 'bangna', 'bang', 'rama', 'ramintra',
    'thonburi', 'srinakarin', 'ratchapruek', 'langsuan', 'lang', 'suan', 'samakee',
    'vibhavadi', 'suvarnabhumi', 'cherngtalay', 'rawai', 'chalong', 'maesai', 'khaoyai',
    'sriracha', 'huahin', 'hua', 'hin', 'asia', 'southeast', 'eastern', 'seaboard',
    'northern', 'southern', 'reignwood', 'park', 'nut', 'onnut', 'lampang', 'phayao',
    'maesot', 'tak', 'greenvalley', 'green', 'valley', 'riverside', 'city', 'khao',
}
BROAD_PLACES = {'thailand', 'thai', 'bangkok', 'bkk'}
THAI_NAME_PREFIXES = ('โรงเรียน', 'นานาชาติ', 'อนุบาล', 'ประถม', 'มัธยม', 'สาธิต', 'อินเตอร์เนชั่นแนล')
SCHOOL_WORDS = (
    'school', 'kindergarten', 'academy', 'college', 'preschool', 'pre-school', 'nursery',
    'campus', 'montessori', 'โรงเรียน', 'นานาชาติ', 'อนุบาล', 'วิทยา',
)


def _words(name, keep_soft=False):
    cleaned = re.sub(r"'s\b", "s", (name or '').lower())
    cleaned = re.sub(r'[^a-z0-9\s]+', ' ', cleaned)
    return [w for w in cleaned.split()
            if len(w) >= 3 and w not in GENERIC_WORDS and (keep_soft or w not in SOFT_WORDS)]


def name_tokens(name):
    """Brand tokens of an English name, in order: school vocabulary and places removed."""
    words = [w for w in _words(name) if w not in PLACE_WORDS]
    return words or [w for w in _words(name, keep_soft=True) if w not in PLACE_WORDS]


def thai_brand(name_th):
    """The distinctive part of a Thai school name, category prefixes stripped, no spaces."""
    txt = str(name_th or '')
    for prefix in THAI_NAME_PREFIXES:
        txt = txt.replace(prefix, '')
    return re.sub(r'[\s\-\(\)\.]+', '', txt)


def _one_edit_apart(a, b):
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] != b[j]:
            edits += 1
            if edits > 1:
                return False
            if len(a) == len(b):
                i += 1
            j += 1
        else:
            i += 1
            j += 1
    return edits + (len(b) - j) <= 1


def _same_word(a, b, typo=False):
    """Equal or singular/plural (well/wells). With typo=True also a one-letter typo in a
    long word (OPEC's "Sukumvit" for Sukhumvit) — never used for the head brand, where
    it made "Brighton" match a "Brighten School"."""
    return (a == b or a + 's' == b or b + 's' == a
            or (typo and min(len(a), len(b)) >= 6 and _one_edit_apart(a, b)))


def _english_match(place, name_en):
    # Use descriptive words only when the name has no more specific brand word.
    soft = not [w for w in _words(name_en) if w not in PLACE_WORDS]
    school = _words(name_en, keep_soft=soft)
    brands = [w for w in school if w not in PLACE_WORDS]
    if not brands:
        return 0
    cand = _words(place, keep_soft=soft)
    flat_school = "".join(school)

    if not any(_same_word(brands[0], c) for c in cand):
        return 0
    # Descriptive words are weak one at a time, so a name made only of them must match
    # in full: "New American Chinese" is not "New International School of Thailand".
    if soft and not all(any(_same_word(b, c) for c in cand) for b in brands):
        return 0
    # A two-word brand needs both words: "Go Future Academy" is not "Future Steps".
    if not soft and len(brands) >= 2 and sum(1 for b in brands if any(_same_word(b, c, typo=True) for c in cand)) < 2:
        return 0

    # Symmetry: a brand word the candidate has and we do not means another school
    # ("Kids Kingdom" is not "Kids Academy", "Pangfun" is not "Pan-Asia").
    for c in cand:
        if c in PLACE_WORDS:
            continue
        if not any(_same_word(c, w, typo=True) for w in school) and c not in flat_school:
            return 0

    # Campus agreement when both names say which campus they are.
    ours = {w for w in school if w in PLACE_WORDS} - BROAD_PLACES
    theirs = {c for c in cand if c in PLACE_WORDS} - BROAD_PLACES
    if ours and theirs and not (ours & theirs):
        if "".join(sorted(ours)) not in "".join(cand) and "".join(sorted(theirs)) not in flat_school:
            return 0

    if soft:
        return 2   # a match on descriptive words only: real, but too weak to stand alone
    return 3 + sum(1 for w in brands[1:] if any(_same_word(w, c) for c in cand))


def campus_words(name_en):
    """The campus/place words of our English name ("Lighthouse at Rawai" -> {"rawai"})."""
    return {w for w in _words(name_en, keep_soft=True) if w in PLACE_WORDS} - BROAD_PLACES


def names_campus(place, words):
    """Does a candidate's name spell out one of our campus words ("HEI Schools Udonthani")?"""
    flat = re.sub(r'[^a-z0-9]', '', (place or '').lower())
    toks = set(_words(place, keep_soft=True))
    return any(w in toks or (len(w) >= 4 and w in flat) for w in words)


# Misspellings of the category word seen in government data ("โรงเรียนนานานชาติอุดรธานี").
_THAI_TYPOS = re.compile(r"นานานชาติ")


def _thai_match(place, name_th, places=()):
    place = _THAI_TYPOS.sub("นานาชาติ", str(place or ""))
    ours = thai_brand(name_th)
    if len(ours) < 3:
        return 0
    theirs = thai_brand(place)
    # A brand that is only the school's own province/district ("นานาชาติอุดรธานี") would
    # match every school in town ("อุดรธานีพิทยาคม"): demand the exact international name.
    core = ours
    for pl in places:
        pl = re.sub(r'^(จังหวัด|อำเภอ|เขต|ตำบล|แขวง|เมือง)', '', str(pl or '')).replace(' ', '')
        if len(pl) >= 2:
            core = core.replace(pl, '')
    if len(core) < 2:
        return 3 if theirs == ours and 'นานาชาติ' in place else 0
    if ours not in theirs:
        return 0
    extra = len(theirs) - len(ours)
    # Theirs may add a short campus suffix, never more than our own brand's length:
    # "คิดส์" must not match "คิดส์คิงดอม", and "จีน" must not match "ไทยจีน".
    if extra <= min(8, len(ours) - 1):
        return 3
    return 0


def name_match_score(place_names, name_en, name_th, places=()):
    """
    0 when `place_names` is not this school, otherwise a strength score (3+).

    The candidate must call itself a school, share our brand, carry no brand of its
    own that we lack, and — when both names state a campus — state the same one.
    """
    names = [n for n in place_names if n]
    if not names:
        return 0
    if not any(w in " ".join(names).lower() for w in SCHOOL_WORDS):
        return 0
    best = 0
    for n in names:
        if re.search(r'[a-zA-Z]{3}', n):
            best = max(best, _english_match(n, name_en))
        if re.search(r'[\u0e00-\u0e7f]', n):
            best = max(best, _thai_match(n, name_th, places))
    return best


# ─── source: OPEC ────────────────────────────────────────────────────────────

def opec_point(school):
    """
    The coordinate the school registered with OPEC.

    fetch_opec.py keeps it in opec_latitude/opec_longitude so that overwriting
    latitude/longitude with a better answer never loses it. Records fetched before
    that field existed still carry it in latitude/longitude with gps_source
    "OPEC Official".
    """
    if "opec_latitude" in school:
        lat, lon = school.get("opec_latitude"), school.get("opec_longitude")
    elif str(school.get("gps_source") or "").startswith("OPEC"):
        lat, lon = school.get("latitude"), school.get("longitude")
    else:
        return None
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not in_thailand(lat_f, lon_f):
        return None
    # OPEC's own "no data" placeholder: the centre of Bangkok.
    if abs(lat_f - 13.7563) < 0.001 and abs(lon_f - 100.5018) < 0.001:
        return None
    return candidate(lat_f, lon_f, "opec", "campus", "OPEC")


# ─── source: the school's own website ────────────────────────────────────────

# (regex, coordinate order, kind, origin)
#
# kind   "place"  = the marker itself; "camera" = where a Google map view is centred (for an
#                   embed that sits 150-300 m from the marker, measured on this dataset).
# origin "school" = coordinates the school itself wrote: JSON-LD/meta geo, a lat,lng typed
#                   into a map link, an OSM/Apple/Waze link. A published fact — storable.
#        "google" = coordinates carried by a Google Maps embed or place URL, i.e. Google's own
#                   place data. Google's Maps terms forbid copying that out for use elsewhere,
#                   so with LICENCE_MODE "open" (the default) the pipeline does not use them.
_PIN_PATTERNS = (
    # Google place URL data segment: ...!3d<lat>!4d<lon>
    (re.compile(r'!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})'), "latlon", "place", "google"),
    # a lat,lng the school typed into a map link: maps?q=<lat>,<lon> / daddr= / destination=
    (re.compile(r'maps[^"\'\s<>]*?[?&](?:q|query|daddr|destination)='
                r'(-?\d{1,3}\.\d{4,})(?:,|%2C)\s*(-?\d{1,3}\.\d{4,})'), "latlon", "place", "school"),
    # Google embed viewport: ...!2d<lon>!3d<lat>...
    (re.compile(r'!2d(-?\d{1,3}\.\d{3,})!3d(-?\d{1,3}\.\d{3,})'), "lonlat", "camera", "google"),
    # Google place page viewport: .../@<lat>,<lon>,17z  and  ll=<lat>,<lon>
    (re.compile(r'google\.[a-z.]+/maps[^"\'\s<>]*?@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})'), "latlon", "camera", "google"),
    (re.compile(r'google\.[a-z.]+/maps[^"\'\s<>]*?[?&](?:ll|center)=(-?\d{1,3}\.\d{4,})(?:,|%2C)\s*(-?\d{1,3}\.\d{4,})'),
     "latlon", "camera", "google"),
    # OpenStreetMap embed / link marker
    (re.compile(r'openstreetmap\.org/[^"\'\s<>]*?marker=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})'), "latlon", "place", "school"),
    (re.compile(r'openstreetmap\.org/[^"\'\s<>]*?mlat=(-?\d{1,3}\.\d{4,})&(?:amp;)?mlon=(-?\d{1,3}\.\d{4,})'), "latlon", "place", "school"),
    # Apple Maps and Waze links
    (re.compile(r'maps\.apple\.com/[^"\'\s<>]*?[?&](?:ll|q|sll|daddr)=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})'), "latlon", "place", "school"),
    (re.compile(r'waze\.com/[^"\'\s<>]*?[?&]ll=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})'), "latlon", "place", "school"),
    # <meta name="geo.position" content="lat;lon">, ICBM "lat, lon"
    (re.compile(r'name=["\'](?:geo\.position|ICBM)["\'][^>]*content=["\'](-?\d{1,3}\.\d{3,})\s*[;,]\s*(-?\d{1,3}\.\d{3,})', re.I),
     "latlon", "place", "school"),
)
_OG_LAT = re.compile(r'(?:place:location:latitude|og:latitude)["\'][^>]*content=["\'](-?\d{1,3}\.\d{3,})', re.I)
_OG_LON = re.compile(r'(?:place:location:longitude|og:longitude)["\'][^>]*content=["\'](-?\d{1,3}\.\d{3,})', re.I)
_JSONLD = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.I | re.S)
_SHORT_LINK = re.compile(r'https?://(?:maps\.app\.goo\.gl|goo\.gl/maps)/[A-Za-z0-9_-]+')
_CONTACT_LINK = re.compile(
    r'href=["\']([^"\']*(?:contact|location|map|find-us|visit|getting-here|about|ติดต่อ|แผนที่)[^"\']*)["\']', re.I)


def _geo_in_jsonld(node, out):
    """Walk schema.org JSON-LD for geo.latitude/longitude the site itself declares."""
    if isinstance(node, list):
        for x in node:
            _geo_in_jsonld(x, out)
    elif isinstance(node, dict):
        geo = node.get("geo") if isinstance(node.get("geo"), dict) else node
        try:
            lat, lon = float(geo.get("latitude")), float(geo.get("longitude"))
            if in_thailand(lat, lon):
                out.append((round(lat, 6), round(lon, 6), "place", "school"))
        except (TypeError, ValueError, AttributeError):
            pass
        for v in node.values():
            if isinstance(v, (dict, list)):
                _geo_in_jsonld(v, out)


def _pins_in(text):
    pins = []
    for rx, order, kind, origin in _PIN_PATTERNS:
        for m in rx.finditer(text):
            a, b = float(m.group(1)), float(m.group(2))
            lat, lon = (b, a) if order == "lonlat" else (a, b)
            if in_thailand(lat, lon):
                pins.append((round(lat, 6), round(lon, 6), kind, origin))
    la, lo = _OG_LAT.search(text), _OG_LON.search(text)
    if la and lo and in_thailand(float(la.group(1)), float(lo.group(1))):
        pins.append((round(float(la.group(1)), 6), round(float(lo.group(1)), 6), "place", "school"))
    for block in _JSONLD.findall(text):
        try:
            _geo_in_jsonld(json.loads(block.strip()), pins)
        except ValueError:
            continue
    return pins


def website_pins(url, max_pages=4, budget_s=15):
    """
    Map pins the school publishes on its own site: the homepage, then contact/location/about
    pages until a pin the school wrote itself turns up, then any maps.app.goo.gl short link.
    Returns [(lat, lon, "place"|"camera", "school"|"google")]; the caller decides which to trust.
    """
    if not url or not str(url).startswith("http"):
        return []
    pins, shorts, visited = [], [], set()
    deadline = time.time() + budget_s   # one slow site must not stall the whole run

    def fetch(u):
        if time.time() > deadline:
            raise TimeoutError("website budget spent")
        visited.add(u)
        r = session.get(u, timeout=(3, 6), verify=False, allow_redirects=True)
        html = unquote(r.text[:600000])
        pins.extend(_pins_in(html))
        shorts.extend(_SHORT_LINK.findall(html))
        return r.url, html

    def have_school_pin():
        return any(o == "school" and k == "place" for _, _, k, o in pins)

    try:
        final_url, html = fetch(url)
    except Exception:
        return []

    if not have_school_pin():
        for link in _CONTACT_LINK.findall(html):
            if len(visited) >= max_pages:
                break
            full = urljoin(final_url, link)
            if full in visited or not full.startswith("http"):
                continue
            try:
                fetch(full)
            except Exception:
                continue
            if have_school_pin():
                break

    # A short link resolves to a Google place URL: Google-origin, so only useful when the
    # caller allows Google-derived pins. Still cheap, so resolve it and tag it.
    if not any(k == "place" for _, _, k, _ in pins):
        for short in list(dict.fromkeys(shorts))[:2]:
            if time.time() > deadline:
                break
            try:
                r = session.get(short, timeout=(3, 6), allow_redirects=True)
                found = _pins_in(unquote(r.url)) or _pins_in(unquote(r.text[:200000]))
                pins.extend((la, lo, k, "google") for la, lo, k, _ in found)
                if found:
                    break
            except Exception:
                continue

    return list(dict.fromkeys(pins))


# ─── source: DOPA government places (กรมการปกครอง gis-02) ─────────────────────
#
# Field-collected by district officials in 2021, independent of OPEC and of map companies.
# No Bangkok. Shipped as a filtered static file (private-school categories + anything named
# international), since the source is never updated. Open Government License Thailand —
# attribution "กรมการปกครอง กระทรวงมหาดไทย".

def _find_up(relpath):
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        candidate_path = os.path.join(d, relpath)
        if os.path.exists(candidate_path):
            return candidate_path
        d = os.path.dirname(d)
    return ""


_dopa = None
_dopa_lock = threading.Lock()


def load_dopa_index():
    """{province: [rows]} from reference/dopa_gis02_schools.json ({} when absent)."""
    global _dopa
    with _dopa_lock:
        if _dopa is None:
            _dopa = {}
            path = _find_up(os.path.join("reference", "dopa_gis02_schools.json"))
            try:
                for r in json.load(io.open(path, encoding="utf-8"))["rows"]:
                    _dopa.setdefault(r["province"], []).append(r)
            except Exception:
                pass
        return _dopa


_INTL_WORD = re.compile(r"นานาชาติ|นานานชาติ|international|inter\b|อินเตอร์", re.I)


def dopa_matches(name_en, name_th, province, places=()):
    """DOPA places in the school's province whose name is this school (score >= 3).
    A name without "international" is a Thai-programme sibling of the same brand as often
    as not, so for an international school that word is required."""
    prov = re.sub(r'^จังหวัด', '', str(province or '')).strip()
    out = []
    for r in load_dopa_index().get(prov, []):
        if 'นานาชาติ' in (name_th or '') and not _INTL_WORD.search(r["name"]):
            continue
        score = name_match_score([r["name"]], name_en, name_th, places)
        if score >= 3:
            out.append((score, r))
    out.sort(key=lambda x: -x[0])
    return out


# ─── source: OpenStreetMap ───────────────────────────────────────────────────

OSM_CACHE = os.path.join(CACHE_DIR, "osm_schools_th.json")
OSM_TTL_S = 30 * 24 * 3600
OSM_MIN_ROWS = 8000   # Thailand has ~13,000 named schools in OSM; far fewer means truncated
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",   # formerly overpass.kumi.systems
)
# "center", "bb" and "geom" are alternatives: Overpass keeps only one, so "out center bb"
# returns bounds and no centre. Ask for the bounds and take their midpoint — that is
# exactly what "center" would have been (the centre of the bounding box).
_OSM_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="TH"][admin_level=2]->.th;
nwr["amenity"~"^(school|kindergarten|college)$"]["name"](area.th);
out bb tags;
"""
_osm_lock = threading.Lock()
_osm_index = None


def _osm_rows(elements):
    """Overpass elements -> cache rows: a point for every school, plus its outline's box."""
    rows = []
    for e in elements:
        tags = e.get("tags", {})
        b = e.get("bounds")
        if e.get("lat") is not None:
            lat, lon = e["lat"], e["lon"]                       # a node
        elif b:
            lat, lon = (b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2
        elif e.get("center"):
            lat, lon = e["center"]["lat"], e["center"]["lon"]
        else:
            continue
        rows.append({
            "id": f"{e['type'][0]}{e['id']}", "lat": lat, "lon": lon,
            # campus outline's bounding box (ways/relations only)
            "bbox": [b["minlat"], b["minlon"], b["maxlat"], b["maxlon"]] if b else None,
            "names": [tags.get(k, "") for k in ("name", "name:en", "name:th",
                                                "official_name", "alt_name", "old_name")
                      if tags.get(k)],
        })
    return rows


def load_osm_index():
    """
    Every named school in Thailand from OpenStreetMap (~13,000), fetched with a single
    Overpass query and cached for 30 days. One bulk query instead of one per school
    keeps us inside Overpass's fair-use policy and makes a full run cheap.
    """
    global _osm_index
    with _osm_lock:
        if _osm_index is not None:
            return _osm_index

        fresh = os.path.exists(OSM_CACHE) and time.time() - os.path.getmtime(OSM_CACHE) < OSM_TTL_S
        if not fresh:
            for endpoint in OVERPASS_ENDPOINTS:
                try:
                    r = requests.post(endpoint, data={"data": _OSM_QUERY}, timeout=240,
                                      headers={"User-Agent": "skoolly-opec-geocoder/2.0"})
                    if r.status_code != 200:
                        continue
                    payload = r.json()
                    elements = payload.get("elements", [])
                    # An overloaded Overpass server answers 200 with a truncated result
                    # and a "remark". Caching that would hide most schools for 30 days.
                    remark = str(payload.get("remark") or "").lower()
                    # Count what we can use, not what came back: rows without a position
                    # are dropped, and a cache of nodes only would hide ~80% of schools.
                    rows = _osm_rows(elements)
                    if "error" in remark or "timed out" in remark or len(rows) < OSM_MIN_ROWS:
                        print(f"[GPS/OSM] {endpoint} returned a partial result "
                              f"({len(rows)} usable of {len(elements)} rows, remark={remark[:80]!r}); keeping the old cache")
                        continue
                    os.makedirs(CACHE_DIR, exist_ok=True)
                    io.open(OSM_CACHE, "w", encoding="utf-8").write(json.dumps(rows, ensure_ascii=False))
                    break
                except Exception as e:
                    print(f"[GPS/OSM] {endpoint} failed: {e}")

        try:
            _osm_index = json.load(io.open(OSM_CACHE, encoding="utf-8"))
        except Exception:
            _osm_index = []   # OSM unavailable: the other sources still work
        return _osm_index


def osm_matches(name_en, name_th, near, radius_m, places=()):
    """OSM schools whose name matches, within radius_m of `near` (lat, lon)."""
    out = []
    for row in load_osm_index():
        if distance_m(near[0], near[1], row["lat"], row["lon"]) > radius_m:
            continue
        score = name_match_score(row["names"], name_en, name_th, places)
        if score:
            out.append((score, row))
    out.sort(key=lambda x: -x[0])
    return out


# ─── source: Overture Maps places ─────────────────────────────────────────────
#
# Overture's Thai school records come ~99% from Meta, i.e. Facebook pages whose location
# the school itself sets — independent of OPEC, OSM and ArcGIS. Licence CDLA-Permissive-2.0
# (Meta/Microsoft records) or Apache-2.0 (Foursquare records): storing and showing the points
# on our own Leaflet map is allowed; the site must credit "Overture Maps Foundation".
# Measured on this dataset: where we already had a confirmed point, Overture's matching
# record lay within 300 m of it 89% of the time (median 39 m).

OVERTURE_BUCKET = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
OVERTURE_CACHE = os.path.join(CACHE_DIR, "overture_places_th.json.gz")
OVERTURE_TTL_S = 35 * 24 * 3600    # Overture publishes monthly
OVERTURE_MIN_ROWS = 50000          # ~129k expected for Thailand; far fewer means a broken refresh
_EDU_CATEGORIES = ("place_of_learning", "education", "college_university", "elementary_school",
                   "specialty_school", "preschool", "campus_building", "high_school", "middle_school",
                   "private_school", "school", "kindergarten", "language_school", "montessori_school",
                   "day_care_preschool", "childrens_school", "international_school")
_SCHOOLISH = (r"(school|international|academy|kindergarten|college|montessori|preschool|nursery|"
              r"โรงเรียน|นานาชาติ|อนุบาล|อินเตอร์)")


def overture_filter_sql(table):
    """Thai education places, plus school-looking names filed under odd categories
    ("Wells International School" is filed as shopping) and any .ac.th website."""
    cats = ", ".join(f"'{c}'" for c in _EDU_CATEGORIES)
    return f"""
        SELECT id, lat, lon, confidence, websites, phones, socials, operating_status,
               name_primary, map_values(name_common) AS other_names,
               coalesce(basic_category, tax_primary) AS category,
               list_transform(sources, x -> x.dataset) AS datasets
        FROM {table}
        WHERE basic_category IN ({cats})
           OR list_contains(tax_hierarchy, 'education')
           OR regexp_matches(lower(coalesce(name_primary, '')), '{_SCHOOLISH}')
           OR len(list_filter(coalesce(websites, []), w -> w ILIKE '%.ac.th%')) > 0
    """


def latest_overture_release():
    r = requests.get(f"{OVERTURE_BUCKET}/?prefix=release/&delimiter=/", timeout=20)
    releases = re.findall(r"<Prefix>release/([^<]+)/</Prefix>", r.text)
    return max(releases) if releases else None


def registrable_domain(url):
    """patana.ac.th for https://www.patana.ac.th/contact ; bsbangkok.ac for bsbangkok.ac/ ."""
    host = re.sub(r'^[a-z]+://', '', (url or '').strip().lower()).split('/')[0].split(':')[0]
    host = re.sub(r'^www\d*\.', '', host)
    parts = [x for x in host.split('.') if x]
    if len(parts) >= 3 and parts[-1] == 'th' and parts[-2] in ('ac', 'co', 'or', 'in', 'go', 'mi', 'net'):
        return '.'.join(parts[-3:])
    return '.'.join(parts[-2:]) if len(parts) >= 2 else host


def phone_key(raw):
    """Last 8 digits of a Thai number, so +66 2 398 0200 and 02-398-0200 compare equal."""
    digits = re.sub(r'\D', '', str(raw or ''))
    if digits.startswith('66'):
        digits = '0' + digits[2:]
    return digits[-8:] if len(digits) >= 8 else ''


def facebook_key(url):
    m = re.search(r'facebook\.com/(?:pg/|pages/[^/]+/)?([^/?#]+)', str(url or '').lower())
    return m.group(1) if m and m.group(1) not in ('profile.php', 'people', 'groups') else ''


def _slim_overture_rows(rows):
    out = []
    for (pid, lat, lon, conf, websites, phones, socials, status, name, others, category, datasets) in rows:
        if lat is None or lon is None or (status or 'open') not in ('open',):
            continue
        names = [n for n in [name] + list(others or [])[:4] if n]
        out.append({
            "id": pid, "lat": round(lat, 7), "lon": round(lon, 7), "confidence": round(conf or 0, 3),
            "names": names, "category": category,
            "domains": sorted({registrable_domain(w) for w in (websites or []) if w}),
            "phones": sorted({phone_key(p) for p in (phones or []) if phone_key(p)}),
            "facebook": sorted({facebook_key(x) for x in (socials or []) if facebook_key(x)}),
            "datasets": sorted(set(datasets or [])),
        })
    return out


def refresh_overture_index(local_parquet=None):
    """
    Rebuild the Thai school-places cache. Reads Overture's public S3 release (no account)
    with DuckDB, or a local GeoParquet extract when given. Returns the row count, or 0 when
    DuckDB is unavailable or the result looks truncated (the old cache is then kept).
    """
    try:
        import duckdb
    except ImportError:
        print("[GPS/Overture] duckdb not installed (pip install duckdb) — Overture skipped")
        return 0
    con = duckdb.connect()
    if local_parquet:
        table = f"read_parquet('{local_parquet}')"
    else:
        release = latest_overture_release()
        if not release:
            return 0
        con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
        table = f"""(SELECT *, ST_Y(geometry) AS lat, ST_X(geometry) AS lon, names.primary AS name_primary,
                            names.common AS name_common, taxonomy.primary AS tax_primary,
                            taxonomy.hierarchy AS tax_hierarchy
                     FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*',
                                       hive_partitioning=1)
                     WHERE bbox.xmin BETWEEN 97.3 AND 105.7 AND bbox.ymin BETWEEN 5.5 AND 20.6)"""
    rows = _slim_overture_rows(con.execute(overture_filter_sql(table)).fetchall())
    if len(rows) < OVERTURE_MIN_ROWS:
        print(f"[GPS/Overture] only {len(rows)} rows — looks truncated, keeping the old cache")
        return 0
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = OVERTURE_CACHE + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    os.replace(tmp, OVERTURE_CACHE)
    return len(rows)


_ov_lock = threading.Lock()
_ov = None


def load_overture_index():
    """The cached Thai school places plus lookup indexes by domain, phone, Facebook page and grid cell."""
    global _ov
    with _ov_lock:
        if _ov is not None:
            return _ov
        stale = not os.path.exists(OVERTURE_CACHE) or time.time() - os.path.getmtime(OVERTURE_CACHE) > OVERTURE_TTL_S
        if stale:
            try:
                refresh_overture_index()
            except Exception as e:
                print(f"[GPS/Overture] refresh failed: {e}")
        try:
            with gzip.open(OVERTURE_CACHE, "rt", encoding="utf-8") as f:
                rows = json.load(f)
        except Exception:
            rows = []
        idx = {"rows": rows, "domain": {}, "phone": {}, "facebook": {}, "cell": {}}
        for i, r in enumerate(rows):
            for k in ("domain", "phone", "facebook"):
                for v in r[k + "s" if k != "facebook" else "facebook"]:
                    idx[k].setdefault(v, []).append(i)
            idx["cell"].setdefault((int(r["lat"] * 10), int(r["lon"] * 10)), []).append(i)
        _ov = idx
        return _ov


def overture_matches(name_en, name_th, website, phones, facebook, near, radius_m, places=()):
    """
    Overture places that are this school, with how we know: "domain" (same website),
    "phone", "facebook" (same page) or "name" (name_match_score). Only rows within
    radius_m of `near` when a near point is known.
    """
    idx = load_overture_index()
    if not idx["rows"]:
        return []
    hits = {}

    def add(i, how):
        hits.setdefault(i, set()).add(how)

    dom = registrable_domain(website) if website else ""
    if dom:
        for i in idx["domain"].get(dom, []):
            add(i, "domain")
    for p in phones:
        for i in idx["phone"].get(phone_key(p), []) if phone_key(p) else []:
            add(i, "phone")
    fb = facebook_key(facebook)
    if fb:
        for i in idx["facebook"].get(fb, []):
            add(i, "facebook")
    if near:
        cells = int(radius_m / 11000) + 1
        cy, cx = int(near[0] * 10), int(near[1] * 10)
        for dy in range(-cells, cells + 1):
            for dx in range(-cells, cells + 1):
                for i in idx["cell"].get((cy + dy, cx + dx), []):
                    if name_match_score(idx["rows"][i]["names"], name_en, name_th, places):
                        add(i, "name")

    out = []
    for i, how in hits.items():
        r = idx["rows"][i]
        if near and distance_m(near[0], near[1], r["lat"], r["lon"]) > radius_m:
            continue
        out.append((sorted(how), name_match_score(r["names"], name_en, name_th, places), r))
    out.sort(key=lambda x: (-len(x[0]), -x[1], -x[2]["confidence"]))
    return out


# ─── source: Esri ArcGIS ─────────────────────────────────────────────────────

GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

# ArcGIS says what it matched in Addr_type. The score does not: it gives 89 to a
# different school and 100 to a bare road name.
ADDR_TYPE_ADDRESS = {"PointAddress", "Subaddress", "BuildingName"}
ADDR_TYPE_AREA_RANK = {
    "StreetAddress": 6, "StreetName": 5, "StreetInt": 5, "Postal": 4, "PostalExt": 4,
    "PostalLoc": 4, "Sector": 3, "DependentLocality": 3, "Locality": 2, "SubAdmin": 1, "Admin": 0,
}


# The anonymous endpoint serves ~1.5 queries/s however many threads ask (measured).
# Past that it starts answering with errors, and an error must never be mistaken for
# "no such place" — that silently drops candidates and changes the verdict.
_ARCGIS_SLOTS = threading.BoundedSemaphore(3)
_arcgis_memo = {}
_arcgis_memo_lock = threading.Lock()


def arcgis(query, max_locations=6):
    """[(lat, lon, addr_type, match_addr, place_name, score)] restricted to Thailand."""
    return [(r["lat"], r["lon"], r["addr_type"], r["match"], r["place"], r["score"])
            for r in arcgis_records(query, max_locations)]


def arcgis_records(query, max_locations=6):
    """
    Same lookups as arcgis(), as dicts that also carry the matched feature's extent
    [ymin, xmin, ymax, xmax] — for an area match that is roughly the area's own size.
    Retries throttled/failed requests; identical queries within a run (every school in
    the same district asks for the same district centre) are answered from memory.
    Results are not written to disk.
    """
    key = (max_locations, query)
    with _arcgis_memo_lock:
        if key in _arcgis_memo:
            return _arcgis_memo[key]

    params = {"singleLine": query, "f": "json", "maxLocations": max_locations,
              "outFields": "Addr_type,PlaceName,Match_addr", "countryCode": "THA"}
    url = f"{GEOCODE_URL}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        payload = None
        with _ARCGIS_SLOTS:
            try:
                r = session.get(url, timeout=10)
                if r.status_code == 200:
                    payload = r.json()
            except Exception:
                payload = None
        if payload is not None and "error" not in payload:
            out = []
            for c in payload.get("candidates", []):
                loc = c.get("location") or {}
                if loc.get("y") is None:
                    continue
                a = c.get("attributes") or {}
                e = c.get("extent") or {}
                out.append({
                    "lat": float(loc["y"]), "lon": float(loc["x"]),
                    "addr_type": (a.get("Addr_type") or "").strip(),
                    "match": (c.get("address") or "").strip(),
                    "place": (a.get("PlaceName") or "").strip(),
                    "score": c.get("score", 0),
                    "extent": [e["ymin"], e["xmin"], e["ymax"], e["xmax"]] if e else None,
                })
            with _arcgis_memo_lock:
                _arcgis_memo[key] = out
            return out
        time.sleep(1.5 * (attempt + 1))
    print(f"[GPS/ArcGIS] gave up after retries: {query[:60]}")
    return []   # not memoised, so the next run asks again
