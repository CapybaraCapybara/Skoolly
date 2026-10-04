"""
public_queries.py
Read-only queries for the public (parent-facing) site:
- Published tuition fees per school, shaped for the Cost Calculator
- Approved forum posts with comments, plus forum stats

Only published / approved rows are returned, so nothing here needs admin rights.
"""

from typing import Any

try:
    from opec.supabase_sync import db_connect, dict_row, get_current_dsn
except ImportError:
    from supabase_sync import db_connect, dict_row, get_current_dsn  # type: ignore

# Wording the calculator already understands (see getAddonAnnualMultiplier in calculatorUtils.ts)
FREQUENCY_NOTES = {
    "once": "once only",
    "per_year": "per year",
    "per_term": "billed termly",
    "per_month": "per month",
    "conditional": "conditional",
}


def _require_dsn(dsn: str | None) -> str:
    target = dsn or get_current_dsn()
    if not target:
        raise ValueError("DATABASE_URL is not set")
    return target


def _num(value: Any) -> float | None:
    return float(value) if value is not None else None


def _display_name(name_en: str | None, name_th: str | None) -> str:
    name = (name_en or "").strip()
    # OPEC stores many English names in all caps; match how schoolsApi.ts shows them
    if len(name) > 4 and name == name.upper():
        name = name.title()
    return name or (name_th or "").strip()


def _extra_fee_notes(row: dict[str, Any]) -> str:
    parts = []
    freq = FREQUENCY_NOTES.get(row.get("frequency") or "")
    if freq:
        parts.append(freq)
    if row.get("refundable") is True:
        parts.append("refundable")
    elif row.get("refundable") is False:
        parts.append("non-refundable")
    if row.get("notes"):
        parts.append(str(row["notes"]))
    return ", ".join(parts)


def fetch_published_fees(dsn: str | None = None) -> list[dict[str, Any]]:
    """Tuition and extra fees from each school's currently published version."""
    target_dsn = _require_dsn(dsn)
    schools: dict[str, dict[str, Any]] = {}

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.school_id::text AS school_id, s.opec_school_code, s.name_en, s.name_th,
                       s.official_website_url, s.curriculums, v.scraped_page_url,
                       f.grade_label, f.level_code, f.annual_thb, f.semester_thb,
                       f.academic_year, f.notes
                FROM school_data.version_fees f
                JOIN school_data.schools s ON s.current_published_version_id = f.version_id
                JOIN school_data.school_versions v ON v.version_id = f.version_id
                WHERE s.status <> 'archived' AND f.annual_thb IS NOT NULL
                ORDER BY s.name_en NULLS LAST, s.name_th, f.annual_thb
            """)
            for row in cur.fetchall():
                school = schools.setdefault(row["school_id"], {
                    "school_id": row["school_id"],
                    "school_code": row["opec_school_code"],
                    "school_name": _display_name(row["name_en"], row["name_th"]),
                    "homepage_url": row["official_website_url"] or "",
                    "page_scraped": row["scraped_page_url"] or "",
                    "curriculum": ", ".join(c.replace("_", " ").title() for c in row["curriculums"] or []),
                    "status": "ok",
                    "tuition_found": True,
                    "tuition_by_grade": [],
                    "hidden_costs": [],
                })
                notes = [n for n in (row["academic_year"] and f"Academic Year {row['academic_year']}", row["notes"]) if n]
                school["tuition_by_grade"].append({
                    "grade_level": row["grade_label"],
                    "display_name": row["grade_label"],
                    "level_code": row["level_code"],
                    "annual_thb": _num(row["annual_thb"]),
                    "semester_thb": _num(row["semester_thb"]),
                    "notes": " · ".join(notes),
                })

            if schools:
                cur.execute("""
                    SELECT s.school_id::text AS school_id, e.name, e.amount_thb, e.frequency,
                           e.refundable, e.notes
                    FROM school_data.version_extra_fees e
                    JOIN school_data.schools s ON s.current_published_version_id = e.version_id
                    WHERE s.school_id::text = ANY(%s) AND e.amount_thb IS NOT NULL
                """, (list(schools.keys()),))
                for row in cur.fetchall():
                    schools[row["school_id"]]["hidden_costs"].append({
                        "name": row["name"],
                        "amount_thb": _num(row["amount_thb"]),
                        "notes": _extra_fee_notes(row),
                    })

    result = list(schools.values())
    for school in result:
        amounts = [g["annual_thb"] for g in school["tuition_by_grade"] if g["annual_thb"]]
        school["tuition_min_thb"] = min(amounts) if amounts else None
        school["tuition_max_thb"] = max(amounts) if amounts else None
    return result


def fetch_forum_posts(limit: int = 100, dsn: str | None = None) -> dict[str, Any]:
    """Approved forum posts (newest first) with their approved comments and overall stats."""
    target_dsn = _require_dsn(dsn)

    with db_connect(target_dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.post_id::text AS post_id, p.category::text AS category, p.title, p.content,
                       p.like_count, p.created_at, u.display_name, u.role,
                       s.opec_school_code, coalesce(s.name_en, s.name_th) AS school_name
                FROM community.forum_posts p
                LEFT JOIN user_data.user_accounts u ON u.user_id = p.user_id
                LEFT JOIN school_data.schools s ON s.school_id = p.school_id
                WHERE p.status = 'approved'
                ORDER BY p.created_at DESC
                LIMIT %s
            """, (limit,))
            posts = cur.fetchall()

            comments_by_post: dict[str, list[dict[str, Any]]] = {}
            if posts:
                cur.execute("""
                    SELECT c.comment_id::text AS comment_id, c.post_id::text AS post_id, c.content,
                           c.like_count, c.created_at, c.deleted_by_author, u.display_name
                    FROM community.forum_comments c
                    LEFT JOIN user_data.user_accounts u ON u.user_id = c.user_id
                    WHERE c.post_id::text = ANY(%s) AND c.status = 'approved'
                    ORDER BY c.created_at
                """, ([p["post_id"] for p in posts],))
                for c in cur.fetchall():
                    comments_by_post.setdefault(c["post_id"], []).append({
                        "id": c["comment_id"],
                        "author": c["display_name"],
                        "content": "ความคิดเห็นนี้ถูกลบโดยผู้เขียน" if c["deleted_by_author"] else c["content"],
                        "likes": c["like_count"],
                        "created_at": c["created_at"].isoformat(),
                    })

            cur.execute("""
                SELECT
                    (SELECT count(*) FROM user_data.user_accounts WHERE status = 'active') AS members,
                    (SELECT count(*) FROM community.forum_posts WHERE status = 'approved') AS posts,
                    (SELECT count(*) FROM community.forum_comments WHERE status = 'approved') AS comments,
                    (SELECT count(DISTINCT school_id) FROM community.forum_posts
                       WHERE status = 'approved' AND school_id IS NOT NULL) AS schools
            """)
            stats = cur.fetchone()

    return {
        "posts": [
            {
                "id": p["post_id"],
                "author": p["display_name"],
                "role": p["role"],
                "category": p["category"],
                "title": p["title"],
                "content": p["content"],
                "likes": p["like_count"],
                "created_at": p["created_at"].isoformat(),
                "school_code": p["opec_school_code"],
                "school_name": p["school_name"],
                "comments": comments_by_post.get(p["post_id"], []),
            }
            for p in posts
        ],
        "stats": stats,
    }
