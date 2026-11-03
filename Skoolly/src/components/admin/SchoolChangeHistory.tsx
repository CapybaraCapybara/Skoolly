import { useEffect, useState } from "react";
import { getSchoolHistory, type SchoolChange } from "@/api/opecApi";

// Column names in school_data.schools; one not listed shows as the column name
const FIELD_LABELS: Record<string, string> = {
  name_th: "ชื่อภาษาไทย",
  name_en: "ชื่อภาษาอังกฤษ",
  status: "สถานะ",
  current_published_version_id: "ฉบับข้อมูลที่เผยแพร่",
  official_website_url: "เว็บไซต์",
  website_source: "ที่มาของเว็บไซต์",
  website_confirmed_at: "ยืนยันเว็บไซต์เมื่อ",
  opec_profile_url: "หน้าโปรไฟล์ สช.",
  official_phone: "เบอร์โทร",
  official_mobile: "มือถือ",
  official_email: "อีเมล",
  social_links: "โซเชียล",
  province: "จังหวัด",
  district: "อำเภอ/เขต",
  subdistrict: "ตำบล/แขวง",
  address: "ที่อยู่",
  geom: "พิกัด",
  gps_precision: "ความแม่นยำของพิกัด",
  gps_source: "ที่มาของพิกัด",
  logo_url: "โลโก้",
  level_range: "ช่วงชั้น",
  levels_offered: "ระดับชั้น",
  curriculums: "หลักสูตร",
  curriculums_confirmed_at: "แอดมินยืนยันหลักสูตรเมื่อ",
  curriculums_confirmed_by: "ยืนยันหลักสูตรโดย",
  student_count: "จำนวนนักเรียน",
  teacher_count: "จำนวนครู",
  pub_tuition_min_thb: "ค่าเทอมต่ำสุด",
  pub_tuition_max_thb: "ค่าเทอมสูงสุด",
  pub_has_safeguarding_policy: "นโยบายคุ้มครองเด็ก",
  pub_data_updated_at: "วันที่ของข้อมูลค่าเทอม",
  licensee_name: "ผู้รับใบอนุญาต",
  director_name: "ผู้อำนวยการ",
  manager_name: "ผู้จัดการ",
  government_support: "เงินอุดหนุน",
  is_isat_member: "สมาชิก ISAT",
  isat_school_name: "ชื่อใน ISAT",
  accreditations: "การรับรอง",
  is_boarding: "มีหอพัก",
  year_established: "ปีที่ก่อตั้ง",
  opec_missing_since: "ไม่อยู่ในรายชื่อ สช. ตั้งแต่",
  archived_at: "ปิดโรงเรียนเมื่อ",
  archived_reason: "เหตุผลที่ปิด",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "number") return value.toLocaleString("th-TH");
  if (typeof value === "object") return JSON.stringify(value);
  if (key.endsWith("_at") && typeof value === "string") return when(value);
  return String(value);
}

/** Every change to one school's data, newest first, as the database logged it (trigger log_school_change).
 *  Without a school code: the latest changes across every school, each with the school's name. */
export function SchoolChangeHistory({ schoolCode }: { schoolCode?: string }) {
  const [changes, setChanges] = useState<SchoolChange[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setChanges(null);
    setError("");
    getSchoolHistory(schoolCode)
      .then((h) => live && setChanges(h))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [schoolCode]);

  if (error) return <p className="text-xs text-rose-700">{error}</p>;
  if (!changes) return <p className="text-xs text-[#78716c]">กำลังโหลด…</p>;
  if (!changes.length) return <p className="text-xs text-[#a8a29e] italic">ยังไม่มีการแก้ไขที่บันทึกไว้</p>;

  return (
    <ol className={`space-y-2.5 text-xs ${schoolCode ? "max-h-80 overflow-y-auto pr-1" : ""}`}>
      {changes.map((c, i) => (
        <li key={i} className="border border-warm-accent rounded-xl p-3 bg-white">
          <div className="font-semibold text-warm-charcoal mb-1.5">
            {when(c.changed_at)}
            {!schoolCode && <span className="text-warm-bronze">{` · ${c.name_th} (${c.school_code})`}</span>}
          </div>
          {c.action === "school.create" ? (
            <div className="text-warm-charcoal">เพิ่มโรงเรียนเข้าระบบ</div>
          ) : (
            Object.keys(c.after).map((k) => (
              <div key={k} className="flex flex-wrap gap-x-1.5 py-0.5">
                <span className="text-[#78716c] font-medium">{FIELD_LABELS[k] ?? k}:</span>
                {k.endsWith("_id") ? (
                  <span className="text-warm-charcoal font-medium">เปลี่ยน</span>
                ) : (
                  <>
                    <span className="line-through text-[#a8a29e] break-words">{show(k, c.before[k])}</span>
                    <span className="text-[#78716c]">→</span>
                    <span className="text-warm-charcoal font-medium break-words">{show(k, c.after[k])}</span>
                  </>
                )}
              </div>
            ))
          )}
        </li>
      ))}
    </ol>
  );
}
