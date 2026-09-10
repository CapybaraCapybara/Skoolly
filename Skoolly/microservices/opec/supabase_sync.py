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

# Curriculum regex patterns (aligned with db/import_opec.py)
CURRICULUM_PATTERNS: list[tuple[str, str]] = [
    ("BRITISH", r"สหราชอาณาจักร|(?<!ภาษา)อังกฤษ|เวลส์|England|Wales|\bUK\b|British"
                r"|IGCSE|GCSE|A\s*&?\s*AS\s*Level|A[\s-]?Level|Cambridge|Oxford\s*International"
                r"|Early\s*Years?\s*Foundation|EYFS|Edexcel|BTEC|Pearson|Key\s*Stage"
                r"|English\s*National\s*Curric|\bENC\b"),
    ("AMERICAN", r"สหรัฐอเมริก|อเมริกัน|แคลิฟอร์เนีย|อะลาบามา|American|California|Massachusetts"
                 r"|\bAERO\b|High\s*School\s*Diploma|Common\s*Core|Advanced\s*Placement"
                 r"|\bU\.?S\.?\b|New\s*Jersey|Pennsylvania|District\s*of\s*Columbia|Chicago"
                 r"|Accelerated\s*Christian|School\s*of\s*Tomorrow|\bWASC\b|BASIS\s*Education"),
    ("IB", r"International\s*Baccalaureate|\bIB\b|\bIBDP\b|\bPYP\b|\bMYP\b|Diploma\s*Programme"),
    ("SINGAPORE", r"สิงคโปร์|Singapore|Nurturing\s?Early\s?Learners"),
    ("THAI_MOE", r"วัฒนธรรมไทย|ประวัติศาสตร์ไทย|แกนกลางการศึกษาขั้นพื้นฐาน"),
    ("CANADIAN", r"แคนาดา|บริติชโคลัมเบีย|Canad|Ontario|Quebec"),
    ("AUSTRALIAN", r"ออสเตรเลีย|Australia|\bACARA\b"),
    ("CHINESE", r"(?<!ภาษา)จีน|Chinese|Mandarin"),
    ("JAPANESE", r"(?<!ภาษา)ญี่ปุ่น|Japan"),
    ("INDIAN", r"อินเดีย|India|CBSE|Central\s*Board\s*of\s*Secondary"),
    ("FRENCH", r"ฝรั่งเศส|French|France|Lyc[eé]e"),
    ("GERMAN", r"(?<!ภาษา)เยอรมัน|German"),
    ("KOREAN", r"เกาหลี|Korea"),
    ("MONTESSORI", r"Montessori|มอนเตสซอรี"),
]
COMPILED_PATTERNS = [(code, re.compile(pattern, re.IGNORECASE)) for code, pattern in CURRICULUM_PATTERNS]


def load_env_vars() -> dict[str, str]:
    """Reads .env file without external dependencies."""
    env_vars = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env_vars[key.strip()] = val.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), env_vars[key.strip()])
    return env_vars


def get_current_dsn() -> str | None:
    """Returns DATABASE_URL from environment or .env."""
    load_env_vars()
    return os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DATABASE_URL")


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
            # Load the alias tables once
            cur.execute("SELECT raw_text, curriculum_code FROM school_data.curriculum_aliases")
            curriculum_map = {r["raw_text"]: r["curriculum_code"] for r in cur.fetchall()}

            cur.execute("SELECT raw_text, level_code FROM school_data.grade_level_aliases")
            level_map = {r["raw_text"]: r["level_code"] for r in cur.fetchall()}

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

                # 1. Upsert school record
                cur.execute(
                    """
                    INSERT INTO school_data.schools (
                        opec_school_code, slug, name_th, name_en,
                        official_website_url, website_source, opec_profile_url,
                        official_phone, official_mobile, official_email,
                        facebook_url, line_id, instagram_url, youtube_url,
                        province, district, subdistrict, address,
                        geom, gps_precision, gps_source,
                        logo_url, level_range, student_count, teacher_count
                    ) VALUES (
                        %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                        %(website)s, %(website_source)s, %(profile_url)s,
                        %(phone)s, %(mobile)s, %(email)s,
                        %(facebook)s, %(line_id)s, %(instagram)s, %(youtube)s,
                        %(province)s, %(district)s, %(subdistrict)s, %(address)s,
                        CASE WHEN %(lng)s IS NULL OR %(lat)s IS NULL THEN NULL
                             ELSE st_setsrid(st_makepoint(%(lng)s, %(lat)s), 4326)::geography END,
                        %(gps_precision)s, %(gps_source)s,
                        %(logo)s, %(level_range)s, %(students)s, %(teachers)s
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
                        student_count = EXCLUDED.student_count,
                        teacher_count = EXCLUDED.teacher_count,
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
                        "students": to_int(record.get("student_count")),
                        "teachers": to_int(record.get("teacher_count")),
                    },
                )
                row = cur.fetchone()
                school_id = row["school_id"]
                if row["is_insert"]:
                    inserted += 1
                else:
                    updated += 1

                # 2. Curriculums
                codes = set()
                for raw in record.get("curriculums") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    code = curriculum_map.get(raw)
                    if code:
                        codes.add(code)
                        continue

                    derived = match_curriculums(raw)
                    if derived:
                        codes |= derived
                        for derived_code in derived:
                            cur.execute(
                                "INSERT INTO school_data.curriculum_aliases (raw_text, curriculum_code) VALUES (%s, %s) ON CONFLICT (raw_text) DO NOTHING",
                                (raw, derived_code),
                            )
                        curriculum_map[raw] = sorted(derived)[0]
                        auto_mapped[raw] = sorted(derived)
                    else:
                        unmapped_curriculums[raw] += 1
                        codes.add("OTHER")

                if codes:
                    cur.execute("DELETE FROM school_data.school_curriculums WHERE school_id = %s", (school_id,))
                    cur.executemany(
                        "INSERT INTO school_data.school_curriculums (school_id, curriculum_code) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        [(school_id, code) for code in sorted(codes)],
                    )

                # 3. Grade levels
                level_codes = set()
                for raw in record.get("levels_offered") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    code = level_map.get(raw)
                    if code:
                        level_codes.add(code)
                    else:
                        unmapped_levels[raw] += 1

                if level_codes:
                    cur.execute("DELETE FROM school_data.school_levels WHERE school_id = %s", (school_id,))
                    cur.executemany(
                        "INSERT INTO school_data.school_levels (school_id, level_code) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        [(school_id, code) for code in sorted(level_codes)],
                    )

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
