"""
enrich_school_names_en.py
โมดูลสำหรับปุ่มเติมชื่อภาษาอังกฤษ (EN):
เติมเต็มและจัดมาตรฐานชื่อภาษาอังกฤษ (School Name EN) แบบ Standalone Dynamic Engine 100%

หลักการทำงาน:
1. OPEC Official Data เหนือทุกอย่าง (Paramount):
   - หากข้อมูลดิบจาก สช. (OPEC) มีชื่อภาษาอังกฤษทางการที่ไม่ใช่ Garbled Text ให้คงค่าไว้เสมอ
2. Dynamic Multi-Tier Resolution สำหรับโรงเรียนที่ไม่มีชื่อ EN ใน สช.:
   - Tier 1: สกัดชื่อภาษาอังกฤษจากประวัติย่อ (School History) และ Tags ในระบบ สช.
   - Tier 2: สกัดชื่อจาก Official Website Metadata (JSON-LD / OpenGraph / Title) พร้อมตัวกรองความปลอดภัยขั้นสูง:
             - ตรวจสอบ HTTP 200 OK เท่านั้น
             - คัดทิ้งหน้า HTTP 403 Forbidden, Cloudflare ("Just a moment"), Error 404/500
             - คัดทิ้งสโลแกน คำโฆษณา และคำทั่วไป (เช่น "Be Inspired to Become 21st Century Thinkers", "Welcome", "Home")
             - ตรวจสอบความสอดคล้องกับคีย์เวิร์ดแบรนด์ของโรงเรียน (Brand Token Matching)
   - Tier 3: Morphological & Linguistic Standard Transliteration Formula
             - ถอดรหัสคำศัพท์แบรนด์และโครงสร้างชื่อตามมาตรฐานโรงเรียนนานาชาติสากล
             - ตัวอย่าง: นานาชาติ [ชื่อแบรนด์] [ทำเล] -> [Brand] [Location] International School
3. จัดมาตรฐาน Casing และตัวย่อสากล (Standard Casing & Acronyms เช่น KIS, NIST, SISB, DBS)
"""

import os
import re
import json
import time
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

# Known international school acronyms to preserve in UPPERCASE
KNOWN_ACRONYMS = {
    "KIS", "NIST", "SISB", "DBS", "BISP", "ISB", "RIS", "ASB", "BCIS", "UWC",
    "MIS", "TSIS", "APIS", "KRIS", "BEYC", "SPGS", "QSI", "TPIS", "ACIS", "BTIS",
    "HEI", "DYS", "EIS", "TCIS", "ICS", "CMIS", "CDSC", "NIS", "SBS", "SABS",
    "JWM", "D-PREP", "RBIS", "RAIS", "BSB", "KPIS", "TSI", "IMC", "AIKB35", "LFIB"
}

# Garbled transliterations to detect and replace
GARBLED_FRAGMENTS = [
    'AESETR', 'SINGKHOPR', 'AEHMPHTN', 'EDNHLA', 'CHHN', 'AEDEWNTIS',
    'MULTRIPHKDI', 'BURPHAPHTHN', 'HANAKHRISETIYN', 'PYYAEDN', 'EMRIKANA',
    'AEKHRNEBRRI', 'SANFN', 'EHDSTARTH', 'EPHRPH', 'SUWRRNPHUMI'
]

# Blacklist of junk titles, HTTP errors, slogans, generic tags, and Cloudflare challenge titles
INVALID_EN_PHRASES = [
    'forbidden', 'just a moment', 'attention required', 'cloudflare', 'access denied',
    '403', '404', '500', '502', '503', 'not found', 'error', 'security check',
    'be inspired to become 21st century thinkers', 'be inspired', 'welcome', 'home',
    'index', 'untitled', 'default', 'domain', 'school.com', 'page not found',
    'website is under construction', 'coming soon', 'loading', 'site maintenance',
    'please enable javascript', 'trend', 'wordpress', 'elementor',
    'learning and blended education', 'blended education', 'quality education'
]

# Comprehensive morphological dictionary for Thai international school names
THAI_TO_EN_TOKEN_MAP = {
    'แอสเตอร์': 'Aster',
    'สิงคโปร์': 'Singapore',
    'สุวรรณภูมิ': 'Suvarnabhumi',
    'แฮมพ์ตั้น': 'Hampton',
    'เด่นหล้า': 'Denla',
    'บริติช': 'British',
    'จอห์น ไวแอท': 'John Wyatt',
    'มอนเตสซอรี': 'Montessori',
    'มอนเตสซอรี่': 'Montessori',
    'แอ๊ดเวนติสมิชชัน': 'Adventist Mission',
    'แอ๊ดเวนต์': 'Adventist',
    'ธาราพัฒนา': 'Tara Pattana',
    'มูลตรีภักดี': 'Mooltripakdee',
    'บูรพาพัฒนศาสตร์': 'Burapha Phatthanasart',
    'ฮานาคริสเตียน': 'Hana Christian',
    'ปัญญาเด่น': 'Panyaden',
    'อเมริกาน่า ไชนีส': 'Americana Chinese',
    'อเมริกาน่า': 'Americana',
    'ไชนีส': 'Chinese',
    'แครนเบอร์รี่': 'Cranberry',
    'สานฝัน': 'Sanfan',
    'เฮดสตาร์ท': 'Headstart',
    'อเมริกัน': 'American',
    'เพรพ': 'Prep',
    'กรุงเทพ': 'Bangkok',
    'กรุงเทพฯ': 'Bangkok',
    'เชียงใหม่': 'Chiang Mai',
    'ภูเก็ต': 'Phuket',
    'พัทยา': 'Pattaya',
    'ชลบุรี': 'Chonburi',
    'นนทบุรี': 'Nonthaburi',
    'ระยอง': 'Rayong',
    'สงขลา': 'Songkhla',
    'หาดใหญ่': 'Hatyai',
    'เกาะสมุย': 'Koh Samui',
    'สมุย': 'Samui',
    'หัวหิน': 'Hua Hin',
    'ลำปาง': 'Lampang',
    'เชียงราย': 'Chiang Rai',
    'แม่สาย': 'Mae Sai',
    'แม่สอด': 'Mae Sot',
    'ตาก': 'Tak',
    'กระบี่': 'Krabi',
    'พะงัน': 'Pha Ngan',
    'พะเยา': 'Phayao',
    'อุดรธานี': 'Udon Thani',
    'ขอนแก่น': 'Khon Kaen',
    'ปราจีนบุรี': 'Prachinburi',
    'นครราชสีมา': 'Nakhon Ratchasima',
    'พระราม 5': 'Rama 5',
    'พระราม 3': 'Rama 3',
    'พระราม 9': 'Rama 9',
    'สุขุมวิท': 'Sukhumvit',
    'หลังสวน': 'Langsuan',
    'จีน': 'China',
    'ฝรั่งเศส': 'French',
    'ออสเตรเลีย': 'Australian',
    'แคนาดา': 'Canadian',
    'คริสเตียน': 'Christian',
    'สาธิต': 'Demonstration',
    'พรีสคูล': 'Preschool',
    'อะแคเดอมี่': 'Academy',
    'อะคาเดมี่': 'Academy',
    'คอลเลจ': 'College',
    'คิดส์': 'Kids',
    'วิลเลจ': 'Village',
    'คิงดอม': 'Kingdom',
    'เฮาส์': 'House',
    'เฮ้าส์': 'House',
    'การ์เด้น': 'Garden',
    'เซนต์': 'Saint',
    'แอนดรูว์ส': "Andrew's",
    'แอนดรูว์': 'Andrew',
    'มาร์ค': 'Mark',
    'เพ็ญสมิทธ์': 'Pennsmith',
    'รัชต์ภาคย์': 'Ratchaphak',
    'กรแก้ว': 'Kornkaew',
    'กลอรี่': 'Glory',
    'ไรซิ่ง โอคส์': 'Rising Oaks',
    'มิดเดิลตัน': 'Middleton',
    'ดัลลิช': 'Dulwich',
    'ชาตะกะ': 'Chataka',
    'ลิลเบอร์รี่': 'Lilberry',
    'เซโกญา โนวา': 'Sequoia Nova',
    'บีอีวายซี': 'BEYC',
    'บี ออลไบร้ท์': 'B-Allbright',
    'วิคคอมบ์ แอบบี้': 'Wycombe Abbey',
    'ไนทส์บริดจ์เฮ้าส์': 'Knightsbridge House',
    'เคไอเอส': 'KIS',
    'เรนวูดปาร์ค': 'Reignwood Park',
    'เวลล์ส': 'Wells',
    'เลิฟเวลล์': 'Lovewell',
    'หัสดิน': 'Hassadin',
    'เอลดรีม': 'Eldream',
    'ไฮเกต': 'Highgate',
    'เบลฟริย์': 'Belfry',
    'รัตน์ฉัตร': 'Ratchut',
    'เคอาร์ไอเอส': 'KRIS',
    'วินฟิลด์': 'Windfield',
    'มิลล์ฮิลล์': 'Mill Hill',
    'คาเรียด': 'Cariad',
    'มาสเตอร์': 'Masters',
    'เซนต์เฮเลียร์-เบรลาร์ด': 'Saint Helier-Brelade',
    'เกนส์วิลล์': 'Gainesville',
    'บัยตี': 'Baiti',
    'กาสะลองคิดส์': 'Kasalong Kids',
    'เดอะแพสชั่น': 'The Passion',
    'เอช้วน': 'A-Chuan',
    'ร่วมฤดี': 'Ruamrudee',
    'ร่วมฤดีวิเทศศึกษา': 'Ruamrudee',
    'คินเดอร์วิลล์โนวา': 'Kinderville Nova',
    'ไลท์เฮ้าส์': 'Lighthouse',
    'ประสานเกตเวย์': 'Prasan Gateway',
    'ภูเก็ตพินนาเคิล': 'Phuket Pinnacle',
    'เซเลสเทีย': 'Celestia',
    'อันดามัน': 'Andaman',
    'เกลนอัลมอนด์': 'Glenalmond',
    'แบมบู แวลลีย์': 'Bamboo Valley',
    'บ้านอินทนิล': 'Baan Inthanin',
    'วันเดอร์แวลี่ย์': 'Wonder Valley'
}

def is_garbled_name(name):
    """Detects whether an English name is a broken transliteration, HTTP error, or generic spam"""
    if not name or len(name.strip()) < 3:
        return True
    low = name.strip().lower()
    for phrase in INVALID_EN_PHRASES:
        if phrase in low:
            return True
    if any(g in name for g in GARBLED_FRAGMENTS):
        return True
    return False

def clean_school_en_name(raw_name):
    """Cleans and formats an English school name with standard casing and acronym preservation"""
    if not raw_name:
        return ""
    name = str(raw_name).strip()
    name = name.replace('&amp;', '&').replace('&quot;', '"').replace('&#39;', "'").replace('&#8211;', '-').replace('&#8212;', '—')
    name = re.sub(r'[\r\n\t]+', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    
    # Strip leading short acronym prefix e.g. "Hcik — " or "APIS - "
    name = re.sub(r'^[A-Za-z0-9]{2,6}\s*[\—\-–•·:]\s*', '', name).strip()
    
    # Strip trailing location or slogan suffixes e.g. "| Bangkok", "· Chiang Mai", "- Trend"
    name = re.split(r'[\s]*[\|\–•·][\s]*(?:Bangkok|Chiang Mai|Phuket|Pattaya|Thailand|Home|Official|Trend)', name, flags=re.IGNORECASE)[0].strip()
    name = re.sub(r'^[,\-\.\s\|•·]+|[,\-\.\s\|•·]+$', '', name)
    name = re.sub(r'\s*\([a-zA-Z0-9\s]+\)$', '', name).strip() # Strip acronym in parens e.g. (acis)
    
    if is_garbled_name(name):
        return ""
        
    # Capitalization
    words = name.split()
    formatted = []
    for w in words:
        w_upper = w.upper().replace("'", "").replace(".", "")
        if w_upper in KNOWN_ACRONYMS or w.upper() in KNOWN_ACRONYMS:
            formatted.append(w.upper())
        elif w.lower() in {'of', 'and', 'in', 'at', 'the', 'for', 'to', 'by', 'on'}:
            formatted.append(w.lower())
        else:
            formatted.append(w.capitalize())
            
    res = " ".join(formatted).strip()
    if res:
        res = res[0].upper() + res[1:]
    return res

def transliterate_thai_school_to_en(name_th):
    """
    Intelligently transliterates a Thai international school name into standard English title:
    e.g. นานาชาติสิงคโปร์สุวรรณภูมิ -> Singapore Suvarnabhumi International School
         อนุบาลนานาชาติฮานาคริสเตียน -> Hana Christian International Kindergarten
         นานาชาติเด่นหล้า บริติช -> DBS Denla British School
    """
    th = str(name_th or "").strip()
    if not th:
        return ""
        
    # Special specific brands known nationwide
    if "เด่นหล้า บริติช" in th:
        return "DBS Denla British School"
    if "แอสเตอร์ กรุงเทพ" in th:
        return "Aster International School Bangkok"
    if "แอ๊ดเวนติสมิชชัน" in th:
        return "Adventist International Mission School"
        
    prefix_type = "International School"
    if th.startswith("อนุบาลนานาชาติ"):
        prefix_type = "International Kindergarten"
        th = th[len("อนุบาลนานาชาติ"):].strip()
    elif th.startswith("ประถมนานาชาติ"):
        prefix_type = "Primary International School"
        th = th[len("ประถมนานาชาติ"):].strip()
    elif th.startswith("โรงเรียนนานาชาติ"):
        prefix_type = "International School"
        th = th[len("โรงเรียนนานาชาติ"):].strip()
    elif th.startswith("นานาชาติ"):
        prefix_type = "International School"
        th = th[len("นานาชาติ"):].strip()

    sorted_tokens = sorted(THAI_TO_EN_TOKEN_MAP.keys(), key=len, reverse=True)
    en_words = []
    
    remaining = th
    while remaining:
        remaining = remaining.strip()
        matched = False
        for tok in sorted_tokens:
            if remaining.startswith(tok):
                en_words.append(THAI_TO_EN_TOKEN_MAP[tok])
                remaining = remaining[len(tok):].strip()
                matched = True
                break
        if not matched:
            chunk = remaining.split()[0] if ' ' in remaining else remaining
            en_words.append(chunk)
            remaining = remaining[len(chunk):].strip()

    brand_en = " ".join(en_words).strip()
    if not brand_en:
        return ""
        
    return clean_school_en_name(f"{brand_en} {prefix_type}")

def does_en_match_thai_brand(en_candidate, th_name):
    """Verifies that an English candidate name from web matches the Thai brand tokens"""
    if not en_candidate or not th_name:
        return False
    en_low = en_candidate.lower()
    
    # Check key brand tokens
    for th_tok, en_tok in THAI_TO_EN_TOKEN_MAP.items():
        if th_tok in th_name:
            if en_tok.lower() in en_low:
                return True
    return False

def extract_english_name_from_web(url, name_th=""):
    """Extracts official English name from school website metadata with strict safety guards"""
    if not url:
        return ""
    
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u

    try:
        r = web_session.get(u, timeout=3.5, verify=False)
        if r.status_code != 200 or not r.text:
            return ""
            
        html = r.text

        # 1. Try JSON-LD Schema.org
        ld_json_matches = re.findall(
            r'<script[^>]*type=[\'"]application/ld\+json[\'"][^>]*>(.*?)</script>',
            html, re.DOTALL | re.IGNORECASE
        )
        for ld in ld_json_matches:
            try:
                data = json.loads(ld.strip())
                if isinstance(data, dict):
                    types = [str(data.get("@type", "")).lower()]
                    if any(t in ["school", "educationalorganization", "organization", "localbusiness"] for t in types):
                        name = data.get("name") or data.get("legalName")
                        if name and isinstance(name, str) and re.search(r'[A-Za-z]{3,}', name):
                            clean = clean_school_en_name(name.strip())
                            if clean and len(clean) > 5 and not is_garbled_name(clean):
                                if not name_th or does_en_match_thai_brand(clean, name_th):
                                    return clean
            except Exception:
                pass

        # 2. Try OpenGraph site_name
        og_name = re.search(
            r'<meta[^>]*property=[\'"]og:site_name[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
            html, re.IGNORECASE
        )
        if og_name:
            val = og_name.group(1).strip()
            if re.search(r'[A-Za-z]{3,}', val):
                clean = clean_school_en_name(val)
                # Ensure it has school context and matches brand
                if clean and len(clean) >= 6 and not is_garbled_name(clean) and any(w in clean.lower() for w in ['school', 'international', 'kindergarten', 'academy', 'college', 'preschool', 'prep']):
                    if not name_th or does_en_match_thai_brand(clean, name_th):
                        return clean

        # 3. Try <title> tag
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
        if title_match:
            raw_title = title_match.group(1).strip()
            parts = re.split(r'[\s]*[\|\-–•:][\s]*', raw_title)
            for part in parts:
                p = part.strip()
                if re.search(r'[A-Za-z]{3,}', p):
                    clean = clean_school_en_name(p)
                    if clean and len(clean) >= 6 and not is_garbled_name(clean) and any(w in clean.lower() for w in ['school', 'international', 'kindergarten', 'academy', 'college', 'preschool', 'prep']):
                        if not name_th or does_en_match_thai_brand(clean, name_th):
                            return clean
    except Exception:
        pass

    return ""

def dynamic_resolve_school_en_name(school):
    """
    Dynamically resolves the accurate, official English name of a school (100% Standalone Dynamic Engine):
    1. Existing clean EN name (if not garbled - OPEC paramount)
    2. OPEC profile tags & history (parentheses English name)
    3. Official website metadata (JSON-LD Schema, OpenGraph, Title with safety guard)
    4. Morphological & Linguistic Standard Transliteration Formula
    """
    # === Tier 1: Existing clean EN name from OPEC ===
    current_en = str(school.get("school_name_en") or "").strip()
    if current_en and not is_garbled_name(current_en):
        return clean_school_en_name(current_en)

    th_name = str(school.get("school_name_th") or "").strip()
    tags = str(school.get("tags") or "")
    history = str(school.get("school_history") or "")
    
    # === Tier 2: OPEC History / Tags Parentheses ===
    en_in_paren = re.findall(r'\(([A-Za-z0-9\s\.\,\'\-–]+(?:School|Kindergarten|Preschool|Academy|College|Prep|International)[A-Za-z0-9\s\.\,\'\-–]*)\)', history + " " + tags)
    if en_in_paren:
        for match in en_in_paren:
            candidate = match.strip()
            if len(candidate) > 5 and not is_garbled_name(candidate):
                return clean_school_en_name(candidate)

    # === Tier 3: Website Metadata ===
    web = str(school.get("website") or "").strip()
    if web:
        web_en = extract_english_name_from_web(web, th_name)
        if web_en and not is_garbled_name(web_en):
            return clean_school_en_name(web_en)

    # === Tier 4: Morphological & Linguistic Standard Transliteration ===
    morph_en = transliterate_thai_school_to_en(th_name)
    if morph_en and not is_garbled_name(morph_en):
        return clean_school_en_name(morph_en)

    return ""

def enrich_single_school_name_en(school):
    """Enriches English name for a single school record"""
    cur_en = str(school.get("school_name_en") or "").strip()
    if cur_en and not is_garbled_name(cur_en):
        return school, {}

    resolved_en = dynamic_resolve_school_en_name(school)
    if resolved_en:
        changes = {"school_name_en": resolved_en}
        school.update(changes)
        return school, changes

    return school, {}

def enrich_all_school_names_en(update_progress, on_save_callback=None):
    """
    Main Runner for Button: เติมชื่อภาษาอังกฤษ (EN)
    """
    schools = load_schools()
    if not schools:
        update_progress("ไม่พบข้อมูลโรงเรียน", 100, 100, "กรุณากดดึงข้อมูล OPEC (ปุ่ม 1) ก่อน!")
        return []

    targets = [s for s in schools if not str(s.get("school_name_en") or "").strip() or is_garbled_name(s.get("school_name_en"))]
    total_tasks = len(targets)

    if total_tasks == 0:
        update_progress("ชื่อภาษาอังกฤษสมบูรณ์ครบถ้วนแล้ว", 100, 100, f"โรงเรียนทั้งหมด {len(schools)} แห่ง มีชื่อภาษาอังกฤษ (EN) ครบถ้วน 100% แล้ว!")
        return schools

    update_progress(f"กำลังประมวลผลชื่อภาษาอังกฤษ ({total_tasks} แห่ง)", 0, total_tasks, "เริ่มต้นกระบวนการเติมชื่อภาษาอังกฤษทางการ...")

    completed = 0
    enriched_count = 0
    lock = threading.Lock()

    for idx, s in enumerate(targets, 1):
        th_name = s.get("school_name_th", "")
        resolved_en = dynamic_resolve_school_en_name(s)
        
        with lock:
            if resolved_en:
                s["school_name_en"] = resolved_en
                s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
                enriched_count += 1
                msg = f"[ชื่อ EN: {idx}/{total_tasks}] เติมชื่อสำเร็จ: {th_name} -> {resolved_en}"
            else:
                msg = f"[ชื่อ EN: {idx}/{total_tasks}] ไม่พบชื่อ: {th_name}"
                
            completed += 1
            update_progress(f"กำลังประมวลผลชื่อภาษาอังกฤษ ({completed}/{total_tasks})", completed, total_tasks, msg)

    save_schools(schools)
    if on_save_callback:
        on_save_callback(schools)

    summary_msg = (
        f"ประมวลผลชื่อภาษาอังกฤษเสร็จสมบูรณ์!\n"
        f"  - อัปเดตชื่อภาษาอังกฤษ: +{enriched_count} แห่ง\n"
        f"  - บันทึกลง data/.json และ data/.csv เรียบร้อยแล้ว (100.0% Complete)"
    )
    update_progress("เติมชื่อภาษาอังกฤษเสร็จสมบูรณ์!", total_tasks, total_tasks, summary_msg)
    return schools
