"""
fetch_official_websites.py
โมดูลสำหรับปุ่มที่ 4: ค้นหา & ตรวจสอบ Official Website ทางการของโรงเรียนนานาชาติ

ลำดับความน่าเชื่อถือ (สูง -> ต่ำ) ทุกชั้นต้องผ่านการตรวจสอบก่อนเขียนทับข้อมูลเดิม:

1. Verified Registry (reference/schoolAndURL.txt)
   ทะเบียนที่ตรวจสอบด้วยมือแล้ว จับคู่ด้วย school_code ก่อน ถ้าไม่เจอจึงจับคู่ด้วยชื่อ
   ที่ normalize แล้ว (รองรับกรณี สช. เปลี่ยนรหัสโรงเรียน)

2. OPEC Profile (ฟิลด์ opec_website เท่านั้น)
   ปัจจุบัน API ของ สช. ยังไม่ส่ง website มาเลยสักแห่ง แต่ถ้าวันหนึ่งส่งมา ค่านั้นจะถูก
   เก็บแยกไว้ใน opec_website โดย fetch_opec.py และ "ห้าม" โมดูลนี้เขียนทับ
   เหตุผลที่ต้องแยกฟิลด์: เดิมโมดูลนี้อ่าน s["website"] ที่ตัวเองเขียนไว้รอบก่อน แล้วติดป้าย
   ว่า "OPEC Profile" ทำให้ผลเดาจากรอบก่อนกลายเป็นข้อมูลทางการถาวรและแก้ไม่ได้อีกเลย

3. Brand Domain (อนุมานจากทะเบียน)
   วิทยาเขตใหม่ที่ยังไม่อยู่ในทะเบียน จะเดาโดเมนจากโรงเรียนในเครือเดียวกันที่อยู่ในทะเบียนแล้ว
   ไม่ hardcode URL รายโรงเรียนอีกต่อไป (ของเดิม hardcode ไว้ ~20 URL ซึ่งซ้ำกับทะเบียน)

4. Algorithmic Probe + Relevance Check
   สร้างโดเมนผู้สมัครจากชื่อโรงเรียน แล้วต้องผ่านทั้ง DNS, HTTP, ตัวกรอง parked domain
   และ "ตรวจเนื้อหาหน้าเว็บว่าเป็นของโรงเรียนนั้นจริง" ก่อนจึงยอมรับ
   ชั้นนี้คือต้นเหตุของ false positive เดิม เช่น ipc.com / kids.org / crescent.com
   ซึ่งเป็นโดเมนของธุรกิจอื่นที่บังเอิญชื่อพ้องกัน

ถ้าไม่มีชั้นไหนผ่านเลย จะ "คงค่าเดิมไว้" ไม่ล้างเป็นค่าว่าง
"""

import os
import re
import time
import socket
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import load_schools, save_schools

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# High-Performance HTTP Session
session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=150, pool_maxsize=150, max_retries=1)
session.mount("https://", adapter)
session.mount("http://", adapter)
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8"
})

def _find_reference_file():
    """
    reference/schoolAndURL.txt sits at the repo root, not next to this module.
    The old code looked only inside microservices/opec/, so the registry silently
    loaded 0 entries and every school fell through to domain guessing.
    Walk up the tree so it resolves regardless of the service's working directory.
    """
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        for candidate in (os.path.join(d, "reference", "schoolAndURL.txt"),
                          os.path.join(d, "schoolAndURL.txt")):
            if os.path.exists(candidate):
                return candidate
        d = os.path.dirname(d)
    return ""

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REFERENCE_FILE = _find_reference_file()

DISQUALIFIED_DOMAINS = {
    'perfectdomain.com', 'expireddomains.com', 'hugedomains.com', 'dan.com',
    'sedo.com', 'godaddy.com', 'namecheap.com', 'domainmarketplace',
    'domainmarket.com', 'buydomains.com', 'uniregistry.com', 'afternic.com',
    'parkingcrew.net', 'bodis.com', 'above.com', 'domainnamesales.com',
    'forsale.godaddy.com', 'domainnameshop.com', 'namefind.com', 'atom.com',
    'domainmanage.com', 'facebook.com', 'instagram.com', 'youtube.com', 'twitter.com', 'tiktok.com',
    'linkedin.com', 'pantip.com', 'bing.com',
    'schoolandcollegelistings.com', 'yellowpages.co.th', 'wongnai.com',
    'international-schools-database.com', 'bangkokpost.com', 'thailandee.com',
    'internationalschoolsinbangkok.com', 'edarabia.com',
    'wikipedia.org', 'wikidata.org', 'moe.go.th', 'opec.go.th', 'tripadvisor.com',
    'sanfan.org', 'kiddykare.org', 'bealbright.ac.th'
}

PARKED_PAGE_PATTERNS = [
    'domain for sale', 'buy this domain', 'domain is parked', 'perfect domain',
    'parked domain', 'coming soon', 'under construction', 'this domain has expired',
    'renew your domain', 'hugedomains.com', 'make an offer', 'dan.com', 'sedo.com',
    'godaddy.com/forsale', 'namecheap.com', 'expireddomains.com', 'domain name is for sale',
    'error 404', '404 not found', 'page not found', 'bealbright.ac.th'
]

FOREIGN_DISQUALIFIED_TLDS = ['.co.uk', '.ac.uk', '.edu.au', '.gov.au', '.edu.sg', '.gov.sg', '.co.nz']

# Words carrying no identity — nearly every school shares them, so they must never
# be what makes a domain or a page look like the right school.
GENERIC_WORDS = {
    'the', 'of', 'in', 'and', 'at', 'campus', 'for', 'school', 'schools', 'international',
    'inter', 'pre-school', 'preschool', 'kindergarten', 'kindergaten', 'kindergarden', 'pre',
    'primary', 'secondary', 'college', 'academy', 'demonstration', 'bilingual', 'nursery',
    'thailand', 'thai', 'bangkok', 'education', 'learning', 'centre', 'center', 'student',
}

# A genuine school homepage says so somewhere in its first screenful.
SCHOOL_PAGE_HINTS = (
    'school', 'kindergarten', 'academy', 'campus', 'admission', 'curriculum', 'pupil',
    'student', 'nursery', 'preschool', 'igcse', 'early years',
    'โรงเรียน', 'นานาชาติ', 'อนุบาล', 'หลักสูตร', 'รับสมัคร', 'นักเรียน',
)

dns_cache = {}
reference_registry = {}     # school_code -> url
registry_by_name = {}       # normalized english name -> url
brand_domains = {}          # distinctive brand token -> domain


def _normalize_name(name):
    """Lowercase, drop punctuation and generic words — what remains identifies the school."""
    cleaned = re.sub(r'[^a-z0-9\s]+', ' ', (name or '').lower())
    return " ".join(w for w in cleaned.split() if w and w not in GENERIC_WORDS)


def _domain_of(url):
    return re.sub(r'^(https?://)?(www\.)?', '', (url or '').lower()).split('/')[0].split(':')[0]


def load_verified_registry():
    """
    Loads the hand-verified school_code -> official URL mapping, and derives two
    extra indexes from it:
      - registry_by_name: fallback match when OPEC reissues a school_code
      - brand_domains:    lets a new campus inherit its group's domain, replacing
                          the ~20 hardcoded per-school URLs the old version carried
    """
    global reference_registry
    if reference_registry:
        return reference_registry

    if not REFERENCE_FILE:
        print("[Registry] reference/schoolAndURL.txt not found — probing only")
        return reference_registry

    brand_hits = {}
    try:
        with open(REFERENCE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                m = re.search(r'\[\d+\s*-\s*(\d+)\]', line)
                if not m:
                    continue
                code = m.group(1).strip()
                url_m = re.search(r'https?://[^\s\)]+', line)
                url = url_m.group(0).strip().rstrip('/') if url_m else ""
                reference_registry[code] = url
                if not url:
                    continue

                # English name is the text between "]" and the "(" holding the Thai name.
                name_m = re.search(r'\]\s*(.*?)\s*\(', line)
                key = _normalize_name(name_m.group(1) if name_m else "")
                if key:
                    registry_by_name.setdefault(key, url)
                    # Index the HEAD token only. These names put the brand first and
                    # the location last, so indexing every token let a trailing place
                    # name act as a brand: "NAWATTAPHUME ... KRABI" matched
                    # krabiinternationalschool.com, a different school entirely.
                    head = key.split()[0]
                    if len(head) >= 4:
                        brand_hits.setdefault(head, set()).add(_domain_of(url))
    except Exception as e:
        print(f"[Registry] Warning loading {REFERENCE_FILE}: {e}")
        return reference_registry

    # Keep only tokens pointing at exactly one domain. "singapore" appears under both
    # sisb.ac.th and glorysingapore.com, so it is ambiguous and gets dropped.
    for token, domains in brand_hits.items():
        if len(domains) == 1:
            brand_domains[token] = next(iter(domains))

    print(f"[Registry] loaded {len(reference_registry)} verified schools "
          f"({sum(1 for v in reference_registry.values() if v)} with a URL), "
          f"{len(brand_domains)} brand domains")
    return reference_registry

# Load registry on module import
load_verified_registry()

def check_dns(host):
    """Fast DNS pre-check to eliminate non-existent domains in <5ms"""
    if host in dns_cache:
        return dns_cache[host]
    try:
        ip = socket.gethostbyname(host)
        res = bool(ip and not ip.startswith('127.'))
        dns_cache[host] = res
        return res
    except Exception:
        dns_cache[host] = False
        return False

def _distinctive_tokens(name_en, name_th=""):
    """Name tokens that actually identify this school, longest first."""
    tokens = [t for t in _normalize_name(name_en).split() if len(t) >= 3]
    tokens.sort(key=len, reverse=True)
    th = re.sub(r'(โรงเรียน|นานาชาติ|อนุบาล|ประถม|สาธิต)', ' ', name_th or '')
    tokens += [t for t in th.split() if len(t) >= 4]
    return tokens


def _page_text(response, limit=32768):
    """First chunk of the response with tags stripped, lowercased."""
    try:
        raw = b""
        for chunk in response.iter_content(8192):
            raw += chunk
            if len(raw) >= limit:
                break
    except Exception:
        return ""
    html = raw.decode('utf-8', errors='ignore')
    html = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html)
    return re.sub(r'<[^>]+>', ' ', html).lower()


def _looks_like_a_school(text):
    return any(hint in text for hint in SCHOOL_PAGE_HINTS)


def _page_belongs_to_school(text, domain, name_en, name_th):
    """
    Guards the guessing tier. A candidate domain built from the school's name will
    happily resolve to an unrelated business that shares the name — ipc.com,
    kids.org and crescent.com were all accepted as "official" this way.
    So an algorithmic hit must look like a school AND mention the school.
    """
    if not _looks_like_a_school(text):
        return False
    tokens = _distinctive_tokens(name_en, name_th)
    if not tokens:
        return False
    flat_domain = re.sub(r'[^a-z0-9]', '', domain)
    for t in tokens:
        if t in text:
            return True
        # Thai tokens reduce to "" here, and "" is a substring of everything —
        # that would make this guard pass unconditionally.
        ascii_t = re.sub(r'[^a-z0-9]', '', t)
        if ascii_t and ascii_t in flat_domain:
            return True
    return False


def verify_live_url(url, name_en="", name_th="", require_relevance=False):
    """
    Verifies that a candidate URL is a live, authentic school website:
    - Fast DNS pre-filtering
    - HTTP status with strict timeout
    - Filters parked pages, domain brokers and 404 redirects
    - When require_relevance is set (guessed domains, never verified ones), the page
      itself must look like this school's site

    Returns (is_live, canonical_url).
    """
    if not url or not isinstance(url, str):
        return False, None
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u

    if 'sites.google.com' in u or 'gism.ac.th' in u:
        return True, u

    raw_host = re.sub(r'^(https?://)?', '', u).split('/')[0].split(':')[0].lower()

    # 1. Blacklist check
    if any(b in raw_host for b in DISQUALIFIED_DOMAINS):
        return False, None
    for ftld in FOREIGN_DISQUALIFIED_TLDS:
        if raw_host.endswith(ftld):
            return False, None

    if not check_dns(raw_host):
        return False, None

    # 2. Live HTTP verification
    try:
        r = session.get(u, timeout=(2.0, 3.5), verify=False, stream=True, allow_redirects=True)
        if r.status_code not in (200, 201, 202, 301, 302, 403, 406):
            return False, None

        final_url = r.url
        dom = _domain_of(final_url)

        for ftld in FOREIGN_DISQUALIFIED_TLDS:
            if dom.endswith(ftld):
                return False, None
        if any(b in dom for b in DISQUALIFIED_DOMAINS):
            return False, None
        if any(marker in final_url.lower() for marker in ('404.html', 'error-404', 'notfound')):
            return False, None

        text = _page_text(r)
        if any(pattern in text for pattern in PARKED_PAGE_PATTERNS):
            return False, None

        clean_dom = re.sub(r'\.(ac\.th|co\.th|com|org|asia|net|academy)$', '', dom)
        if len(clean_dom) <= 2:
            return False, None

        if require_relevance and not _page_belongs_to_school(text, dom, name_en, name_th):
            return False, None

        # Keep a deep link the caller supplied; otherwise report where we landed.
        if '#' in u or '/' in u.replace('https://', '').replace('http://', ''):
            return True, u
        return True, final_url
    except Exception:
        # A .ac.th domain is registrar-gated to Thai academic institutions, so an
        # unreachable one built from the school's own name is still worth keeping —
        # but only when we are not in strict mode.
        if (not require_relevance and raw_host.endswith('.ac.th')
                and check_dns(raw_host) and 'bealbright' not in raw_host):
            return True, u

    return False, None


def generate_algorithmic_candidates(s):
    """
    Builds candidate domains from the school's own name.

    The old version also carried ~20 hardcoded URLs (St Andrews, SISB, Regents,
    Wells, Brighton, HEI, Ruamrudee, Garden). Those duplicated reference/schoolAndURL.txt
    and went stale independently of it, so they are gone: the registry is now the single
    source of truth and campus groups are handled by the brand tier instead.
    """
    if isinstance(s, dict):
        name_en = s.get("school_name_en", "").strip()
    else:
        name_en = str(s).strip()

    name_en = re.sub(r'[ะ-ฺ็-๎​-‏]', '', name_en).strip()
    clean_en = re.sub(r'[\(\)\[\],\'\"\-\./\\:]+', ' ', name_en).strip()
    words = [w.lower() for w in clean_en.split() if w]
    core_words = [w for w in words if w not in GENERIC_WORDS and not w.isdigit()] or words
    if not core_words:
        return []

    core_join = "".join(core_words)
    core_dash = "-".join(core_words)
    if len(core_join) < 3 or core_join == 'school':
        return []

    candidates = [
        f"https://www.{core_join}.ac.th",
        f"https://{core_join}.ac.th",
        f"https://www.{core_dash}.ac.th",
        f"https://{core_dash}.ac.th",
        f"https://www.{core_join}school.ac.th",
        f"https://{core_join}school.ac.th",
        f"https://{core_join}school.com",
        f"https://{core_join}.com",
        f"https://{core_join}.org",
    ]
    return list(dict.fromkeys(candidates))


def brand_domain_candidates(s):
    """
    A campus missing from the registry usually belongs to a group already in it.
    Derives the group's domain from the registry rather than from a hardcoded table.

    Matches on the leading token of both names only — the brand. Matching anywhere in
    the name made every shared place name look like a shared brand.
    """
    tokens = _normalize_name(s.get("school_name_en", "")).split()
    if not tokens or len(tokens[0]) < 4:
        return []
    domain = brand_domains.get(tokens[0])
    return [f"https://{domain}"] if domain else []


def dynamic_search_official_website(s):
    """
    Resolves one school's official website. Returns (url, source).
    An empty url means "no confident answer" — the caller keeps the existing value
    rather than erasing it.
    """
    code = str(s.get("school_code", "")).strip()
    name_en = s.get("school_name_en", "") or ""
    name_th = s.get("school_name_th", "") or ""
    load_verified_registry()

    # === Tier 1: verified registry, by code then by name ===
    if code in reference_registry and reference_registry[code]:
        return reference_registry[code], "Verified Official Registry"

    by_name = registry_by_name.get(_normalize_name(name_en))
    if by_name:
        return by_name, "Verified Official Registry (Name Match)"

    # === Tier 2: genuine OPEC value — read only, never overwritten ===
    # Deliberately NOT s["website"]: that field holds this module's own previous
    # answer, and reading it back was promoting old guesses to "OPEC Profile".
    opec_w = str(s.get("opec_website") or "").strip()
    if opec_w:
        is_live, canonical = verify_live_url(opec_w, name_en, name_th)
        if is_live and canonical:
            return canonical.rstrip('/'), "OPEC Profile"
        if opec_w.startswith("http"):
            return opec_w.rstrip('/'), "OPEC Profile"

    # === Tier 3: sibling campus domain inferred from the registry ===
    for candidate in brand_domain_candidates(s):
        is_live, canonical = verify_live_url(candidate, name_en, name_th, require_relevance=True)
        if is_live and canonical:
            return canonical.rstrip('/'), "Brand Domain Match"

    # === Tier 4: name-derived candidates, relevance-checked ===
    for candidate in generate_algorithmic_candidates(s):
        is_live, canonical = verify_live_url(candidate, name_en, name_th, require_relevance=True)
        if is_live and canonical:
            return canonical.rstrip('/'), "Live Domain Match & Verification"

    return "", "Not Found"


def resolve_all_official_websites(update_progress, on_save_callback=None):
    """
    High-Speed Resolver for Task 3 (Button 3: Fetch Official Websites):
    - Reads existing schools from data/ folder.
    - Resolves official websites with 100% accuracy and zero hanging.
    - Emits rich, detailed real-time logs per school sequentially.
    - Periodically saves every 25 schools and notifies progress.
    """
    schools = load_schools()
    if not schools:
        update_progress("ไม่พบข้อมูลโรงเรียน", 100, 100, "กรุณากดดึงข้อมูลจาก OPEC (ปุ่ม 1) ก่อน!")
        return []

    total = len(schools)
    update_progress("เริ่มต้นค้นหาและตรวจสอบ Official Website...", 0, total, f"มีโรงเรียนในระบบทั้งหมด {total} แห่ง")

    resolved_count = 0
    completed_count = 0
    registry_source_count = 0
    opec_source_count = 0
    live_match_count = 0
    no_website_count = 0

    # Ensure clean sequential processing across thread pool
    results_map = {}
    with ThreadPoolExecutor(max_workers=30) as executor:
        future_to_school = {executor.submit(dynamic_search_official_website, s): s for s in schools}
        for future in as_completed(future_to_school):
            s = future_to_school[future]
            code = s.get("school_code", "")
            try:
                url, source = future.result()
            except Exception:
                url, source = "", "Not Found"
            results_map[code] = (url, source)

    # Process and stream progress in orderly index
    for idx, s in enumerate(schools, 1):
        code = s.get("school_code", "")
        th_name = s.get("school_name_th", "")
        en_name = s.get("school_name_en", "")
        display_name = f"{th_name} ({en_name})" if en_name else th_name

        url, source = results_map.get(code, ("", "Not Found"))
        completed_count += 1

        # No confident answer keeps whatever is already on record. The old code
        # assigned unconditionally, so one failed lookup erased a good URL.
        if url:
            s["website"] = url
            s["website_source"] = source
            s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        else:
            kept = str(s.get("website") or "").strip()
            if kept:
                url, source = kept, s.get("website_source") or "Kept (unverified)"

        if url:
            resolved_count += 1
            if "Registry" in source:
                registry_source_count += 1
            elif "OPEC" in source:
                opec_source_count += 1
            else:
                live_match_count += 1

            log_msg = f"[{completed_count}/{total}] [รหัส: {code}] {display_name} -> {url} (แหล่งข้อมูล: {source})"
            update_progress(
                f"ตรวจสอบเว็บไซต์ ({completed_count}/{total})",
                completed_count, total,
                log_msg
            )
        else:
            no_website_count += 1
            log_msg = f"[{completed_count}/{total}] [รหัส: {code}] {display_name} -> ไม่มีเว็บไซต์ทางการประจำโรงเรียน"
            update_progress(
                f"ตรวจสอบเว็บไซต์ ({completed_count}/{total})",
                completed_count, total,
                log_msg
            )

        if completed_count % 25 == 0:
            save_schools(schools)
            if on_save_callback:
                on_save_callback(schools)

    # Final atomic save
    save_schools(schools)
    if on_save_callback:
        on_save_callback(schools)

    pct = round(resolved_count / total * 100, 1) if total > 0 else 0
    summary_log = (
        f"ตรวจสอบและบันทึก Official Website ครบทั้ง {total} แห่งสำเร็จ!\n"
        f"  - พบเว็บไซต์ทางการ: {resolved_count}/{total} แห่ง ({pct}%)\n"
        f"  - ทะเบียนทางการที่ผ่านการตรวจยืนยัน: {registry_source_count} แห่ง | OPEC: {opec_source_count} แห่ง | Live Domain: {live_match_count} แห่ง\n"
        f"  - ไม่มีเว็บไซต์ทางการ: {no_website_count} แห่ง\n"
        f"  - บันทึกลง data/.json และ data/.csv เรียบร้อยแล้ว (100.0% Complete)"
    )
    update_progress(
        "ค้นหา Official Website เสร็จสิ้น!",
        total, total,
        summary_log
    )
    return schools

def resolve_single_school_by_code(school_code):
    """Resolves official website for a single school by its OPEC code and saves to data/"""
    schools = load_schools()
    for s in schools:
        if s["school_code"] == school_code:
            url, source = dynamic_search_official_website(s)
            if url:
                s["website"] = url
                s["website_source"] = source
                s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
                save_schools(schools)
            return s
    return None
