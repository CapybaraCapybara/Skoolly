"""
data_manager.py
โมดูลสำหรับโหลดและบันทึกข้อมูลโรงเรียน (JSON / CSV)
จัดการข้อมูลแบบ Atomic Write ในโฟลเดอร์ data/ เท่านั้น 
ไม่ดึงไฟล์ dump เก่ากลับมาทับซ้ำ
"""

import os
import json
import csv
import shutil
import time

# Directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.json")
CSV_FILE = os.path.join(DATA_DIR, "international_schools_thailand_opec.csv")
# Pins an admin set by hand, keyed by school_code. Kept apart from the school list on
# purpose: "ดึงข้อมูล OPEC" rebuilds that list from scratch and the reset buttons wipe
# it, but a manual pin must survive both.
MANUAL_PINS_FILE = os.path.join(DATA_DIR, "gps_manual_pins.json")
# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def load_schools():
    """
    Loads international schools list from data/international_schools_thailand_opec.json.
    Returns an empty list if file doesn't exist or is empty.
    """
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    return []
                data = json.loads(content)
                return apply_manual_pins(data) if isinstance(data, list) else []
        except Exception as e:
            print(f"[DataManager] Error loading {DATA_FILE}:", e)
            return []
    return []


# ─── manual GPS pins ────────────────────────────────────────────────────────

def load_manual_pins():
    """{school_code: {"lat", "lon", "source", "note", "by", "at"}} — empty when none."""
    try:
        with open(MANUAL_PINS_FILE, "r", encoding="utf-8") as f:
            pins = json.load(f)
            return pins if isinstance(pins, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def _save_manual_pins(pins):
    _atomic_write(MANUAL_PINS_FILE, lambda f: json.dump(pins, f, ensure_ascii=False, indent=2), "utf-8")


def set_manual_pin(school_code, lat, lon, source, note="", by=""):
    """Locks a school's pin at (lat, lon). `source` says where the coordinate came from."""
    pins = load_manual_pins()
    pins[str(school_code)] = {
        "lat": f"{float(lat):.7f}".rstrip("0"), "lon": f"{float(lon):.7f}".rstrip("0"),
        "source": source.strip(), "note": (note or "").strip(), "by": (by or "").strip(),
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    _save_manual_pins(pins)
    return pins[str(school_code)]


def clear_manual_pin(school_code):
    """Unlocks a school; its next GPS run decides the pin again. False if it had none."""
    pins = load_manual_pins()
    if pins.pop(str(school_code), None) is None:
        return False
    _save_manual_pins(pins)
    return True


def apply_manual_pins(schools):
    """
    Writes each manual pin over its school record, in place, and returns the list.
    Every load and save goes through here, so no scraper, GPS run or late save of a
    stale list can put a different coordinate on a locked school.
    """
    pins = load_manual_pins()
    for s in schools or []:
        code = str(s.get("school_code") or "").strip()
        pin = pins.get(code)
        if pin:
            s.update({
                "latitude": pin["lat"], "longitude": pin["lon"],
                "gps_locked": True, "gps_method": "manual",
                "gps_precision": "Exact", "gps_confidence": "high", "gps_verified": True,
                "gps_source": f"ปักหมุดด้วยมือโดยแอดมิน: {pin['source']}",
                "gps_confirmed_by": ["แอดมิน"],
                "gps_manual": {k: pin.get(k, "") for k in ("source", "note", "by", "at")},
            })
        elif s.get("gps_locked"):
            # The pin was removed from the pins file: unlock, and let the next GPS run
            # re-decide this school (it only picks records whose method is not current).
            s.update({"gps_locked": False, "gps_method": "manual-unlocked", "gps_precision": "Approximate",
                      "gps_confidence": "low", "gps_verified": False,
                      "gps_source": "เคยปักหมุดด้วยมือ ปลดล็อกแล้ว รอตรวจพิกัดใหม่ (พิกัดประมาณการ)"})
            s.pop("gps_manual", None)
    return schools

def _atomic_write(path, write_fn, encoding, newline=None):
    """
    Writes via a temp file and swaps it in. Falls back to overwriting in place
    when the target is held open (common on Windows while the file is served).
    """
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding=encoding, newline=newline) as f:
            write_fn(f)
    except Exception as e:
        print(f"[DataManager] Error writing {tmp}: {e}")
        return

    try:
        os.replace(tmp, path)
    except Exception as e:
        print(f"[DataManager] Atomic swap failed for {path} ({e}); overwriting in place")
        try:
            shutil.copyfile(tmp, path)
            os.remove(tmp)
        except Exception as e2:
            print(f"[DataManager] Fallback overwrite failed for {path}: {e2}")


CSV_FALLBACK_HEADER = [
    "no", "school_code", "school_name_th", "school_name_en", "province", "district",
    "subdistrict", "address", "website", "website_source", "facebook", "telephone",
    "mobile", "latitude", "longitude", "gps_source", "gps_precision",
    "opec_profile_url", "fetched_at", "last_updated",
]


OSM_TYPES = {"n": "node", "w": "way", "r": "relation"}
# website_source label -> who says this is the school's site
WEBSITE_SOURCE_NAMES = {
    "ISAT": "สมาคม ISAT", "OPEC Profile": "ระบบ สช.", "Overture": "Overture Maps", "Domain Guess": "ชื่อโดเมนของโรงเรียน",
    "Admin Verified": "ผู้ดูแลระบบ", "Manual Edit": "ผู้ดูแลระบบ", "Previous Link": "ลิงก์เดิมในระบบ",
    "Verified Official Registry": "ทะเบียนเว็บไซต์ที่ตรวจแล้ว",
}
# gps_confirmed_by names we may show; ArcGIS only helps confirm and is never a source of the pin
PIN_SOURCE_NAMES = {"OPEC": "ระบบ สช.", "OpenStreetMap": "OpenStreetMap", "Overture Maps": "Overture Maps",
                    "กรมการปกครอง": "ข้อมูลเปิดกรมการปกครอง", "เว็บไซต์โรงเรียน": "เว็บไซต์โรงเรียน",
                    "แอดมิน": "ผู้ดูแลระบบ"}   # a pin placed by hand (apply_manual_pins)


def _thai_list(names):
    """"ก", "ก และ ข", "ก, ข และ ค" """
    names = list(dict.fromkeys(names))
    return " และ ".join(filter(None, [", ".join(names[:-1]), names[-1]])) if names else ""


def data_sources(s):
    """
    Where each part of a school's record came from and when, for the admin and public pages:
    {"opec" | "isat" | "website" | "location": {"source": name, "url": page to check it, "at": "YYYY-MM-DD HH:MM:SS"}}.
    Built from fields the pipeline steps keep; a part nothing stands behind is left out, "url"/"at" may be None.
    ISAT has no link (its site lists every school on one search page); website and location carry no time
    yet (decided 2 Nov 2026).
    """
    out = {}
    if s.get("opec_profile_url") or s.get("fetched_at"):
        out["opec"] = {"source": "ระบบ สช.", "url": s.get("opec_profile_url") or None, "at": s.get("fetched_at") or None}
    if s.get("is_isat_member"):
        out["isat"] = {"source": "สมาคม ISAT", "url": None, "at": s.get("isat_fetched_at") or None}
    label = s.get("website_source") or ""
    if s.get("website") and label not in ("", "Not Checked", "Not Found"):
        parts = label.split(" + ")
        url = s.get("opec_profile_url") if "OPEC Profile" in parts else None
        out["website"] = {"source": _thai_list(WEBSITE_SOURCE_NAMES.get(p, p) for p in parts), "url": url or None,
                          "at": None}
    names = [PIN_SOURCE_NAMES[n] for n in s.get("gps_confirmed_by") or [] if n in PIN_SOURCE_NAMES]
    if names and s.get("latitude") and s.get("longitude"):
        evidence = s.get("gps_evidence") or []
        osm = min((e for e in evidence if e.get("source") == "osm" and e.get("osm_id")),
                  key=lambda e: e.get("distance_m") or 0, default=None)
        site = next((e.get("label") for e in evidence if e.get("source") == "website"), None)
        if osm and "OpenStreetMap" in names and osm["osm_id"][:1] in OSM_TYPES:
            url = f"https://www.openstreetmap.org/{OSM_TYPES[osm['osm_id'][0]]}/{osm['osm_id'][1:]}"
        elif site and "เว็บไซต์โรงเรียน" in names:
            url = site
        else:
            url = s.get("opec_profile_url") if "ระบบ สช." in names else None
        out["location"] = {"source": _thai_list(names), "url": url or None, "at": None}
    return out


def save_schools(data):
    """
    Atomically writes international schools data into both JSON and CSV files in data/.
    Only data/ is written — the Vite dev middleware serves it directly, so there is
    no second copy under public/.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    data = apply_manual_pins(data or [])
    for s in data:
        s["data_sources"] = data_sources(s)

    _atomic_write(
        DATA_FILE,
        lambda f: json.dump(data, f, ensure_ascii=False, indent=2),
        "utf-8",
    )

    # Union of every record's keys, in first-seen order.
    fieldnames = list(dict.fromkeys(k for item in data for k in item)) or CSV_FALLBACK_HEADER

    def write_csv(f):
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data)

    # csv needs newline="" so the writer emits CRLF exactly once per row.
    _atomic_write(CSV_FILE, write_csv, "utf-8-sig", newline="")
