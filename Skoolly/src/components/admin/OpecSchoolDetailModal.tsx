import { useState, useEffect } from "react";
import {
  X,
  Globe,
  MapPin,
  ExternalLink,
  School,
  Users,
  GraduationCap,
  Building2,
  Phone,
  FileJson,
  Copy,
  Check,
  Sparkles,
  Edit,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr || dateStr.trim() === "" || dateStr === "—") return "—";
  try {
    // Handle standard ISO or "YYYY-MM-DD HH:mm:ss" format
    const cleaned = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return dateStr;

    return d.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

interface OpecSchoolDetailModalProps {
  school: OpecSchoolRecord | null;
  onClose: () => void;
  onEditWebsite: (school: OpecSchoolRecord) => void;
  onResolveSchoolWebsite?: (schoolCode: string) => void;
  onScrapeTuition?: (school: OpecSchoolRecord) => void;
}

export function OpecSchoolDetailModal({
  school,
  onClose,
  onEditWebsite,
  onResolveSchoolWebsite,
  onScrapeTuition,
}: OpecSchoolDetailModalProps) {
  const [showJson, setShowJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!school) return null;

  const studentCount = Number(school.student_count) || 0;
  const teacherCount = Number(school.teacher_count) || 0;

  const hasGps = Boolean(school.latitude && school.longitude);
  const lat = school.latitude ? String(school.latitude) : "";
  const lon = school.longitude ? String(school.longitude) : "";
  const gpsSource = school.gps_source || "";
  const isApproxGps =
    school.gps_precision === "Approximate" ||
    (gpsSource &&
      (gpsSource.includes("District") ||
        gpsSource.includes("Centroid") ||
        gpsSource.includes("Placeholder") ||
        gpsSource.includes("ประมาณการ")));

  const allPossibleLevels = [
    "ก่อนอนุบาล",
    "อนุบาล",
    "ประถมศึกษา",
    "มัธยมศึกษาตอนต้น",
    "มัธยมศึกษาตอนปลาย",
  ];
  const activeLevels = Array.isArray(school.levels_offered) ? school.levels_offered : [];

  const LEVEL_ALIASES: Record<string, string[]> = {
    "ก่อนอนุบาล": ["ก่อนอนุบาล", "เตรียมอนุบาล", "PRE_K", "Pre-K", "NURSERY", "Nursery"],
    "อนุบาล": ["อนุบาล", "KINDERGARTEN", "Kindergarten", "EYFS"],
    "ประถมศึกษา": ["ประถมศึกษา", "PRIMARY", "Primary", "ELEMENTARY", "Elementary"],
    "มัธยมศึกษาตอนต้น": ["มัธยมศึกษาตอนต้น", "LOWER_SEC", "Lower Secondary", "MIDDLE", "Middle School"],
    "มัธยมศึกษาตอนปลาย": ["มัธยมศึกษาตอนปลาย", "UPPER_SEC", "Upper Secondary", "HIGH_SCHOOL", "High School"],
  };

  const isLevelActive = (lvl: string) => {
    const aliases = LEVEL_ALIASES[lvl] || [lvl];
    return activeLevels.some((al) => aliases.some((alias) => al.trim().toLowerCase() === alias.trim().toLowerCase()));
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(school, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyWebsite = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedWeb(true);
    setTimeout(() => setCopiedWeb(false), 2000);
  };

  const admins = [];
  if (school.director_name) admins.push(`ผู้อำนวยการ: ${school.director_name}`);
  if (school.licensee_name) admins.push(`ผู้รับใบอนุญาต: ${school.licensee_name}`);
  if (school.manager_name) admins.push(`ผู้จัดการ: ${school.manager_name}`);

  const hasExtra = Boolean(
    school.school_history ||
      school.vision ||
      school.mission ||
      school.uniqueness ||
      school.identity ||
      school.maxim ||
      school.tags
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-warm-charcoal/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] w-full max-w-5xl my-auto max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-warm-charcoal">
        {/* =========================================================================
            1. TOP HEADER (Exact format from user's reference image)
           ========================================================================= */}
        <div className="p-4 sm:p-5 border-b border-warm-accent flex items-center justify-between bg-white shadow-xs shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* School Crest / Logo Avatar */}
            {school.school_logo_url ? (
              <img
                src={school.school_logo_url}
                alt="Logo"
                className="w-12 h-12 rounded-xl object-contain border border-warm-accent bg-white/70 p-1 shadow-xs shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-warm-bronze/10 text-warm-bronze flex items-center justify-center border border-warm-bronze/20 shadow-xs shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
            )}

            <div className="min-w-0">
              {/* Thai Name & Badges Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-warm-charcoal tracking-tight truncate">
                  {school.school_name_th || "—"}
                </h2>

                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-warm-cream text-warm-bronze border border-warm-accent">
                  รหัส สช. {school.school_code || "—"}
                </span>

                {school.province && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#f5f5f4] text-[#57534e] border border-[#e7e5e4]">
                    {school.province}
                  </span>
                )}

                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                    school.government_support && school.government_support.includes("รับ") && !school.government_support.includes("ไม่")
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]"
                  }`}
                >
                  {school.government_support || "ไม่รับเงินอุดหนุน"}
                </span>

                {school.is_isat_member && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#456ca6]/10 text-[#456ca6] border border-[#456ca6]/30">
                    สมาชิก ISAT
                  </span>
                )}

                {school.is_boarding && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                    โรงเรียนประจำ
                  </span>
                )}

                {school.year_established && (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                    ก่อตั้ง พ.ศ. {school.year_established + 543} (ค.ศ. {school.year_established})
                  </span>
                )}

                {school.accreditations && school.accreditations.length > 0 && (
                  <div className="flex items-center gap-1">
                    {school.accreditations.map((acc, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200"
                        title={`มาตรฐานการรับรองสากล: ${acc}`}
                      >
                        {acc}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* English Name Subtitle */}
              {school.school_name_en && (
                <p className="text-xs font-semibold text-[#78716c] uppercase tracking-wide truncate mt-0.5">
                  {school.school_name_en}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-warm-accent/50 text-[#78716c] hover:text-warm-charcoal transition-colors shrink-0"
            title="ปิด (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =========================================================================
            2. SCROLLABLE LANDSCAPE BODY (2-Column Grid matching reference image)
           ========================================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 scrollbar-thin bg-white/70">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4.5">
            {/* -------------------------------------------------------------
                CARD 1: ระดับชั้นที่เปิดสอน & หลักสูตร (Top Left)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                <GraduationCap className="w-4 h-4 text-warm-bronze" />
                <span>ระดับชั้นและหลักสูตร</span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Levels Offered Row */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                    ระดับชั้นที่เปิดสอน:
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5 flex-1">
                    {allPossibleLevels.map((lvl) => {
                      const isActive = isLevelActive(lvl);
                      return (
                        <span
                          key={lvl}
                          className={`px-2.5 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                            isActive
                              ? "bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0] font-semibold"
                              : "bg-[#f5f5f4] text-[#a8a29e] border border-[#e7e5e4] opacity-60"
                          }`}
                        >
                          {isActive && <Check className="w-3 h-3 text-[#059669]" />}
                          {lvl}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Level Range */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    ช่วงระดับชั้นรวม:
                  </span>
                  <span className="font-bold text-warm-bronze text-right">
                    {school.level_range && school.level_range !== "ไม่ระบุ"
                      ? school.level_range
                      : activeLevels.length > 0
                      ? activeLevels.join(" - ")
                      : "—"}
                  </span>
                </div>

                {/* Curriculums */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                    หลักสูตรที่เปิดสอน:
                  </span>
                  <div className="flex flex-col items-end gap-1.5 flex-1">
                    {Array.isArray(school.curriculums) && school.curriculums.length > 0 ? (
                      school.curriculums.map((c, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-warm-cream text-warm-bronze border border-warm-accent text-right"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-[#78716c]">—</span>
                    )}
                  </div>
                </div>

                {/* International Accreditations (ISAT) */}
                {school.accreditations && school.accreditations.length > 0 && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                      การรับรองมาตรฐานสากล:
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5 flex-1">
                      {school.accreditations.map((acc, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200"
                        >
                          {acc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Government Support */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    การรับเงินอุดหนุน:
                  </span>
                  <span className="font-semibold text-warm-charcoal text-right">
                    {school.government_support || "ไม่รับเงินอุดหนุน"}
                  </span>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 2: จำนวนนักเรียน ครู และบุคลากร (Top Right)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                <Users className="w-4 h-4 text-warm-bronze" />
                <span>นักเรียนและครู</span>
              </div>

              {/* 2 Side-by-side Metric Highlight Boxes */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-3 text-center shadow-2xs">
                  <div className="text-xl sm:text-2xl font-bold text-[#16a34a]">
                    {studentCount > 0 ? `${studentCount.toLocaleString()} คน` : "—"}
                  </div>
                  <div className="text-xs text-[#166534] font-medium mt-0.5 flex items-center justify-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>จำนวนนักเรียนทั้งหมด</span>
                  </div>
                </div>

                <div className="flex-1 bg-warm-cream border border-warm-accent rounded-xl p-3 text-center shadow-2xs">
                  <div className="text-xl sm:text-2xl font-bold text-warm-bronze">
                    {teacherCount > 0 ? `${teacherCount.toLocaleString()} คน` : "—"}
                  </div>
                  <div className="text-xs text-[#96752a] font-medium mt-0.5 flex items-center justify-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>จำนวนครูและบุคลากร</span>
                  </div>
                </div>
              </div>

              {/* Management list */}
              <div className="pt-1 text-xs">
                <div className="text-[#78716c] font-medium mb-1.5">
                  คณะผู้บริหารโรงเรียน:
                </div>
                {admins.length > 0 ? (
                  <div className="space-y-1 pl-1 text-warm-charcoal font-medium leading-relaxed">
                    {admins.map((admin, idx) => (
                      <div key={idx} className="flex items-baseline gap-1.5">
                        <span className="text-[#78716c]">•</span>
                        <span>{admin}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[#a8a29e] italic">ไม่มีข้อมูล</span>
                )}
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 3: ที่ตั้ง & ภูมิศาสตร์ (Middle Left)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                <Building2 className="w-4 h-4 text-warm-bronze" />
                <span>ที่ตั้ง</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    รหัสโรงเรียน สช.:
                  </span>
                  <span className="font-mono font-bold text-warm-bronze text-right">
                    {school.school_code || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    จังหวัด:
                  </span>
                  <span className="font-semibold text-warm-charcoal text-right">
                    {school.province || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    เขต / อำเภอ:
                  </span>
                  <span className="font-medium text-warm-charcoal text-right">
                    {school.district || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    แขวง / ตำบล:
                  </span>
                  <span className="font-medium text-warm-charcoal text-right">
                    {school.subdistrict || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-warm-accent/60">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    ที่อยู่เต็ม (สช.):
                  </span>
                  <span className="font-medium text-warm-charcoal text-right leading-relaxed flex-1">
                    {school.address || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 4: เว็บไซต์ & ช่องทางออนไลน์ (Middle Right)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                <Globe className="w-4 h-4 text-warm-bronze" />
                <span>เว็บไซต์และโซเชียล</span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Website */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                    เว็บไซต์:
                  </span>
                  <div className="flex-1 flex items-center justify-end gap-1.5 flex-wrap">
                    {school.website ? (
                      <>
                        <a
                          href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-warm-bronze hover:underline truncate max-w-[240px]"
                        >
                          {school.website}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyWebsite(school.website!)}
                          className="p-1 rounded-lg hover:bg-warm-cream border border-warm-accent text-[#78716c] hover:text-warm-charcoal transition-colors"
                          title="คัดลอก URL เว็บไซต์"
                        >
                          {copiedWeb ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    ) : (
                      <span className="text-[#a8a29e] italic">ยังไม่มีเว็บไซต์</span>
                    )}
                  </div>
                </div>

                {/* Website Source */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    แหล่งข้อมูลเว็บไซต์:
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-warm-cream text-warm-bronze border border-warm-accent">
                    {school.website_source || "Not Found"}
                  </span>
                </div>

                {/* OPEC Profile link */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    หน้าโปรไฟล์ สช.:
                  </span>
                  {school.opec_profile_url ? (
                    <a
                      href={school.opec_profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-warm-bronze hover:underline inline-flex items-center gap-1 text-right"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>เปิดหน้า สช. (school.opec.go.th)</span>
                    </a>
                  ) : (
                    <span className="text-[#78716c]">—</span>
                  )}
                </div>

                {/* Social channels */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    ช่องทางโซเชียล:
                  </span>
                  <div className="flex items-center justify-end gap-2 flex-wrap text-right font-medium">
                    {school.facebook ? (
                      <a
                        href={school.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1877f2] hover:underline font-semibold"
                      >
                        Facebook
                      </a>
                    ) : null}
                    {school.instagram ? (
                      <a
                        href={school.instagram.startsWith("http") ? school.instagram : `https://instagram.com/${school.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#e4405f] hover:underline font-semibold"
                      >
                        Instagram
                      </a>
                    ) : null}
                    {school.line_id ? (
                      <span className="text-[#06c755] font-semibold">
                        Line: {school.line_id}
                      </span>
                    ) : null}
                    {school.tiktok ? (
                      <a
                        href={school.tiktok}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-warm-charcoal hover:underline font-semibold"
                      >
                        TikTok
                      </a>
                    ) : null}
                    {school.youtube ? (
                      <a
                        href={school.youtube}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#ff0000] hover:underline font-semibold"
                      >
                        YouTube
                      </a>
                    ) : null}
                    {!school.facebook && !school.instagram && !school.line_id && !school.tiktok && !school.youtube && (
                      <span className="text-[#78716c]">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 5: การติดต่อ & พิกัดแผนที่ (Spans full 2 columns)
               ------------------------------------------------------------- */}
            <div className="lg:col-span-2 bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                <Phone className="w-4 h-4 text-warm-bronze" />
                <span>ติดต่อและพิกัด</span>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* 3 Contact Columns Top */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-white/70 border border-warm-accent/60">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">เบอร์โทรศัพท์:</span>
                    <span className="font-bold text-warm-charcoal text-sm">{school.telephone || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">เบอร์มือถือ:</span>
                    <span className="font-semibold text-warm-charcoal">{school.mobile || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">อีเมลติดต่อ:</span>
                    <span className="font-semibold text-warm-charcoal truncate">{school.email || "—"}</span>
                  </div>
                </div>

                {/* GPS details row */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      พิกัด:
                    </span>
                    <span className="font-mono font-bold text-warm-charcoal text-right">
                      {hasGps ? `${lat}, ${lon}` : "—"}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      ความแม่นยำพิกัด:
                    </span>
                    <div className="text-right">
                      {hasGps ? (
                        isApproxGps ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>โดยประมาณ (อำเภอ/ตำบล)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
                            <span>ระดับอาคาร</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[#a8a29e] italic">ไม่มีพิกัด</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      แหล่งที่มา GPS:
                    </span>
                    <span className="font-semibold text-warm-charcoal text-right">
                      {gpsSource || "OPEC Official"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      แผนที่นำทาง:
                    </span>
                    {hasGps ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-white hover:bg-warm-cream border border-warm-accent text-warm-charcoal rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-rose-500" />
                        <span>เปิดใน Google Maps</span>
                      </a>
                    ) : (
                      <span className="text-[#a8a29e] text-xs italic">ไม่มีพิกัด</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 6: ข้อมูลประวัติ วิสัยทัศน์ & อัตลักษณ์ (Optional)
               ------------------------------------------------------------- */}
            {hasExtra && (
              <div className="lg:col-span-2 bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
                <div className="flex items-center gap-2 pb-2.5 border-b border-warm-accent/80 text-warm-bronze font-bold text-xs uppercase tracking-wide">
                  <School className="w-4 h-4 text-warm-bronze" />
                  <span>ประวัติและวิสัยทัศน์</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {school.school_history && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[#78716c] font-medium">ประวัติโรงเรียน:</span>
                      <p className="text-warm-charcoal font-medium leading-relaxed pl-2 border-l-2 border-warm-bronze/40">
                        {school.school_history}
                      </p>
                    </div>
                  )}

                  {(school.vision || school.mission) && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">วิสัยทัศน์ / พันธกิจ:</span>
                      <p className="text-warm-charcoal font-medium leading-relaxed pl-2 border-l-2 border-[#456ca6]/40">
                        {[school.vision, school.mission ? `พันธกิจ: ${school.mission}` : ""].filter(Boolean).join(" / ")}
                      </p>
                    </div>
                  )}

                  {(school.uniqueness || school.identity || school.maxim) && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">เอกลักษณ์ / อัตลักษณ์:</span>
                      <p className="text-warm-charcoal font-medium pl-2 border-l-2 border-warm-bronze/40">
                        {[school.uniqueness, school.identity, school.maxim].filter(Boolean).join(" | ")}
                      </p>
                    </div>
                  )}

                  {school.tags && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">แท็ก / ป้ายกำกับ:</span>
                      <p className="text-warm-charcoal font-medium">{school.tags}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Raw JSON Debug (Admin toggle) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowJson(!showJson)}
              className="text-xs font-bold text-[#78716c] hover:text-warm-charcoal flex items-center gap-1.5 py-1 transition-colors"
            >
              <FileJson className="w-4 h-4 text-warm-bronze" />
              <span>{showJson ? "ซ่อนข้อมูลดิบ" : "ดูข้อมูลดิบ (JSON)"}</span>
            </button>
            {showJson && (
              <div className="mt-2 relative">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="absolute top-3 right-3 p-1.5 bg-[#2d2825] hover:bg-[#3d3835] text-warm-accent rounded-lg text-xs flex items-center gap-1 transition-colors"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-[#456ca6]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? "คัดลอกแล้ว" : "คัดลอก JSON"}</span>
                </button>
                <pre className="bg-warm-charcoal text-warm-accent p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-60 border border-[#2d2825]">
                  {JSON.stringify(school, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            3. FOOTER ACTION BAR
           ========================================================================= */}
        <div className="p-3.5 sm:p-4.5 border-t border-warm-accent bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[#78716c] flex items-center flex-wrap gap-2">
            <span>
              ดึงข้อมูลเมื่อ:{" "}
              <strong className="text-warm-charcoal font-semibold">
                {formatDisplayDate(school.fetched_at || school.last_updated)}
              </strong>
            </span>
            <span className="text-[#d6c7b2]">•</span>
            <span>
              อัปเดตล่าสุด:{" "}
              <strong className="text-warm-charcoal font-semibold">
                {formatDisplayDate(school.last_updated || school.fetched_at)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-warm-cream border border-warm-accent text-warm-charcoal rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#78716c]" />
              <span>ปิด</span>
            </button>

            <button
              type="button"
              onClick={() => onEditWebsite(school)}
              className="px-4 py-2 bg-warm-cream hover:bg-warm-accent/50 border border-warm-accent text-warm-charcoal rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Edit className="w-3.5 h-3.5 text-warm-bronze" />
              <span>แก้ไขเว็บไซต์</span>
            </button>

            {onResolveSchoolWebsite && (
              <button
                type="button"
                onClick={() => onResolveSchoolWebsite(school.school_code)}
                className="px-4 py-2 bg-warm-bronze hover:bg-[#96752a] text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ค้นหาเว็บไซต์</span>
              </button>
            )}

            {onScrapeTuition && school.website && (
              <button
                type="button"
                onClick={() => onScrapeTuition(school)}
                className="px-4 py-2 bg-warm-bronze hover:bg-[#96752a] text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                title="ดึงค่าเทอมจากเว็บไซต์โรงเรียน"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>Scrape ค่าเทอม</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
