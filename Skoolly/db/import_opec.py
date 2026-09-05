"""
Import the OPEC dataset into Postgres (Phase 1 — Bootstrap).

Reads data/international_schools_thailand_opec.json and upserts every school into
school_data.schools, then maps the free-text Thai curriculum / level values onto the
lookup tables so UC-G01's filters actually work.

Idempotent: re-running updates existing rows instead of duplicating them, keyed on
`opec_school_code` (UC-A02 E5). Everything runs in one transaction.

Usage:
    pip install "psycopg[binary]"
    # put your Supabase connection string in .env as DATABASE_URL (Session pooler)
    python db/import_opec.py                  # Phase 1: schools only, nothing published yet
    python db/import_opec.py --publish-initial  # also create a published v1 per school

By default no school becomes visible on the public site: `current_published_version_id`
stays NULL, matching Phase 1 in the architecture doc. Pass --publish-initial to create an
initial published version from the OPEC fields (name/address/levels/curriculums — no
tuition), which is what UC-A02 step 5 describes after an admin confirms the import.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    sys.exit('psycopg is required:  pip install "psycopg[binary]"')

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "international_schools_thailand_opec.json"

# The dataset contains 268 distinct curriculum strings for 291 schools — free text typed by
# each school, in two languages, with no shared vocabulary. Seeding an exact alias for every
# one of them by hand is not maintainable, so exact aliases (school_data.curriculum_aliases)
# handle the frequent values and these keyword patterns catch the long tail.
#
# A string can match several patterns and that is intentional: "สหราชอาณาจักร หลักสูตร IB"
# is genuinely both British and IB, and school_curriculums is many-to-many.
#
# The (?<!ภาษา) guards matter: "ภาษาอังกฤษ" means the English *language* subject, not the
# English curriculum — without the guard, every school that lists its teaching languages
# would be filed under BRITISH and the UC-G01 filter would return nonsense.
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
    # Montessori เป็น "แนวการสอน" ไม่ใช่หลักสูตรประจำชาติ แต่แยกรหัสไว้เพราะผู้ปกครองค้นหาคำนี้จริง
    # และโรงเรียนหลายแห่งในข้อมูลระบุไว้เป็นหลักสูตรของตัวเอง (จับคู่กับรหัสอื่นพร้อมกันได้)
    ("MONTESSORI", r"Montessori|มอนเตสซอรี"),
]
COMPILED_PATTERNS = [(code, re.compile(pattern, re.IGNORECASE)) for code, pattern in CURRICULUM_PATTERNS]


def match_curriculums(raw: str) -> set[str]:
    """Every canonical code whose keywords appear in this free-text value."""
    return {code for code, pattern in COMPILED_PATTERNS if pattern.search(raw)}


def load_env() -> None:
    """Minimal .env reader so this script has no dependency beyond psycopg."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def slugify(name_en: str | None, name_th: str, opec_code: str) -> str:
    """ASCII slug from the English name; Thai names have no usable ASCII form, so those
    fall back to the OPEC code, which is unique by definition."""
    source = (name_en or "").strip()
    ascii_form = unicodedata.normalize("NFKD", source).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_form).strip("-").lower()
    return slug or f"school-{opec_code}"


def to_int(value) -> int | None:
    try:
        return int(value) if value not in (None, "", []) else None
    except (TypeError, ValueError):
        return None


def to_float(value) -> float | None:
    try:
        return float(value) if value not in (None, "", []) else None
    except (TypeError, ValueError):
        return None


def clean(value) -> str | None:
    """Empty strings in the dataset mean 'not found', which belongs in the DB as NULL."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--publish-initial",
        action="store_true",
        help="create a published v1 per school from the OPEC fields (UC-A02 step 5)",
    )
    parser.add_argument("--dry-run", action="store_true", help="roll back instead of committing")
    args = parser.parse_args()

    load_env()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set. Put the Supabase session-pooler string in .env")

    if not DATA_FILE.exists():
        sys.exit(f"dataset not found: {DATA_FILE}")

    records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    print(f"loaded {len(records)} schools from {DATA_FILE.name}")

    inserted = updated = 0
    unmapped_curriculums: Counter[str] = Counter()
    auto_mapped: dict[str, list[str]] = {}
    unmapped_levels: Counter[str] = Counter()
    used_slugs: set[str] = set()

    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Load the alias tables once; the mapping happens in Python so unmapped values
            # can be reported instead of silently vanishing from the filters.
            cur.execute("select raw_text, curriculum_code from school_data.curriculum_aliases")
            curriculum_map = {r["raw_text"]: r["curriculum_code"] for r in cur.fetchall()}
            cur.execute("select raw_text, level_code from school_data.grade_level_aliases")
            level_map = {r["raw_text"]: r["level_code"] for r in cur.fetchall()}

            cur.execute("select slug from school_data.schools")
            used_slugs = {r["slug"] for r in cur.fetchall()}

            for record in records:
                opec_code = clean(record.get("school_code"))
                name_th = clean(record.get("school_name_th"))
                if not opec_code or not name_th:
                    print(f"  skip: record without school_code/name — {record.get('no')}")
                    continue

                name_en = clean(record.get("school_name_en"))
                slug = slugify(name_en, name_th, opec_code)
                # Two schools can share an English name (different branches); keep slugs unique.
                if slug in used_slugs:
                    slug = f"{slug}-{opec_code[-4:]}"
                used_slugs.add(slug)

                lat = to_float(record.get("latitude"))
                lng = to_float(record.get("longitude"))

                cur.execute(
                    """
                    insert into school_data.schools (
                        opec_school_code, slug, name_th, name_en,
                        official_website_url, website_source, opec_profile_url,
                        official_phone, official_mobile, official_email,
                        facebook_url, line_id, instagram_url, youtube_url,
                        province, district, subdistrict, address,
                        geom, gps_precision, gps_source,
                        logo_url, level_range, student_count, teacher_count
                    ) values (
                        %(opec_code)s, %(slug)s, %(name_th)s, %(name_en)s,
                        %(website)s, %(website_source)s, %(profile_url)s,
                        %(phone)s, %(mobile)s, %(email)s,
                        %(facebook)s, %(line_id)s, %(instagram)s, %(youtube)s,
                        %(province)s, %(district)s, %(subdistrict)s, %(address)s,
                        case when %(lng)s is null or %(lat)s is null then null
                             else st_setsrid(st_makepoint(%(lng)s, %(lat)s), 4326)::geography end,
                        %(gps_precision)s, %(gps_source)s,
                        %(logo)s, %(level_range)s, %(students)s, %(teachers)s
                    )
                    on conflict (opec_school_code) do update set
                        name_th = excluded.name_th,
                        name_en = excluded.name_en,
                        official_website_url = coalesce(school_data.schools.official_website_url,
                                                        excluded.official_website_url),
                        opec_profile_url = excluded.opec_profile_url,
                        official_phone = excluded.official_phone,
                        official_mobile = excluded.official_mobile,
                        province = excluded.province,
                        district = excluded.district,
                        subdistrict = excluded.subdistrict,
                        address = excluded.address,
                        geom = excluded.geom,
                        gps_precision = excluded.gps_precision,
                        gps_source = excluded.gps_source,
                        logo_url = excluded.logo_url,
                        level_range = excluded.level_range,
                        student_count = excluded.student_count,
                        teacher_count = excluded.teacher_count,
                        updated_at = now()
                    returning school_id, (xmax = 0) as is_insert
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

                # ── curriculums ──────────────────────────────────────────────────
                codes = set()
                for raw in record.get("curriculums") or []:
                    raw = clean(raw)
                    if not raw:
                        continue
                    code = curriculum_map.get(raw)
                    if code:
                        codes.add(code)
                        continue

                    # No exact alias: fall back to keyword matching, then persist whatever
                    # it derived into curriculum_aliases so the mapping is reviewable and
                    # an admin can correct it once instead of it being re-guessed forever.
                    derived = match_curriculums(raw)
                    if derived:
                        codes |= derived
                        for derived_code in derived:
                            cur.execute(
                                "insert into school_data.curriculum_aliases (raw_text, curriculum_code)"
                                " values (%s, %s) on conflict (raw_text) do nothing",
                                (raw, derived_code),
                            )
                        # Only the first derived code can be stored per raw_text (raw_text is
                        # the PK), so remember the rest for the report rather than losing them.
                        curriculum_map[raw] = sorted(derived)[0]
                        auto_mapped[raw] = sorted(derived)
                    else:
                        # Nothing matched: file under OTHER so the school still appears, and
                        # report it so a human can add a real alias (Use Case doc 7.16).
                        unmapped_curriculums[raw] += 1
                        codes.add("OTHER")
                if codes:
                    cur.execute(
                        "delete from school_data.school_curriculums where school_id = %s",
                        (school_id,),
                    )
                    cur.executemany(
                        "insert into school_data.school_curriculums (school_id, curriculum_code)"
                        " values (%s, %s) on conflict do nothing",
                        [(school_id, code) for code in sorted(codes)],
                    )

                # ── grade levels ─────────────────────────────────────────────────
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
                    cur.execute(
                        "delete from school_data.school_levels where school_id = %s",
                        (school_id,),
                    )
                    cur.executemany(
                        "insert into school_data.school_levels (school_id, level_code)"
                        " values (%s, %s) on conflict do nothing",
                        [(school_id, code) for code in sorted(level_codes)],
                    )

                # ── optional: initial published version (UC-A02 step 5) ──────────
                if args.publish_initial:
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
                        insert into school_data.school_versions
                            (school_id, version_number, status, source_type, data_snapshot)
                        select %s, 1, 'published', 'opec_import', %s::jsonb
                        where not exists (
                            select 1 from school_data.school_versions where school_id = %s
                        )
                        returning version_id
                        """,
                        (school_id, json.dumps(snapshot, ensure_ascii=False), school_id),
                    )
                    created = cur.fetchone()
                    if created:
                        cur.execute(
                            "update school_data.schools"
                            "   set current_published_version_id = %s, pub_data_updated_at = now()"
                            " where school_id = %s",
                            (created["version_id"], school_id),
                        )

            if args.dry_run:
                conn.rollback()
                print("\n-- dry run: rolled back, nothing was written --")
            else:
                conn.commit()

    print(f"\ninserted: {inserted}   updated: {updated}")

    if auto_mapped:
        print(f"\n{len(auto_mapped)} curriculum values were mapped by keyword and saved as aliases.")
        print("Spot-check these — they are guesses, and an admin can correct any row in")
        print("school_data.curriculum_aliases without touching this script:")
        for raw, codes in sorted(auto_mapped.items())[:20]:
            print(f"  {'+'.join(codes):<22} {raw}")
        if len(auto_mapped) > 20:
            print(f"  ... and {len(auto_mapped) - 20} more (query the table to see them all)")

    if unmapped_curriculums:
        print(f"\n{len(unmapped_curriculums)} curriculum values matched nothing (filed under OTHER).")
        print("Add a real alias for these so UC-G01's filter can find the schools:")
        for raw, count in unmapped_curriculums.most_common():
            print(f"  ({count:>3}x)  {raw}")
    if unmapped_levels:
        print(f"\n{len(unmapped_levels)} level values had no alias (school left unfiltered):")
        for raw, count in unmapped_levels.most_common():
            print(f"  ({count:>3}x)  {raw}")

    if not args.publish_initial:
        print(
            "\nNo school is publicly visible yet: current_published_version_id is still NULL,"
            "\nwhich is Phase 1 behaviour. Run with --publish-initial to create a published v1."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
