"""
Supabase Database Synchronization Engine for OPEC Schools Data.

Handles:
1. Connection testing and status reporting.
2. Saving DATABASE_URL to .env.
3. Automated Schema initialization (running db/schema.sql).
4. Upserting OPEC school records into Postgres (school_data.schools, school_data.school_curriculums, etc.)
   with live progress reporting.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata
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
    ("สหราชอาณาจักร (British)", r"สหราชอาณาจักร|ประเทศอังกฤษ|อังกฤษ|เวลส์|England|Wales|\bUK\b|British"
                                r"|IGCSE|GCSE|AS\s*(&|and)?\s*A\s*Level|A[\s-]?Level|Cambridge|เคมบริดจ์|แคมบริ"
                                r"|Oxford|Early\s*Years?\s*Foundation|EYFS|Edexcel|BTEC|Pearson|Key\s*Stage"
                                r"|English\s*National\s*Curric|\bENC\b|Wellington|เวลลิงตัน|AICE|St\s*Andrews"),
    ("สหรัฐอเมริกา (American)", r"สหรัฐอเมริกา|สหรัฐอเมริก|อเมริกัน|อเมริกา|แคลิฟอร์เนีย|แมสซาชูเซตส์|มิสซิสซิปปี"
                                r"|เวอร์จีเนีย|เพนซิลเวเนีย|Pennsylvania|นิวเจอร์ซีย์|New\s*Jersey|อะลาบามา"
                                r"|American|California|\bCDE\b|Massachusetts|\bAERO\b|High\s*School\s*Diploma"
                                r"|Common\s*Core|\bCCSS\b|Advanced\s*Placement|\bAP\b|\bU\.?S\.?\b"
                                r"|District\s*of\s*Columbia|Chicago|Accelerated\s*Christian|School\s*of\s*Tomorrow"
                                r"|\bWASC\b|BASIS|North\s*American\s*Division|\bNAD\b|Carson|Calvert|High\s*Reach"
                                r"|ริเวอร์ไซด์|แอ๊ดเวนตีส|เอกมัย|ประชาคมนานาชาติ"),
    ("นานาชาติ IB (International Baccalaureate)", r"International\s*Baccalaureate|\bIB\b|\bIBDP\b|\bPYP\b|\bMYP\b"
                                                 r"|\bIB-CP\b|Diploma\s*Programme|\bIBO\b|Reignwood|เคไอเอส|KIS"),
    ("สิงคโปร์ (Singapore)", r"สิงคโปร์|สิงค์โปร์|Singapore|Nurturing\s*Early\s*Learners|SISB|แองโกล"
                             r"|Pre-School\s*Education\s*Unit|Primary\s*School\s*Curriculum"
                             r"|National\s*Curriculum\s*for\s*Primary\s*School"),
    ("ออสเตรเลีย (Australian)", r"ออสเตรเลีย|Australia|\bACARA\b|Western\s*Australian"),
    ("แคนาดา (Canadian)", r"แคนาดา|แคนนาดา|Canad|บริติชโคลัมเบีย|British\s*Columbia|Ontario|Quebec"),
    ("ฝรั่งเศส (French)", r"ฝรั่งเศส|French|France|Lyc[eé]e"),
    ("เยอรมัน (German)", r"เยอรมัน|German|ทูริงเง่น|Thuringia"),
    ("ญี่ปุ่น (Japanese)", r"ญี่ปุ่น|Japan|Culture,\s*Sports,\s*Science\s*and\s*Technology"),
    ("จีน (Chinese)", r"จีน|Chinese|Mandarin|แมนดาริน"),
    ("เกาหลี (Korean)", r"เกาหลี|Korea"),
    ("อินเดีย (Indian)", r"อินเดีย|India|\bCBSE\b|ซิลเวอร์ไลน์|Central\s*Board\s*of\s*Secondary"),
    ("มอนเตสซอรี (Montessori)", r"Montessori|มอนเตสซอรี|มอนเทสซอรี่|Hershey"),
    ("ฟินแลนด์ (Finnish)", r"Finish|Finnish|FGES"),
    ("ปฐมวัยสากล (Early Childhood / IPC)", r"International\s*Preschool|International\s*Primary|\bIPC\b|\bIMYC\b"
                                           r"|HighScope|Creative\s*Curriculum|Child-Centered|ASDAN|Early\s*child"
                                           r"|Early\s*Years\s*Development|ปฐมวัย|A\s*Child\'s\s*World"
                                           r"|Kindergarten\s*Curriculum"),
    ("ไทย (กระทรวงศึกษาธิการ)", r"วัฒนธรรมไทย|ประวัติศาสตร์ไทย|แกนกลางการศึกษาขั้นพื้นฐาน|ภาษาไทย"),
    ("หลักสูตรเฉพาะของโรงเรียน", r"หลักสูตรของทางโรงเรียน|หลักสูตรนานาชาติ|หลักสูตรอินเตอร์"
                                  r"|International\s*Curriculum|ประกาศนียบัตรนานาชาติ|ซีสเต็มส์"
                                  r"|ดาเนียล|อริสตา|มัธยมศึกษาตอนปลาย"),
]
COMPILED_PATTERNS = [(code, re.compile(pattern, re.IGNORECASE)) for code, pattern in CURRICULUM_PATTERNS]

# Grade level mapping kept in standard Thai names for 1:1 frontend matching
GRADE_LEVEL_MAP: dict[str, str] = {
    "ก่อนอนุบาล": "ก่อนอนุบาล",
    "เตรียมอนุบาล": "ก่อนอนุบาล",
    "อนุบาล": "อนุบาล",
    "ประถมศึกษา": "ประถมศึกษา",
    "มัธยมศึกษาตอนต้น": "มัธยมศึกษาตอนต้น",
    "มัธยมศึกษาตอนปลาย": "มัธยมศึกษาตอนปลาย",
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


def mask_dsn(dsn: str) -> str:
    """Masks password in connection string for safe UI presentation."""
    if not dsn:
        return ""
    # Matches postgresql://user:password@host:port/dbname
    pattern = r"://([^:]+):([^@]+)@"
    return re.sub(pattern, r"://\1:••••••••@", dsn)


def save_database_url(dsn: str) -> bool:
    """Saves or updates DATABASE_URL in .env file."""
    dsn = dsn.strip()
    os.environ["DATABASE_URL"] = dsn

    lines: list[str] = []
    found = False
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DATABASE_URL="):
                lines.append(f'DATABASE_URL="{dsn}"')
                found = True
            else:
                lines.append(line)

    if not found:
        lines.append(f'DATABASE_URL="{dsn}"')

    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


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
        with psycopg.connect(target_dsn, connect_timeout=5, row_factory=dict_row) as conn:
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

    with psycopg.connect(target_dsn, connect_timeout=15) as conn:
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
) -> dict[str, Any]:
    """
    Imports OPEC records into Supabase Postgres database.
    
    Args:
        dsn: Connection string (falls back to DATABASE_URL in .env)
        records: List of school dictionaries (falls back to data/international_schools_thailand_opec.json)
        publish_initial: Create initial published version 1
        progress_callback: Callback for live progress (task, current, total, log)
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

    total_records = len(records)
    log("เชื่อมต่อสำเร็จ", 5, 100, f"เตรียมนำเข้าข้อมูลโรงเรียน {total_records} แห่ง...")

    # Check and initialize schema if needed
    status_check = test_database_connection(target_dsn)
    if not status_check.get("has_schema"):
        log("กำลังสร้างโครงสร้างตาราง...", 10, 100, "ไม่พบ schema school_data — กำลังรัน db/schema.sql...")
        initialize_schema_on_supabase(target_dsn)
        log("สร้างตารางสำเร็จ", 15, 100, "โครงสร้างตารางและ Lookup Seeds สร้างเสร็จสิ้น")

    inserted = 0
    updated = 0
    unmapped_curriculums: Counter[str] = Counter()
    auto_mapped: dict[str, list[str]] = {}
    unmapped_levels: Counter[str] = Counter()
    used_slugs: set[str] = set()

    with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT slug FROM school_data.schools")
            used_slugs = {r["slug"] for r in cur.fetchall()}

            for idx, record in enumerate(records, 1):
                opec_code = clean(record.get("school_code"))
                name_th = clean(record.get("school_name_th"))
                if not opec_code or not name_th:
                    continue

                name_en = clean(record.get("school_name_en"))
                slug = slugify(name_en, name_th, opec_code)
                if slug in used_slugs:
                    slug = f"{slug}-{opec_code[-4:]}"
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
                        codes.add("หลักสูตรเฉพาะของโรงเรียน")
                if not codes:
                    codes.add("หลักสูตรเฉพาะของโรงเรียน")

                # 2. Derive grade levels (standard Thai names matching modal badges)
                level_codes = set()
                for raw in record.get("levels_offered") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    code = GRADE_LEVEL_MAP.get(raw, raw)
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
                        facebook_url, line_id, instagram_url, youtube_url,
                        province, district, subdistrict, address,
                        geom, gps_precision, gps_source,
                        logo_url, level_range, levels_offered, curriculums,
                        student_count, teacher_count,
                        licensee_name, director_name, manager_name, government_support
                    ) VALUES (
                        %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                        %(website)s, %(website_source)s, %(profile_url)s,
                        %(phone)s, %(mobile)s, %(email)s,
                        %(facebook)s, %(line_id)s, %(instagram)s, %(youtube)s,
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
                        facebook_url = EXCLUDED.facebook_url,
                        line_id = EXCLUDED.line_id,
                        instagram_url = EXCLUDED.instagram_url,
                        youtube_url = EXCLUDED.youtube_url,
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
                        "facebook": clean(record.get("facebook")),
                        "line_id": clean(record.get("line_id")),
                        "instagram": clean(record.get("instagram")),
                        "youtube": clean(record.get("youtube")),
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

                # 4. Initial published version (UC-A02 step 5)
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

            conn.commit()

    log(
        "นำเข้าข้อมูลสู่ Supabase เสร็จสมบูรณ์!",
        100,
        100,
        f"สำเร็จ 100%: เพิ่มโรงเรียนใหม่ {inserted} แห่ง, อัปเดต {updated} แห่ง, รวม {total_records} แห่ง",
    )

    return {
        "status": "success",
        "total": total_records,
        "inserted": inserted,
        "updated": updated,
        "auto_mapped_curriculums": len(auto_mapped),
        "unmapped_curriculums": len(unmapped_curriculums),
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

    where_clauses = ["1=1"]
    params: list[Any] = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        where_clauses.append("(name_th ILIKE %s OR name_en ILIKE %s OR opec_school_code ILIKE %s)")
        params.extend([term, term, term])

    if province and province.strip() and province != "all":
        where_clauses.append("province = %s")
        params.append(province.strip())

    if curriculum and curriculum.strip() and curriculum != "all":
        where_clauses.append("%s = ANY(curriculums)")
        params.append(curriculum.strip().upper())

    if level and level.strip() and level != "all":
        where_clauses.append("%s = ANY(levels_offered)")
        params.append(level.strip())

    where_str = " AND ".join(where_clauses)

    with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
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

            # Query list with lat/lng extracted from geom
            query = f"""
                SELECT 
                    school_id,
                    opec_school_code,
                    slug,
                    name_th,
                    name_en,
                    status,
                    official_website_url,
                    website_source,
                    opec_profile_url,
                    official_phone,
                    official_mobile,
                    official_email,
                    facebook_url,
                    line_id,
                    instagram_url,
                    youtube_url,
                    province,
                    district,
                    subdistrict,
                    address,
                    st_y(geom::geometry) as latitude,
                    st_x(geom::geometry) as longitude,
                    gps_precision,
                    gps_source,
                    logo_url,
                    level_range,
                    levels_offered,
                    curriculums,
                    student_count,
                    teacher_count,
                    licensee_name,
                    director_name,
                    manager_name,
                    government_support,
                    pub_tuition_min_thb,
                    pub_tuition_max_thb,
                    pub_has_safeguarding_policy,
                    pub_data_updated_at,
                    rating_avg,
                    review_count,
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
                if item.get("rating_avg") is not None:
                    item["rating_avg"] = float(item["rating_avg"])
                if item.get("pub_data_updated_at"):
                    item["pub_data_updated_at"] = item["pub_data_updated_at"].isoformat()
                if item.get("updated_at"):
                    item["updated_at"] = item["updated_at"].isoformat()

                # Compatibility fields with OpecSchoolRecord
                item["school_code"] = item.get("opec_school_code") or str(item.get("school_id", ""))
                item["school_name_th"] = item.get("name_th") or ""
                item["school_name_en"] = item.get("name_en") or ""
                item["website"] = item.get("official_website_url") or ""
                item["telephone"] = item.get("official_phone") or ""
                item["mobile"] = item.get("official_mobile") or ""
                item["email"] = item.get("official_email") or ""
                item["facebook"] = item.get("facebook_url") or ""
                item["instagram"] = item.get("instagram_url") or ""
                item["youtube"] = item.get("youtube_url") or ""
                item["school_logo_url"] = item.get("logo_url") or ""
                item["curriculums"] = item.get("curriculums") or []
                item["levels_offered"] = item.get("levels_offered") or []
                item["student_count"] = item.get("student_count") or 0
                item["teacher_count"] = item.get("teacher_count") or 0
                item["last_updated"] = item.get("updated_at") or item.get("created_at") or ""
                serialized_rows.append(item)

            return {
                "schools": serialized_rows,
                "total": filtered_count,
                "kpis": kpis,
            }


def clear_supabase_data(dsn: str | None = None) -> dict[str, Any]:
    """Clears all school records and scrape logs from Supabase for clean testing."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with psycopg.connect(target_dsn, autocommit=True) as conn:
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

    with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO school_data.schools (
                    opec_school_code, slug, name_th, name_en,
                    official_website_url, website_source,
                    official_phone, official_mobile, official_email,
                    facebook_url, line_id, instagram_url, youtube_url,
                    province, district, subdistrict, address,
                    geom, gps_precision, gps_source,
                    logo_url, level_range, levels_offered, curriculums,
                    student_count, teacher_count
                ) VALUES (
                    %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                    %(website)s, %(website_source)s,
                    %(phone)s, %(mobile)s, %(email)s,
                    %(facebook)s, %(line_id)s, %(instagram)s, %(youtube)s,
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
                    "facebook": clean(data.get("facebook_url")),
                    "line_id": clean(data.get("line_id")),
                    "instagram": clean(data.get("instagram_url")),
                    "youtube": clean(data.get("youtube_url")),
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

    with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
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
                    facebook_url = COALESCE(%(facebook)s, facebook_url),
                    line_id = COALESCE(%(line_id)s, line_id),
                    instagram_url = COALESCE(%(instagram)s, instagram_url),
                    youtube_url = COALESCE(%(youtube)s, youtube_url),
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
                    "facebook": clean(data.get("facebook_url")),
                    "line_id": clean(data.get("line_id")),
                    "instagram": clean(data.get("instagram_url")),
                    "youtube": clean(data.get("youtube_url")),
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
    """Deletes a school record from Supabase."""
    target_dsn = dsn or get_current_dsn()
    if not target_dsn:
        raise ValueError("DATABASE_URL is not set")

    with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM school_data.schools WHERE school_id = %s RETURNING school_id, name_th",
                (school_id,)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("ไม่พบโรงเรียนที่ต้องการลบ")
            conn.commit()

    return {"status": "deleted", "school_id": str(row["school_id"]), "name_th": row["name_th"]}


def update_supabase_school_names_en(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes enriched official English names and regenerated slugs to Supabase (school_data.schools).
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0

    if schools is None:
        from data_manager import load_schools
        schools = load_schools() or []

    code_to_en: dict[str, str] = {}
    code_to_th: dict[str, str] = {}
    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "").strip()
        en = str(s.get("school_name_en") or s.get("name_en") or "").strip()
        th = str(s.get("school_name_th") or s.get("name_th") or "").strip()
        if code and en:
            code_to_en[code] = en
            code_to_th[code] = th

    updated_count = 0
    try:
        with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT opec_school_code, name_th, name_en, slug FROM school_data.schools")
                db_schools = cur.fetchall()
                for db_s in db_schools:
                    code = db_s["opec_school_code"]
                    curr_en = (db_s["name_en"] or "").strip()
                    th = db_s["name_th"] or code_to_th.get(code, "")

                    target_en = code_to_en.get(code)
                    if not target_en and not curr_en:
                        try:
                            from enrich_school_names_en import dynamic_resolve_school_en_name
                            target_en = dynamic_resolve_school_en_name({"school_name_th": th, "school_code": code})
                        except Exception:
                            target_en = ""

                    if target_en and target_en != curr_en:
                        new_slug = slugify(target_en, th, code)
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET name_en = %(en)s,
                                slug = %(slug)s,
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            {"en": target_en, "slug": new_slug, "code": code}
                        )
                        updated_count += 1
            conn.commit()
    except Exception as e:
        print("[Supabase Sync] Error updating EN names:", e)
        if update_progress_cb:
            update_progress_cb("เกิดข้อผิดพลาดในการซิงค์ EN สู่ Supabase", 100, 100, f"Supabase error: {e}")

    return updated_count


def update_supabase_school_gps(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes geocoded GPS locations to Supabase (school_data.schools).
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0

    if schools is None:
        from data_manager import load_schools
        schools = load_schools() or []

    code_to_gps: dict[str, tuple[float, float, str, str]] = {}
    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "").strip()
        lat = s.get("latitude") or s.get("lat")
        lng = s.get("longitude") or s.get("lng")
        precision = str(s.get("gps_precision") or "")
        source = str(s.get("gps_source") or "")
        if code and lat and lng:
            try:
                lat_f = float(lat)
                lng_f = float(lng)
                code_to_gps[code] = (lat_f, lng_f, precision, source)
            except (ValueError, TypeError):
                pass

    updated_count = 0
    try:
        with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT opec_school_code FROM school_data.schools")
                db_schools = cur.fetchall()
                for db_s in db_schools:
                    code = db_s["opec_school_code"]
                    if code in code_to_gps:
                        lat_f, lng_f, precision, source = code_to_gps[code]
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET geom = st_setsrid(st_makepoint(%(lng)s, %(lat)s), 4326)::geography,
                                gps_precision = %(precision)s,
                                gps_source = %(source)s,
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            {"lat": lat_f, "lng": lng_f, "precision": precision, "source": source, "code": code}
                        )
                        updated_count += 1
            conn.commit()
    except Exception as e:
        print("[Supabase Sync] Error updating GPS:", e)
        if update_progress_cb:
            update_progress_cb("เกิดข้อผิดพลาดในการซิงค์ GPS สู่ Supabase", 100, 100, f"Supabase error: {e}")

    return updated_count


def update_supabase_school_websites(schools: list[dict] | None = None, update_progress_cb: Optional[Callable] = None) -> int:
    """
    Synchronizes official websites and socials to Supabase (school_data.schools).
    """
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return 0

    if schools is None:
        from data_manager import load_schools
        schools = load_schools() or []

    code_to_web: dict[str, tuple[str, str, str]] = {}
    for s in schools:
        code = str(s.get("school_code") or s.get("opec_school_code") or "").strip()
        web = str(s.get("website") or s.get("official_website_url") or "").strip()
        src = str(s.get("website_source") or "Official Scraper").strip()
        fb = str(s.get("facebook") or s.get("facebook_url") or "").strip()
        if code and web:
            code_to_web[code] = (web, src, fb)

    updated_count = 0
    try:
        with psycopg.connect(target_dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT opec_school_code FROM school_data.schools")
                db_schools = cur.fetchall()
                for db_s in db_schools:
                    code = db_s["opec_school_code"]
                    if code in code_to_web:
                        web, src, fb = code_to_web[code]
                        cur.execute(
                            """
                            UPDATE school_data.schools
                            SET official_website_url = %(web)s,
                                website_source = COALESCE(NULLIF(%(src)s, ''), website_source),
                                facebook_url = COALESCE(NULLIF(%(fb)s, ''), facebook_url),
                                updated_at = NOW()
                            WHERE opec_school_code = %(code)s
                            """,
                            {"web": web, "src": src, "fb": fb, "code": code}
                        )
                        updated_count += 1
            conn.commit()
    except Exception as e:
        print("[Supabase Sync] Error updating websites:", e)
        if update_progress_cb:
            update_progress_cb("เกิดข้อผิดพลาดในการซิงค์เว็บไซต์สู่ Supabase", 100, 100, f"Supabase error: {e}")

    return updated_count


def sync_single_school_to_supabase(school: dict) -> bool:
    """Synchronizes a single school's updated fields (name_en, website, GPS) to Supabase."""
    target_dsn = get_current_dsn()
    if not target_dsn or not psycopg:
        return False
    code = str(school.get("school_code") or school.get("opec_school_code") or "").strip()
    if not code:
        return False
    try:
        with psycopg.connect(target_dsn) as conn:
            with conn.cursor() as cur:
                name_en = clean(school.get("school_name_en") or school.get("name_en"))
                name_th = clean(school.get("school_name_th") or school.get("name_th"))
                slug_val = slugify(name_en, name_th or "", code) if name_en else None
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



