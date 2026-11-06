"""
Supabase Database Synchronization Engine for OPEC Schools Data.

Handles:
1. Connection testing and status reporting (DATABASE_URL comes from .env).
2. Automated Schema initialization (running db/schema.sql).
3. Upserting OPEC school records into Postgres (school_data.schools, school_data.school_versions)
   with live progress reporting.
4. Pushing what the pipeline steps changed (EN names, websites, GPS) to existing rows.
"""

from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import uuid
from collections import Counter
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Any, Optional

from grade_years import year_rows

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"
SCHEMA_FILE = BASE_DIR / "db" / "schema.sql"
DATA_FILE = BASE_DIR / "data" / "international_schools_thailand_opec.json"

# Comprehensive Normalized Curriculum Categories (Eliminates "OTHER" fallback)
CURRICULUM_PATTERNS: list[tuple[str, str]] = [
    # not "ภาษาอังกฤษ" (English as a subject) nor "British Columbia" (a Canadian province)
    ("BRITISH", r"สหราชอาณาจักร|ประเทศอังกฤษ|(?<!ภาษา)อังกฤษ|เวลส์|England|Wales|\bUK\b|British(?!\s*Columbia)"
                                r"|IGCSE|GCSE|AS\s*(&|and)?\s*A\s*Level|A[\s-]?Level|Cambridge|เคมบริดจ์|แคมบริ"
                                r"|Oxford|Early\s*Years?\s*Foundation|EYFS|Edexcel|BTEC|Pearson|Key\s*Stage"
                                r"|English\s*National\s*Curric|\bENC\b|Wellington|เวลลิงตัน|AICE|St\s*Andrews"
                                r"|ASDAN"),  # UK qualifications for ages 11-19, not early childhood
    ("AMERICAN", r"สหรัฐอเมริกา|สหรัฐอเมริก|อเมริกัน|อเมริกา|แคลิฟอร์เนีย|แมสซาชูเซตส์|มิสซิสซิปปี"
                                r"|เวอร์จีเนีย|เพนซิลเวเนีย|Pennsylvania|นิวเจอร์ซีย์|New\s*Jersey|อะลาบามา"
                                # not "High School Diploma": British and Singapore schools register it too
                                r"|American|California|\bCDE\b|Massachusetts|\bAERO\b"
                                r"|Common\s*Core|\bCCSS\b|Advanced\s*Placement|\bAP\b|\bU\.?S\.?\b"
                                r"|District\s*of\s*Columbia|Chicago|Accelerated\s*Christian|School\s*of\s*Tomorrow"
                                r"|\bWASC\b|BASIS|North\s*American\s*Division|\bNAD\b|Carson|Calvert|High\s*Reach"
                                r"|ริเวอร์ไซด์|แอ๊ดเวนตีส|เอกมัย|ประชาคมนานาชาติ"),
    ("IB", r"International\s*Baccalaureate|\bIB\b|\bIBDP\b|\bPYP\b|\bMYP\b"
                                                 r"|\bIB-CP\b|Diploma\s*Programme|\bIBO\b|Reignwood|เคไอเอส|KIS"),
    ("SINGAPOREAN", r"สิงคโปร์|สิงค์โปร์|Singapore|Nurturing\s*Early\s*Learners|SISB|แองโกล"
                             r"|Pre-School\s*Education\s*Unit|Primary\s*School\s*Curriculum"
                             r"|National\s*Curriculum\s*for\s*Primary\s*School"),
    ("AUSTRALIAN", r"ออสเตรเลีย|Australia|\bACARA\b|Western\s*Australian"),
    ("CANADIAN", r"แคนาดา|แคนนาดา|Canad|บริติชโคลัมเบีย|British\s*Columbia|Ontario|Quebec"),
    ("FRENCH", r"ฝรั่งเศส|French|France|Lyc[eé]e"),
    ("GERMAN", r"เยอรมัน|German|ทูริงเง่น|Thuringia"),
    ("JAPANESE", r"ญี่ปุ่น|Japan|Culture,\s*Sports,\s*Science\s*and\s*Technology"),
    ("CHINESE", r"จีน|Chinese|Mandarin|แมนดาริน"),
    ("KOREAN", r"เกาหลี|Korea"),
    ("INDIAN", r"อินเดีย|India|\bCBSE\b|ซิลเวอร์ไลน์|Central\s*Board\s*of\s*Secondary"),
    ("MONTESSORI", r"Montessori|มอนเตสซอรี|มอนเทสซอรี่|Hershey"),
    ("FINNISH", r"Finish|Finnish|FGES"),
    ("EARLY_CHILDHOOD", r"International\s*Preschool|International\s*Primary|\bIPC\b|\bIMYC\b"
                                           r"|HighScope|Creative\s*Curriculum|Child-Centered|Early\s*child"
                                           r"|Early\s*Years\s*Development|ปฐมวัย|A\s*Child\'s\s*World"
                                           r"|Kindergarten\s*Curriculum"),
    # Only the Thai national core curriculum; Thai language/culture subjects alone are MANDATORY_THAI_SUBJECTS
    ("THAI_MOE", r"แกนกลางการศึกษาขั้นพื้นฐาน"),
    ("SCHOOL_SPECIFIC", r"หลักสูตรของทางโรงเรียน|หลักสูตรนานาชาติ|หลักสูตรอินเตอร์"
                                  r"|International\s*Curriculum|ประกาศนียบัตรนานาชาติ|ซีสเต็มส์"
                                  r"|ดาเนียล|อริสตา|มัธยมศึกษาตอนปลาย"),
]
COMPILED_PATTERNS = [(code, re.compile(pattern, re.IGNORECASE)) for code, pattern in CURRICULUM_PATTERNS]

# Grade level mapping kept in standard Thai names for 1:1 frontend matching
GRADE_LEVEL_MAP: dict[str, str] = {
    "ก่อนอนุบาล": "PRE_K",
    "เตรียมอนุบาล": "PRE_K",
    "อนุบาล": "KINDERGARTEN",
    "ประถมศึกษา": "PRIMARY",
    "มัธยมศึกษาตอนต้น": "LOWER_SEC",
    "มัธยมศึกษาตอนปลาย": "UPPER_SEC",
}


def load_env_vars() -> dict[str, str]:
    """Reads .env file without external dependencies."""
    env_vars = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key_clean = key.strip()
            val_clean = val.strip().strip('"').strip("'")
            env_vars[key_clean] = val_clean
            os.environ[key_clean] = val_clean
    return env_vars


def get_current_dsn() -> str | None:
    """Returns DATABASE_URL from environment or .env."""
    env_vars = load_env_vars()
    return env_vars.get("DATABASE_URL") or os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DATABASE_URL")


def db_connect(target_dsn: str | None = None, **kwargs):
    """
    Creates a psycopg connection configured for Supabase Transaction Pooler (PgBouncer/Supavisor).
    Disables client-side prepared statements (prepare_threshold=None) to prevent:
    'prepared statement "_pg3_0" already exists' errors.
    """
    dsn = target_dsn or get_current_dsn()
    if not dsn:
        raise ValueError("DATABASE_URL is not set")
    # In transaction pool mode (port 6543 / pooler), prepared statements must be disabled
    if "prepare_threshold" not in kwargs:
        kwargs["prepare_threshold"] = None
    return psycopg.connect(dsn, **kwargs)


# ─── versions of the link, pin and curriculums (UC-11) ───────────────────────
# The trigger version_school_change (db/schema.sql) makes a published version whenever one of these
# changes in schools, whoever writes it. tag_versions() says who did, and admin_edit() wraps an admin's edit.

def tag_versions(cur, source: str, action: str, **note: Any) -> None:
    """Tells the trigger who makes the versions in this transaction (source_type) and why (diff_summary)."""
    cur.execute("SELECT set_config('skoolly.version_source', %s, true), set_config('skoolly.version_note', %s, true)",
                (source, json.dumps({"action": action, **note}, ensure_ascii=False)))


class VersionConflict(Exception):
    """The page edited a school while showing another published version than the one live now (HTTP 409)."""


STALE_PAGE = "มีคนแก้ข้อมูลโรงเรียนนี้ไปก่อนแล้ว กดรีเฟรชเพื่อดูค่าล่าสุดแล้วแก้อีกครั้ง"


@contextmanager
def admin_edit(school_code: str, action: str, expected_version_id: str | None = None, dsn: str | None = None, **note: Any):
    """One admin edit of a school as one transaction, yielding (cursor, school row).

    Locks the school's row (SELECT ... FOR UPDATE), so a second admin saving the same school waits here,
    then checks again under the lock that the published version is still the one the page showed
    (expected_version_id) and raises VersionConflict when it is not. Commits when the block ends."""
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT school_id, current_published_version_id::text AS version_id, name_th, name_en
                FROM school_data.schools WHERE opec_school_code = %s FOR UPDATE
            """, (school_code,))
            school = cur.fetchone()
            if not school:
                raise ValueError(f"ไม่พบโรงเรียนรหัส {school_code}")
            if expected_version_id and school["version_id"] != expected_version_id:
                raise VersionConflict(STALE_PAGE)
            tag_versions(cur, "admin", action, **note)
            yield cur, school
        conn.commit()



def social_links_json(facebook: Any = None, line_id: Any = None,
                      instagram: Any = None, youtube: Any = None) -> str:
    """รวมลิงก์โซเชียลเป็น JSON ก้อนเดียวสำหรับคอลัมน์ schools.social_links (jsonb).

    เก็บเฉพาะคีย์ที่มีค่าจริง เพื่อไม่ให้ jsonb เต็มไปด้วย null —
    fill rate ของข้อมูลชุดนี้ต่ำมาก และไม่เคยถูกใช้กรอง/เรียง จึงไม่ต้องแยกเป็นคอลัมน์
    """
    pairs = {"facebook": facebook, "line_id": line_id,
             "instagram": instagram, "youtube": youtube}
    return json.dumps({k: v for k, v in pairs.items() if v}, ensure_ascii=False)


def expand_social_links(item: dict) -> None:
    """แตก social_links กลับเป็นคีย์แบน ๆ ที่หน้าเว็บใช้อยู่เดิม (แก้ item ในที่)"""
    links = item.get("social_links") or {}
    if isinstance(links, str):
        try:
            links = json.loads(links)
        except (ValueError, TypeError):
            links = {}
    item["facebook"] = links.get("facebook") or item.get("facebook") or item.get("facebook_url") or ""
    item["line_id"] = links.get("line_id") or item.get("line_id") or ""
    item["instagram"] = links.get("instagram") or item.get("instagram") or item.get("instagram_url") or ""
    item["youtube"] = links.get("youtube") or item.get("youtube") or item.get("youtube_url") or ""



# label ที่ใช้แสดงผล — ตรงกับ name_th ในตาราง school_data.curriculums / grade_levels
CURRICULUM_LABELS: dict[str, str] = {
    "BRITISH": "สหราชอาณาจักร (British)",
    "AMERICAN": "สหรัฐอเมริกา (American)",
    "IB": "นานาชาติ IB (International Baccalaureate)",
    "SINGAPOREAN": "สิงคโปร์ (Singapore)",
    "AUSTRALIAN": "ออสเตรเลีย (Australian)",
    "CANADIAN": "แคนาดา (Canadian)",
    "FRENCH": "ฝรั่งเศส (French)",
    "GERMAN": "เยอรมัน (German)",
    "JAPANESE": "ญี่ปุ่น (Japanese)",
    "CHINESE": "จีน (Chinese)",
    "KOREAN": "เกาหลี (Korean)",
    "INDIAN": "อินเดีย (Indian)",
    "MONTESSORI": "มอนเตสซอรี (Montessori)",
    "FINNISH": "ฟินแลนด์ (Finnish)",
    "EARLY_CHILDHOOD": "ปฐมวัยสากล (Early Childhood / IPC)",
    "THAI_MOE": "ไทย (กระทรวงศึกษาธิการ)",
    "SCHOOL_SPECIFIC": "หลักสูตรเฉพาะของโรงเรียน",
}
GRADE_LEVEL_LABELS: dict[str, str] = {
    "PRE_K": "ก่อนอนุบาล",
    "KINDERGARTEN": "อนุบาล",
    "PRIMARY": "ประถมศึกษา",
    "LOWER_SEC": "มัธยมศึกษาตอนต้น",
    "UPPER_SEC": "มัธยมศึกษาตอนปลาย",
}


def expand_vocab(item: dict) -> None:
    """แปลง code ที่เก็บใน DB กลับเป็นข้อความไทยที่หน้าเว็บแสดงอยู่เดิม (แก้ item ในที่)

    DB เก็บ code เพื่อให้ join กับตาราง lookup และกรองได้แน่นอน
    ส่วน payload ที่ส่งออกยังเป็นข้อความไทยเหมือนเดิม หน้าเว็บจึงไม่ต้องแก้
    เก็บ code ดิบไว้ในคีย์ *_codes เผื่อฝั่ง client อยากใช้ตรง ๆ
    """
    codes = item.get("curriculums") or []
    levels = item.get("levels_offered") or []
    item["curriculum_codes"] = list(codes)
    item["level_codes"] = list(levels)
    item["curriculums"] = [CURRICULUM_LABELS.get(c, c) for c in codes]
    item["levels_offered"] = [GRADE_LEVEL_LABELS.get(c, c) for c in levels]


def mask_dsn(dsn: str) -> str:
    """Masks password in connection string for safe UI presentation."""
    if not dsn:
        return ""
    # Matches postgresql://user:password@host:port/dbname
    pattern = r"://([^:]+):([^@]+)@"
    return re.sub(pattern, r"://\1:••••••••@", dsn)


def test_database_connection(dsn: str | None = None) -> dict[str, Any]:
    """Tests connection to PostgreSQL/Supabase and checks schema presence."""
    if not psycopg:
        return {
            "configured": False,
            "connected": False,
            "error": "psycopg is not installed. Run: pip install 'psycopg[binary]'",
        }

    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        return {
            "configured": False,
            "connected": False,
            "error": "ยังไม่ได้กำหนด DATABASE_URL",
        }

    start_t = time.time()
    try:
        with db_connect(target_dsn, connect_timeout=5, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 as ping")
                cur.fetchone()

                # Check if school_data schema exists
                cur.execute(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'school_data') as has_schema"
                )
                has_schema = cur.fetchone()["has_schema"]

                # Check if school_data.schools table exists
                has_schools_table = False
                school_count = 0
                if has_schema:
                    cur.execute(
                        """
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.tables 
                            WHERE table_schema = 'school_data' AND table_name = 'schools'
                        ) as exists
                        """
                    )
                    has_schools_table = cur.fetchone()["exists"]
                    if has_schools_table:
                        cur.execute("SELECT count(*) as cnt FROM school_data.schools")
                        school_count = cur.fetchone()["cnt"]

        latency_ms = round((time.time() - start_t) * 1000)
        return {
            "configured": True,
            "connected": True,
            "masked_url": mask_dsn(target_dsn),
            "latency_ms": latency_ms,
            "has_schema": has_schema and has_schools_table,
            "school_count": school_count,
            "error": None,
        }
    except Exception as e:
        return {
            "configured": True,
            "connected": False,
            "masked_url": mask_dsn(target_dsn),
            "latency_ms": None,
            "has_schema": False,
            "school_count": 0,
            "error": str(e),
        }


def initialize_schema_on_supabase(dsn: str | None = None) -> dict[str, Any]:
    """Executes db/schema.sql on Supabase to initialize all schemas and tables."""
    if not psycopg:
        raise RuntimeError("psycopg is not installed")

    if not SCHEMA_FILE.exists():
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_FILE}")

    sql_content = SCHEMA_FILE.read_text(encoding="utf-8")

    with db_connect(dsn, connect_timeout=15) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql_content)

    return {"status": "success", "message": "Database schema created and initialized successfully"}


def match_curriculums(raw: str) -> set[str]:
    """Every canonical code whose keywords appear in this free-text value."""
    return {code for code, pattern in COMPILED_PATTERNS if pattern.search(raw)}


# Every international school must teach Thai language, culture and history, so an OPEC value
# naming only these subjects says nothing about which curriculum the school follows
MANDATORY_THAI_SUBJECTS = re.compile(r"ภาษาไทย|วัฒนธรรมไทย|ประวัติศาสตร์ไทย")
CURRICULUM_CODES = {code for code, _ in CURRICULUM_PATTERNS}


def opec_curriculum_codes(raw_values: Any, unmapped: Counter | None = None,
                          auto_mapped: dict | None = None) -> list[str]:
    """Codes for OPEC's free-text curriculum values; ['SCHOOL_SPECIFIC'] when OPEC names no curriculum."""
    codes: set[str] = set()
    for raw in raw_values or []:
        raw = clean(raw)
        if not raw:
            continue
        derived = match_curriculums(raw)
        if derived:
            codes |= derived
            if auto_mapped is not None:
                auto_mapped[raw] = sorted(derived)
        elif not MANDATORY_THAI_SUBJECTS.search(raw):
            if unmapped is not None:
                unmapped[raw] += 1
            codes.add("SCHOOL_SPECIFIC")
    return sorted(codes or {"SCHOOL_SPECIFIC"})


def website_curriculum_codes(snapshot: dict) -> list[str] | None:
    """Codes for the curriculum a scraped version read off the school's website; None if it found none."""
    raw = snapshot.get("curriculums") or snapshot.get("curriculum")
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, str) else []
    codes: set[str] = set()
    for item in items:
        text = str(item).strip()
        matched = match_curriculums(text)
        if matched:
            codes |= matched
        elif text.upper() in CURRICULUM_CODES:
            codes.add(text.upper())
    return sorted(codes) or None


# A named IB programme. The IBO authorises each one, so either source naming it is enough; OPEC's bare
# "IB" in "สหราชอาณาจักร หลักสูตร IB" is a form template that preschools fill in too.
IB_PROGRAMME = re.compile(r"International\s*Baccalaureate|IB\s*-?\s*(DP|CP|PYP|MYP|Diploma|Continuum|Career)|\bIBDP\b|\bIBCP\b"
                          r"|\bPYP\b|\bMYP\b|Diploma\s*Programme", re.IGNORECASE)


def choose_curriculums(opec_raw_values: Any, website_snapshot: dict | None,
                       unmapped: Counter | None = None, auto_mapped: dict | None = None) -> list[str]:
    """The rule for a school no admin has decided. Both sources go wrong in their own way: OPEC's
    registration can be years old, and the scraper reads language or maths programmes as curricula
    ("French Programme", "Singapore Mathematics"). So when both name a curriculum, show the ones they
    agree on, plus IB when either names an IB programme. When they share none (curriculums_conflict),
    OPEC's registration stands until an admin decides. One source naming nothing: the other one's."""
    opec = set(opec_curriculum_codes(opec_raw_values, unmapped, auto_mapped)) - {"SCHOOL_SPECIFIC"}
    web = set(website_curriculum_codes(website_snapshot or {}) or []) - {"SCHOOL_SPECIFIC"}
    both = opec & web
    if both:
        snap = website_snapshot or {}
        web_raw = snap.get("curriculums") or snap.get("curriculum") or []
        texts = [*(opec_raw_values or []), *(web_raw if isinstance(web_raw, list) else [web_raw])]
        if any(IB_PROGRAMME.search(str(t)) for t in texts):
            both.add("IB")
        return sorted(both)
    return sorted(opec or web or {"SCHOOL_SPECIFIC"})


def curriculums_conflict(opec_codes: list[str] | None, website_codes: list[str] | None) -> bool:
    """OPEC and the website both name a curriculum but not one in common, e.g. American vs British.
    Partial overlaps (British + IB vs IB) are not conflicts: choose_curriculums keeps what they share."""
    opec = set(opec_codes or []) - {"SCHOOL_SPECIFIC"}
    web = set(website_codes or []) - {"SCHOOL_SPECIFIC"}
    return bool(opec and web and not opec & web)


# A version v holding data read off the school's website: a scraper's own, or carried forward by a version
# the trigger or a rollback made (web_origin names the scraper version it came from)
HAS_WEB_DATA = "(v.source_type = 'scraper' OR v.data_snapshot ? 'web_origin')"

_REVIEW_QUERY = f"""
    SELECT s.opec_school_code, s.name_th, s.name_en, s.province, s.district, s.curriculums, s.official_website_url,
           s.curriculums_confirmed_at, s.curriculums_confirmed_by, s.current_published_version_id::text AS version_id,
           v.scraped_page_url, v.data_snapshot->'curriculums' AS web_list,
           v.data_snapshot->>'curriculum' AS web_text
    FROM school_data.schools s
    LEFT JOIN school_data.school_versions v
      ON v.version_id = s.current_published_version_id AND {HAS_WEB_DATA}
"""


def fetch_curriculum_review(opec_records: list[dict], dsn: str | None = None) -> dict[str, Any]:
    """Schools whose OPEC registration and approved website version disagree, for an admin to
    decide, and the schools an admin has already decided. `opec_records` is the local OPEC dataset."""
    opec_raw = {str(r.get("school_code") or "").strip(): r.get("curriculums") or [] for r in opec_records}

    with db_connect(dsn, row_factory=dict_row) as conn:
        rows = conn.execute(_REVIEW_QUERY + " WHERE s.status <> 'archived' ORDER BY s.name_en NULLS LAST, s.name_th").fetchall()

    conflicts, confirmed = [], []
    for r in rows:
        raw = opec_raw.get(r["opec_school_code"], [])
        opec = opec_curriculum_codes(raw)
        web = website_curriculum_codes({"curriculums": r["web_list"], "curriculum": r["web_text"]})
        item = {
            "school_code": r["opec_school_code"],
            "name_th": r["name_th"],
            "name_en": r["name_en"],
            "province": r["province"],
            "district": r["district"],
            "opec_codes": opec,
            "opec_text": [str(x) for x in raw if x],
            "website_codes": web or [],
            "website_text": r["web_text"] or ", ".join(str(x) for x in r["web_list"] or []),
            # The homepage, not scraped_page_url: that is the fee page, and the curriculum came from
            # whichever of the scraped pages mentioned it
            "website_url": r["official_website_url"] or r["scraped_page_url"] or "",
            "current_codes": list(r["curriculums"] or []),
            "confirmed_at": r["curriculums_confirmed_at"].isoformat() if r["curriculums_confirmed_at"] else None,
            "confirmed_by": r["curriculums_confirmed_by"],
            "version_id": r["version_id"],   # the published version the page shows; sent back on save
        }
        if item["confirmed_at"]:
            confirmed.append(item)
        elif curriculums_conflict(opec, web):
            conflicts.append(item)
    return {"conflicts": conflicts, "confirmed": confirmed, "labels": CURRICULUM_LABELS}


def confirm_school_curriculums(school_code: str, codes: list[str], confirmed_by: str | None = None,
                               expected_version_id: str | None = None, dsn: str | None = None) -> dict[str, Any]:
    """An admin's decision: these curriculums, kept by every later OPEC import until cleared. Makes a version."""
    chosen = sorted({str(c).strip().upper() for c in codes or [] if str(c).strip()})
    unknown = [c for c in chosen if c not in CURRICULUM_CODES]
    if not chosen or unknown:
        raise ValueError(f"เลือกหลักสูตรอย่างน้อยหนึ่งรายการจากรายการที่มี (ไม่รู้จัก: {', '.join(unknown)})"
                         if unknown else "เลือกหลักสูตรอย่างน้อยหนึ่งรายการ")

    with admin_edit(school_code, "confirm_curriculums", expected_version_id, dsn) as (cur, school):
        row = cur.execute("""
            UPDATE school_data.schools
            SET curriculums = %s, curriculums_confirmed_at = NOW(), curriculums_confirmed_by = %s
            WHERE school_id = %s
            RETURNING curriculums, current_published_version_id::text AS version_id
        """, (chosen, clean(confirmed_by), school["school_id"])).fetchone()
    return {"status": "confirmed", "school_code": school_code, "curriculums": row["curriculums"],
            "version_id": row["version_id"]}


def clear_curriculums_confirmation(school_code: str, opec_raw_values: Any, expected_version_id: str | None = None,
                                   dsn: str | None = None) -> dict[str, Any]:
    """Undoes an admin's decision: the school goes back to the rule in choose_curriculums(). Makes a version."""
    with admin_edit(school_code, "clear_curriculums", expected_version_id, dsn) as (cur, school):
        r = cur.execute(_REVIEW_QUERY + " WHERE s.school_id = %s", (school["school_id"],)).fetchone()
        codes = choose_curriculums(opec_raw_values, {"curriculums": r["web_list"], "curriculum": r["web_text"]})
        row = cur.execute("""
            UPDATE school_data.schools
            SET curriculums = %s, curriculums_confirmed_at = NULL, curriculums_confirmed_by = NULL
            WHERE school_id = %s
            RETURNING current_published_version_id::text AS version_id
        """, (codes, school["school_id"])).fetchone()
    return {"status": "cleared", "school_code": school_code, "curriculums": codes, "version_id": row["version_id"]}


def slugify(name_en: str | None, opec_code: str) -> str:
    """ASCII slug from the English name or fallback to OPEC code."""
    source = (name_en or "").strip()
    ascii_form = unicodedata.normalize("NFKD", source).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_form).strip("-").lower()
    return slug or f"school-{opec_code}"


def free_slug(base: str, opec_code: str, taken: set[str]) -> str:
    """`base`, or base plus the code's last digits when another school holds it (slug is UNIQUE)."""
    if base not in taken:
        return base
    slug, n = f"{base}-{opec_code[-4:]}", 2
    while slug in taken:
        slug, n = f"{base}-{opec_code[-4:]}-{n}", n + 1
    return slug


def to_int(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "", []) else None
    except (TypeError, ValueError):
        return None


def to_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "", []) else None
    except (TypeError, ValueError):
        return None


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def execute_opec_import(
    dsn: str | None = None,
    records: list[dict[str, Any]] | None = None,
    publish_initial: bool = True,
    progress_callback: Callable[[str, int, int, str], None] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Imports OPEC records into Supabase Postgres database.

    Args:
        dsn: Connection string (falls back to DATABASE_URL in .env)
        records: List of school dictionaries (falls back to data/international_schools_thailand_opec.json)
        publish_initial: Create initial published version 1
        progress_callback: Callback for live progress (task, current, total, log)
        dry_run: Roll back at the end instead of committing (db/import_opec.py --dry-run)
    """
    if not psycopg:
        raise RuntimeError("psycopg is not installed")

    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set. Please configure Supabase connection first.")

    def log(task: str, cur_step: int, tot_step: int, message: str):
        if progress_callback:
            progress_callback(task, cur_step, tot_step, message)

    log("กำลังตรวจสอบการเชื่อมต่อกับ Supabase...", 1, 100, "กำลังเชื่อมต่อ Supabase Database...")

    # Load records if not passed
    if records is None:
        if not DATA_FILE.exists():
            raise FileNotFoundError(f"Dataset not found: {DATA_FILE}")
        records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    # A hand-placed pin wins over whatever coordinate the records carry.
    from data_manager import apply_manual_pins
    apply_manual_pins(records)

    total_records = len(records)
    log("เชื่อมต่อสำเร็จ", 5, 100, f"เตรียมนำเข้าข้อมูลโรงเรียน {total_records} แห่ง...")

    # Check and initialize schema if needed
    status_check = test_database_connection(target_dsn)
    if not status_check.get("has_schema"):
        if dry_run:
            raise RuntimeError("ยังไม่มี schema school_data: dry run ไม่สร้างตารางให้ รัน db/schema.sql ก่อน")
        log("กำลังสร้างโครงสร้างตาราง...", 10, 100, "ไม่พบ schema school_data — กำลังรัน db/schema.sql...")
        initialize_schema_on_supabase(target_dsn)
        log("สร้างตารางสำเร็จ", 15, 100, "โครงสร้างตารางและ Lookup Seeds สร้างเสร็จสิ้น")

    inserted = 0
    updated = 0
    unmapped_curriculums: Counter[str] = Counter()
    unmapped_levels: Counter[str] = Counter()
    auto_mapped: dict[str, list[str]] = {}
    used_slugs: set[str] = set()

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # a school whose pin or curriculums this import changes gets a published 'opec_import' version
            tag_versions(cur, "opec_import", "opec_import")
            cur.execute("SELECT slug FROM school_data.schools")
            used_slugs = {r["slug"] for r in cur.fetchall()}

            # Curriculum each school's approved website version names; choose_curriculums weighs it against OPEC's
            cur.execute(f"""
                SELECT s.opec_school_code, v.data_snapshot->'curriculums' AS curriculums,
                       v.data_snapshot->>'curriculum' AS curriculum
                FROM school_data.schools s
                JOIN school_data.school_versions v ON v.version_id = s.current_published_version_id
                WHERE {HAS_WEB_DATA}
            """)
            website_snapshots = {r["opec_school_code"]: r for r in cur.fetchall()}

            for idx, record in enumerate(records, 1):
                opec_code = clean(record.get("school_code"))
                name_th = clean(record.get("school_name_th"))
                if not opec_code or not name_th:
                    continue

                name_en = clean(record.get("school_name_en"))
                # Only used when the row is new: ON CONFLICT leaves an existing slug alone
                slug = free_slug(slugify(name_en, opec_code), opec_code, used_slugs)
                used_slugs.add(slug)

                lat = to_float(record.get("latitude"))
                lng = to_float(record.get("longitude"))

                # 1. Curriculums: OPEC's registration, or the approved website version when OPEC names
                #    none. A school an admin has decided keeps its curriculums (ON CONFLICT below)
                curriculums_list = choose_curriculums(record.get("curriculums"), website_snapshots.get(opec_code),
                                                      unmapped_curriculums, auto_mapped)

                # 2. Derive grade levels (standard Thai names matching modal badges)
                level_codes = set()
                for raw in record.get("levels_offered") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    code = GRADE_LEVEL_MAP.get(raw)
                    if not code:
                        unmapped_levels[raw] += 1
                        continue
                    level_codes.add(code)

                levels_offered_list = sorted(list(level_codes))

                # 3. Upsert school record (with curriculums, levels_offered, admins, and support info)
                cur.execute(
                    """
                    INSERT INTO school_data.schools (
                        opec_school_code, slug, name_th, name_en,
                        official_website_url, website_source, opec_profile_url,
                        official_phone, official_mobile,
                        social_links,
                        province, district, subdistrict, address,
                        geom, gps_precision, gps_source,
                        logo_url, level_range, levels_offered, curriculums,
                        student_count, teacher_count,
                        licensee_name, director_name, manager_name
                    ) VALUES (
                        %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                        %(website)s, %(website_source)s, %(profile_url)s,
                        %(phone)s, %(mobile)s,
                        %(social_links)s::jsonb,
                        %(province)s, %(district)s, %(subdistrict)s, %(address)s,
                        CASE WHEN %(lng)s::double precision IS NULL OR %(lat)s::double precision IS NULL THEN NULL
                             ELSE st_setsrid(st_makepoint(%(lng)s::double precision, %(lat)s::double precision), 4326)::geography END,
                        %(gps_precision)s, %(gps_source)s,
                        %(logo)s, %(level_range)s, %(levels_offered)s, %(curriculums)s,
                        %(students)s, %(teachers)s,
                        %(licensee_name)s, %(director_name)s, %(manager_name)s
                    )
                    ON CONFLICT (opec_school_code) DO UPDATE SET
                        name_th = EXCLUDED.name_th,
                        name_en = EXCLUDED.name_en,
                        official_website_url = COALESCE(school_data.schools.official_website_url, EXCLUDED.official_website_url),
                        website_source = COALESCE(school_data.schools.website_source, EXCLUDED.website_source),
                        opec_profile_url = EXCLUDED.opec_profile_url,
                        official_phone = EXCLUDED.official_phone,
                        official_mobile = EXCLUDED.official_mobile,
                        social_links = EXCLUDED.social_links,
                        province = EXCLUDED.province,
                        district = EXCLUDED.district,
                        subdistrict = EXCLUDED.subdistrict,
                        address = EXCLUDED.address,
                        geom = EXCLUDED.geom,
                        gps_precision = EXCLUDED.gps_precision,
                        gps_source = EXCLUDED.gps_source,
                        logo_url = EXCLUDED.logo_url,
                        level_range = EXCLUDED.level_range,
                        levels_offered = EXCLUDED.levels_offered,
                        curriculums = CASE WHEN school_data.schools.curriculums_confirmed_at IS NOT NULL
                                           THEN school_data.schools.curriculums ELSE EXCLUDED.curriculums END,
                        student_count = EXCLUDED.student_count,
                        teacher_count = EXCLUDED.teacher_count,
                        licensee_name = EXCLUDED.licensee_name,
                        director_name = EXCLUDED.director_name,
                        manager_name = EXCLUDED.manager_name,
                        updated_at = NOW()
                    RETURNING school_id, (xmax = 0) AS is_insert
                    """,
                    {
                        "opec_code": opec_code,
                        "slug": slug,
                        "name_th": name_th,
                        "name_en": name_en,
                        "website": clean(record.get("website")),
                        "website_source": clean(record.get("website_source")),
                        "profile_url": clean(record.get("opec_profile_url")),
                        "phone": clean(record.get("telephone")),
                        "mobile": clean(record.get("mobile")),
                        "social_links": social_links_json(
                            clean(record.get("facebook")),
                            clean(record.get("line_id")),
                            clean(record.get("instagram")),
                            clean(record.get("youtube")),
                        ),
                        "province": clean(record.get("province")) or "ไม่ระบุ",
                        "district": clean(record.get("district")),
                        "subdistrict": clean(record.get("subdistrict")),
                        "address": clean(record.get("address")),
                        "lat": lat,
                        "lng": lng,
                        "gps_precision": clean(record.get("gps_precision")),
                        "gps_source": clean(record.get("gps_source")),
                        "logo": clean(record.get("school_logo_url")),
                        "level_range": clean(record.get("level_range")),
                        "levels_offered": levels_offered_list,
                        "curriculums": curriculums_list,
                        "students": to_int(record.get("student_count")),
                        "teachers": to_int(record.get("teacher_count")),
                        "licensee_name": clean(record.get("licensee_name")),
                        "director_name": clean(record.get("director_name")),
                        "manager_name": clean(record.get("manager_name")),
                    },
                )
                row = cur.fetchone()
                school_id = row["school_id"]
                if row["is_insert"]:
                    inserted += 1
                else:
                    updated += 1

                # 4. Initial published version (UC-12 step 5)
                if publish_initial:
                    snapshot = {
                        "source": "opec_import",
                        "name_th": name_th,
                        "name_en": name_en,
                        "address": clean(record.get("address")),
                        "province": clean(record.get("province")),
                        "levels_offered": record.get("levels_offered") or [],
                        "curriculums": record.get("curriculums") or [],
                        "student_count": to_int(record.get("student_count")),
                        "teacher_count": to_int(record.get("teacher_count")),
                        "fetched_at": clean(record.get("fetched_at")),
                    }
                    cur.execute(
                        """
                        INSERT INTO school_data.school_versions
                            (school_id, version_number, status, source_type, data_snapshot)
                        SELECT %s, 1, 'published', 'opec_import', %s::jsonb
                        WHERE NOT EXISTS (
                            SELECT 1 FROM school_data.school_versions WHERE school_id = %s
                        )
                        RETURNING version_id
                        """,
                        (school_id, json.dumps(snapshot, ensure_ascii=False), school_id),
                    )
                    created = cur.fetchone()
                    if created:
                        cur.execute(
                            "UPDATE school_data.schools SET current_published_version_id = %s, pub_data_updated_at = NOW() WHERE school_id = %s",
                            (created["version_id"], school_id),
                        )

                # Step progress every 20 records or on completion
                if idx % 20 == 0 or idx == total_records:
                    pct = 15 + int((idx / total_records) * 80)
                    log(
                        f"กำลังนำเข้าข้อมูลสู่ Supabase ({idx}/{total_records})...",
                        pct,
                        100,
                        f"นำเข้าแล้ว: {idx}/{total_records} โรงเรียน (เพิ่มใหม่: {inserted}, อัปเดต: {updated})",
                    )

            if dry_run:
                conn.rollback()
            else:
                conn.commit()

    log(
        "นำเข้าข้อมูลสู่ Supabase เสร็จแล้ว" if not dry_run else "ทดลองนำเข้าเสร็จแล้ว (ยกเลิก ไม่ได้บันทึก)",
        100,
        100,
        f"เพิ่มโรงเรียนใหม่ {inserted} แห่ง, อัปเดต {updated} แห่ง, รวม {total_records} แห่ง"
        + (" (dry run: rollback แล้ว)" if dry_run else ""),
    )

    return {
        "status": "success",
        "total": total_records,
        "inserted": inserted,
        "updated": updated,
        "auto_mapped_curriculums": len(auto_mapped),
        "unmapped_curriculums": len(unmapped_curriculums),
        # ระดับชั้นที่ map ไม่ลงถูก "ข้าม" ไปเลย ไม่เหมือนหลักสูตรที่ยังตกไปที่ SCHOOL_SPECIFIC
        # จึงต้องรายงานออกมาด้วย มิฉะนั้นโรงเรียนจะหายจากตัวกรองระดับชั้นโดยไม่มีใครรู้
        "unmapped_levels": len(unmapped_levels),
        "unmapped_level_values": sorted(unmapped_levels),
    }


def fetch_supabase_schools(
    search: str | None = None,
    province: str | None = None,
    curriculum: str | None = None,
    level: str | None = None,
    limit: int = 1000,
    offset: int = 0,
    include_closed: bool = False,
    dsn: str | None = None,
) -> dict[str, Any]:
    """Queries school records directly from Supabase database with filters and KPIs."""
    # โรงเรียนที่ปิดแล้ว (archived) ไม่แสดงในรายการ ข้อมูลยังอยู่ในฐาน ยกเว้นหน้าแอดมินขอ include_closed
    where_clauses = [] if include_closed else ["status <> 'archived'"]
    params: list[Any] = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        where_clauses.append("(name_th ILIKE %s OR name_en ILIKE %s OR opec_school_code ILIKE %s)")
        params.extend([term, term, term])

    if province and province.strip() and province != "all":
        where_clauses.append("province = %s")
        params.append(province.strip())

    if curriculum and curriculum.strip() and curriculum != "all":
        where_clauses.append("%s = ANY(curriculums)")  # ค่าที่ส่งมาเป็น code เช่น BRITISH
        params.append(curriculum.strip().upper())

    if level and level.strip() and level != "all":
        where_clauses.append("%s = ANY(levels_offered)")
        params.append(level.strip())

    where_str = " AND ".join(where_clauses) or "TRUE"

    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Overall KPIs (open schools only)
            cur.execute("""
                SELECT
                    count(*) as total_schools,
                    count(distinct province) as total_provinces,
                    coalesce(sum(student_count), 0) as total_students,
                    count(case when official_website_url is not null and official_website_url != '' then 1 end) as with_website
                FROM school_data.schools
                WHERE status <> 'archived'
            """)
            kpis = cur.fetchone() or {
                "total_schools": 0,
                "total_provinces": 0,
                "total_students": 0,
                "with_website": 0,
            }

            # Filtered count
            cur.execute(f"SELECT count(*) as filtered_count FROM school_data.schools WHERE {where_str}", params)
            filtered_count = cur.fetchone()["filtered_count"]

            query = f"""
                SELECT 
                    school_id,
                    opec_school_code,
                    slug,
                    name_th,
                    name_en,
                    status,
                    archived_at,
                    opec_missing_since,
                    official_website_url,
                    website_source,
                    opec_profile_url,
                    official_phone,
                    official_mobile,
                    social_links,
                    NULL AS facebook_url,   -- old flat columns, now in social_links; kept as keys the admin page falls back to
                    NULL AS line_id,
                    NULL AS instagram_url,
                    NULL AS youtube_url,
                    province,
                    district,
                    subdistrict,
                    address,
                    st_y(geom::geometry) AS latitude,
                    st_x(geom::geometry) AS longitude,
                    gps_precision,
                    gps_source,
                    current_published_version_id::text AS current_published_version_id,
                    logo_url,
                    level_range,
                    levels_offered,
                    curriculums,
                    student_count,
                    teacher_count,
                    licensee_name,
                    director_name,
                    manager_name,
                    pub_tuition_min_thb,
                    pub_tuition_max_thb,
                    pub_has_safeguarding_policy,
                    pub_data_updated_at,
                    is_isat_member,
                    is_boarding,
                    year_established,
                    accreditations,
                    isat_school_name,
                    data_sources,
                    created_at,
                    updated_at
                FROM school_data.schools
                WHERE {where_str}
                ORDER BY updated_at DESC, name_th ASC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, params + [limit, offset])
            rows = cur.fetchall()

            serialized_rows = []
            for r in rows:
                item = dict(r)
                if item.get("school_id"):
                    item["school_id"] = str(item["school_id"])
                if item.get("pub_tuition_min_thb") is not None:
                    item["pub_tuition_min_thb"] = float(item["pub_tuition_min_thb"])
                if item.get("pub_tuition_max_thb") is not None:
                    item["pub_tuition_max_thb"] = float(item["pub_tuition_max_thb"])
                for when in ("pub_data_updated_at", "archived_at", "opec_missing_since"):
                    if item.get(when):
                        item[when] = item[when].isoformat()
                if item.get("updated_at"):
                    item["updated_at"] = item["updated_at"].isoformat()
                if item.get("created_at"):
                    item["created_at"] = item["created_at"].isoformat()

                # Compatibility fields with OpecSchoolRecord
                item["school_code"] = item.get("opec_school_code") or str(item.get("school_id", ""))
                item["school_name_th"] = item.get("name_th") or ""
                item["school_name_en"] = item.get("name_en") or ""
                item["website"] = item.get("official_website_url") or ""
                item["telephone"] = item.get("official_phone") or ""
                item["mobile"] = item.get("official_mobile") or ""
                expand_social_links(item)
                item["school_logo_url"] = item.get("logo_url") or ""
                expand_vocab(item)
                item["student_count"] = item.get("student_count") or 0
                item["teacher_count"] = item.get("teacher_count") or 0
                # the last OPEC fetch, same as "ที่มาของข้อมูล"; created_at is only when the row was first imported
                item["fetched_at"] = ((item.get("data_sources") or {}).get("opec") or {}).get("at") or item.get("created_at") or ""
                item["last_updated"] = item.get("updated_at") or item.get("created_at") or ""
                serialized_rows.append(item)

            return {
                "schools": serialized_rows,
                "total": filtered_count,
                "kpis": kpis,
            }


def clear_supabase_data(dsn: str | None = None) -> dict[str, Any]:
    """⚠️ ล้างข้อมูลโรงเรียนทั้งหมด — เครื่องมือรีเซ็ตสำหรับการทดสอบเท่านั้น

    ต่างจาก close_school() ที่เป็น soft delete ตาม UC-11 Business Rule —
    ฟังก์ชันนี้ลบจริงและ cascade ไปทุกตารางลูก ใช้เฉพาะตอนต้องการ re-import
    ชุดข้อมูล OPEC ใหม่ทั้งหมด ห้ามเรียกจากหน้าใช้งานปกติ
    """
    with db_connect(dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM school_data.schools")
            before_count = cur.fetchone()[0]
            cur.execute("DELETE FROM school_data.schools;")
            cur.execute("DELETE FROM school_data.school_scrape_log;")

    return {
        "status": "success",
        "action": "cleared",
        "deleted_count": before_count,
        "message": f"ลบข้อมูลโรงเรียนและประวัติใน Supabase ทั้งหมด {before_count} รายการเรียบร้อยแล้ว",
    }


def mark_opec_presence(opec_codes: list[str], dsn: str | None = None) -> dict[str, Any]:
    """After an OPEC check: dates the schools OPEC has stopped listing (opec_missing_since) and clears
    the date for schools it lists again. Hides nothing; an admin closes a school from its detail page."""
    codes = sorted({str(c).strip() for c in opec_codes if str(c).strip()})

    with db_connect(dsn, row_factory=dict_row) as conn:
        listed = conn.execute("SELECT count(*) AS n FROM school_data.schools WHERE status <> 'archived'").fetchone()["n"]
        # A short list is a bad answer from OPEC, not a wave of closures (fetch_opec_schools checks the same)
        if len(codes) < 0.8 * listed:
            raise ValueError(f"รายชื่อจาก OPEC มี {len(codes)} แห่ง น้อยกว่าในฐาน ({listed}) ผิดปกติ จึงไม่บันทึกว่าโรงเรียนไหนหายไป")
        tag_versions(conn, "opec_import", "opec_presence")
        changed = conn.execute("""
            UPDATE school_data.schools
            SET opec_missing_since = CASE WHEN opec_school_code = ANY(%(codes)s) THEN NULL ELSE NOW() END
            WHERE (opec_school_code = ANY(%(codes)s) AND opec_missing_since IS NOT NULL)
               OR (opec_school_code <> ALL(%(codes)s) AND opec_missing_since IS NULL)
            RETURNING opec_school_code, opec_missing_since IS NOT NULL AS missing
        """, {"codes": codes}).fetchall()
        still_shown = conn.execute("""SELECT count(*) AS n FROM school_data.schools
                                      WHERE status <> 'archived' AND opec_missing_since IS NOT NULL""").fetchone()["n"]
        conn.commit()
    return {"newly_missing": [r["opec_school_code"] for r in changed if r["missing"]],
            "listed_again": [r["opec_school_code"] for r in changed if not r["missing"]],
            "missing_still_shown": still_shown}


def _set_closure(school_code: str, action: str, sql: str, not_found: str, dsn: str | None) -> dict[str, Any]:
    with db_connect(dsn, row_factory=dict_row) as conn:
        tag_versions(conn, "admin", action)
        row = conn.execute(sql, (school_code,)).fetchone()
        if not row:
            raise ValueError(not_found)
        conn.commit()
    return {"school_code": school_code, "status": row["status"]}


def close_school(school_code: str, dsn: str | None = None) -> dict[str, Any]:
    """An admin closes a school: parents no longer see it; its data stays and reopen_school() undoes it.
    The reason is recorded only when OPEC has dropped the school."""
    return _set_closure(school_code, "close_school", """
        UPDATE school_data.schools
        SET status = 'archived', archived_at = NOW(), updated_at = NOW(),
            archived_reason = CASE WHEN opec_missing_since IS NOT NULL THEN 'ไม่อยู่ในรายชื่อ OPEC แล้ว' END
        WHERE opec_school_code = %s AND status <> 'archived'
        RETURNING status::text AS status
    """, f"ไม่พบโรงเรียนรหัส {school_code} หรือปิดไปแล้ว", dsn)


def reopen_school(school_code: str, dsn: str | None = None) -> dict[str, Any]:
    """Undoes close_school()."""
    return _set_closure(school_code, "reopen_school", """
        UPDATE school_data.schools
        SET status = 'active', archived_at = NULL, archived_reason = NULL, updated_at = NOW()
        WHERE opec_school_code = %s AND status = 'archived'
        RETURNING status::text AS status
    """, f"ไม่พบโรงเรียนรหัส {school_code} ที่ปิดอยู่", dsn)


def fetch_school_history(school_code: str | None = None, limit: int = 200, search: str | None = None,
                         dsn: str | None = None) -> list[dict[str, Any]]:
    """What changed on one school's row (every school's when school_code is None), newest first: the trigger
    log_school_change (db/schema.sql) writes each change to ops.audit_log with the old and new value of
    every field that changed. The published version shows as its number, not its id.
    search: part of the school's Thai or English name, or its OPEC code."""
    search = (search or "").strip()
    pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%" if search else None
    with db_connect(dsn, row_factory=dict_row) as conn:
        rows = conn.execute("""
            SELECT l.created_at, l.action,
                   l.before_snapshot || coalesce((SELECT jsonb_build_object('current_published_version_id', v.version_number)
                       FROM school_data.school_versions v
                       WHERE v.version_id::text = l.before_snapshot->>'current_published_version_id'), '{}') AS before_snapshot,
                   l.after_snapshot || coalesce((SELECT jsonb_build_object('current_published_version_id', v.version_number)
                       FROM school_data.school_versions v
                       WHERE v.version_id::text = l.after_snapshot->>'current_published_version_id'), '{}') AS after_snapshot,
                   l.actor_type::text AS actor_type, s.opec_school_code, s.name_th, s.name_en
            FROM ops.audit_log l
            JOIN school_data.schools s ON s.school_id = l.entity_id
            WHERE l.entity_type = 'school' AND (%(code)s::text IS NULL OR s.opec_school_code = %(code)s)
              AND (%(pattern)s::text IS NULL OR s.name_th ILIKE %(pattern)s OR s.name_en ILIKE %(pattern)s
                   OR s.opec_school_code LIKE %(pattern)s)
            ORDER BY l.created_at DESC, l.log_id DESC
            LIMIT %(limit)s
        """, {"code": school_code, "limit": limit, "pattern": pattern}).fetchall()
    return [{"changed_at": r["created_at"].isoformat(), "action": r["action"], "actor_type": r["actor_type"],
             "school_code": r["opec_school_code"], "name_th": r["name_th"], "name_en": r["name_en"],
             "before": r["before_snapshot"] or {}, "after": r["after_snapshot"] or {}}
            for r in rows]


def _same_point(lat_a: Any, lng_a: Any, lat_b: Any, lng_b: Any) -> bool:
    """Two optional coordinates are the same point (the dataset keeps 7 decimals)."""
    if lat_a is None or lng_a is None or lat_b is None or lng_b is None:
        return lat_a is None and lat_b is None
    return abs(float(lat_a) - float(lat_b)) < 5e-8 and abs(float(lng_a) - float(lng_b)) < 5e-8


def _sync_failed(what: str, error: Exception, update_progress_cb: Optional[Callable]) -> int:
    print(f"[Supabase Sync] Error updating {what.strip()}:", error)
    if update_progress_cb:
        update_progress_cb(f"เกิดข้อผิดพลาดในการซิงค์{what}สู่ Supabase", 100, 100, f"Supabase error: {error}")
    return 0


def _by_code(schools: list[dict] | None) -> dict[str, dict]:
    if schools is None:
        from data_manager import load_schools
        schools = load_schools() or []
    out = {}
    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "").strip()
        if code:
            out[code] = s
    return out


# The sync functions below write only the rows whose value differs from what the database
# already holds. Every UPDATE on schools bumps updated_at and row_version (trigger
# bump_row_version), so rewriting unchanged rows made every school look edited after each
# run, and the counts they return are rows that really changed.

def update_supabase_school_names_en(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes enriched official English names and regenerated slugs to Supabase (school_data.schools).
    Returns how many rows changed.
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0
    by_code = _by_code(schools)

    try:
        with db_connect(target_dsn, row_factory=dict_row) as conn:
            rows = conn.execute("SELECT opec_school_code, name_th, name_en, slug FROM school_data.schools").fetchall()

        # Names are worked out with no transaction open
        taken = {r["slug"] for r in rows}
        updates = []
        for r in rows:
            code = r["opec_school_code"]
            if not code:
                continue
            s = by_code.get(code) or {}
            curr_en = (r["name_en"] or "").strip()
            target_en = str(s.get("school_name_en") or s.get("name_en") or "").strip()
            if not target_en and not curr_en:
                try:
                    from enrich_school_names_en import dynamic_resolve_school_en_name
                    target_en = dynamic_resolve_school_en_name({"school_name_th": r["name_th"], "school_code": code})
                except Exception:
                    target_en = ""
            if target_en and target_en != curr_en:
                taken.discard(r["slug"])
                slug = free_slug(slugify(target_en, code), code, taken)
                taken.add(slug)
                updates.append({"en": target_en, "slug": slug, "code": code})

        if updates:
            with db_connect(target_dsn) as conn:
                with conn.cursor() as cur:
                    tag_versions(cur, "pipeline", "name_en_step")
                    for params in updates:
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET name_en = %(en)s,
                                slug = %(slug)s,
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            params,
                        )
                conn.commit()
        return len(updates)
    except Exception as e:
        return _sync_failed(" EN ", e, update_progress_cb)


def update_supabase_school_gps(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes geocoded GPS locations to Supabase (school_data.schools).
    Returns how many rows changed.
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0

    code_to_gps: dict[str, tuple[float | None, float | None, str, str]] = {}
    for code, s in _by_code(schools).items():
        lat = s.get("latitude") or s.get("lat")
        lng = s.get("longitude") or s.get("lng")
        precision = str(s.get("gps_precision") or "")
        source = str(s.get("gps_source") or "")
        if not (lat and lng) and precision == "None":
            # No coordinate we may keep (e.g. only ArcGIS had one): clear the old point.
            code_to_gps[code] = (None, None, precision, source)
        elif lat and lng:
            try:
                code_to_gps[code] = (float(lat), float(lng), precision, source)
            except (ValueError, TypeError):
                pass

    try:
        with db_connect(target_dsn, row_factory=dict_row) as conn:
            rows = conn.execute(
                """
                SELECT opec_school_code, st_y(geom::geometry) AS lat, st_x(geom::geometry) AS lng,
                       gps_precision, gps_source
                FROM school_data.schools
                """
            ).fetchall()
            updates = []
            for r in rows:
                want = code_to_gps.get(r["opec_school_code"])
                if want is None:
                    continue
                lat_f, lng_f, precision, source = want
                if (_same_point(r["lat"], r["lng"], lat_f, lng_f)
                        and (r["gps_precision"] or "") == precision and (r["gps_source"] or "") == source):
                    continue
                updates.append({"lat": lat_f, "lng": lng_f, "precision": precision, "source": source,
                                "code": r["opec_school_code"]})
            if updates:
                with conn.cursor() as cur:
                    tag_versions(cur, "pipeline", "gps_step")
                    for params in updates:
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET geom = CASE WHEN %(lat)s::double precision IS NULL THEN NULL
                                            ELSE st_setsrid(st_makepoint(%(lng)s::double precision, %(lat)s::double precision), 4326)::geography END,
                                gps_precision = %(precision)s,
                                gps_source = %(source)s,
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            params,
                        )
            conn.commit()
        return len(updates)
    except Exception as e:
        return _sync_failed("พิกัด GPS ", e, update_progress_cb)


def update_supabase_school_websites(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes official websites and socials to Supabase (school_data.schools).
    Returns how many rows changed.
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0

    code_to_web: dict[str, tuple[str, str, str]] = {}
    for code, s in _by_code(schools).items():
        web = str(s.get("website") or s.get("official_website_url") or "").strip()
        src = str(s.get("website_source") or "Official Scraper").strip()
        fb = str(s.get("facebook") or s.get("facebook_url") or "").strip()
        if web or src == "No Official Website":   # the website step's label for a school with no link (fetch_official_websites.NO_WEBSITE)
            code_to_web[code] = (web, src, fb)

    try:
        with db_connect(target_dsn, row_factory=dict_row) as conn:
            rows = conn.execute(
                """
                SELECT opec_school_code, official_website_url, website_source,
                       social_links->>'facebook' AS facebook
                FROM school_data.schools
                """
            ).fetchall()
            updates = []
            for r in rows:
                want = code_to_web.get(r["opec_school_code"])
                if want is None:
                    continue
                web, src, fb = want
                if ((r["official_website_url"] or "") == web
                        and (not src or (r["website_source"] or "") == src)
                        and (not fb or (r["facebook"] or "") == fb)):
                    continue
                updates.append({"web": web, "src": src, "fb": fb, "code": r["opec_school_code"]})
            if updates:
                with conn.cursor() as cur:
                    tag_versions(cur, "pipeline", "website_step")
                    for params in updates:
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET official_website_url = NULLIF(%(web)s, ''),
                                website_source = COALESCE(NULLIF(%(src)s, ''), website_source),
                                social_links = case when NULLIF(%(fb)s, '') is null then social_links
                                                   else social_links || jsonb_build_object('facebook', %(fb)s) end,
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            params,
                        )
            conn.commit()
        return len(updates)
    except Exception as e:
        return _sync_failed("เว็บไซต์", e, update_progress_cb)


def update_supabase_school_sources(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """Writes each school's data_sources (data_manager.data_sources: where each part came from and when).
    The website part describes the link the database holds, which the local file can lag behind.
    Returns how many rows changed."""
    from data_manager import data_sources
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0
    by_code = _by_code(schools)
    try:
        with db_connect(target_dsn, row_factory=dict_row) as conn:
            rows = conn.execute("""SELECT opec_school_code, official_website_url, website_source, data_sources
                                   FROM school_data.schools""").fetchall()
            changed = []
            for r in rows:
                s = by_code.get(r["opec_school_code"])
                if s is None:
                    continue
                want = data_sources({**s, "website": r["official_website_url"], "website_source": r["website_source"]})
                if want != r["data_sources"]:
                    changed.append((json.dumps(want, ensure_ascii=False), r["opec_school_code"]))
            with conn.cursor() as cur:
                cur.executemany("UPDATE school_data.schools SET data_sources = %s::jsonb WHERE opec_school_code = %s",
                                changed)
            conn.commit()
        return len(changed)
    except Exception as e:
        return _sync_failed("แหล่งที่มาของข้อมูล", e, update_progress_cb)


def _snapshot(value: Any) -> Any:
    """A version's data_snapshot as a dict; older rows hold it as a JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}
    return value or {}


def _version_fees(cur, version_ids: list) -> dict[str, list[dict[str, Any]]]:
    """Fee rows of each version, keyed by version_id as text."""
    cur.execute("""
        SELECT version_id, fee_id, grade_label, level_code, annual_thb, semester_thb, currency, notes
        FROM school_data.version_fees
        WHERE version_id = ANY(%s::uuid[])
        ORDER BY grade_label ASC
    """, ([str(v) for v in version_ids],))
    out: dict[str, list[dict[str, Any]]] = {}
    for f in cur.fetchall():
        out.setdefault(str(f["version_id"]), []).append({
            "fee_id": str(f["fee_id"]),
            "grade_label": f["grade_label"],
            "level_code": f.get("level_code"),
            "annual_thb": float(f["annual_thb"]) if f.get("annual_thb") is not None else None,
            "semester_thb": float(f["semester_thb"]) if f.get("semester_thb") is not None else None,
            "currency": f.get("currency") or "THB",
            "notes": f.get("notes"),
        })
    return out


def _version_extra_fees(cur, version_ids: list) -> dict[str, list[dict[str, Any]]]:
    """Each version's extra fees (hidden costs), by name, keyed by version_id as text."""
    cur.execute("""
        SELECT version_id, extra_fee_id, name, amount_thb, frequency, notes
        FROM school_data.version_extra_fees
        WHERE version_id = ANY(%s::uuid[])
        ORDER BY name ASC
    """, ([str(v) for v in version_ids],))
    out: dict[str, list[dict[str, Any]]] = {}
    for ef in cur.fetchall():
        out.setdefault(str(ef["version_id"]), []).append({
            "extra_fee_id": str(ef["extra_fee_id"]),
            "name": ef["name"],
            "amount_thb": float(ef["amount_thb"]) if ef.get("amount_thb") is not None else None,
            "frequency": ef.get("frequency") or "unknown",
            "notes": ef.get("notes"),
        })
    return out


def _version_safety(cur, version_ids: list) -> dict[str, dict[str, Any]]:
    """Each version's safety row, keyed by version_id as text."""
    cur.execute("""
        SELECT version_id, security_guards, cctv_monitoring, nurse_medical_clinic,
               child_safeguarding_policy, air_quality_pm25_protocol, visitor_access_control,
               highlights, policy_summary, policy_url
        FROM school_data.version_safety
        WHERE version_id = ANY(%s::uuid[])
    """, ([str(v) for v in version_ids],))
    return {str(r.pop("version_id")): dict(r) for r in cur.fetchall()}


def fetch_pending_versions(dsn: str | None = None) -> list[dict[str, Any]]:
    """
    Fetches all school versions that are pending admin review (UC-A04 Diff View).
    Includes related school info, version fees, extra fees, safety policies,
    curriculums, general info, facilities, and previous published version data.
    """
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    v.version_id,
                    v.school_id,
                    v.version_number,
                    v.status,
                    v.source_type,
                    v.confidence_score,
                    v.confidence_reasoning,
                    v.scraped_page_url,
                    v.diff_summary,
                    v.data_snapshot,
                    v.submitted_at,
                    s.name_th,
                    s.name_en,
                    s.opec_school_code,
                    s.province,
                    s.district,
                    s.logo_url,
                    s.official_website_url,
                    s.current_published_version_id,
                    s.curriculums as current_curriculums,
                    s.pub_tuition_min_thb as current_pub_min_thb,
                    s.pub_tuition_max_thb as current_pub_max_thb,
                    s.pub_has_safeguarding_policy as current_has_safeguarding,
                    s.pub_data_updated_at as current_pub_data_updated_at,
                    p.data_snapshot AS prev_snapshot,
                    p.submitted_at AS prev_submitted_at,
                    p.created_at AS prev_created_at
                FROM school_data.school_versions v
                JOIN school_data.schools s ON v.school_id = s.school_id
                LEFT JOIN school_data.school_versions p ON p.version_id = s.current_published_version_id
                WHERE v.status = 'pending_review'
                ORDER BY v.submitted_at DESC
            """)
            versions = [dict(r) for r in cur.fetchall()]
            ids = [v["version_id"] for v in versions] + [v["current_published_version_id"] for v in versions
                                                        if v.get("current_published_version_id")]
            fees, extra_fees, safety = _version_fees(cur, ids), _version_extra_fees(cur, ids), _version_safety(cur, ids)

            for v in versions:
                vid = v["version_id"]
                v["version_id"] = str(vid)
                v["school_id"] = str(v["school_id"])
                if v.get("current_published_version_id"):
                    v["current_published_version_id"] = str(v["current_published_version_id"])
                if v.get("current_pub_min_thb") is not None:
                    v["current_pub_min_thb"] = float(v["current_pub_min_thb"])
                if v.get("current_pub_max_thb") is not None:
                    v["current_pub_max_thb"] = float(v["current_pub_max_thb"])
                if v.get("submitted_at"):
                    v["submitted_at"] = v["submitted_at"].isoformat()
                if v.get("current_pub_data_updated_at"):
                    v["current_pub_data_updated_at"] = v["current_pub_data_updated_at"].isoformat()

                # Extract parsed fields from data_snapshot
                snapshot = _snapshot(v.get("data_snapshot"))
                v["scraped_curriculums"] = snapshot.get("curriculums") or ([snapshot.get("curriculum")] if snapshot.get("curriculum") else [])
                v["scraped_general_info"] = snapshot.get("general_info") or {}
                v["scraped_facilities"] = snapshot.get("facilities") or []
                v["scraped_signature_programs"] = snapshot.get("signature_programs") or []

                v["fees"] = fees.get(str(vid), [])

                v["extra_fees"] = extra_fees.get(str(vid), [])

                v["safety"] = safety.get(str(vid))

                # The live version's fees, safety and snapshot, for the side-by-side comparison (ก่อน vs หลัง)
                prev_vid = v.get("current_published_version_id")
                prev_ver = {"data_snapshot": v.pop("prev_snapshot"), "submitted_at": v.pop("prev_submitted_at"),
                            "created_at": v.pop("prev_created_at")}
                if prev_vid:
                    v["previous_fees"] = fees.get(prev_vid, [])
                    v["previous_safety"] = safety.get(prev_vid)

                    if prev_ver["created_at"]:
                        p_snap = _snapshot(prev_ver.get("data_snapshot"))
                        v["previous_curriculums"] = p_snap.get("curriculums") or ([p_snap.get("curriculum")] if p_snap.get("curriculum") else v.get("current_curriculums") or [])
                        v["previous_facilities"] = p_snap.get("facilities") or []
                        v["previous_general_info"] = p_snap.get("general_info") or {}
                        p_date = prev_ver.get("submitted_at") or prev_ver.get("created_at")
                        v["previous_submitted_at"] = p_date.isoformat() if hasattr(p_date, "isoformat") else (str(p_date) if p_date else None)
                    else:
                        v["previous_curriculums"] = v.get("current_curriculums") or []
                        v["previous_facilities"] = []
                        v["previous_general_info"] = {}
                        v["previous_submitted_at"] = None
                else:
                    v["previous_fees"] = []
                    v["previous_safety"] = None
                    v["previous_curriculums"] = v.get("current_curriculums") or []
                    v["previous_facilities"] = []
                    v["previous_general_info"] = {}
                    v["previous_submitted_at"] = None

                # A scraped name is new only when it names a curriculum the school did not have. Compared as text,
                # "A-Level" and "IGCSE" looked new next to the code BRITISH they belong to.
                prev_codes = set(website_curriculum_codes({"curriculums": v["previous_curriculums"]}) or [])
                v["added_curriculums"] = [c for c in v.get("scraped_curriculums") or []
                                          if not set(website_curriculum_codes({"curriculums": [c]}) or []) <= prev_codes]

            return versions


def _read_model(cur, version_id: Any) -> dict[str, Any]:
    """What schools shows from a version (pub_* columns): the tuition range and the safeguarding policy.
    annual_thb only: a school may have 2 or 3 terms, so semester_thb can't be annualized. The range runs
    over the calculator's school years (year_rows), so a half-day option is not shown as the starting fee."""
    rows = cur.execute("""
        SELECT f.grade_label AS grade_level, f.annual_thb,
               (SELECT min(e.i) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.data_snapshot->'tuition_by_grade') = 'array'
                                                               THEN v.data_snapshot->'tuition_by_grade' ELSE '[]' END)
                                     WITH ORDINALITY e(item, i)
                 WHERE e.item->>'grade_level' = f.grade_label) AS page_pos
        FROM school_data.version_fees f JOIN school_data.school_versions v ON v.version_id = f.version_id
        WHERE f.version_id = %s AND f.annual_thb > 0
    """, (version_id,)).fetchall()
    extra = cur.execute("""
        SELECT s.curriculums,
               (SELECT child_safeguarding_policy FROM school_data.version_safety WHERE version_id = v.version_id) AS has_safeguarding
        FROM school_data.school_versions v JOIN school_data.schools s ON s.school_id = v.school_id
        WHERE v.version_id = %s
    """, (version_id,)).fetchone()
    amounts = [r["annual_thb"] for r in year_rows([dict(r) for r in rows], extra["curriculums"] or [])]
    return {"min_tuition": min(amounts, default=None), "max_tuition": max(amounts, default=None),
            "has_safeguarding": extra["has_safeguarding"]}


# What an admin can turn down in a draft while approving the rest: snapshot keys and child tables per part.
# A part turned down keeps what the live version holds (UC-11 review by part).
APPROVAL_PARTS: dict[str, tuple[list[str], dict[str, str]]] = {
    "fees": (["tuition_by_grade", "hidden_costs", "tuition_found", "tuition_min_thb", "tuition_max_thb"],
             {"version_fees": "grade_label, level_code, annual_thb, semester_thb, currency, academic_year, "
                              "source_published_at, source_url, confidence_score, notes",
              "version_extra_fees": "name, amount_thb, frequency, refundable, sibling_related, academic_year, "
                                    "source_published_at, notes"}),
    "safety": (["safety_and_security"],
               {"version_safety": "security_guards, cctv_monitoring, nurse_medical_clinic, child_safeguarding_policy, "
                                  "air_quality_pm25_protocol, visitor_access_control, highlights, policy_summary, "
                                  "policy_url, source_published_at"}),
    "info": (["general_info", "facilities", "signature_programs", "curriculums", "curriculum"], {}),
}


def _keep_live_parts(cur, draft_id: Any, live_id: Any, parts: list[str]) -> None:
    """Puts the live version's data of `parts` into the draft before it is published."""
    keys = [k for p in parts for k in APPROVAL_PARTS[p][0]]
    for p in parts:
        for table, cols in APPROVAL_PARTS[p][1].items():
            cur.execute(f"DELETE FROM school_data.{table} WHERE version_id = %s", (draft_id,))
            if live_id:
                cur.execute(f"INSERT INTO school_data.{table} (version_id, {cols}) "
                            f"SELECT %s, {cols} FROM school_data.{table} WHERE version_id = %s", (draft_id, live_id))
    cur.execute("""
        UPDATE school_data.school_versions d
        SET data_snapshot = (d.data_snapshot - %(keys)s::text[])
                            || COALESCE((SELECT jsonb_object_agg(k, v) FROM jsonb_each(l.data_snapshot) AS e(k, v)
                                         WHERE k = ANY(%(keys)s::text[])), '{}'::jsonb),
            diff_summary = COALESCE(d.diff_summary, '{}'::jsonb) || jsonb_build_object('kept_from_live', %(parts)s::jsonb)
        FROM (SELECT %(live)s::uuid AS id) x
        LEFT JOIN school_data.school_versions l ON l.version_id = x.id
        WHERE d.version_id = %(draft)s
    """, {"keys": keys, "parts": json.dumps(parts), "live": live_id, "draft": draft_id})


def approve_school_version(version_id: str, keep_live: list[str] | None = None,
                           opec_curriculums: dict[str, Any] | None = None, dsn: str | None = None) -> dict[str, Any]:
    """
    Approves a pending version and publishes it (UC-A04 Step 4).
    1. Updates target version status to 'published'
    2. Supersedes any previous published version
    3. Projects published tuition min/max and safeguarding policy to school_data.schools
    4. Records approval in school_data.school_scrape_log
    keep_live: parts of APPROVAL_PARTS ("fees", "safety", "info") the admin turned down; those keep the live data.
    opec_curriculums: {opec_school_code: OPEC's raw curriculums} from the local dataset, for choose_curriculums.
    """
    keep_live = sorted(set(keep_live or []))
    if set(keep_live) - APPROVAL_PARTS.keys():
        raise ValueError(f"ไม่รู้จักหมวด: {', '.join(sorted(set(keep_live) - APPROVAL_PARTS.keys()))}")
    if len(keep_live) == len(APPROVAL_PARTS):
        raise ValueError("ต้องรับอย่างน้อยหนึ่งหมวด ถ้าไม่รับเลยให้กดปฏิเสธแทน")
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # FOR UPDATE: a second approve/reject of the same draft waits here, then sees the new status
            cur.execute("""
                SELECT version_id, school_id, status::text AS status, version_number, data_snapshot
                FROM school_data.school_versions
                WHERE version_id = %s
                FOR UPDATE
            """, (version_id,))
            ver = cur.fetchone()
            if not ver:
                raise ValueError("ไม่พบเวอร์ชันที่ต้องการอนุมัติ")
            # A page left open can still list a draft that was approved or rejected since
            if ver["status"] != "pending_review":
                raise ValueError(f"ร่างนี้ไม่ได้รออนุมัติแล้ว (สถานะตอนนี้: {ver['status']}) กดรีเฟรชเพื่อดูรายการล่าสุด")

            school_id = ver["school_id"]
            # An admin edit of this school waits until the approval is done, so the link, pin and
            # curriculums written into the draft below are the ones live when it is published
            live = cur.execute("SELECT current_published_version_id, opec_school_code FROM school_data.schools "
                               "WHERE school_id = %s FOR UPDATE", (school_id,)).fetchone()
            live_id = live["current_published_version_id"]
            tag_versions(cur, "admin", "approve_version")
            if keep_live:
                _keep_live_parts(cur, version_id, live_id, keep_live)
                ver["data_snapshot"] = cur.execute("SELECT data_snapshot FROM school_data.school_versions WHERE version_id = %s",
                                                   (version_id,)).fetchone()["data_snapshot"]

            rm = _read_model(cur, version_id)
            min_tuition, max_tuition, has_safeguarding = rm["min_tuition"], rm["max_tuition"], rm["has_safeguarding"]

            # Supersede existing published versions
            cur.execute("""
                UPDATE school_data.school_versions
                SET status = 'superseded'
                WHERE school_id = %s AND status = 'published' AND version_id != %s
            """, (school_id, version_id))

            # Publish target version
            cur.execute("""
                UPDATE school_data.school_versions
                SET status = 'published',
                    reviewed_at = NOW()
                WHERE version_id = %s
            """, (version_id,))

            # An older draft approved after this one would put older fees back on the site
            cur.execute("""
                UPDATE school_data.school_versions
                SET status = 'rejected', rejection_reason = 'มีร่างที่ใหม่กว่าอนุมัติแล้ว', reviewed_at = NOW()
                WHERE school_id = %s AND status = 'pending_review' AND version_number < %s
            """, (school_id, ver["version_number"]))

            # Extract snapshot fields to update on school if available
            snapshot = _snapshot(ver.get("data_snapshot"))

            # The same rule as the OPEC import, so the next import does not change them back. A school not
            # in the local OPEC dataset keeps what it has.
            code = live["opec_school_code"]
            chosen = (choose_curriculums(opec_curriculums[code], snapshot)
                      if opec_curriculums is not None and code in opec_curriculums else None)

            # Project to main schools table
            cur.execute("""
                UPDATE school_data.schools
                SET current_published_version_id = %s,
                    pub_tuition_min_thb = %s,
                    pub_tuition_max_thb = %s,
                    pub_has_safeguarding_policy = %s,
                    curriculums = CASE WHEN %s::text[] IS NOT NULL AND curriculums_confirmed_at IS NULL
                                       THEN %s::text[] ELSE curriculums END,
                    pub_data_updated_at = CASE WHEN %s THEN pub_data_updated_at ELSE NOW() END,   -- fees kept: their date too
                    updated_at = NOW()
                WHERE school_id = %s
            """, (version_id, min_tuition, max_tuition, has_safeguarding,
                  chosen, chosen, "fees" in keep_live, school_id))

            # The draft brings only what the website says (fees, extra fees, safety, facilities). A draft
            # scraped before an admin moved the pin or fixed the link must not put the old ones back: the
            # UPDATE above leaves them alone, and the draft records them as they are live now
            cur.execute("""
                UPDATE school_data.school_versions v
                SET data_snapshot = v.data_snapshot || jsonb_build_object('school', school_data.school_fields(s))
                FROM school_data.schools s
                WHERE v.version_id = %s AND s.school_id = v.school_id
            """, (version_id,))

            # Log approval in school_data.school_scrape_log
            cur.execute("""
                INSERT INTO school_data.school_scrape_log
                    (school_id, version_id, run_id, phase, status, ai_reasoning, created_at)
                VALUES (%s, %s, gen_random_uuid(), 'extract', 'ok'::school_data.scrape_status, %s, NOW())
            """, (school_id, version_id, "Admin approved and published draft to live database"))

            conn.commit()

            return {
                "status": "success",
                "action": "published",
                "version_id": str(version_id),
                "school_id": str(school_id),
                "min_tuition": float(min_tuition) if min_tuition is not None else None,
                "max_tuition": float(max_tuition) if max_tuition is not None else None,
                "has_safeguarding": has_safeguarding,
            }


def reject_school_version(version_id: str, reason: str | None = None, dsn: str | None = None) -> dict[str, Any]:
    """Rejects a pending version with an optional reason."""
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Only a draft: rejecting the version that is live would leave the site showing a "rejected" version
            cur.execute("""
                UPDATE school_data.school_versions
                SET status = 'rejected',
                    rejection_reason = %s,
                    reviewed_at = NOW()
                WHERE version_id = %s AND status = 'pending_review'
                RETURNING version_id
            """, (reason or "ไม่ผ่านเกณฑ์การตรวจสอบของแอดมิน", version_id))
            if not cur.fetchone():
                raise ValueError("ไม่พบร่างนี้ หรือร่างนี้ไม่ได้รออนุมัติแล้ว กดรีเฟรชเพื่อดูรายการล่าสุด")
            conn.commit()

    return {
        "status": "success",
        "action": "rejected",
        "version_id": str(version_id),
    }


def fetch_school_versions(school_code: str, dsn: str | None = None) -> dict[str, Any]:
    """Every version of one school, highest number first, for the admin's version history (UC-11)."""
    with db_connect(dsn, row_factory=dict_row) as conn:
        rows = conn.execute(f"""
            SELECT v.version_id::text AS version_id, v.version_number, v.status::text AS status,
                   v.source_type::text AS source_type, v.submitted_at, v.reviewed_at, v.scraped_page_url,
                   v.diff_summary, v.rejection_reason, {HAS_WEB_DATA} AS has_web_data,
                   (v.data_snapshot->'web_origin'->>'version_number')::int AS web_from_number,
                   (SELECT count(*) FROM school_data.version_fees f WHERE f.version_id = v.version_id) AS fee_rows,
                   -- every annual row of this version (the site's range, _read_model, counts school years only)
                   (SELECT min(annual_thb)::float8 FROM school_data.version_fees f
                     WHERE f.version_id = v.version_id AND annual_thb > 0) AS annual_min,
                   (SELECT max(annual_thb)::float8 FROM school_data.version_fees f
                     WHERE f.version_id = v.version_id AND annual_thb > 0) AS annual_max,
                   (SELECT count(*) FROM school_data.version_extra_fees e WHERE e.version_id = v.version_id) AS extra_rows,
                   v.data_snapshot->'school' AS school,
                   s.current_published_version_id::text AS current_version_id
            FROM school_data.school_versions v
            JOIN school_data.schools s ON s.school_id = v.school_id
            WHERE s.opec_school_code = %s
            ORDER BY v.version_number DESC
        """, (school_code,)).fetchall()
    for r in rows:
        for when in ("submitted_at", "reviewed_at"):
            r[when] = r[when].isoformat() if r[when] else None
    return {"current_version_id": rows[0]["current_version_id"] if rows else None,
            "versions": [{k: v for k, v in r.items() if k != "current_version_id"} for r in rows]}


def fetch_version_compare(school_code: str, version_id: str, dsn: str | None = None) -> dict[str, Any] | None:
    """One version of a school next to the one published now, for the admin to see what restoring it would
    change: fees (in the order the school's page lists them), extra fees, safety, facilities, and the link,
    pin and curriculums. `school` is None for a version saved before those were versioned. None if not found."""
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            row = cur.execute(f"""
                SELECT v.version_number, v.data_snapshot, {HAS_WEB_DATA} AS has_web_data,
                       c.version_id AS current_id, c.version_number AS current_number, c.data_snapshot AS current_snapshot,
                       (c.source_type = 'scraper' OR c.data_snapshot ? 'web_origin') AS current_has_web_data,
                       school_data.school_fields(s) AS live
                FROM school_data.school_versions v
                JOIN school_data.schools s ON s.school_id = v.school_id
                LEFT JOIN school_data.school_versions c ON c.version_id = s.current_published_version_id
                WHERE v.version_id = %s AND s.opec_school_code = %s
            """, (version_id, school_code)).fetchone()
            if not row:
                return None

            def detail(vid, number, snapshot, has_web, school):
                snap = _snapshot(snapshot)
                fees = cur.execute("""
                    SELECT f.grade_label, f.annual_thb::float8 AS annual_thb, f.semester_thb::float8 AS semester_thb, f.notes
                    FROM school_data.version_fees f
                    JOIN school_data.school_versions v ON v.version_id = f.version_id
                    WHERE f.version_id = %s
                    ORDER BY (SELECT min(e.i)
                              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.data_snapshot->'tuition_by_grade') = 'array'
                                                             THEN v.data_snapshot->'tuition_by_grade' ELSE '[]' END)
                                   WITH ORDINALITY e(item, i)
                              WHERE e.item->>'grade_level' = f.grade_label) NULLS LAST, f.grade_label
                """, (vid,)).fetchall() if vid else []
                facilities = snap.get("facilities") if has_web else None
                return {
                    "version_number": number,
                    "has_web_data": bool(has_web),
                    "fees": fees,
                    "extra_fees": _version_extra_fees(cur, [vid]).get(str(vid), []) if vid else [],
                    "safety": _version_safety(cur, [vid]).get(str(vid)) if vid else None,
                    "facilities": [f for f in facilities if isinstance(f, str) and f.strip()] if isinstance(facilities, list) else [],
                    "school": school,
                }

            return {
                "version": detail(version_id, row["version_number"], row["data_snapshot"], row["has_web_data"],
                                  _snapshot(row["data_snapshot"]).get("school")),
                "current": detail(row["current_id"], row["current_number"], row["current_snapshot"],
                                  row["current_has_web_data"], row["live"]),
            }


def restore_school_version(school_code: str, version_id: str, expected_version_id: str | None = None,
                           dsn: str | None = None) -> dict[str, Any]:
    """Rollback (UC-11): publishes a new version holding the same values as an older one, with copies of its
    fees, extra fees and safety rows. Old versions are never changed or deleted.

    Versions made before 4 Nov 2569 hold no link, pin or curriculums ('school' in the snapshot):
    restoring one brings back its website data and keeps those three as they are now.
    Returns the fields that changed, so the caller can bring the local file, pin locks and URL registry in line."""
    with admin_edit(school_code, "rollback", expected_version_id, dsn) as (cur, school):
        target = cur.execute("""
            SELECT v.version_number, v.status::text AS status, v.data_snapshot->'school' AS school,
                   school_data.school_fields(s) AS live,
                   COALESCE(v.data_snapshot->'web_origin'->>'version_id',
                            CASE WHEN v.source_type = 'scraper' THEN v.version_id::text END) AS web_from,
                   -- the data date parents see: when the restored website data was approved, or for a version
                   -- with none (an OPEC import), when that version was published, as the import sets it
                   CASE WHEN v.data_snapshot ? 'web_origin' THEN (v.data_snapshot->'web_origin'->>'approved_at')::timestamptz
                        WHEN v.source_type = 'scraper' THEN v.reviewed_at
                        ELSE COALESCE(v.reviewed_at, v.submitted_at, v.created_at) END AS web_approved_at,
                   COALESCE(c.data_snapshot->'web_origin'->>'version_id',
                            CASE WHEN c.source_type = 'scraper' THEN c.version_id::text END) AS web_now
            FROM school_data.school_versions v
            JOIN school_data.schools s ON s.school_id = v.school_id
            LEFT JOIN school_data.school_versions c ON c.version_id = s.current_published_version_id
            WHERE v.version_id = %s AND v.school_id = %s
        """, (version_id, school["school_id"])).fetchone()
        if not target:
            raise ValueError("ไม่พบฉบับนี้ของโรงเรียนนี้")
        if target["status"] != "superseded":
            raise ValueError("ฉบับนี้เผยแพร่อยู่แล้ว" if target["status"] == "published" else
                             "ย้อนได้เฉพาะฉบับที่เคยเผยแพร่ ร่างที่รออนุมัติหรือถูกปฏิเสธใช้ไม่ได้")

        live = target["live"]
        values = {**live, **(target["school"] or {})}
        fields = {k: [live.get(k), v] for k, v in values.items() if live.get(k) != v}
        web_changed = target["web_from"] != target["web_now"]
        diff = {"action": "rollback", "restored_from": target["version_number"], "fields": fields,
                "web_changed": web_changed}
        new_id = cur.execute("SELECT school_data.new_school_version(%s, %s, 'admin', %s::jsonb, %s::jsonb) AS id",
                             (school["school_id"], version_id, json.dumps(values, ensure_ascii=False),
                              json.dumps(diff, ensure_ascii=False))).fetchone()["id"]
        rm = _read_model(cur, new_id)
        # current_published_version_id changes here, so the trigger leaves this UPDATE to us
        cur.execute("""
            UPDATE school_data.schools
            SET current_published_version_id = %(vid)s,
                official_website_url = %(official_website_url)s,
                website_source = %(website_source)s,
                website_confirmed_at = %(website_confirmed_at)s::timestamptz,
                geom = CASE WHEN %(latitude)s::double precision IS NULL OR %(longitude)s::double precision IS NULL THEN NULL
                            ELSE st_setsrid(st_makepoint(%(longitude)s::double precision, %(latitude)s::double precision), 4326)::geography END,
                gps_precision = %(gps_precision)s,
                gps_source = %(gps_source)s,
                curriculums = %(curriculums)s::text[],
                curriculums_confirmed_at = %(curriculums_confirmed_at)s::timestamptz,
                curriculums_confirmed_by = %(curriculums_confirmed_by)s,
                pub_tuition_min_thb = %(min_tuition)s,
                pub_tuition_max_thb = %(max_tuition)s,
                pub_has_safeguarding_policy = %(has_safeguarding)s,
                pub_data_updated_at = CASE WHEN %(web_changed)s THEN %(web_approved_at)s::timestamptz ELSE pub_data_updated_at END,
                updated_at = NOW()
            WHERE school_id = %(sid)s
        """, {**values, **rm, "vid": new_id, "sid": school["school_id"], "web_changed": web_changed,
               "web_approved_at": target["web_approved_at"]})
        number = cur.execute("SELECT version_number FROM school_data.school_versions WHERE version_id = %s",
                             (new_id,)).fetchone()["version_number"]
    return {"status": "restored", "school_code": school_code, "version_id": str(new_id), "version_number": number,
            "restored_from": target["version_number"], "school": values, "fields": fields}


# Phrases that state how often an extra fee is charged. Notes often give two rates, e.g.
# "per year (or 10,000 per semester)", and amount_thb is the first one, so the earliest
# phrase in the text wins rather than whichever pattern is checked first.
FEE_FREQUENCY_PATTERNS: list[tuple[str, str]] = [
    ("once", r"\bonce\b|one[- ]?time|one[- ]?off|lump[- ]sum|ครั้งเดียว|แรกเข้า"),
    ("per_year", r"per (?:academic |school )?year|per annum|\bannual(?:ly)?\b|\byearly\b|a year\b|ต่อปี|รายปี"),
    ("per_semester", r"(?:per|each|a|every) semester|semesterly|/\s?semester|ต่อภาค|รายภาค"),
    ("per_term", r"(?:per|each|a|every) term\b|\btermly\b|/\s?term\b|\bterm (?:rate|fee)|\bterm 1\b|ต่อเทอม|รายเทอม"),
    ("per_month", r"per month|\bmonthly\b|a month\b|/\s?month\b|ต่อเดือน|รายเดือน"),
]


def guess_fee_frequency(name: str | None, notes: str | None) -> str:
    """fee_frequency from the wording of an extra fee, for rows the model left unknown.
    Notes are read before the name; deposits are paid once unless the text says otherwise."""
    for text in (notes or "", name or ""):
        hits = [(m.start(), freq) for freq, pattern in FEE_FREQUENCY_PATTERNS
                if (m := re.search(pattern, text, re.IGNORECASE))]
        if hits:
            return min(hits)[1]
    if re.search(r"deposit|เงินประกัน|มัดจำ", name or "", re.IGNORECASE):
        return "once"
    return "unknown"


# Keys of a scrape result that change on every run and say nothing about the school
_RUN_KEYS = {"run_id", "correlation_id", "status", "elapsed_sec", "confidence", "confidence_reasoning",
             "needs_ocr_review", "fee_page_discovery", "identity_verified", "page_scraped", "school_name",
             "homepage_url", "metadata", "diff_summary", "ai_model", "error", "scraped_at",
             "school", "web_origin"}   # the last two: what new_school_version() adds to a published version


def _web_data(snapshot: Any) -> str:
    """A version's website data, comparable across runs."""
    return json.dumps({k: v for k, v in (_snapshot(snapshot) or {}).items() if k not in _RUN_KEYS},
                      ensure_ascii=False, sort_keys=True)


def _same_web_data(cur, school_id: Any, result_data: dict[str, Any]) -> dict[str, Any] | None:
    """The published version, or a draft still awaiting review, whose website data equals this result."""
    new = _web_data(result_data)
    cur.execute("""
        SELECT v.version_id, v.version_number, v.data_snapshot
        FROM school_data.school_versions v
        WHERE v.school_id = %s AND (v.status = 'pending_review' OR
              (v.status = 'published' AND (v.source_type = 'scraper' OR v.data_snapshot ? 'web_origin')))
        ORDER BY v.version_number DESC
    """, (school_id,))
    return next((r for r in cur.fetchall() if _web_data(r["data_snapshot"]) == new), None)


def save_scraped_draft_version(school_id: str, result_data: dict[str, Any], dsn: str | None = None) -> dict[str, Any]:
    """
    Saves new scraped data as a draft version in school_data.school_versions
    with status 'pending_review' (preserving versioning history & auditability).
    No draft when the data equals the published version or a waiting draft: status 'unchanged'.

    `school_id` may be the schools.school_id uuid or the OPEC school code: the admin
    table only carries the code.
    """
    with db_connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # FOR UPDATE: version numbers of one school are handed out one at a time (admin edits and the
            # trigger version_school_change take the same lock)
            cur.execute(
                "SELECT school_id FROM school_data.schools WHERE school_id::text = %s OR opec_school_code = %s LIMIT 1 FOR UPDATE",
                (str(school_id), str(school_id)),
            )
            found = cur.fetchone()
            if not found:
                raise ValueError(f"ไม่พบโรงเรียนรหัส {school_id} ใน Supabase")
            school_id = found["school_id"]

            # Same data as the live version or a draft already waiting: log the run, make no new draft
            same = _same_web_data(cur, school_id, result_data)
            if same:
                cur.execute("""
                    INSERT INTO school_data.school_scrape_log
                        (school_id, run_id, correlation_id, phase, status, page_scraped, elapsed_sec, ai_model,
                         ai_reasoning, created_at)
                    VALUES (%s, %s::uuid, %s::uuid, 'extract', 'ok', %s, %s, %s, %s, NOW())
                """, (school_id, result_data.get("run_id") or str(uuid.uuid4()),
                      result_data.get("correlation_id") or str(uuid.uuid4()),
                      result_data.get("page_scraped") or "", to_float(result_data.get("elapsed_sec")) or 0.0,
                      result_data.get("ai_model") or "gemini-flash-lite-latest",
                      f"ข้อมูลเหมือนฉบับ {same['version_number']} จึงไม่สร้างร่างใหม่"))
                conn.commit()
                return {"status": "unchanged", "version_id": str(same["version_id"]),
                        "version_number": same["version_number"], "school_id": str(school_id)}

            cur.execute("""
                SELECT COALESCE(MAX(version_number), 0) + 1 as next_num 
                FROM school_data.school_versions 
                WHERE school_id = %s
            """, (school_id,))
            version_number = cur.fetchone()["next_num"]

            metadata = result_data.get("metadata") or {}
            confidence_score = result_data.get("confidence") or metadata.get("confidence_score")
            confidence_reasoning = result_data.get("confidence_reasoning") or metadata.get("confidence_reasoning")
            scraped_url = result_data.get("page_scraped") or metadata.get("source_url")
            diff_raw = result_data.get("diff_summary") or metadata.get("diff_summary")
            diff_json = json.dumps(diff_raw if isinstance(diff_raw, dict) else {"text": str(diff_raw or "")}, ensure_ascii=False)

            cur.execute("""
                INSERT INTO school_data.school_versions
                    (school_id, version_number, status, source_type, data_snapshot, 
                     confidence_score, confidence_reasoning, scraped_page_url, diff_summary)
                VALUES (%s, %s, 'pending_review', 'scraper', %s::jsonb, %s, %s, %s, %s::jsonb)
                RETURNING version_id
            """, (
                school_id,
                version_number,
                json.dumps(result_data, ensure_ascii=False),
                confidence_score,
                confidence_reasoning,
                scraped_url,
                diff_json
            ))
            version_id = cur.fetchone()["version_id"]

            tuition_list = result_data.get("tuition_by_grade") or result_data.get("fees_by_grade") or []
            for t in tuition_list:
                grade_label = clean(t.get("grade_level")) or clean(t.get("grade_label"))
                if not grade_label:
                    continue
                annual = to_float(t.get("annual_thb"))
                semester = to_float(t.get("semester_thb"))
                currency = clean(t.get("currency")) or "THB"
                notes = clean(t.get("notes"))
                if annual is not None or semester is not None or notes:
                    cur.execute("""
                        INSERT INTO school_data.version_fees
                            (version_id, grade_label, level_code, annual_thb, semester_thb, currency, notes)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (version_id, grade_label, clean(t.get("level_code")), annual, semester, currency, notes))

            hidden_costs = result_data.get("hidden_costs") or []
            freq_map = {
                "once": "once", "one_time": "once", "ครั้งเดียว": "once", "แรกเข้า": "once",
                "per_year": "per_year", "annual": "per_year", "ต่อปี": "per_year", "รายปี": "per_year",
                "per_semester": "per_semester", "semester": "per_semester", "ต่อภาค": "per_semester", "รายภาค": "per_semester",
                "per_term": "per_term", "termly": "per_term", "ต่อเทอม": "per_term",
                "per_month": "per_month", "monthly": "per_month", "ต่อเดือน": "per_month", "รายเดือน": "per_month",
                "conditional": "conditional", "optional": "conditional", "ทางเลือก": "conditional"
            }
            for hc in hidden_costs:
                name = clean(hc.get("name")) or clean(hc.get("fee_name"))
                if not name:
                    continue
                amount = to_float(hc.get("amount_thb"))
                raw_freq = (clean(hc.get("frequency")) or "unknown").lower()
                notes = clean(hc.get("notes"))
                freq = freq_map.get(raw_freq) or guess_fee_frequency(name, notes)
                cur.execute("""
                    INSERT INTO school_data.version_extra_fees
                        (version_id, name, amount_thb, frequency, notes)
                    VALUES (%s, %s, %s, %s::school_data.fee_frequency, %s)
                """, (version_id, name, amount, freq, notes))

            safety = result_data.get("safety_and_security") or result_data.get("safety_policies") or {}
            if safety:
                cur.execute("""
                    INSERT INTO school_data.version_safety
                        (version_id, security_guards, cctv_monitoring, nurse_medical_clinic,
                         child_safeguarding_policy, air_quality_pm25_protocol, visitor_access_control,
                         highlights, policy_summary, policy_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    version_id,
                    safety.get("security_guards"),
                    safety.get("cctv_monitoring"),
                    safety.get("nurse_medical_clinic"),
                    safety.get("child_safeguarding_policy"),
                    safety.get("air_quality_pm25_protocol"),
                    safety.get("visitor_access_control"),
                    safety.get("highlights") or [],
                    clean(safety.get("policy_summary")),
                    clean(safety.get("policy_url"))
                ))

            # 4. Insert log entry into school_data.school_scrape_log
            run_id = result_data.get("run_id") or str(uuid.uuid4())
            correlation_id = result_data.get("correlation_id") or str(uuid.uuid4())
            elapsed = to_float(result_data.get("elapsed_sec")) or 0.0
            ai_model_name = result_data.get("ai_model") or "gemini-flash-lite-latest"
            status_val = "ok" if (result_data.get("tuition_found") or tuition_list) else "no_tuition_found"
            if result_data.get("status") == "failed" or result_data.get("error"):
                status_val = "error"

            cur.execute("""
                INSERT INTO school_data.school_scrape_log
                    (school_id, version_id, run_id, correlation_id, phase, status,
                     page_scraped, elapsed_sec, ai_model, ai_reasoning, created_at)
                VALUES (%s, %s, %s::uuid, %s::uuid, 'extract', %s::school_data.scrape_status,
                        %s, %s, %s, %s, NOW())
            """, (
                school_id,
                version_id,
                run_id,
                correlation_id,
                status_val,
                scraped_url or "",
                elapsed,
                ai_model_name,
                confidence_reasoning or "",
            ))

            conn.commit()

            return {
                "status": "success",
                "version_id": str(version_id),
                "version_number": version_number,
                "school_id": str(school_id)
            }


def fetch_scrape_logs(limit: int = 150, offset: int = 0, dsn: str | None = None) -> list[dict[str, Any]]:
    """Fetches scrape logs from school_data.school_scrape_log for the Admin Console."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        return []

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    l.log_id,
                    l.school_id,
                    l.version_id,
                    l.run_id,
                    l.correlation_id,
                    l.phase,
                    l.status,
                    l.page_scraped,
                    l.elapsed_sec,
                    l.ai_model,
                    l.ai_reasoning,
                    l.error_message,
                    l.created_at,
                    s.name_th,
                    s.name_en,
                    s.opec_school_code,
                    s.official_website_url
                FROM school_data.school_scrape_log l
                LEFT JOIN school_data.schools s ON l.school_id = s.school_id
                ORDER BY l.created_at DESC
                LIMIT %s OFFSET %s
            """, (limit, offset))
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                r["log_id"] = int(r["log_id"])
                if r.get("school_id"):
                    r["school_id"] = str(r["school_id"])
                if r.get("version_id"):
                    r["version_id"] = str(r["version_id"])
                if r.get("run_id"):
                    r["run_id"] = str(r["run_id"])
                if r.get("correlation_id"):
                    r["correlation_id"] = str(r["correlation_id"])
                if r.get("elapsed_sec") is not None:
                    r["elapsed_sec"] = float(r["elapsed_sec"])
                if r.get("created_at"):
                    r["created_at"] = r["created_at"].isoformat()
            return rows


def log_school_scrape(
    school_id: str | None,
    phase: str,
    status: str,
    version_id: str | None = None,
    run_id: str | None = None,
    correlation_id: str | None = None,
    page_scraped: str | None = None,
    elapsed_sec: float | None = None,
    ai_model: str | None = None,
    ai_reasoning: str | None = None,
    error_message: str | None = None,
    dsn: str | None = None,
) -> int | None:
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        return None
    valid_statuses = {'ok', 'no_tuition_found', 'nav_failed', 'blocked', 'timeout', 'error'}
    status_val = status if status in valid_statuses else ('ok' if status in ('success', 'passed') else 'error')

    try:
        with db_connect(target_dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO school_data.school_scrape_log
                        (school_id, version_id, run_id, correlation_id, phase, status,
                         page_scraped, elapsed_sec, ai_model, ai_reasoning, error_message, created_at)
                    VALUES ((SELECT school_id FROM school_data.schools WHERE school_id::text = %s OR opec_school_code = %s),
                            %s, %s::uuid, %s::uuid, %s, %s::school_data.scrape_status,
                            %s, %s, %s, %s, %s, NOW())
                    RETURNING log_id
                """, (
                    str(school_id) if school_id else None, str(school_id) if school_id else None,
                    version_id,
                    run_id or str(uuid.uuid4()),
                    correlation_id or str(uuid.uuid4()),
                    phase,
                    status_val,
                    page_scraped or "",
                    elapsed_sec or 0.0,
                    ai_model or "gemini-flash-lite-latest",
                    ai_reasoning or "",
                    error_message or None,
                ))
                conn.commit()
                row = cur.fetchone()
                return int(row["log_id"]) if row else None
    except Exception as e:
        print("[log_school_scrape error]", e)
        return None
