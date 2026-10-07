"""
fetch_opec.py
โมดูลสำหรับปุ่มที่ 1 (ดึงข้อมูล OPEC):
ดึงข้อมูลจาก school.opec.go.th เท่านั้น
- ดึงรายชื่อโรงเรียนนานาชาติทั้งหมดในระบบ สช. (SchoolType 7)
- ดึงข้อมูลสถิติจำนวนนักเรียน (GetCountStudent), จำนวนครู/บุคลากร (GetCountEmployee)
- ดึงระดับชั้นที่เปิดสอน (level1 - level5) และหลักสูตร (GetCurriculumSearch)
- ดึงที่อยู่, ผู้รับใบอนุญาต, ผู้อำนวยการ, ผู้จัดการ, ประวัติโรงเรียน, พิกัด OPEC และเว็บไซต์จากโปรไฟล์ OPEC (ถ้ามี)

ผลที่ได้ถูก "รวม" เข้ากับข้อมูลเดิม ไม่ใช่สร้างใหม่ทั้งชุด (ดู merge_with_previous):
ช่องที่ OPEC เป็นเจ้าของจะอัปเดตตาม OPEC ส่วนชื่อ EN ที่เติมแล้ว เว็บไซต์ที่ยืนยันแล้ว ผลตรวจพิกัด
และข้อมูล ISAT ยังอยู่ และไฟล์ถูกบันทึกครั้งเดียวตอนจบ ถ้า OPEC ล่มกลางทาง ข้อมูลเดิมไม่หาย
"""

import re
import time
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import load_schools, save_schools
from enrich_school_names_en import is_garbled_name

# Disable SSL warnings for OPEC site
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=70, pool_maxsize=70, max_retries=2)
session.mount("https://", adapter)
session.mount("http://", adapter)

session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://school.opec.go.th",
    "Referer": "https://school.opec.go.th/search",
})

def make_multipart(fields):
    """Encodes form fields as multipart/form-data for OPEC API"""
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    lines = []
    for k, v in fields.items():
        lines.append(f"--{boundary}")
        lines.append(f'Content-Disposition: form-data; name="{k}"')
        lines.append("")
        lines.append(str(v))
    lines.append(f"--{boundary}--")
    lines.append("")
    body = "\r\n".join(lines).encode("utf-8")
    content_type = f"multipart/form-data; boundary={boundary}"
    return content_type, body

def search_international_schools():
    """Every international school (SchoolType 7) from OPEC's search API, in one request."""
    fields = {"SchoolCodeName": "", "Course": "", "Tags": "", "ProvinceCode": "",
              "AmphurCode": "", "TumbolCode": "", "SchoolTypeGroup": "1"}
    content_type, body = make_multipart(fields)
    r = session.post("https://school.opec.go.th/api/GetSchoolSearch", data=body,
                     headers={"Content-Type": content_type}, timeout=30, verify=False)
    r.raise_for_status()
    return [s for s in r.json() if str(s.get("schoolType1")) == "7"]

def fetch_opec_coordinates():
    """
    {school_code: (lat, lon)} for every international school, straight from OPEC's
    search API — a single request that returns in about a second.

    The GPS button uses it to recover the raw OPEC pin for records whose
    latitude/longitude were already overwritten by an earlier run.
    """
    out = {}
    for s in search_international_schools():
        lat, lon = str(s.get("latitude") or "").strip(), str(s.get("longitude") or "").strip()
        if lat and lon and lat not in ("0", "0.0") and lon not in ("0", "0.0"):
            out[str(s.get("schoolCode", "")).strip()] = (lat, lon)
    return out

def build_pure_opec_record(s):
    """Transforms raw OPEC API response into standard school record (100% Pure OPEC Data)"""
    code = str(s.get("schoolCode", "")).strip()
    name_th = s.get("schoolNameTh", "").strip()
    # OPEC's English field occasionally carries a stray Thai mark ("ฺBritish Columbia ...")
    name_en = re.sub(r"\s+", " ", re.sub(r"[\u0E00-\u0E7F]", "", s.get("schoolNameEn") or "")).strip()

    province = s.get("provinceNameTh", "").strip()
    amphur = s.get("amphurNameTh", "").strip()
    tumbol = s.get("tumbolNameTh", "").strip()
    zipcode = s.get("zipCode", "").strip()

    addr_parts = []
    if s.get("houseNumber"): addr_parts.append(str(s["houseNumber"]).strip())
    if s.get("moo"): addr_parts.append(f"หมู่ {s['moo']}")
    if s.get("soi"): addr_parts.append(f"ซอย {s['soi']}")
    if s.get("street"): addr_parts.append(f"ถนน {s['street']}")
    if tumbol: addr_parts.append(f"ต.{tumbol}" if "กรุงเทพ" not in province else f"แขวง{tumbol}")
    if amphur: addr_parts.append(f"อ.{amphur}" if "กรุงเทพ" not in province else f"เขต{amphur}")
    if province: addr_parts.append(f"จ.{province}" if "กรุงเทพ" not in province else province)
    if zipcode: addr_parts.append(zipcode)
    full_address = " ".join([p for p in addr_parts if p])

    # Website strictly from OPEC Profile.
    # As of this writing GetSchoolSearch/GetSchoolDetail return an empty website for
    # all 291 international schools, but when one does appear it is kept in its own
    # opec_website field. fetch_official_websites.py reads that field and never writes
    # it, so a resolved guess can never masquerade as OPEC-supplied data.
    raw_web = s.get("website", "").strip()
    if raw_web and "." in raw_web:
        website = raw_web if raw_web.startswith("http") else "https://" + raw_web
        website_source = "OPEC Profile"
    else:
        website = ""
        website_source = "Not Checked"

    raw_fb = s.get("facebook", "").strip()
    facebook = ""
    if raw_fb:
        facebook = raw_fb if raw_fb.startswith("http") else "https://" + raw_fb

    # Levels offered
    level_map = [
        ("level1", "ก่อนอนุบาล"),
        ("level2", "อนุบาล"),
        ("level3", "ประถมศึกษา"),
        ("level4", "มัธยมศึกษาตอนต้น"),
        ("level5", "มัธยมศึกษาตอนปลาย")
    ]
    levels = [ln for lk, ln in level_map if s.get(lk) == "Y"]
    level_range = f"{levels[0]} - {levels[-1]}" if levels else "ไม่ระบุ"

    # Logo URL from OPEC PDC
    pdc_id = str(s.get("schoolPdcId") or s.get("SchoolPdcId") or "").strip()
    school_logo_url = f"https://pedb.opec.go.th/web/SchoolPdc.htm?mode=showPicture&t=1&id={pdc_id}" if pdc_id else ""

    # Subsidy
    no_support = str(s.get("noSupport", "")).strip()
    gov_support = "รับเงินอุดหนุน" if no_support == "0" else "ไม่รับเงินอุดหนุน"

    raw_lat = str(s.get("latitude") or "").strip()
    raw_lon = str(s.get("longitude") or "").strip()
    if raw_lat and raw_lon and raw_lat not in ["0", "0.0", ""] and raw_lon not in ["0", "0.0", ""]:
        if "13.7563" in raw_lat and "100.501" in raw_lon:
            gps_source = "OPEC Placeholder (Centroid)"
            gps_precision = "Approximate"
        else:
            # Not "Exact": nothing has checked this pin yet. Some OPEC pins sit on a
            # tambon centroid or are shared with an unrelated school. The GPS button
            # cross-checks it against other sources and sets the real precision.
            gps_source = "OPEC Official (unverified)"
            gps_precision = "Approximate"
    else:
        gps_source = ""
        gps_precision = "None"

    return {
        "no": 0,
        "school_code": code,
        "school_name_th": name_th,
        "school_name_en": name_en,
        "province": province,
        "district": amphur,
        "subdistrict": tumbol,
        "address": full_address,
        "website": website,
        "website_source": website_source,
        "opec_website": website,
        "facebook": facebook,
        "telephone": s.get("tel", "").strip(),
        "mobile": s.get("mobile", "").strip(),
        "email": s.get("email", "").strip(),
        "latitude": raw_lat,
        "longitude": raw_lon,
        # The raw OPEC pin, kept apart from latitude/longitude so that a better
        # answer from the GPS button never erases it — enrich_school_gps.py reads
        # these and never writes them.
        "opec_latitude": raw_lat,
        "opec_longitude": raw_lon,
        "gps_source": gps_source,
        "gps_precision": gps_precision,
        "opec_profile_url": f"https://school.opec.go.th/school/{code}",
        
        # Deep OPEC Profile Fields
        "levels_offered": levels,
        "level_range": level_range,
        # None = the request failed, so merge_with_previous keeps the last known value
        "student_count": s.get("_student_count"),
        "teacher_count": s.get("_teacher_count"),
        "curriculums": s.get("_curriculums"),
        "licensee_name": s.get("licenseeName", "").strip(),
        "director_name": s.get("directorName", "").strip(),
        "manager_name": s.get("managerName", "").strip(),
        "government_support": gov_support,
        "school_history": s.get("schoolHistory", "").strip(),
        "vision": s.get("sVision", "").strip(),
        "mission": s.get("sMission", "").strip(),
        "maxim": s.get("sMaxim", "").strip(),
        "uniqueness": s.get("sUniqueness", "").strip(),
        "identity": s.get("sIdentity", "").strip(),
        "tags": s.get("tags", "").strip(),
        "school_logo_url": school_logo_url,
        "line_id": s.get("lineID", "").strip(),
        "instagram": s.get("instagram", "").strip(),
        "tiktok": s.get("tiktok", "").strip(),
        "youtube": s.get("youtube", "").strip(),
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

# What the GPS button decided depends on these. While they are unchanged, its result stands;
# when one changes, the school goes back in the GPS button's queue.
GPS_INPUTS = ("opec_latitude", "opec_longitude", "province", "district", "subdistrict", "address")
GPS_RESULT = ("latitude", "longitude", "gps_source", "gps_precision")
GPS_CHECK = ("gps_confidence", "gps_confirmed_by", "gps_evidence", "gps_anchor", "gps_method", "gps_verified")
# Defaults for a new school whose count or curriculum request failed (the dataset's convention)
UNKNOWN_DEFAULTS = {"student_count": 0, "teacher_count": 0, "curriculums": []}


def merge_with_previous(fresh, old):
    """
    A freshly fetched OPEC record merged into what the dataset already holds for that school.

    OPEC's own fields take the fresh value, except one this run could not read (None).
    What the later steps added is kept:
      - school_name_en: OPEC's name wins unless it is empty or garbled (enrich_school_names_en)
      - website: a verified or hand-edited URL outranks OPEC's; a guessed one stays until OPEC has one
      - GPS: the checked result stays while its inputs (OPEC pin, address) are unchanged
      - ISAT fields and anything else OPEC does not supply
    """
    if not old:
        return {k: UNKNOWN_DEFAULTS.get(k) if v is None else v for k, v in fresh.items()}

    merged = {**old, **{k: v for k, v in fresh.items() if v is not None}}

    if is_garbled_name(fresh.get("school_name_en")) and not is_garbled_name(old.get("school_name_en")):
        merged["school_name_en"] = old["school_name_en"]

    old_web = str(old.get("website") or "").strip()
    old_src = str(old.get("website_source") or "")
    if old_web and (old_src.startswith("Verified") or old_src == "Manual Edit" or not fresh.get("website")):
        merged["website"], merged["website_source"] = old_web, old_src

    if all(str(old.get(k) or "") == str(fresh.get(k) or "") for k in GPS_INPUTS):
        for k in GPS_RESULT + GPS_CHECK:
            if k in old:
                merged[k] = old[k]
    else:
        for k in GPS_CHECK:
            merged.pop(k, None)
    return merged


def fetch_deep_detail(school):
    """
    The search row plus GetSchoolDetail, student/staff counts and curriculums.
    _detail_ok tells whether GetSchoolDetail answered; a count or curriculum list stays
    None when its request failed (as opposed to OPEC answering with nothing).
    """
    code = str(school.get("schoolCode", "")).strip()
    ct_code, b_code = make_multipart({"SchoolCode": code})
    detail = {}

    # Retry GetSchoolDetail up to 3 times
    for _ in range(3):
        try:
            dr = session.post(
                "https://school.opec.go.th/api/GetSchoolDetail",
                data=b_code,
                headers={"Content-Type": ct_code},
                timeout=8,
                verify=False
            )
            if dr.ok and dr.text:
                res_json = dr.json()
                if isinstance(res_json, dict) and res_json.get("provinceNameTh"):
                    detail = res_json
                    break
                elif isinstance(res_json, dict):
                    detail = res_json
        except Exception:
            time.sleep(0.3)

    merged = dict(school)
    merged.update(detail)
    merged["_detail_ok"] = bool(detail.get("provinceNameTh"))

    def ask(endpoint, body, content_type, expect):
        """OPEC's answer if it is of the expected type, else None. Two tries: under load it times out."""
        for _ in range(2):
            try:
                r = session.post(f"https://school.opec.go.th/api/{endpoint}", data=body,
                                 headers={"Content-Type": content_type}, timeout=8, verify=False)
                data = r.json() if r.ok else None
            except Exception:
                data = None
            if isinstance(data, expect):
                return data
        return None

    def count(endpoint, keys):
        data = ask(endpoint, b_code, ct_code, dict)
        try:
            return None if data is None else next((int(data[k]) for k in keys if data.get(k)), 0)
        except (TypeError, ValueError):
            return None

    # Exact student and teacher/staff counts
    merged["_student_count"] = count("GetCountStudent", ("countStudent", "countStudentAll"))
    merged["_teacher_count"] = count("GetCountEmployee", ("countEmployee", "countTeacherAll"))

    # Curriculums via SchoolPdcId. Thai and international programmes come from two endpoints;
    # both must answer, or the list stays None (the last known one is kept): half a list
    # would read as the school dropping a curriculum.
    pdc_id = merged.get("schoolPdcId") or merged.get("SchoolPdcId")
    curriculums = [] if not pdc_id else None
    if pdc_id:
        ct_p, b_p = make_multipart({"SchoolPdcId": str(pdc_id)})
        lists = [ask(endpoint, b_p, ct_p, list) for endpoint in ("GetCurriculumSearch", "GetCurriculumInterSearch")]
        if all(lst is not None for lst in lists):
            curriculums = []
            for item in lists[0] + lists[1]:
                if not isinstance(item, dict):
                    continue
                cname = (item.get("curriculumNameTh") or item.get("curriculumNameEn") or "").strip()
                if cname and cname not in curriculums:
                    curriculums.append(cname)
    merged["_curriculums"] = curriculums
    return merged


def fetch_opec_schools(update_progress, on_save_callback=None):
    """
    Main Runner for Button 1 (ดึงข้อมูล OPEC):
    1. Searches OPEC API for international schools (SchoolType 7).
    2. Multi-threads deep detail API calls for all schools with retries.
    3. Merges every record into the existing dataset (merge_with_previous) and saves once,
       at the end. A run that fails part-way leaves the dataset as it was.
    """
    update_progress("กำลังเริ่มเชื่อมต่อระบบ OPEC...", 0, 100, "กำลังเชื่อมต่อ school.opec.go.th...")
    previous = {str(s.get("school_code") or "").strip(): s for s in load_schools()}

    update_progress("กำลังดึงรายชื่อโรงเรียนจาก OPEC API...", 10, 100, "ส่งคำขอค้นหาโรงเรียนประเภทนานาชาติ...")
    intl_schools = search_international_schools()
    total_schools = len(intl_schools)
    # A short list means OPEC answered badly, not that a fifth of the schools closed overnight
    if total_schools == 0 or total_schools < 0.8 * len(previous):
        raise RuntimeError(f"OPEC ส่งรายชื่อโรงเรียนนานาชาติมา {total_schools} แห่ง (เดิมมี {len(previous)} แห่ง) "
                           "ดูผิดปกติ จึงไม่บันทึกทับข้อมูลเดิม")
    update_progress(f"พบโรงเรียนนานาชาติ {total_schools} แห่ง", 20, 100, f"กำลังดึงข้อมูลเชิงลึก (ระดับชั้น, นักเรียน, ครู, หลักสูตร) ทั้ง {total_schools} แห่ง...")

    records = []
    kept_old = 0

    with ThreadPoolExecutor(max_workers=25) as executor:
        future_to_school = {executor.submit(fetch_deep_detail, s): s for s in intl_schools}
        for completed_count, future in enumerate(as_completed(future_to_school), 1):
            res_school = future.result()
            code = str(res_school.get("schoolCode", "")).strip()
            sch_name = res_school.get('schoolNameTh', '')
            if not res_school.get("_detail_ok") and code in previous:
                # Half a profile would blank fields we already know: keep the old record
                records.append(previous[code])
                kept_old += 1
                msg = f"[{completed_count}/{total_schools}] ดึงรายละเอียดไม่สำเร็จ ใช้ข้อมูลเดิม: {sch_name}"
            else:
                records.append(merge_with_previous(build_pure_opec_record(res_school), previous.get(code)))
                msg = f"[{completed_count}/{total_schools}] ดึงสำเร็จ: {sch_name}"
            pct = 20 + int((completed_count / total_schools) * 75)
            update_progress(f"ดึงข้อมูลโปรไฟล์และสถิติเชิงลึก ({completed_count}/{total_schools})", pct, 100, msg)

    final_sorted = sorted(records, key=lambda x: str(x.get("school_code", "")))
    for i, r in enumerate(final_sorted, 1):
        r["no"] = i
    save_schools(final_sorted)
    if on_save_callback:
        on_save_callback(final_sorted)

    codes = {str(r.get("school_code")) for r in final_sorted}
    added = len(codes - set(previous))
    dropped = len(set(previous) - codes)
    recheck = sum(1 for r in final_sorted if not r.get("gps_method") and not r.get("gps_locked"))
    update_progress("ดึงข้อมูลจาก OPEC เสร็จแล้ว", 100, 100, (
        f"บันทึกข้อมูลโรงเรียนนานาชาติ {len(final_sorted)} แห่ง (ใหม่ {added}, ไม่อยู่ใน OPEC แล้ว {dropped}, "
        f"ดึงรายละเอียดไม่สำเร็จจึงใช้ข้อมูลเดิม {kept_old}) รอปักหมุด GPS {recheck} แห่ง"))
    return final_sorted
