"""
fetch_opec.py
โมดูลสำหรับปุ่มที่ 1 (ดึงข้อมูล OPEC):
ดึงข้อมูลจาก school.opec.go.th เท่านั้น 100%
- ดึงรายชื่อโรงเรียนนานาชาติทั้งหมดในระบบ สช. (SchoolType 7)
- ดึงข้อมูลสถิติจำนวนนักเรียน (GetCountStudent), จำนวนครู/บุคลากร (GetCountEmployee)
- ดึงระดับชั้นที่เปิดสอน (level1 - level5) และหลักสูตร (GetCurriculumSearch)
- ดึงที่อยู่, ผู้รับใบอนุญาต, ผู้อำนวยการ, ผู้จัดการ, ประวัติโรงเรียน, พิกัด OPEC และเว็บไซต์จากโปรไฟล์ OPEC (ถ้ามี)
"""

import re
import os
import json
import time
import requests
import urllib3
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from data_manager import save_schools

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

def build_pure_opec_record(s):
    """Transforms raw OPEC API response into standard school record (100% Pure OPEC Data)"""
    code = str(s.get("schoolCode", "")).strip()
    name_th = s.get("schoolNameTh", "").strip()
    name_en = s.get("schoolNameEn", "").strip()

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
            gps_source = "OPEC Official"
            gps_precision = "Exact"
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
        "gps_source": gps_source,
        "gps_precision": gps_precision,
        "opec_profile_url": f"https://school.opec.go.th/school/{code}",
        
        # Deep OPEC Profile Fields
        "levels_offered": levels,
        "level_range": level_range,
        "student_count": s.get("_student_count", 0),
        "teacher_count": s.get("_teacher_count", 0),
        "curriculums": s.get("_curriculums", []),
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

def fetch_opec_schools(update_progress, on_save_callback=None):
    """
    Main Runner for Button 1 (ดึงข้อมูล OPEC):
    1. Searches OPEC API for international schools (SchoolType 7).
    2. Multi-threads deep detail API calls for all schools with retries.
    3. Formats clean records incrementally, saves to data/, and updates UI in real-time.
    """
    update_progress("กำลังเริ่มเชื่อมต่อระบบ OPEC...", 0, 100, "กำลังเชื่อมต่อ school.opec.go.th...")

    # Clear old data at start so UI starts fresh
    save_schools([])
    if on_save_callback:
        on_save_callback([])

    update_progress("กำลังดึงรายชื่อโรงเรียนจาก OPEC API...", 10, 100, "ส่งคำขอค้นหาโรงเรียนประเภทนานาชาติ...")
    fields = {
        "SchoolCodeName": "",
        "Course": "",
        "Tags": "",
        "ProvinceCode": "",
        "AmphurCode": "",
        "TumbolCode": "",
        "SchoolTypeGroup": "1"
    }
    content_type, body = make_multipart(fields)
    r = session.post(
        "https://school.opec.go.th/api/GetSchoolSearch",
        data=body,
        headers={"Content-Type": content_type},
        timeout=30,
        verify=False
    )
    all_schools = r.json()

    # SchoolType 7 = International Schools
    intl_schools = [s for s in all_schools if str(s.get("schoolType1")) == "7"]
    total_schools = len(intl_schools)
    update_progress(f"พบโรงเรียนนานาชาติ {total_schools} แห่ง", 20, 100, f"กำลังดึงข้อมูลเชิงลึก (ระดับชั้น, นักเรียน, ครู, หลักสูตร) ทั้ง {total_schools} แห่ง...")

    def fetch_deep_detail(school):
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
        if isinstance(detail, dict):
            merged.update(detail)

        student_count = 0
        teacher_count = 0
        curriculums = []
        pdc_id = merged.get("schoolPdcId") or merged.get("SchoolPdcId")

        # 1. Exact Student Count via GetCountStudent (SchoolCode)
        try:
            r_stud = session.post("https://school.opec.go.th/api/GetCountStudent", data=b_code, headers={"Content-Type": ct_code}, timeout=5, verify=False)
            if r_stud.ok:
                sd = r_stud.json()
                if isinstance(sd, dict) and "countStudent" in sd and sd["countStudent"]:
                    student_count = int(sd["countStudent"])
                elif isinstance(sd, dict) and "countStudentAll" in sd and sd["countStudentAll"]:
                    student_count = int(sd["countStudentAll"])
        except Exception:
            pass

        # 2. Exact Teacher & Staff Count via GetCountEmployee (SchoolCode)
        try:
            r_teach = session.post("https://school.opec.go.th/api/GetCountEmployee", data=b_code, headers={"Content-Type": ct_code}, timeout=5, verify=False)
            if r_teach.ok:
                td = r_teach.json()
                if isinstance(td, dict) and "countEmployee" in td and td["countEmployee"]:
                    teacher_count = int(td["countEmployee"])
                elif isinstance(td, dict) and "countTeacherAll" in td and td["countTeacherAll"]:
                    teacher_count = int(td["countTeacherAll"])
        except Exception:
            pass

        # 3. Curriculums via SchoolPdcId
        if pdc_id:
            ct_p, b_p = make_multipart({"SchoolPdcId": str(pdc_id)})
            try:
                r_c = session.post("https://school.opec.go.th/api/GetCurriculumSearch", data=b_p, headers={"Content-Type": ct_p}, timeout=4, verify=False)
                if r_c.ok:
                    cd = r_c.json()
                    if isinstance(cd, list):
                        for item in cd:
                            cname = (item.get("curriculumNameTh") or item.get("curriculumNameEn") or "").strip()
                            if cname and cname not in curriculums:
                                curriculums.append(cname)
            except Exception:
                pass

            try:
                r_ci = session.post("https://school.opec.go.th/api/GetCurriculumInterSearch", data=b_p, headers={"Content-Type": ct_p}, timeout=4, verify=False)
                if r_ci.ok:
                    cid = r_ci.json()
                    if isinstance(cid, list):
                        for item in cid:
                            cname = (item.get("curriculumNameTh") or item.get("curriculumNameEn") or "").strip()
                            if cname and cname not in curriculums:
                                curriculums.append(cname)
            except Exception:
                pass

        merged["_student_count"] = student_count
        merged["_teacher_count"] = teacher_count
        merged["_curriculums"] = curriculums
        return merged

    clean_records = []
    completed_count = 0
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=25) as executor:
        future_to_school = {executor.submit(fetch_deep_detail, s): s for s in intl_schools}
        for future in as_completed(future_to_school):
            res_school = future.result()
            rec = build_pure_opec_record(res_school)
            
            with lock:
                clean_records.append(rec)
                completed_count += 1
                pct = 20 + int((completed_count / total_schools) * 75)
                
                sch_name = res_school.get('schoolNameTh', '')
                update_progress(
                    f"ดึงข้อมูลโปรไฟล์และสถิติเชิงลึก ({completed_count}/{total_schools})",
                    pct, 100,
                    f"[{completed_count}/{total_schools}] ดึงสำเร็จ: {sch_name}"
                )

                # Incremental Save every 5 schools and at completion so UI table matches log 1:1
                if completed_count % 5 == 0 or completed_count == total_schools:
                    sorted_records = sorted(clean_records, key=lambda x: str(x.get("school_code", "")))
                    for i, r in enumerate(sorted_records, 1):
                        r["no"] = i
                    save_schools(sorted_records)
                    if on_save_callback:
                        on_save_callback(sorted_records)

    # Final Save and Sort
    final_sorted = sorted(clean_records, key=lambda x: str(x.get("school_code", "")))
    for i, r in enumerate(final_sorted, 1):
        r["no"] = i
    save_schools(final_sorted)
    if on_save_callback:
        on_save_callback(final_sorted)

    update_progress("ดึงข้อมูลจาก OPEC เสร็จสมบูรณ์!", 100, 100, f"บันทึกข้อมูลโรงเรียนนานาชาติและสถิติเชิงลึก {len(final_sorted)} แห่งเรียบร้อยแล้ว")
    return final_sorted
