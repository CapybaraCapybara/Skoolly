import { useState, useEffect } from "react";
import type { School, SchoolDetail } from "@/types";
import { getSchoolDetail } from "@/api/schoolsApi";
import { getSchoolInitials } from "@/components/schools/SchoolCard";

// ─── StarRating ─────────────────────────────────────────────────────────────
function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className={sz} viewBox="0 0 20 20" fill={s <= Math.round(rating) ? "#f59e0b" : "#d1d5db"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

// ─── Tab list ────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Fees", "Gallery", "Reviews", "Forum"];

// ─── Props ───────────────────────────────────────────────────────────────────
interface SchoolDetailPageProps {
  school: School;
  onBack: () => void;
  onForum: () => void;
  onOpenCalculator?: () => void;
}

// ─── Format date helper ───────────────────────────────────────────────────────
function formatLastUpdated(val?: string | number): string {
  if (!val || val === "ไม่มีข้อมูล") return "ไม่มีข้อมูล";
  const str = String(val).trim();
  const parsed = Date.parse(str);
  if (!isNaN(parsed) && (str.includes("-") || str.includes("/"))) {
    try {
      const d = new Date(parsed);
      return d.toLocaleDateString("th-TH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return str;
    }
  }
  return str;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export function SchoolDetailPage({ school, onBack, onForum, onOpenCalculator }: SchoolDetailPageProps) {
  const [tab, setTab] = useState("Overview");
  const [detail, setDetail] = useState<SchoolDetail | null>(null);
  const [detailMissing, setDetailMissing] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // ── Fetch extended school detail from the API layer on mount ───────────────
  useEffect(() => {
    setDetailMissing(false);
    getSchoolDetail(school.id)
      .then((d) => {
        setDetail(d ?? null);
        setDetailMissing(!d);
      })
      .catch(() => setDetailMissing(true));
  }, [school.id]);

  if (detailMissing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="text-slate-500 text-sm">โหลดข้อมูลโรงเรียนนี้ไม่สำเร็จ</div>
        <button onClick={onBack} className="text-sm font-semibold text-warm-bronze hover:underline">
          ← กลับไปหน้ารายชื่อ
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">กำลังโหลดข้อมูลโรงเรียน…</div>
      </div>
    );
  }

  const rawLastUpdated =
    detail.lastUpdated ||
    school.lastUpdated ||
    (detail as any).last_updated ||
    (detail as any).updated_at ||
    (school as any).last_updated;
  const lastUpdatedDisplay = formatLastUpdated(rawLastUpdated);

  const logoSrc = detail.logoUrl || school.logoUrl || (school.image?.startsWith("http") ? school.image : null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Hero Header: Branded School Presentation with Official Logo ── */}
      <div className="relative min-h-[290px] md:min-h-[320px] bg-gradient-to-br from-slate-900 via-navy-950 to-slate-900 overflow-hidden flex flex-col justify-between p-6 md:p-8">
        {/* Soft background ambient glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-warm-bronze/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar: Back button & Official verification badge */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white text-sm font-medium px-4 py-2 rounded-full transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            ย้อนกลับ
          </button>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            <div
              id="school-last-updated-badge"
              className="flex items-center gap-1.5 bg-slate-900/60 hover:bg-slate-900/80 backdrop-blur-md border border-white/20 text-white text-xs font-medium px-3.5 py-1.5 rounded-full shadow-md select-none"
              title="วันที่อัปเดตข้อมูลล่าสุด"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-300">อัปเดต:</span>
              <span className="font-semibold text-white">{lastUpdatedDisplay}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full select-none shadow-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>ข้อมูลทางการ สช. (OPEC)</span>
            </div>
          </div>
        </div>

        {/* Hero main identity: Official School Logo & Verified Titles */}
        <div className="relative z-10 max-w-5xl mx-auto w-full flex flex-col md:flex-row items-start md:items-center gap-5 my-auto pt-6 pb-2">
          {/* Official Logo Container */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white p-3 shadow-xl border border-white/20 flex items-center justify-center shrink-0">
            {logoSrc && !logoFailed ? (
              <img
                src={logoSrc}
                alt={`โลโก้ ${school.name}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-warm-bronze/10 border border-warm-bronze/20 flex flex-col items-center justify-center text-warm-bronze font-bold text-xl tracking-wider select-none">
                {getSchoolInitials(school.name)}
              </div>
            )}
          </div>

          {/* School Titles & Metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {school.badge && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-white bg-warm-bronze shadow-xs">
                  {school.badge}
                </span>
              )}
              {detail.schoolCode && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10">
                  รหัสโรงเรียน: {detail.schoolCode}
                </span>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl text-white font-bold leading-tight">
              {school.name}
            </h1>
            {school.nameTh && school.nameTh !== school.name && (
              <p className="text-slate-300 text-sm sm:text-base mt-1 font-normal">
                {school.nameTh}
              </p>
            )}

            <div className="flex items-center gap-3 mt-3 text-slate-300 text-xs sm:text-sm flex-wrap">
              {school.reviewCount > 0 && school.rating > 0 ? (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={school.rating} size="lg" />
                  <span className="text-white font-semibold">{school.rating}</span>
                  <span className="text-slate-400">({school.reviewCount} รีวิว)</span>
                </div>
              ) : (
                <span className="text-slate-400 italic">ยังไม่มีรีวิว</span>
              )}
              <span>·</span>
              <span>{school.location}</span>
              <span>·</span>
              <span>หลักสูตร {school.curriculum}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => (t === "Forum" ? onForum() : setTab(t))}
              className={`px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${tab === t && t !== "Forum"
                ? "border-teal-500 text-teal-700 font-bold"
                : "border-transparent text-slate-500 hover:text-navy-900"
                }`}
            >
              {t === "Forum" ? "💬 " + t : t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {/* About the School (Authentic OPEC summary) */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h2 className="font-semibold text-navy-900 text-lg mb-3">About the School (ข้อมูลโรงเรียน)</h2>
                <p className="text-slate-600 text-sm leading-relaxed">{detail.about}</p>
              </div>

              {/* School Academic & Operational Profile */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h2 className="font-semibold text-navy-900 text-lg mb-4">Academic & Campus Standards (ข้อมูลมาตรฐานสถานศึกษา)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 block mb-0.5">ระดับชั้นที่เปิดสอน</span>
                    <span className="font-semibold text-slate-800">{detail.levelRange || (detail.levelsOffered?.length ? detail.levelsOffered.join(", ") : "ไม่ระบุ")}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 block mb-0.5">หลักสูตรการศึกษา</span>
                    <span className="font-semibold text-slate-800">{detail.curriculums?.length ? detail.curriculums.join(", ") : school.curriculum}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 block mb-0.5">สถานะหอพักนักเรียน</span>
                    <span className="font-semibold text-slate-800">{detail.isBoarding ? "มีหอพักประจำ (Boarding School)" : "ไม่มีหอพัก (Day School ไป-กลับ)"}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 block mb-0.5">สมาชิกสมาคม ISAT</span>
                    <span className="font-semibold text-slate-800">{detail.isIsatMember ? "เป็นสมาชิก ISAT (International Schools Association of Thailand)" : "ไม่ได้เป็นสมาชิก ISAT"}</span>
                  </div>
                </div>
              </div>

              {/* Facilities: Strictly truthful */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h2 className="font-semibold text-navy-900 text-lg mb-3">Facilities (สิ่งอำนวยความสะดวก)</h2>
                {detail.facilities && detail.facilities.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {detail.facilities.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-slate-700">
                        <svg className="w-4 h-4 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-1">ยังไม่มีข้อมูลสิ่งอำนวยความสะดวกในฐานข้อมูล OPEC</p>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">
                      ระบบบันทึกเฉพาะข้อมูลทางการ ผู้ปกครองสามารถตรวจสอบสิ่งอำนวยความสะดวก ห้องเรียน ห้องปฏิบัติการ และพื้นที่กิจกรรมได้โดยตรงจากเว็บไซต์ทางการของโรงเรียน
                    </p>
                    {detail.website && (
                      <a
                        href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        เข้าชมเว็บไซต์ทางการของโรงเรียน ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Child Safeguarding Policy: Truthful DB verification */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold">
                    🛡️
                  </div>
                  <div>
                    <h2 className="font-semibold text-navy-900 text-lg leading-tight">Child Safeguarding & Safety Policy</h2>
                    <span className="text-xs text-slate-500">ข้อมูลมาตรฐานความปลอดภัยและสวัสดิภาพเด็ก</span>
                  </div>
                </div>

                {detail.safety?.safeguardingPolicy ? (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
                    <div className="flex items-center gap-2 font-semibold text-emerald-800 mb-1">
                      <span className="text-base">✓</span>
                      <span>ผ่านการรับรองนโยบายคุ้มครองสวัสดิภาพเด็ก (Child Safeguarding Policy)</span>
                    </div>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      โรงเรียนมีนโยบายคุ้มครองความปลอดภัยและสวัสดิภาพของนักเรียนตามเกณฑ์มาตรฐานการรับรองของ สช./ISAT
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-1">ยังไม่มีข้อมูลนโยบายความปลอดภัยที่เผยแพร่ผ่านระบบ OPEC</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      ผู้ปกครองสามารถสอบถามรายละเอียดเกี่ยวกับมาตรการความปลอดภัย การดูแลทางการแพทย์ และการคัดกรองบุคลากรได้โดยตรงจากทางโรงเรียน
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Facts */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                <h3 className="font-semibold text-navy-900 mb-3 text-sm">Quick Facts (ข้อมูลพื้นฐาน)</h3>
                <div className="space-y-2.5">
                  {[
                    ["ก่อตั้งปี (Founded)", detail.founded],
                    ["จำนวนนักเรียน (Students)", detail.students],
                    ["จำนวนครู (Teachers)", detail.teacherCount ? `${detail.teacherCount.toLocaleString()} คน` : "ไม่มีข้อมูล"],
                    ["สัดส่วนนักเรียนต่อครู", detail.studentTeacherRatio ? `1 : ${detail.studentTeacherRatio}` : "ไม่มีข้อมูล"],
                    ["หลักสูตร (Curriculum)", school.curriculum],
                    ["ระดับชั้น (Grades)", school.grades || "ไม่มีข้อมูล"],
                    ["หอพัก (Boarding)", detail.isBoarding ? "มีหอพัก (Boarding)" : "ไม่มีหอพัก (Day School)"],
                    ["สมาชิก ISAT", detail.isIsatMember ? "เป็นสมาชิก ISAT" : "ไม่ได้เป็นสมาชิก"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-medium text-navy-900 text-right max-w-[55%]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                <h3 className="font-semibold text-navy-900 mb-2 text-sm">Location (ที่ตั้ง)</h3>
                <div className="text-sm text-slate-600 leading-relaxed">{detail.address || school.location}</div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${school.name} ${detail.address || school.location}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z" />
                    <circle cx="12" cy="9.5" r="2.5" />
                  </svg>
                  เปิดดูตำแหน่งใน Google Maps ↗
                </a>
              </div>

              {/* Contact Information */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                <h3 className="font-semibold text-navy-900 mb-3 text-sm">Contact (การติดต่อโรงเรียน)</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">โทรศัพท์:</span>
                    {detail.officialPhone ? (
                      <a href={`tel:${detail.officialPhone}`} className="text-teal-700 font-semibold hover:underline">
                        {detail.officialPhone}
                      </a>
                    ) : (
                      <span className="text-slate-400">ไม่มีข้อมูล</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">อีเมล:</span>
                    {detail.officialEmail ? (
                      <a href={`mailto:${detail.officialEmail}`} className="text-teal-700 font-semibold hover:underline truncate max-w-[65%]">
                        {detail.officialEmail}
                      </a>
                    ) : (
                      <span className="text-slate-400">ไม่มีข้อมูล</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">เว็บไซต์:</span>
                    {detail.website ? (
                      <a
                        href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 font-semibold hover:underline truncate max-w-[65%]"
                      >
                        {detail.website.replace(/^https?:\/\/(www\.)?/, "")} ↗
                      </a>
                    ) : (
                      <span className="text-slate-400">ไม่มีข้อมูล</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Accreditation */}
              {detail.accreditation && detail.accreditation.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                  <h3 className="font-semibold text-navy-900 mb-2 text-sm">Accreditation (การรับรองวิทยฐานะ)</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.accreditation.map((a) => (
                      <span key={a} className="bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Starting Tuition */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                <h3 className="font-semibold text-navy-900 mb-2 text-sm">Starting Tuition (ค่าธรรมเนียมเริ่มต้น)</h3>
                {school.tuitionStart > 0 ? (
                  <>
                    <div className="text-2xl font-bold text-navy-900">฿{(school.tuitionStart / 1000).toFixed(0)}K</div>
                    <div className="text-xs text-slate-500 mt-0.5">ต่อปี (ประมาณการ) · ดูรายละเอียดเพิ่มเติมในแท็บ Fees</div>
                    <button
                      onClick={() => setTab("Fees")}
                      className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors cursor-pointer"
                    >
                      ดูตารางค่าธรรมเนียมการศึกษา →
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-slate-600">ติดต่อโรงเรียนเพื่อสอบถาม</div>
                    <div className="text-xs text-slate-500 mt-1">ยังไม่มีข้อมูลค่าธรรมเนียมการศึกษาในระบบ OPEC</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── FEES ─────────────────────────────────────────────────────────── */}
        {tab === "Fees" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h2 className="font-semibold text-navy-900 text-lg mb-1">{school.name} — Fee Schedule</h2>
              <p className="text-xs text-slate-500 mb-5">ข้อมูลค่าธรรมเนียมการศึกษาทางการตามที่บันทึกในฐานข้อมูลระบบ</p>

              {detail.fees && detail.fees.length > 0 ? (
                <div className="space-y-2 mb-6">
                  {detail.fees.map((f, i) => (
                    <div
                      key={i}
                      className={`flex justify-between items-center py-3.5 px-4 rounded-xl text-sm ${i % 2 === 0 ? "bg-slate-50" : "bg-white border border-slate-100"}`}
                    >
                      <span className="text-slate-700 font-medium">{f.label}</span>
                      <span className="font-bold text-navy-900">{f.amount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-6 text-center mb-6">
                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-2 text-base font-bold">
                    ฿
                  </div>
                  <h3 className="font-semibold text-navy-900 text-sm mb-1">ยังไม่มีข้อมูลโครงสร้างค่าเล่าเรียนในระบบ OPEC</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                    โรงเรียนยังไม่ได้เผยแพร่โครงสร้างค่าเล่าเรียนผ่านฐานข้อมูล สช. ท่านสามารถติดต่อสอบถามข้อมูลค่าเล่าเรียนและค่าธรรมเนียมล่าสุดได้จากทางโรงเรียนโดยตรง
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {detail.officialPhone && (
                      <a
                        href={`tel:${detail.officialPhone}`}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors inline-flex items-center gap-1.5"
                      >
                        📞 โทร {detail.officialPhone}
                      </a>
                    )}
                    {detail.website && (
                      <a
                        href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors inline-flex items-center gap-1"
                      >
                        เว็บไซต์โรงเรียน ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Multi-Year Calculator Card */}
              <div className="bg-warm-cream border border-warm-accent rounded-2xl p-5 shadow-2xs">
                <div className="text-sm font-bold text-warm-charcoal mb-1">Interactive Multi-Year Cost Calculator</div>
                <div className="text-xs text-warm-charcoal/70">
                  คำนวณและจำลองค่าใช้จ่ายตลอดช่วงชั้นการศึกษา รวมค่าแรกเข้า ค่าชุด และค่าบำรุง
                </div>
                <button
                  onClick={onOpenCalculator}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-warm-bronze hover:bg-warm-bronze/90 transition-all shadow-xs cursor-pointer"
                >
                  เปิดเครื่องคำนวณค่าใช้จ่ายสำหรับ {school.name} →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── GALLERY ──────────────────────────────────────────────────────── */}
        {tab === "Gallery" && (
          <div className="max-w-3xl mx-auto">
            {detail.gallery && detail.gallery.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {detail.gallery.map((img, i) => (
                  <div key={i} className="overflow-hidden rounded-2xl bg-slate-100 h-48">
                    <img
                      src={img.startsWith("http") ? img : `https://images.unsplash.com/${img}?w=600&h=400&fit=crop&auto=format`}
                      alt={`${school.name} photo ${i + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-xs">
                <div className="w-20 h-20 mx-auto mb-3 p-2 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center">
                  {logoSrc && !logoFailed ? (
                    <img
                      src={logoSrc}
                      alt={school.name}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-slate-400">🏫</span>
                  )}
                </div>
                <h3 className="font-bold text-navy-900 text-base mb-1">ยังไม่มีรูปภาพแกลเลอรีในระบบ</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mb-4">
                  ระบบแสดงเฉพาะรูปภาพที่ผ่านการตรวจสอบอย่างเป็นทางการ ท่านสามารถเข้าชมภาพบรรยากาศและอาคารสถานที่จริงได้จากเว็บไซต์ทางการของโรงเรียน
                </p>
                {detail.website && (
                  <a
                    href={detail.website.startsWith("http") ? detail.website : `https://${detail.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                  >
                    เยี่ยมชมเว็บไซต์ทางการของโรงเรียน ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── REVIEWS ──────────────────────────────────────────────────────── */}
        {tab === "Reviews" && (
          <div className="max-w-2xl mx-auto space-y-4">
            {detail.reviews && detail.reviews.length > 0 ? (
              detail.reviews.map((r, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                      style={{ background: "#456ca6" }}
                    >
                      {r.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-navy-900">{r.author}</span>
                        <span className="text-xs text-slate-400">{r.time}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StarRating rating={r.rating} />
                        <span className="text-xs text-slate-500">Child in {r.childYear}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-xs">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
                  ★
                </div>
                <h3 className="font-bold text-navy-900 text-base mb-1">ยังไม่มีรีวิวสำหรับโรงเรียนนี้</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mb-5">
                  ยังไม่มีผู้ปกครองเขียนรีวิวหรือแสดงความคิดเห็นสำหรับโรงเรียนนี้ในระบบ คุณสามารถร่วมเป็นคนแรกที่แบ่งปันประสบการณ์เพื่อเป็นประโยชน์ต่อผู้ปกครองท่านอื่นได้
                </p>
                <button className="px-5 py-2.5 rounded-xl text-xs font-semibold border border-teal-500 text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer">
                  + เขียนรีวิวโรงเรียนนี้ (เข้าสู่ระบบ)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
