"""
pipeline_preview.py — ลองรันแต่ละขั้นของ data pipeline ให้เห็นผล โดยไม่แตะฐานข้อมูลและไม่แก้ไฟล์จริง

ทำงานบนสำเนาในโฟลเดอร์ .tmp-pipeline-preview/ (อยู่ใน .gitignore แล้ว): คัดลอกโค้ด microservices/
ไฟล์ data/ และไฟล์อ้างอิงไปไว้ที่นั่น แต่ไม่คัดลอก .env จึงไม่มี DATABASE_URL ขั้นที่ปกติบันทึกลง Supabase
จะข้ามไปเอง และ psycopg.connect ถูกปิดไว้อีกชั้น ไฟล์ data/ ตัวจริงไม่ถูกเขียนทับ

แต่ละขั้นใช้โค้ดเดียวกับปุ่มในหน้า admin (step_* ใน opec_service.py) และต่ออินเทอร์เน็ตจริง:
OPEC, ISAT, เว็บไซต์โรงเรียน, ArcGIS และ OpenStreetMap

    python microservices/pipeline_preview.py opec         ดึงข้อมูล OPEC
    python microservices/pipeline_preview.py names        เติมชื่อ EN
    python microservices/pipeline_preview.py isat         ซิงค์ ISAT
    python microservices/pipeline_preview.py websites     ค้นหา Website
    python microservices/pipeline_preview.py gps          ปักหมุด GPS (เฉพาะโรงเรียนที่รอตรวจ)
    python microservices/pipeline_preview.py gps --recheck 6   ตรวจพิกัดใหม่ 6 แห่ง แล้วเทียบกับผลเดิม
    python microservices/pipeline_preview.py all          ครบ 5 ขั้นตามลำดับของปุ่ม "รันครบทุกขั้นตอน"
    python microservices/pipeline_preview.py import       ดูว่าปุ่มนำเข้าจะส่งอะไรเข้า Supabase (ไม่เชื่อมต่อจริง)

    --continue   ทำต่อจากผลรอบก่อนในโฟลเดอร์ preview แทนการเริ่มจากข้อมูลจริง

ผลแต่ละรอบอยู่ใน .tmp-pipeline-preview/report-<ขั้น>.md และข้อมูลหลังรันอยู่ใน .tmp-pipeline-preview/data/
ทะเบียนเว็บไซต์มาจาก reference/schoolAndURL.txt (ไม่อ่านตารางใน Supabase) ผลที่ขึ้นกับเว็บไซต์จึงอาจต่างจากของจริงได้
"""

import argparse
import json
import os
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent          # Skoolly/
WORK = APP_DIR / ".tmp-pipeline-preview"
DATASET = Path("data") / "international_schools_thailand_opec.json"
REFERENCE_FILES = ("schoolAndURL.txt", "dopa_gis02_schools.json")

# Fields that change on every run and say nothing about the data itself
VOLATILE = {"no", "fetched_at", "last_updated"}
# Large lists/objects: count the changes, don't print them
BULKY = {"gps_evidence", "gps_anchor", "gps_confirmed_by", "school_history", "vision", "mission"}


def out(text=""):
    print(text)
    REPORT.append(text)


REPORT = []


# ─── workspace ──────────────────────────────────────────────────────────────

def prepare_workspace(keep_data):
    """A copy of the code (always fresh) and of the data (fresh unless keep_data), without .env."""
    WORK.mkdir(exist_ok=True)
    if (WORK / "microservices").exists():
        shutil.rmtree(WORK / "microservices")
    shutil.copytree(APP_DIR / "microservices", WORK / "microservices",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "pipeline_preview.py"))
    if not keep_data or not (WORK / DATASET).exists():
        if (WORK / "data").exists():
            shutil.rmtree(WORK / "data")
        shutil.copytree(APP_DIR / "data", WORK / "data")
    (WORK / "reference").mkdir(exist_ok=True)
    for name in REFERENCE_FILES:
        src = APP_DIR / "reference" / name
        if src.exists():
            shutil.copy2(src, WORK / "reference" / name)
    if (WORK / ".env").exists():
        (WORK / ".env").unlink()


def load_service():
    """Imports opec_service from the workspace copy, with every database connection refused."""
    for key in [k for k in os.environ if "DATABASE_URL" in k]:
        del os.environ[key]

    import psycopg

    def refuse(*args, **kwargs):
        raise RuntimeError("pipeline_preview: ปิดการเชื่อมต่อฐานข้อมูลไว้")
    psycopg.connect = refuse

    # The real microservices/ is on sys.path (it holds this script): take it off so that
    # every import below resolves to the workspace copy
    def same(p):
        return os.path.normcase(os.path.realpath(p or ".")) == os.path.normcase(str(Path(__file__).resolve().parent))
    sys.path[:] = [p for p in sys.path if not same(p)]
    sys.path[:0] = [str(WORK / "microservices" / "opec"), str(WORK / "microservices")]
    os.chdir(WORK)
    import opec_service
    import supabase_sync  # type: ignore
    assert Path(opec_service.__file__).resolve().is_relative_to(WORK), "imported the real opec_service"
    assert supabase_sync.get_current_dsn() is None, "a DATABASE_URL is still visible"
    return opec_service


def read_dataset():
    with open(WORK / DATASET, encoding="utf-8") as f:
        return {str(s.get("school_code")): s for s in json.load(f)}


def save_dataset(by_code):
    import data_manager  # type: ignore
    data_manager.save_schools(sorted(by_code.values(), key=lambda s: str(s.get("school_code"))))


# ─── reporting ──────────────────────────────────────────────────────────────

def short(value, limit=70):
    text = json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else str(value)
    return text if len(text) <= limit else text[:limit - 1] + "…"


def snapshot(by_code):
    import enrich_school_names_en  # type: ignore
    schools = list(by_code.values())
    return {
        "โรงเรียนทั้งหมด": len(schools),
        "มีเว็บไซต์": sum(1 for s in schools if str(s.get("website") or "").startswith("http")),
        "ชื่อ EN ที่ต้องแก้": sum(1 for s in schools if enrich_school_names_en.needs_en_name(s.get("school_name_en"))),
        "พิกัด Exact": sum(1 for s in schools if s.get("gps_precision") == "Exact"),
        "พิกัด Approximate": sum(1 for s in schools if s.get("gps_precision") == "Approximate"),
        "ไม่มีพิกัด (None)": sum(1 for s in schools if s.get("gps_precision") == "None"),
        "รอตรวจ GPS": sum(1 for s in schools if not s.get("gps_method") and not s.get("gps_locked")),
        "สมาชิก ISAT": sum(1 for s in schools if s.get("is_isat_member")),
        "จำนวนนักเรียนเป็น 0": sum(1 for s in schools if not s.get("student_count")),
    }


def report_changes(before, after):
    sb, sa = snapshot(before), snapshot(after)
    out("| | ก่อน | หลัง |")
    out("|---|---:|---:|")
    for key in sb:
        mark = "" if sb[key] == sa[key] else " ←"
        out(f"| {key} | {sb[key]} | {sa[key]}{mark} |")

    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    if added:
        out(f"\nโรงเรียนใหม่ {len(added)} แห่ง: " + ", ".join(f"{c} {after[c].get('school_name_th', '')}" for c in added[:10]))
    if removed:
        out(f"\nไม่อยู่ใน OPEC แล้ว {len(removed)} แห่ง: " + ", ".join(f"{c} {before[c].get('school_name_th', '')}" for c in removed[:10]))

    changes = {}
    for code in set(before) & set(after):
        b, a = before[code], after[code]
        for key in (set(b) | set(a)) - VOLATILE:
            if b.get(key) != a.get(key):
                changes.setdefault(key, []).append(code)
    if not changes:
        out("\nไม่มีช่องไหนของโรงเรียนเดิมเปลี่ยน")
        return
    out("\nช่องที่เปลี่ยน (จำนวนโรงเรียน):")
    for key, codes in sorted(changes.items(), key=lambda kv: -len(kv[1])):
        out(f"- {key}: {len(codes)} แห่ง")
        if key in BULKY:
            continue
        for code in sorted(codes)[:3]:
            name = after[code].get("school_name_th", "")
            out(f"    {code} {short(name, 40)}: {short(before[code].get(key))} -> {short(after[code].get(key))}")


def report_gps_recheck(before, after, codes):
    import gps_sources  # type: ignore
    out("\nผลตรวจพิกัดใหม่เทียบกับของเดิม:")
    out("| โรงเรียน | เดิม | ใหม่ | ห่างกัน |")
    out("|---|---|---|---:|")
    for code in codes:
        b, a = before.get(code, {}), after.get(code, {})
        try:
            dist = f"{gps_sources.distance_m(float(b['latitude']), float(b['longitude']), float(a['latitude']), float(a['longitude'])):.0f} ม."
        except (KeyError, TypeError, ValueError):
            dist = "-"
        out(f"| {code} {short(a.get('school_name_th', ''), 30)} | {b.get('gps_precision')} | "
            f"{a.get('gps_precision')} | {dist} |")
        out(f"|  | {short(b.get('gps_source'), 60)} | {short(a.get('gps_source'), 60)} | |")


# ─── steps ──────────────────────────────────────────────────────────────────

def progress_printer(log_lines):
    def progress(task, current, total, log=""):
        if log:
            for line in str(log).splitlines():
                print(f"    {line}")
            log_lines.append(log)
    return progress


def run_step(svc, label, fn):
    before = read_dataset()
    out(f"\n## {label}\n")
    logs = []
    started = time.time()
    try:
        fn(progress_printer(logs))
        ok = True
    except Exception as e:
        out(f"ขั้นนี้หยุดด้วยข้อผิดพลาด: {e}")
        ok = False
    out(f"\nใช้เวลา {time.time() - started:.0f} วินาที ข้อความสุดท้ายของขั้นนี้:")
    for line in (logs[-1] if logs else "-").splitlines():
        out(f"> {line}")
    after = read_dataset()
    out("")
    report_changes(before, after)
    return ok, before, after


def pick_recheck(by_code, n):
    """A spread of schools to re-check: some Exact, some Approximate, some without a point."""
    groups = {p: sorted(c for c, s in by_code.items() if s.get("gps_precision") == p and not s.get("gps_locked"))
              for p in ("Exact", "Approximate", "None")}
    picked = []
    while len(picked) < n and any(groups.values()):
        for p in ("Exact", "Approximate", "None"):
            if groups[p] and len(picked) < n:
                picked.append(groups[p].pop(len(groups[p]) // 2))
    return picked


def preview_import(svc):
    """Runs the Supabase import against a recorder: shows what would be sent, connects to nothing."""
    import supabase_sync  # type: ignore
    sent = []

    class Recorder:
        def __init__(self):
            self.rows = []

        def execute(self, sql, params=None):
            flat = " ".join(sql.split())
            if flat.startswith("INSERT INTO school_data.schools"):
                sent.append(params)
                self.rows = [{"school_id": "preview", "is_insert": True}]
            elif "as has_schema" in flat:
                self.rows = [{"has_schema": True}]
            elif "information_schema.tables" in flat:
                self.rows = [{"exists": True}]
            elif flat.startswith("SELECT count(*) as cnt"):
                self.rows = [{"cnt": 0}]
            elif flat.startswith("SELECT 1 as ping"):
                self.rows = [{"ping": 1}]
            else:
                self.rows = []
            return self

        def fetchone(self):
            return self.rows[0] if self.rows else None

        def fetchall(self):
            return list(self.rows)

        def cursor(self):
            return self

        def commit(self):
            pass

        def rollback(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    supabase_sync.db_connect = lambda *a, **k: Recorder()
    records = list(read_dataset().values())
    out("\n## ดูสิ่งที่ปุ่มนำเข้าจะส่งเข้า Supabase (ไม่ได้เชื่อมต่อจริง)\n")
    result = supabase_sync.execute_opec_import(dsn="preview://no-database", records=records,
                                               publish_initial=False, dry_run=True)
    out(f"จะส่งแถวโรงเรียน {len(sent)} แถว (upsert ตาม opec_school_code)")
    curr = Counter(c for r in sent for c in r["curriculums"])
    levels = Counter(c for r in sent for c in r["levels_offered"])
    out("- รหัสหลักสูตร: " + ", ".join(f"{k} {v}" for k, v in curr.most_common()))
    out("- รหัสระดับชั้น: " + ", ".join(f"{k} {v}" for k, v in levels.most_common()))
    out(f"- ข้อความหลักสูตรที่ map ไม่ได้ (ตกเป็น SCHOOL_SPECIFIC): {result['unmapped_curriculums']} แบบ")
    out(f"- ระดับชั้นที่ map ไม่ได้: {result['unmapped_level_values'] or 'ไม่มี'}")
    out(f"- มีพิกัด (geom): {sum(1 for r in sent if r['lat'] is not None)} แถว, "
        f"ไม่มี: {sum(1 for r in sent if r['lat'] is None)} แถว")
    out("- gps_precision: " + ", ".join(f"{k} {v}" for k, v in Counter(r["gps_precision"] for r in sent).most_common()))
    out(f"- มีเว็บไซต์: {sum(1 for r in sent if r['website'])} แถว "
        "(แถวที่มีอยู่แล้วใน Supabase จะคง official_website_url เดิมไว้)")
    out(f"- จำนวนนักเรียนว่าง: {sum(1 for r in sent if not r['students'])} แถว")
    out("\nตัวอย่าง 3 แถว:")
    for r in sent[:3]:
        out(f"    {r['opec_code']} {r['name_en']} | {r['province']} | หลักสูตร {r['curriculums']} | "
            f"ระดับ {r['levels_offered']} | {r['gps_precision']} ({r['lat']}, {r['lng']})")


def main():
    parser = argparse.ArgumentParser(description="ลองรัน data pipeline โดยไม่แตะฐานข้อมูลและไฟล์จริง")
    parser.add_argument("step", choices=["opec", "names", "isat", "websites", "gps", "all", "auto", "import"])
    parser.add_argument("--recheck", type=int, default=0, help="gps: ตรวจพิกัดใหม่กี่แห่งเพื่อเทียบกับผลเดิม")
    parser.add_argument("--continue", dest="keep", action="store_true", help="ทำต่อจากผลรอบก่อนในโฟลเดอร์ preview")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)   # live output even into a file

    prepare_workspace(keep_data=args.keep)
    svc = load_service()
    out(f"# pipeline preview: {args.step}")
    out(f"\nทำงานบนสำเนาที่ {WORK} ไม่มี DATABASE_URL และปิด psycopg.connect ไว้ "
        f"({'ต่อจากผลรอบก่อน' if args.keep else 'เริ่มจากข้อมูลจริงใน data/'})")

    steps = {
        "opec": [("1. ดึงข้อมูล OPEC", lambda p: svc.step_fetch_opec(p, import_to_supabase=False))],
        "names": [("2. เติมชื่อ EN", svc.step_names_en)],
        "isat": [("ซิงค์ ISAT", svc.step_isat)],
        "websites": [("3. ค้นหา Website", svc.step_websites)],
        "gps": [("4. ปักหมุด GPS", svc.step_gps)],
    }
    steps["all"] = steps["opec"] + steps["names"] + steps["isat"] + steps["websites"] + steps["gps"]
    steps["auto"] = steps["names"] + steps["websites"] + steps["gps"]

    if args.step == "import":
        preview_import(svc)
    else:
        rechecked = []
        if args.step == "gps" and args.recheck:
            data = read_dataset()
            rechecked = pick_recheck(data, args.recheck)
            for code in rechecked:
                data[code].pop("gps_method", None)   # back in the GPS button's queue
            save_dataset(data)
            out(f"\nส่งกลับไปตรวจพิกัดใหม่ {len(rechecked)} แห่ง: {', '.join(rechecked)}")
        for label, fn in steps[args.step]:
            ok, before, after = run_step(svc, label, fn)
            if rechecked:
                report_gps_recheck(before, after, rechecked)
            if not ok:
                break

    report = "\n".join(REPORT) + "\n"
    (WORK / "report.md").write_text(report, encoding="utf-8")
    (WORK / f"report-{args.step}.md").write_text(report, encoding="utf-8")   # kept per step
    print(f"\nรายงานเต็ม: {WORK / f'report-{args.step}.md'}")
    print(f"ข้อมูลหลังรัน: {WORK / DATASET}")


if __name__ == "__main__":
    main()
