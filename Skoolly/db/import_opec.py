"""
Import the OPEC dataset into Postgres (Phase 1 — Bootstrap).

Command-line front end to the importer the admin page uses (execute_opec_import in
microservices/opec/supabase_sync.py), so there is one importer to keep in step with
db/schema.sql. It reads data/international_schools_thailand_opec.json, upserts every school
into school_data.schools keyed on `opec_school_code` (re-running updates rows instead of
duplicating them, UC-12 E5) and maps the free-text curriculum / level values onto the codes
in the lookup tables, so UC-01's filters work. Everything runs in one transaction.

Usage:
    pip install "psycopg[binary]"
    # Put the Supabase connection string in .env as DATABASE_URL. Use the Session pooler
    # one (aws-0-<region>.pooler.supabase.com:5432) — the direct connection is IPv6-only.
    python db/import_opec.py                    # Phase 1: schools only, nothing published yet
    python db/import_opec.py --publish-initial  # also create a published v1 per school
    python db/import_opec.py --dry-run          # run the whole import, then roll back

By default no published version is created: `current_published_version_id` stays NULL,
matching Phase 1 in the architecture doc. --publish-initial creates an initial published
version from the OPEC fields (name/address/levels/curriculums — no tuition), which is what
UC-12 step 5 describes after an admin confirms the import.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "microservices" / "opec"))

from supabase_sync import execute_opec_import  # type: ignore  # found via the sys.path line above


def main() -> int:
    parser = argparse.ArgumentParser(description="Import the OPEC dataset into school_data.schools")
    parser.add_argument(
        "--publish-initial",
        action="store_true",
        help="create a published v1 per school from the OPEC fields (UC-12 step 5)",
    )
    parser.add_argument("--dry-run", action="store_true", help="roll back instead of committing")
    args = parser.parse_args()

    try:
        result = execute_opec_import(
            publish_initial=args.publish_initial,
            dry_run=args.dry_run,
            progress_callback=lambda task, current, total, message: print(message),
        )
    except Exception as e:
        print(f"Import failed: {e}", file=sys.stderr)
        return 1

    if result["unmapped_level_values"]:
        print(f"\n{result['unmapped_levels']} level values had no code (those schools are left out "
              f"of the level filter): {', '.join(result['unmapped_level_values'])}")
    if result["unmapped_curriculums"]:
        print(f"{result['unmapped_curriculums']} curriculum values matched no pattern and were filed "
              f"under SCHOOL_SPECIFIC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
