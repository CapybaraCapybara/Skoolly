import { useEffect, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { getSchoolHistory, type SchoolChange } from "@/api/adminApi";
import { ACTION_LABELS } from "@/components/admin/SchoolVersionHistory";

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
  is_isat_member: "สมาชิก ISAT",
  isat_school_name: "ชื่อใน ISAT",
  accreditations: "การรับรอง",
  is_boarding: "มีหอพัก",
  year_established: "ปีที่ก่อตั้ง",
  opec_missing_since: "ไม่อยู่ในรายชื่อ สช. ตั้งแต่",
  archived_at: "ปิดโรงเรียนเมื่อ",
  archived_reason: "เหตุผลที่ปิด",
};

const TZ = "Asia/Bangkok";

function when(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ,
  });
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  // the API turns a version id into its number; one it could not find stays an id
  if (key === "current_published_version_id") return typeof value === "number" ? `ฉบับ ${value}` : "ไม่ทราบเลขฉบับ";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "number") return value.toLocaleString("th-TH");
  if (typeof value === "object") return JSON.stringify(value);
  if (key.endsWith("_at") && typeof value === "string") return when(value);
  return String(value);
}

/** Who made the change and, under it, what they did */
function editor(c: SchoolChange): { who: string; chip: string; what?: string; title?: string } {
  if (c.action === "school.create") return { who: "ระบบ", chip: "bg-warm-card text-[#78716c]" };
  const label = ACTION_LABELS[c.action.slice("school.".length)];
  if (!label) {
    return {
      who: "ไม่ทราบ",
      chip: "border border-dashed border-warm-accent text-[#a8a29e]",
      title: "บันทึกก่อนที่ระบบจะเก็บผู้แก้ (6 พ.ย. 2569)",
    };
  }
  return c.actor_type === "admin"
    ? { who: "แอดมิน", chip: "bg-warm-charcoal text-white", what: label.replace(/^แอดมิน/, "") }
    : { who: "ระบบ", chip: "bg-warm-card text-[#78716c]", what: label };
}

/** The browser's date picker, but the value reads วว/ดด/ปปปป (พ.ศ.) like the rest of the page,
 *  whatever locale the browser uses: the native input sits invisible on top of the formatted text. */
function DateField({ label, value, min, max, onChange, className }: {
  label: string; value: string; min?: string; max?: string; onChange: (v: string) => void; className: string;
}) {
  const [y, m, d] = value.split("-");
  return (
    <span className="relative inline-flex">
      <span aria-hidden className={`${className} min-w-[9.5rem] flex items-center justify-between gap-2 ${value ? "" : "text-[#a8a29e]"}`}>
        {value ? `${d}/${m}/${Number(y) + 543}` : "วว/ดด/ปปปป"}
        <CalendarDays className="w-4 h-4 text-[#a8a29e]" />
      </span>
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      />
    </span>
  );
}

/** Every change to one school's data, newest first, as the database logged it (trigger log_school_change).
 *  Without a school code: the latest changes across every school, with a search by school name or code. */
export function SchoolChangeHistory({ schoolCode }: { schoolCode?: string }) {
  const [changes, setChanges] = useState<SchoolChange[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const all = !schoolCode;
  const badRange = !!dateFrom && !!dateTo && dateFrom > dateTo;

  // ask the server once typing pauses
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (badRange) return;
    let live = true;
    setChanges(null);
    setError("");
    getSchoolHistory(schoolCode, search, dateFrom, dateTo)
      .then((h) => live && setChanges(h))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [schoolCode, search, dateFrom, dateTo, badRange]);

  const filtered = !!(search || dateFrom || dateTo);
  const dateInput =
    "px-3 py-2 rounded-xl bg-white border border-[#e5dcce] text-warm-charcoal focus:outline-hidden focus:ring-2 focus:ring-warm-bronze/30";

  const cols = all
    ? "md:grid-cols-[7rem_9rem_minmax(0,14rem)_minmax(0,1fr)]"
    : "sm:grid-cols-[7rem_9rem_minmax(0,1fr)]";

  return (
    <div className="flex flex-col gap-3 text-xs">
      {all && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              placeholder="ค้นหาชื่อโรงเรียน หรือรหัส สช."
              aria-label="ค้นหาชื่อโรงเรียน หรือรหัส สช."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-[#e5dcce] text-warm-charcoal placeholder-[#a8a29e] focus:outline-hidden focus:ring-2 focus:ring-warm-bronze/30"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[#78716c]">
            ตั้งแต่
            <DateField label="ตั้งแต่วันที่" value={dateFrom} max={dateTo} onChange={setDateFrom} className={dateInput} />
          </label>
          <label className="flex items-center gap-1.5 text-[#78716c]">
            ถึง
            <DateField label="ถึงวันที่" value={dateTo} min={dateFrom} onChange={setDateTo} className={dateInput} />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-warm-bronze underline underline-offset-2"
            >
              ล้างวันที่
            </button>
          )}
        </div>
      )}

      {badRange && <p className="text-rose-700">วันที่เริ่มต้องไม่อยู่หลังวันที่สิ้นสุด</p>}
      {error && <p className="text-rose-700">{error}</p>}
      {!changes && !error && !badRange && <p className="text-[#78716c]">กำลังโหลด…</p>}
      {changes && !changes.length && !badRange && (
        <p className="text-[#a8a29e] italic">
          {filtered ? "ไม่พบการแก้ไขตามที่ค้นหา" : "ยังไม่มีการแก้ไขที่บันทึกไว้"}
        </p>
      )}

      {changes && changes.length > 0 && !badRange && (
        <div className={`bg-white border border-warm-accent rounded-xl ${all ? "" : "max-h-80 overflow-y-auto"}`}>
          <div
            className={`hidden ${all ? "md:grid" : "sm:grid"} ${cols} gap-x-4 px-4 py-2 border-b border-warm-accent bg-warm-cream text-[11px] font-semibold text-[#78716c] rounded-t-xl`}
          >
            <span>เวลา</span>
            <span>ผู้แก้</span>
            {all && <span>โรงเรียน</span>}
            <span>สิ่งที่แก้</span>
          </div>
          <ol className="divide-y divide-warm-accent/70">
            {changes.map((c, i) => {
              const ed = editor(c);
              const d = new Date(c.changed_at);
              return (
                <li key={i} className={`grid grid-cols-1 ${cols} gap-x-4 gap-y-1.5 px-4 py-3`}>
                  <div className="text-warm-charcoal">
                    <span className="font-semibold">
                      {d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}
                    </span>
                    <span className="text-[#78716c]">
                      {" "}
                      {d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 md:flex-col md:items-start">
                    <span title={ed.title} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ed.chip}`}>
                      {ed.who}
                    </span>
                    {ed.what && <span className="text-[#78716c]">{ed.what}</span>}
                  </div>

                  {all && (
                    <div className="min-w-0">
                      <div className="font-semibold text-warm-charcoal break-words">{c.name_th}</div>
                      <div className="text-[#a8a29e] break-words">
                        {c.name_en ? `${c.name_en} · ` : ""}
                        {c.school_code}
                      </div>
                    </div>
                  )}

                  {c.action === "school.create" ? (
                    <div className="text-warm-charcoal">เพิ่มโรงเรียนเข้าระบบ</div>
                  ) : (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 min-w-0">
                      {Object.keys(c.after).map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-[#78716c]">{FIELD_LABELS[k] ?? k}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="line-through text-[#a8a29e]">{show(k, c.before[k])}</span>
                            <span className="text-[#78716c]">{" → "}</span>
                            <span className="text-warm-charcoal font-medium">{show(k, c.after[k])}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
