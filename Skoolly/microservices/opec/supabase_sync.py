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
import sys
import time
import unicodedata
import uuid
from collections import Counter
from pathlib import Path
from typing import Callable, Any, Optional

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
    ("BRITISH", r"สหราชอาณาจักร|ประเทศอังกฤษ|อังกฤษ|เวลส์|England|Wales|\bUK\b|British"
                                r"|IGCSE|GCSE|AS\s*(&|and)?\s*A\s*Level|A[\s-]?Level|Cambridge|เคมบริดจ์|แคมบริ"
                                r"|Oxford|Early\s*Years?\s*Foundation|EYFS|Edexcel|BTEC|Pearson|Key\s*Stage"
                                r"|English\s*National\s*Curric|\bENC\b|Wellington|เวลลิงตัน|AICE|St\s*Andrews"),
    ("AMERICAN", r"สหรัฐอเมริกา|สหรัฐอเมริก|อเมริกัน|อเมริกา|แคลิฟอร์เนีย|แมสซาชูเซตส์|มิสซิสซิปปี"
                                r"|เวอร์จีเนีย|เพนซิลเวเนีย|Pennsylvania|นิวเจอร์ซีย์|New\s*Jersey|อะลาบามา"
                                r"|American|California|\bCDE\b|Massachusetts|\bAERO\b|High\s*School\s*Diploma"
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
                                           r"|HighScope|Creative\s*Curriculum|Child-Centered|ASDAN|Early\s*child"
                                           r"|Early\s*Years\s*Development|ปฐมวัย|A\s*Child\'s\s*World"
                                           r"|Kindergarten\s*Curriculum"),
    ("THAI_MOE", r"วัฒนธรรมไทย|ประวัติศาสตร์ไทย|แกนกลางการศึกษาขั้นพื้นฐาน|ภาษาไทย"),
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
                ping_res = cur.fetchone()

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

    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    if not SCHEMA_FILE.exists():
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_FILE}")

    sql_content = SCHEMA_FILE.read_text(encoding="utf-8")

    with db_connect(target_dsn, connect_timeout=15) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql_content)

    return {"status": "success", "message": "Database schema created and initialized successfully"}


def match_curriculums(raw: str) -> set[str]:
    """Every canonical code whose keywords appear in this free-text value."""
    return {code for code, pattern in COMPILED_PATTERNS if pattern.search(raw)}


def slugify(name_en: str | None, name_th: str, opec_code: str) -> str:
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
            cur.execute("SELECT slug FROM school_data.schools")
            used_slugs = {r["slug"] for r in cur.fetchall()}

            for idx, record in enumerate(records, 1):
                opec_code = clean(record.get("school_code"))
                name_th = clean(record.get("school_name_th"))
                if not opec_code or not name_th:
                    continue

                name_en = clean(record.get("school_name_en"))
                # Only used when the row is new: ON CONFLICT leaves an existing slug alone
                slug = free_slug(slugify(name_en, name_th, opec_code), opec_code, used_slugs)
                used_slugs.add(slug)

                lat = to_float(record.get("latitude"))
                lng = to_float(record.get("longitude"))

                # 1. Derive curriculums (Normalized into 17 high-level groups, minimizing other)
                codes = set()
                for raw in record.get("curriculums") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    derived = match_curriculums(raw)
                    if derived:
                        codes |= derived
                        auto_mapped[raw] = sorted(derived)
                    else:
                        unmapped_curriculums[raw] += 1
                        codes.add("SCHOOL_SPECIFIC")
                if not codes:
                    codes.add("SCHOOL_SPECIFIC")

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

                curriculums_list = sorted(list(codes))
                levels_offered_list = sorted(list(level_codes))

                # 3. Upsert school record (with curriculums, levels_offered, admins, and support info)
                cur.execute(
                    """
                    INSERT INTO school_data.schools (
                        opec_school_code, slug, name_th, name_en,
                        official_website_url, website_source, opec_profile_url,
                        official_phone, official_mobile, official_email,
                        social_links,
                        province, district, subdistrict, address,
                        geom, gps_precision, gps_source,
                        logo_url, level_range, levels_offered, curriculums,
                        student_count, teacher_count,
                        licensee_name, director_name, manager_name, government_support
                    ) VALUES (
                        %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                        %(website)s, %(website_source)s, %(profile_url)s,
                        %(phone)s, %(mobile)s, %(email)s,
                        %(social_links)s::jsonb,
                        %(province)s, %(district)s, %(subdistrict)s, %(address)s,
                        CASE WHEN %(lng)s::double precision IS NULL OR %(lat)s::double precision IS NULL THEN NULL
                             ELSE st_setsrid(st_makepoint(%(lng)s::double precision, %(lat)s::double precision), 4326)::geography END,
                        %(gps_precision)s, %(gps_source)s,
                        %(logo)s, %(level_range)s, %(levels_offered)s, %(curriculums)s,
                        %(students)s, %(teachers)s,
                        %(licensee_name)s, %(director_name)s, %(manager_name)s, %(government_support)s
                    )
                    ON CONFLICT (opec_school_code) DO UPDATE SET
                        name_th = EXCLUDED.name_th,
                        name_en = EXCLUDED.name_en,
                        official_website_url = COALESCE(school_data.schools.official_website_url, EXCLUDED.official_website_url),
                        website_source = COALESCE(school_data.schools.website_source, EXCLUDED.website_source),
                        opec_profile_url = EXCLUDED.opec_profile_url,
                        official_phone = EXCLUDED.official_phone,
                        official_mobile = EXCLUDED.official_mobile,
                        official_email = EXCLUDED.official_email,
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
                        curriculums = EXCLUDED.curriculums,
                        student_count = EXCLUDED.student_count,
                        teacher_count = EXCLUDED.teacher_count,
                        licensee_name = EXCLUDED.licensee_name,
                        director_name = EXCLUDED.director_name,
                        manager_name = EXCLUDED.manager_name,
                        government_support = EXCLUDED.government_support,
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
                        "email": clean(record.get("email")),
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
                        "government_support": clean(record.get("government_support")),
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
    dsn: str | None = None,
) -> dict[str, Any]:
    """Queries school records directly from Supabase database with filters and KPIs."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    # โรงเรียนที่ถูกนำออก (archived) ไม่แสดงในรายการ — ข้อมูลยังอยู่ในฐานข้อมูล
    where_clauses = ["status <> 'archived'"]
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

    where_str = " AND ".join(where_clauses)

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Overall KPIs
            cur.execute("""
                SELECT 
                    count(*) as total_schools,
                    count(distinct province) as total_provinces,
                    coalesce(sum(student_count), 0) as total_students,
                    count(case when official_website_url is not null and official_website_url != '' then 1 end) as with_website
                FROM school_data.schools
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

            # Dynamically inspect available columns in school_data.schools to prevent UndefinedColumn crashes
            cur.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = 'school_data' AND table_name = 'schools'"
            )
            existing_cols = {r["column_name"] for r in cur.fetchall()}

            def c(col_name: str) -> str:
                return col_name if col_name in existing_cols else f"NULL as {col_name}"

            lat_expr = "st_y(geom::geometry) as latitude" if "geom" in existing_cols else "NULL as latitude"
            lng_expr = "st_x(geom::geometry) as longitude" if "geom" in existing_cols else "NULL as longitude"

            # Query list with lat/lng extracted from geom safely
            query = f"""
                SELECT 
                    {c('school_id')},
                    {c('opec_school_code')},
                    {c('slug')},
                    {c('name_th')},
                    {c('name_en')},
                    {c('status')},
                    {c('official_website_url')},
                    {c('website_source')},
                    {c('opec_profile_url')},
                    {c('official_phone')},
                    {c('official_mobile')},
                    {c('official_email')},
                    {c('social_links')},
                    {c('facebook_url')},
                    {c('line_id')},
                    {c('instagram_url')},
                    {c('youtube_url')},
                    {c('province')},
                    {c('district')},
                    {c('subdistrict')},
                    {c('address')},
                    {lat_expr},
                    {lng_expr},
                    {c('gps_precision')},
                    {c('gps_source')},
                    {c('logo_url')},
                    {c('level_range')},
                    {c('levels_offered')},
                    {c('curriculums')},
                    {c('student_count')},
                    {c('teacher_count')},
                    {c('licensee_name')},
                    {c('director_name')},
                    {c('manager_name')},
                    {c('government_support')},
                    {c('pub_tuition_min_thb')},
                    {c('pub_tuition_max_thb')},
                    {c('pub_has_safeguarding_policy')},
                    {c('pub_data_updated_at')},
                    {c('rating_avg')},
                    {c('review_count')},
                    {c('is_isat_member')},
                    {c('is_boarding')},
                    {c('year_established')},
                    {c('accreditations')},
                    {c('isat_school_name')},
                    {c('created_at')},
                    {c('updated_at')}
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
                if item.get("rating_avg") is not None:
                    item["rating_avg"] = float(item["rating_avg"])
                if item.get("pub_data_updated_at"):
                    item["pub_data_updated_at"] = item["pub_data_updated_at"].isoformat()
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
                item["email"] = item.get("official_email") or ""
                expand_social_links(item)
                item["school_logo_url"] = item.get("logo_url") or ""
                expand_vocab(item)
                item["student_count"] = item.get("student_count") or 0
                item["teacher_count"] = item.get("teacher_count") or 0
                item["fetched_at"] = item.get("created_at") or ""
                item["last_updated"] = item.get("updated_at") or item.get("created_at") or ""
                serialized_rows.append(item)

            return {
                "schools": serialized_rows,
                "total": filtered_count,
                "kpis": kpis,
            }


def clear_supabase_data(dsn: str | None = None) -> dict[str, Any]:
    """⚠️ ล้างข้อมูลโรงเรียนทั้งหมด — เครื่องมือรีเซ็ตสำหรับการทดสอบเท่านั้น

    ต่างจาก delete_supabase_school() ที่เป็น soft delete ตาม UC-11 Business Rule —
    ฟังก์ชันนี้ลบจริงและ cascade ไปทุกตารางลูก ใช้เฉพาะตอนต้องการ re-import
    ชุดข้อมูล OPEC ใหม่ทั้งหมด ห้ามเรียกจากหน้าใช้งานปกติ
    """
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, autocommit=True) as conn:
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


def insert_supabase_school(data: dict[str, Any], dsn: str | None = None) -> dict[str, Any]:
    """Inserts a new school record directly into Supabase."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    name_th = clean(data.get("name_th"))
    if not name_th:
        raise ValueError("ชื่อโรงเรียน (ภาษาไทย) เป็นข้อมูลจำเป็น")
    name_en = clean(data.get("name_en"))
    province = clean(data.get("province")) or "กรุงเทพมหานคร"
    opec_code = clean(data.get("opec_school_code"))
    slug = clean(data.get("slug")) or slugify(name_en, name_th, opec_code or str(int(time.time())))

    lat = to_float(data.get("latitude"))
    lng = to_float(data.get("longitude"))

    curriculums = data.get("curriculums") or []
    if isinstance(curriculums, str):
        curriculums = [c.strip() for c in curriculums.split(",") if c.strip()]
    levels_offered = data.get("levels_offered") or []
    if isinstance(levels_offered, str):
        levels_offered = [l.strip() for l in levels_offered.split(",") if l.strip()]

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO school_data.schools (
                    opec_school_code, slug, name_th, name_en,
                    official_website_url, website_source,
                    official_phone, official_mobile, official_email,
                    social_links,
                    province, district, subdistrict, address,
                    geom, gps_precision, gps_source,
                    logo_url, level_range, levels_offered, curriculums,
                    student_count, teacher_count
                ) VALUES (
                    %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                    %(website)s, %(website_source)s,
                    %(phone)s, %(mobile)s, %(email)s,
                    %(social_links)s::jsonb,
                    %(province)s, %(district)s, %(subdistrict)s, %(address)s,
                    CASE WHEN %(lng)s::double precision IS NULL OR %(lat)s::double precision IS NULL THEN NULL
                         ELSE st_setsrid(st_makepoint(%(lng)s::double precision, %(lat)s::double precision), 4326)::geography END,
                    %(gps_precision)s, %(gps_source)s,
                    %(logo)s, %(level_range)s, %(levels_offered)s, %(curriculums)s,
                    %(students)s, %(teachers)s
                )
                RETURNING school_id
                """,
                {
                    "opec_code": opec_code,
                    "slug": slug,
                    "name_th": name_th,
                    "name_en": name_en,
                    "website": clean(data.get("official_website_url")),
                    "website_source": clean(data.get("website_source")) or "Admin Input",
                    "phone": clean(data.get("official_phone")),
                    "mobile": clean(data.get("official_mobile")),
                    "email": clean(data.get("official_email")),
                    "social_links": social_links_json(
                        clean(data.get("facebook_url")),
                        clean(data.get("line_id")),
                        clean(data.get("instagram_url")),
                        clean(data.get("youtube_url")),
                    ),
                    "province": province,
                    "district": clean(data.get("district")),
                    "subdistrict": clean(data.get("subdistrict")),
                    "address": clean(data.get("address")),
                    "lat": lat,
                    "lng": lng,
                    "gps_precision": clean(data.get("gps_precision")) or "Approximate",
                    "gps_source": clean(data.get("gps_source")) or "Manual",
                    "logo": clean(data.get("logo_url")),
                    "level_range": clean(data.get("level_range")),
                    "levels_offered": levels_offered,
                    "curriculums": curriculums,
                    "students": to_int(data.get("student_count")),
                    "teachers": to_int(data.get("teacher_count")),
                },
            )
            school_id = str(cur.fetchone()["school_id"])
            conn.commit()

    return {"status": "created", "school_id": school_id, "name_th": name_th}


def update_supabase_school(school_id: str, data: dict[str, Any], dsn: str | None = None) -> dict[str, Any]:
    """Updates an existing school record in Supabase."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    lat = to_float(data.get("latitude"))
    lng = to_float(data.get("longitude"))

    curriculums = data.get("curriculums")
    if isinstance(curriculums, str):
        curriculums = [c.strip() for c in curriculums.split(",") if c.strip()]
    levels_offered = data.get("levels_offered")
    if isinstance(levels_offered, str):
        levels_offered = [l.strip() for l in levels_offered.split(",") if l.strip()]

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE school_data.schools SET
                    name_th = COALESCE(%(name_th)s, name_th),
                    name_en = COALESCE(%(name_en)s, name_en),
                    official_website_url = COALESCE(%(website)s, official_website_url),
                    website_source = COALESCE(%(website_source)s, website_source),
                    official_phone = COALESCE(%(phone)s, official_phone),
                    official_mobile = COALESCE(%(mobile)s, official_mobile),
                    official_email = COALESCE(%(email)s, official_email),
                    social_links = social_links || %(social_links)s::jsonb,
                    province = COALESCE(%(province)s, province),
                    district = COALESCE(%(district)s, district),
                    subdistrict = COALESCE(%(subdistrict)s, subdistrict),
                    address = COALESCE(%(address)s, address),
                    geom = CASE 
                        WHEN %(lng)s IS NOT NULL AND %(lat)s IS NOT NULL 
                        THEN st_setsrid(st_makepoint(%(lng)s, %(lat)s), 4326)::geography 
                        ELSE geom END,
                    logo_url = COALESCE(%(logo)s, logo_url),
                    level_range = COALESCE(%(level_range)s, level_range),
                    levels_offered = COALESCE(%(levels_offered)s, levels_offered),
                    curriculums = COALESCE(%(curriculums)s, curriculums),
                    student_count = COALESCE(%(students)s, student_count),
                    teacher_count = COALESCE(%(teachers)s, teacher_count),
                    updated_at = NOW()
                WHERE school_id = %(school_id)s
                RETURNING school_id, name_th
                """,
                {
                    "school_id": school_id,
                    "name_th": clean(data.get("name_th")),
                    "name_en": clean(data.get("name_en")),
                    "website": clean(data.get("official_website_url")),
                    "website_source": clean(data.get("website_source")),
                    "phone": clean(data.get("official_phone")),
                    "mobile": clean(data.get("official_mobile")),
                    "email": clean(data.get("official_email")),
                    "social_links": social_links_json(
                        clean(data.get("facebook_url")),
                        clean(data.get("line_id")),
                        clean(data.get("instagram_url")),
                        clean(data.get("youtube_url")),
                    ),
                    "province": clean(data.get("province")),
                    "district": clean(data.get("district")),
                    "subdistrict": clean(data.get("subdistrict")),
                    "address": clean(data.get("address")),
                    "lat": lat,
                    "lng": lng,
                    "logo": clean(data.get("logo_url")),
                    "level_range": clean(data.get("level_range")),
                    "levels_offered": levels_offered,
                    "curriculums": curriculums,
                    "students": to_int(data.get("student_count")),
                    "teachers": to_int(data.get("teacher_count")),
                },
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("ไม่พบโรงเรียนที่ต้องการแก้ไข")
            conn.commit()

    return {"status": "updated", "school_id": str(row["school_id"]), "name_th": row["name_th"]}


def delete_supabase_school(school_id: str, dsn: str | None = None) -> dict[str, Any]:
    """Archives a school (soft delete) — ไม่ลบแถวจริง

    UC-11 Business Rule: "ห้าม hard delete ข้อมูลโรงเรียนเด็ดขาด ใช้ Archived status แทนเสมอ"
    เดิมฟังก์ชันนี้ DELETE จริง ซึ่งจะ cascade ลบ school_versions / version_fees /
    version_extra_fees / version_safety / school_google_reviews ทิ้งทั้งหมด และทำให้
    favorites / comparison_sets ของผู้ใช้ (ที่อ้าง school_id แบบ logical ไม่มี FK)
    ชี้ไปยังแถวที่ไม่มีอยู่จริง — โรงเรียนที่ archived จะหายจากรายการของ Admin
    และจากผลค้นหา (UC-01) เหมือนเดิม แต่ลิงก์เก่ายังเปิดดูได้ตาม UC-02 E1b
    """
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE school_data.schools
                   SET status = 'archived', updated_at = now()
                 WHERE school_id = %s AND status <> 'archived'
                RETURNING school_id, name_th
                """,
                (school_id,)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("ไม่พบโรงเรียนที่ต้องการลบ หรือถูกนำออกไปแล้ว")
            conn.commit()

    return {"status": "deleted", "school_id": str(row["school_id"]), "name_th": row["name_th"]}


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
                slug = free_slug(slugify(target_en, r["name_th"] or "", code), code, taken)
                taken.add(slug)
                updates.append({"en": target_en, "slug": slug, "code": code})

        if updates:
            with db_connect(target_dsn) as conn:
                with conn.cursor() as cur:
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
        if web:
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
                    for params in updates:
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET official_website_url = %(web)s,
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


def sync_single_school_to_supabase(school: dict) -> bool:
    """Synchronizes a single school's updated fields (name_en, website, GPS) to Supabase."""
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return False
    code = str(school.get("school_code") or school.get("opec_school_code") or "").strip()
    if not code:
        return False
    try:
        with db_connect(target_dsn) as conn:
            with conn.cursor() as cur:
                name_en = clean(school.get("school_name_en") or school.get("name_en"))
                name_th = clean(school.get("school_name_th") or school.get("name_th"))
                cur.execute("SELECT name_en FROM school_data.schools WHERE opec_school_code = %s", (code,))
                row = cur.fetchone()
                if not row:
                    return False
                # A new English name gets a new slug, one no other school holds
                slug_val = None
                if name_en and name_en != (row[0] or ""):
                    base = slugify(name_en, name_th or "", code)
                    cur.execute("SELECT slug FROM school_data.schools WHERE slug LIKE %s AND opec_school_code <> %s",
                                (base + "%", code))
                    slug_val = free_slug(base, code, {r[0] for r in cur.fetchall()})
                web = clean(school.get("website") or school.get("official_website_url"))
                src = clean(school.get("website_source"))
                lat = school.get("latitude") or school.get("lat")
                lng = school.get("longitude") or school.get("lng")
                lat_f = float(lat) if lat not in (None, "") else None
                lng_f = float(lng) if lng not in (None, "") else None
                precision = clean(school.get("gps_precision"))
                gps_source = clean(school.get("gps_source"))
                cur.execute(
                    """
                    UPDATE school_data.schools
                    SET name_en = COALESCE(%(name_en)s, name_en),
                        slug = COALESCE(%(slug)s, slug),
                        official_website_url = COALESCE(%(web)s, official_website_url),
                        website_source = COALESCE(%(src)s, website_source),
                        geom = CASE WHEN %(lat)s::double precision IS NOT NULL AND %(lng)s::double precision IS NOT NULL
                                    THEN st_setsrid(st_makepoint(%(lng)s::double precision, %(lat)s::double precision), 4326)::geography
                                    WHEN %(precision)s = 'None' THEN NULL
                                    ELSE geom END,
                        gps_precision = COALESCE(%(precision)s, gps_precision),
                        gps_source = COALESCE(%(gps_source)s, gps_source),
                        updated_at = NOW()
                    WHERE opec_school_code = %(code)s
                    """,
                    {
                        "name_en": name_en,
                        "slug": slug_val,
                        "web": web,
                        "src": src,
                        "lat": lat_f,
                        "lng": lng_f,
                        "precision": precision,
                        "gps_source": gps_source,
                        "code": code,
                    }
                )
                conn.commit()
                return True
    except Exception as e:
        print("[Supabase Sync Single School Error]", e)
        return False


def fetch_pending_versions(dsn: str | None = None) -> list[dict[str, Any]]:
    """
    Fetches all school versions that are pending admin review (UC-A04 Diff View).
    Includes related school info, version fees, extra fees, safety policies,
    curriculums, general info, facilities, and previous published version data.
    """
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, row_factory=dict_row) as conn:
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
                    s.pub_data_updated_at as current_pub_data_updated_at
                FROM school_data.school_versions v
                JOIN school_data.schools s ON v.school_id = s.school_id
                WHERE v.status = 'pending_review'
                ORDER BY v.submitted_at DESC
            """)
            versions = [dict(r) for r in cur.fetchall()]

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
                snapshot = v.get("data_snapshot") or {}
                if isinstance(snapshot, str):
                    try:
                        snapshot = json.loads(snapshot)
                    except Exception:
                        snapshot = {}
                v["scraped_curriculums"] = snapshot.get("curriculums") or ([snapshot.get("curriculum")] if snapshot.get("curriculum") else [])
                v["scraped_general_info"] = snapshot.get("general_info") or {}
                v["scraped_facilities"] = snapshot.get("facilities") or []

                # 1. Fetch version fees
                cur.execute("""
                    SELECT fee_id, grade_label, level_code, annual_thb, semester_thb, currency, notes
                    FROM school_data.version_fees
                    WHERE version_id = %s
                    ORDER BY grade_label ASC
                """, (vid,))
                v["fees"] = [
                    {
                        "fee_id": str(f["fee_id"]),
                        "grade_label": f["grade_label"],
                        "level_code": f.get("level_code"),
                        "annual_thb": float(f["annual_thb"]) if f.get("annual_thb") is not None else None,
                        "semester_thb": float(f["semester_thb"]) if f.get("semester_thb") is not None else None,
                        "currency": f.get("currency") or "THB",
                        "notes": f.get("notes"),
                    }
                    for f in cur.fetchall()
                ]

                # 2. Fetch version extra fees (hidden costs)
                cur.execute("""
                    SELECT extra_fee_id, name, amount_thb, frequency, notes
                    FROM school_data.version_extra_fees
                    WHERE version_id = %s
                    ORDER BY name ASC
                """, (vid,))
                v["extra_fees"] = [
                    {
                        "extra_fee_id": str(ef["extra_fee_id"]),
                        "name": ef["name"],
                        "amount_thb": float(ef["amount_thb"]) if ef.get("amount_thb") is not None else None,
                        "frequency": ef.get("frequency") or "unknown",
                        "notes": ef.get("notes"),
                    }
                    for ef in cur.fetchall()
                ]

                # 3. Fetch version safety
                cur.execute("""
                    SELECT security_guards, cctv_monitoring, nurse_medical_clinic, 
                           child_safeguarding_policy, air_quality_pm25_protocol, visitor_access_control,
                           highlights, policy_summary, policy_url
                    FROM school_data.version_safety
                    WHERE version_id = %s
                """, (vid,))
                safety_row = cur.fetchone()
                v["safety"] = dict(safety_row) if safety_row else None

                # 4. Fetch previous version fees, safety, and snapshot for side-by-side comparison (ก่อน vs หลัง)
                prev_vid = v.get("current_published_version_id")
                if prev_vid:
                    cur.execute("""
                        SELECT fee_id, grade_label, level_code, annual_thb, semester_thb, currency, notes
                        FROM school_data.version_fees
                        WHERE version_id = %s
                        ORDER BY grade_label ASC
                    """, (prev_vid,))
                    v["previous_fees"] = [
                        {
                            "fee_id": str(f["fee_id"]),
                            "grade_label": f["grade_label"],
                            "level_code": f.get("level_code"),
                            "annual_thb": float(f["annual_thb"]) if f.get("annual_thb") is not None else None,
                            "semester_thb": float(f["semester_thb"]) if f.get("semester_thb") is not None else None,
                            "currency": f.get("currency") or "THB",
                            "notes": f.get("notes"),
                        }
                        for f in cur.fetchall()
                    ]

                    # Fetch previous safety
                    cur.execute("""
                        SELECT security_guards, cctv_monitoring, nurse_medical_clinic, 
                               child_safeguarding_policy, air_quality_pm25_protocol, visitor_access_control,
                               highlights, policy_summary, policy_url
                        FROM school_data.version_safety
                        WHERE version_id = %s
                    """, (prev_vid,))
                    prev_saf = cur.fetchone()
                    v["previous_safety"] = dict(prev_saf) if prev_saf else None

                    # Fetch previous snapshot (curriculums, facilities, general_info, submission date)
                    cur.execute("""
                        SELECT data_snapshot, submitted_at, created_at
                        FROM school_data.school_versions
                        WHERE version_id = %s
                    """, (prev_vid,))
                    prev_ver = cur.fetchone()
                    if prev_ver:
                        p_snap = prev_ver.get("data_snapshot") or {}
                        if isinstance(p_snap, str):
                            try:
                                p_snap = json.loads(p_snap)
                            except Exception:
                                p_snap = {}
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

            return versions


def approve_school_version(version_id: str, reviewed_by: str | None = None, dsn: str | None = None) -> dict[str, Any]:
    """
    Approves a pending version and publishes it (UC-A04 Step 4).
    1. Updates target version status to 'published'
    2. Supersedes any previous published version
    3. Projects published tuition min/max and safeguarding policy to school_data.schools
    4. Records approval in school_data.school_scrape_log
    """
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT version_id, school_id, status, version_number, data_snapshot
                FROM school_data.school_versions 
                WHERE version_id = %s
            """, (version_id,))
            ver = cur.fetchone()
            if not ver:
                raise ValueError("ไม่พบเวอร์ชันที่ต้องการอนุมัติ")

            school_id = ver["school_id"]

            cur.execute("""
                SELECT 
                    MIN(COALESCE(annual_thb, semester_thb * 2)) as min_tuition,
                    MAX(COALESCE(annual_thb, semester_thb * 2)) as max_tuition
                FROM school_data.version_fees
                WHERE version_id = %s AND (annual_thb > 0 OR semester_thb > 0)
            """, (version_id,))
            fees_calc = cur.fetchone() or {"min_tuition": None, "max_tuition": None}
            min_tuition = fees_calc.get("min_tuition")
            max_tuition = fees_calc.get("max_tuition")

            cur.execute("""
                SELECT child_safeguarding_policy 
                FROM school_data.version_safety 
                WHERE version_id = %s
            """, (version_id,))
            safety_row = cur.fetchone()
            has_safeguarding = safety_row.get("child_safeguarding_policy") if safety_row else None

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

            # Extract snapshot fields to update on school if available
            snapshot = ver.get("data_snapshot") or {}
            if isinstance(snapshot, str):
                try:
                    snapshot = json.loads(snapshot)
                except Exception:
                    snapshot = {}
            new_curriculums = snapshot.get("curriculums")

            # Project to main schools table
            cur.execute("""
                UPDATE school_data.schools
                SET current_published_version_id = %s,
                    pub_tuition_min_thb = %s,
                    pub_tuition_max_thb = %s,
                    pub_has_safeguarding_policy = %s,
                    curriculums = COALESCE(%s, curriculums),
                    pub_data_updated_at = NOW(),
                    updated_at = NOW()
                WHERE school_id = %s
            """, (version_id, min_tuition, max_tuition, has_safeguarding, new_curriculums, school_id))

            # Log approval in school_data.school_scrape_log
            cur.execute("""
                INSERT INTO school_data.school_scrape_log
                    (school_id, version_id, run_id, phase, status, ai_reasoning, created_at)
                VALUES (%s, %s, gen_random_uuid(), 'extract', 'ok'::school_data.scrape_status, 'Admin approved and published draft to live database', NOW())
            """, (school_id, version_id))

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
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE school_data.school_versions
                SET status = 'rejected',
                    rejection_reason = %s,
                    reviewed_at = NOW()
                WHERE version_id = %s
            """, (reason or "ไม่ผ่านเกณฑ์การตรวจสอบของแอดมิน", version_id))
            conn.commit()

    return {
        "status": "success",
        "action": "rejected",
        "version_id": str(version_id),
    }


def save_scraped_draft_version(school_id: str, result_data: dict[str, Any], dsn: str | None = None) -> dict[str, Any]:
    """
    Saves new scraped data as a draft version in school_data.school_versions
    with status 'pending_review' (preserving versioning history & auditability).

    `school_id` may be the schools.school_id uuid or the OPEC school code: the admin
    table only carries the code.
    """
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT school_id FROM school_data.schools WHERE school_id::text = %s OR opec_school_code = %s LIMIT 1",
                (str(school_id), str(school_id)),
            )
            found = cur.fetchone()
            if not found:
                raise ValueError(f"ไม่พบโรงเรียนรหัส {school_id} ใน Supabase")
            school_id = found["school_id"]

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
                "per_term": "per_term", "termly": "per_term", "ต่อเทอม": "per_term", "รายภาค": "per_term",
                "per_month": "per_month", "monthly": "per_month", "ต่อเดือน": "per_month", "รายเดือน": "per_month",
                "conditional": "conditional", "optional": "conditional", "ทางเลือก": "conditional"
            }
            for hc in hidden_costs:
                name = clean(hc.get("name")) or clean(hc.get("fee_name"))
                if not name:
                    continue
                amount = to_float(hc.get("amount_thb"))
                raw_freq = (clean(hc.get("frequency")) or "unknown").lower()
                freq = freq_map.get(raw_freq, "unknown")
                notes = clean(hc.get("notes"))
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
                    VALUES (%s, %s, %s::uuid, %s::uuid, %s, %s::school_data.scrape_status,
                            %s, %s, %s, %s, %s, NOW())
                    RETURNING log_id
                """, (
                    school_id,
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
