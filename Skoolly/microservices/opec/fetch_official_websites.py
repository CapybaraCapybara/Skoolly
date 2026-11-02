"""
fetch_official_websites.py
ขั้น "ค้นหา Website": ระบบตัดสินเว็บไซต์ทางการของแต่ละโรงเรียนเอง ไม่อ่านรายชื่อที่คนพิมพ์ไว้ (schoolAndURL.txt)

ลำดับ (สูง -> ต่ำ):

0. ลิงก์ที่คนแก้ไว้เอง (ทะเบียนที่ verified_by = 'Admin' หรือ website_source = 'Manual Edit') ระบบไม่แตะ
   รวมถึงแถวที่แอดมินบันทึกว่าโรงเรียนไม่มีเว็บ

1. ลิงก์ที่โรงเรียนแจ้งเอง: ISAT (isat_website จากขั้นซิงค์ ISAT) แล้วจึง สช. (opec_website)
   ใช้ได้เมื่อเปิดหน้าได้จริงเท่านั้น ลิงก์ ISAT ที่เป็นโดเมนเก่าหรือเสียรูป ("https://", "sv.info@sisbschool")
   ถูกตัดตรงนี้ ถ้าเป็นเว็บเดียวกับลิงก์ที่ใช้อยู่ จะคงลิงก์เดิมไว้ เพราะลิงก์เดิมมักเป็นหน้าวิทยาเขต
   ส่วน ISAT มักให้หน้าแรกของเครือ และตัวดึงค่าเทอมเริ่มอ่านจากหน้านี้

2. ลิงก์ที่ใช้อยู่ (school_data.schools) ที่ยังเปิดได้: คงไว้ ถ้า Overture ลงเว็บเดียวกันไว้จะติดป้าย Overture
   ถ้าไม่มีแหล่งไหนยืนยันจะติดป้าย Previous Link

3. ลิงก์เดิมว่างหรือเสีย และไม่มีลิงก์ที่โรงเรียนแจ้งที่เปิดได้: หาเองจาก Overture และโดเมนที่สร้างจากชื่อ
   รับเมื่อสองแหล่งชี้เว็บเดียวกันและเปิดได้อย่างน้อยหนึ่ง หรือ Overture แหล่งเดียวที่ผ่านการตรวจหน้าเว็บแบบเข้ม
   โดเมนที่สร้างจากชื่อแหล่งเดียวไม่รับ เพราะได้เว็บของสถาบันไทยหรือโรงเรียนต่างประเทศที่ชื่อพ้องกัน
   (rajapark.ac.th, spgs.org)

ไม่มีชั้นไหนได้ผล จะคงค่าเดิมไว้ ไม่ล้างเป็นค่าว่าง
ทุกลิงก์ที่ตัดสินแล้วถูกเปิดตรวจในรอบเดียวกัน (check_link) ผลอยู่ใน website_check ของแต่ละโรงเรียน
และ step_websites บันทึกลงทะเบียนเว็บไซต์ให้หน้าตรวจลิงก์ของแอดมินแสดง
"""

import re
import time
import socket
import threading
from urllib.parse import urlsplit
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import load_schools, save_schools
import gps_sources as src

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

DISQUALIFIED_DOMAINS = {
    'perfectdomain.com', 'expireddomains.com', 'hugedomains.com', 'dan.com',
    'sedo.com', 'godaddy.com', 'namecheap.com', 'domainmarketplace',
    'domainmarket.com', 'buydomains.com', 'uniregistry.com', 'afternic.com',
    'parkingcrew.net', 'bodis.com', 'above.com', 'domainnamesales.com',
    'forsale.godaddy.com', 'domainnameshop.com', 'namefind.com', 'atom.com',
    'domainmanage.com', 'facebook.com', 'instagram.com', 'youtube.com', 'twitter.com', 'tiktok.com',
    'linkedin.com', 'pantip.com', 'bing.com',
    'linktr.ee', 'lin.ee', 'line.me', 'tinyurl.com', 'bit.ly', 'goo.gl',
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

# Words carrying no identity — nearly every school shares them, so they must never
# be what makes a domain or a page look like the right school.
GENERIC_WORDS = {
    'the', 'of', 'in', 'and', 'at', 'campus', 'for', 'school', 'schools', 'international',
    'inter', 'pre-school', 'preschool', 'kindergarten', 'kindergaten', 'kindergarden', 'pre',
    'primary', 'secondary', 'college', 'academy', 'demonstration', 'bilingual', 'nursery',
    'thailand', 'thai', 'bangkok', 'education', 'learning', 'centre', 'center', 'student',
}

SELF_REPORTED = (("isat_website", "ISAT"), ("opec_website", "OPEC Profile"))
ALIVE = ("ok", "blocked", "chain", "busy", "cert")   # the site is there even when a script cannot read it
SHARED_HOSTS = ("wixsite.com", "wordpress.com", "blogspot.com", "weebly.com")
INTL_WORDS = ("international", "นานาชาติ", "อินเตอร์")
LINK_TIMEOUT = (5, 15)
OVERTURE_RADIUS_M = 1500
OVERTURE_MIN_CONFIDENCE = 0.3   # same floor the GPS step uses

dns_cache = {}
current_links = {}          # school_code -> the link school_data.schools holds now
admin_links = {}            # school_code -> link someone set by hand ("" = the school has no website)
_registry_lock = threading.Lock()
_registry_state = {"loaded": False}


def _normalize_name(name):
    """Lowercase, drop punctuation and generic words — what remains identifies the school."""
    cleaned = re.sub(r'[^a-z0-9\s]+', ' ', (name or '').lower())
    return " ".join(w for w in cleaned.split() if w and w not in GENERIC_WORDS)


def _name_words(name_en):
    return [w for w in _normalize_name(name_en).split() if len(w) >= 3]


def reset_verified_registry():
    """Forgets the loaded links, so the next lookup reads them again (after an admin edits one)."""
    with _registry_lock:
        _registry_state["loaded"] = False


def load_verified_registry(force=False):
    """
    school_code -> the link the site uses now, read from Supabase on first use and then kept;
    also fills admin_links. `force` or reset_verified_registry() makes the next call read again.
    """
    with _registry_lock:
        if not _registry_state["loaded"] or force:
            current_links.clear()
            admin_links.clear()
            _read_registry()
            _registry_state["loaded"] = True
        return current_links


def _read_registry():
    """
    The links school_data.schools holds and the ones an admin set by hand. Raises when the database
    cannot be read: deciding without the current links would swap good campus pages for guesses.
    """
    from supabase_sync import get_current_dsn, psycopg, dict_row, db_connect
    dsn = get_current_dsn()
    if not (dsn and psycopg):
        raise RuntimeError("ต่อ Supabase ไม่ได้ จึงไม่รู้ลิงก์ที่ใช้อยู่ ขั้นค้นหา Website หยุดไว้ก่อน")
    with db_connect(dsn, row_factory=dict_row, connect_timeout=10) as conn:
        schools = conn.execute(
            "SELECT opec_school_code, official_website_url, website_source FROM school_data.schools").fetchall()
        fixed = conn.execute("""
            SELECT school_code, website_url FROM school_data.official_website_registry
            WHERE verified_by = 'Admin' AND is_verified""").fetchall()
    for r in schools:
        code = str(r["opec_school_code"]).strip()
        url = (r["official_website_url"] or "").strip().rstrip('/')
        if url:
            current_links[code] = url
            if r["website_source"] == "Manual Edit":
                admin_links[code] = url
    for r in fixed:
        admin_links[str(r["school_code"]).strip()] = (r["website_url"] or "").strip().rstrip('/')
    print(f"[Websites] {len(current_links)} links in use, {len(admin_links)} set by hand")


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


def _html_text(html):
    """Page text with scripts, styles and tags stripped, lowercased."""
    html = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).lower()


def _site(url):
    """Which site a link belongs to: its registrable domain, or the owner's part on a shared host."""
    parts = urlsplit(url if "://" in url else "https://" + url)
    host = parts.netloc.lower().split("@")[-1].split(":")[0]
    host = host[4:] if host.startswith("www.") else host
    if host == "sites.google.com":   # sites.google.com/<school domain>/... is that school's Workspace site
        seg = next((s for s in parts.path.split("/") if s), "")
        return src.registrable_domain(seg) if "." in seg else host
    if host.endswith(SHARED_HOSTS):
        return host
    return src.registrable_domain(host)


def _well_formed(url):
    host = urlsplit(url if "://" in url else "https://" + url).netloc
    return "." in host and "@" not in host and not host.endswith("-")


def check_link(url, name_en=""):
    """
    Opens a link the way a visitor's browser would (GET, certificate checked) and says what came back:
      ok       the page loaded; carries final (where redirects ended), title and text
      blocked  a bot shield answered (403, 429, Cloudflare 52x): the site is there, a script cannot read it
      busy     timed out or another 5xx: the site is there but having a bad moment
      chain    the server sends an incomplete certificate chain: browsers open it, a script cannot read it
      cert     the certificate does not match the address, so browsers warn visitors before opening it
      dead     no such host, connection refused, another 4xx, or a parked / "not found" page
    """
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u
    try:
        r = session.get(u, timeout=LINK_TIMEOUT, allow_redirects=True)
    except requests.exceptions.SSLError as e:
        # an incomplete chain is the server's slip that browsers repair themselves; a wrong name they warn about
        return {"state": "chain" if "local issuer" in str(e) else "cert", "code": 0}
    except requests.exceptions.Timeout:
        return {"state": "busy", "code": 0}
    except requests.RequestException as e:
        why = str(e)
        if "Timeout" in why:
            return {"state": "busy", "code": 0}
        if any(k in why for k in ("NameResolution", "getaddrinfo", "Failed to resolve", "refused")):
            return {"state": "dead", "code": 0}
        # the server hung up on a script (RemoteDisconnected): big schools' firewalls do this, the site is there
        return {"state": "blocked", "code": 0}
    code, final = r.status_code, r.url
    if code in (403, 429) or code >= 520:
        return {"state": "blocked", "code": code, "final": final}
    if code >= 400:
        return {"state": "busy" if code >= 500 else "dead", "code": code, "final": final}
    if (r.encoding or "").lower() in ("", "iso-8859-1"):   # requests' guess for pages that do not say; Thai pages mostly UTF-8
        r.encoding = r.apparent_encoding
    html = r.text[:400000]
    m = re.search(r'(?is)<title[^>]*>(.*?)</title>', html)
    title = re.sub(r'\s+', ' ', m.group(1)).strip().lower() if m else ""
    text = _html_text(html)[:30000]
    host = urlsplit(final).netloc.lower()
    # "coming soon" on a page whose title names the school is a real page announcing something
    parked = (any(p in text[:3000] for p in PARKED_PAGE_PATTERNS)
              and not any(w in title for w in _name_words(name_en)))
    if parked or any(b in host for b in DISQUALIFIED_DOMAINS):
        return {"state": "dead", "code": code, "final": final, "title": title}
    return {"state": "ok", "code": code, "final": final, "title": title, "text": text}


def _names_this_school(page, name_en, name_th):
    """
    Strict page check for a link only map data points at: the page uses the school's own name (two
    distinctive words when it has two), calls itself international and is about Thailand. A name-built
    domain passing this is still not enough on its own (rajapark.ac.th passes for Rajapark International).
    """
    text = f'{page.get("title", "")} {page.get("text", "")}'
    words = _name_words(name_en)
    hits = [w for w in words if re.search(rf"\b{re.escape(w)}\b", text)]
    thai = re.sub(r'(โรงเรียน|นานาชาติ|อนุบาล|ประถม|สาธิต)', ' ', name_th or '')
    hits += [t for t in thai.split() if len(t) >= 4 and t in text]
    return (len(hits) >= (2 if len(words) >= 2 else 1)
            and any(w in text for w in INTL_WORDS)
            and bool(re.search(r'[฀-๿]|thailand|bangkok', text)))


def _overture_sites(s):
    """Websites Overture lists for the place that is this school (name, phone or Facebook near its pin)."""
    try:
        near = (float(s["latitude"]), float(s["longitude"]))
    except (KeyError, TypeError, ValueError):
        pin = src.opec_point(s)
        near = (pin["lat"], pin["lon"]) if pin else None
    if not near:
        return []
    phones = [p for p in (s.get("telephone"), s.get("mobile")) if p]
    sites = []
    for _, _, row in src.overture_matches(s.get("school_name_en") or "", s.get("school_name_th") or "", "",
                                          phones, s.get("facebook"), near, OVERTURE_RADIUS_M)[:6]:
        if row["confidence"] >= OVERTURE_MIN_CONFIDENCE:
            sites += [d for d in row["domains"] if d and not any(b in d for b in DISQUALIFIED_DOMAINS)]
    return list(dict.fromkeys(sites))


def generate_algorithmic_candidates(s):
    """Builds candidate domains from the school's own name."""
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


def _find_by_agreement(s, unreadable):
    """
    For a school with no usable link: Overture's listing and name-built domains each vote for a site.
    Takes a site two sources agree on when at least one of them opens (two stale copies of an old domain,
    like wells-school.com, open for neither), else Overture alone when its page passes _names_this_school.
    `unreadable` are the school's own reported links that exist but a script cannot read; they still vote.
    Returns (url, source, page) or None.
    """
    name_en, name_th = s.get("school_name_en") or "", s.get("school_name_th") or ""
    votes = {}   # site -> {source: (url, page)}

    def vote(source, url, page):
        if page["state"] in ALIVE:
            votes.setdefault(_site(page.get("final") or url), {}).setdefault(source, (url, page))

    for label, url, page in unreadable:
        vote(label, url, page)
    for dom in _overture_sites(s):
        vote("Overture", "https://" + dom, check_link(dom, name_en))
    for url in generate_algorithmic_candidates(s):
        if check_dns(urlsplit(url).netloc):
            vote("Domain Guess", url, check_link(url, name_en))

    for by in votes.values():
        readable = [(u, p) for u, p in by.values() if p["state"] == "ok"]
        if len(by) >= 2 and readable:
            url, page = readable[0]
            return url.rstrip('/'), " + ".join(sorted(by)), page
    for by in votes.values():
        url, page = by.get("Overture", ("", {"state": ""}))
        if page["state"] == "ok" and _names_this_school(page, name_en, name_th):
            return url, "Overture", page
    return None


def dynamic_search_official_website(s):
    """
    Decides one school's website in the order the module docstring gives. Returns (url, source, page):
    page is what check_link saw at url ({} when there is no url). An empty url means no answer and no
    link on record either.
    """
    code = str(s.get("school_code", "")).strip()
    name_en = s.get("school_name_en", "") or ""
    load_verified_registry()

    if code in admin_links:
        url = admin_links[code]
        return url, "Admin Verified", (check_link(url, name_en) if url else {})

    old = current_links.get(code) or str(s.get("website") or "").strip().rstrip('/')
    old_page = check_link(old, name_en) if old else {"state": ""}
    reported, unreadable = [], []
    for field, label in SELF_REPORTED:
        url = str(s.get(field) or "").strip().rstrip('/')
        if url and _well_formed(url):
            page = check_link(url, name_en)
            (reported if page["state"] == "ok" else unreadable).append((label, url, page))

    if old_page["state"] in ALIVE:
        old_site = _site(old_page.get("final") or old)
        for label, url, page in reported + unreadable:   # only labels a link already in use: unread but alive will do
            if page["state"] in ALIVE and _site(page.get("final") or url) == old_site:
                return old, label, old_page
        if old_site in _overture_sites(s):
            return old, "Overture", old_page
        return old, "Previous Link", old_page
    if reported:
        label, url, page = reported[0]
        return url, label, page
    found = _find_by_agreement(s, unreadable)
    if found:
        return found
    return (old, "Previous Link", old_page) if old else ("", "Not Found", {})


def _record(s, url, source, page):
    """Writes one decision onto the school's record. Never erases a link, except where an admin said none."""
    if source == "Admin Verified" and not url:
        s["website"], s["website_source"] = "", source
    elif url and (url != s.get("website") or source != s.get("website_source")):
        s["website"] = url
        s["website_source"] = source
        s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    s["website_check"] = page.get("state", "")
    s["website_http_status"] = page.get("code")
    s["website_checked_at"] = time.strftime("%Y-%m-%d %H:%M:%S")


def resolve_all_official_websites(update_progress, on_save_callback=None):
    """
    Decides every school's website through the order above, opening each link once on the way
    (that is the health check), logs one line per school in dataset order and saves to data/.
    """
    load_verified_registry(force=True)   # links an admin fixed since the last run
    src.load_overture_index()            # load once here, not from 30 threads at the first school
    schools = load_schools()
    if not schools:
        update_progress("ไม่พบข้อมูลโรงเรียน", 100, 100, "กรุณากดดึงข้อมูลจาก OPEC (ปุ่ม 1) ก่อน!")
        return []

    total = len(schools)
    update_progress("เริ่มต้นค้นหาและตรวจสอบ Official Website...", 0, total, f"มีโรงเรียนในระบบทั้งหมด {total} แห่ง")

    results_map = {}
    with ThreadPoolExecutor(max_workers=30) as executor:
        future_to_school = {executor.submit(dynamic_search_official_website, s): s for s in schools}
        for future in as_completed(future_to_school):
            s = future_to_school[future]
            try:
                results_map[s.get("school_code", "")] = future.result()
            except Exception as e:
                print(f"[Websites] {s.get('school_code')}: {e}")
                results_map[s.get("school_code", "")] = ("", "Not Found", {})

    by_source, by_state = {}, {}
    for idx, s in enumerate(schools, 1):
        code = s.get("school_code", "")
        th_name = s.get("school_name_th", "")
        en_name = s.get("school_name_en", "")
        display_name = f"{th_name} ({en_name})" if en_name else th_name

        url, source, page = results_map.get(code, ("", "Not Found", {}))
        _record(s, url, source, page)
        url = s.get("website") or ""
        state = s["website_check"] or "ไม่มีลิงก์"
        by_source[source] = by_source.get(source, 0) + 1
        by_state[state] = by_state.get(state, 0) + 1

        verdict = f"{url} (แหล่ง: {source}, เปิดตรวจ: {state})" if url else "ไม่พบเว็บไซต์ทางการ"
        update_progress(f"ตรวจสอบเว็บไซต์ ({idx}/{total})", idx, total,
                        f"[{idx}/{total}] [รหัส: {code}] {display_name} -> {verdict}")

        if idx % 25 == 0:
            save_schools(schools)
            if on_save_callback:
                on_save_callback(schools)

    # Final atomic save
    save_schools(schools)
    if on_save_callback:
        on_save_callback(schools)

    with_url = sum(1 for s in schools if s.get("website"))
    summary_log = (
        f"ตรวจสอบ Official Website ครบทั้ง {total} แห่งแล้ว มีเว็บ {with_url} แห่ง\n"
        "  - ที่มา: " + ", ".join(f"{k} {v}" for k, v in sorted(by_source.items(), key=lambda kv: -kv[1])) + "\n"
        "  - ผลเปิดตรวจ: " + ", ".join(f"{k} {v}" for k, v in sorted(by_state.items(), key=lambda kv: -kv[1])) + "\n"
        "  - บันทึกลง data/international_schools_thailand_opec.json และ .csv แล้ว"
    )
    update_progress("ค้นหา Official Website เสร็จแล้ว", total, total, summary_log)
    return schools


def resolve_single_school_by_code(school_code):
    """Decides one school's website by its OPEC code and saves to data/"""
    load_verified_registry(force=True)
    schools = load_schools()
    for s in schools:
        if s["school_code"] == school_code:
            _record(s, *dynamic_search_official_website(s))
            save_schools(schools)
            return s
    return None
