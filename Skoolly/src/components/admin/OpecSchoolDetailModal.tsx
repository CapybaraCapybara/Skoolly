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
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Edit,
  ArrowLeft,
} from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

interface OpecSchoolDetailModalProps {
  school: OpecSchoolRecord | null;
  onClose: () => void;
  onEditWebsite: (school: OpecSchoolRecord) => void;
  onResolveSchoolWebsite?: (schoolCode: string) => void;
}

export function OpecSchoolDetailModal({
  school,
  onClose,
  onEditWebsite,
  onResolveSchoolWebsite,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#faf8f5] border border-[#eae0d0] rounded-3xl w-full max-w-5xl my-auto max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn text-[#1c1917]">
        {/* =========================================================================
            1. TOP HEADER (Exact format from user's reference image)
           ========================================================================= */}
        <div className="p-4 sm:p-5 border-b border-[#eae0d0] flex items-center justify-between bg-white shadow-xs shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* School Crest / Logo Avatar */}
            {school.school_logo_url ? (
              <img
                src={school.school_logo_url}
                alt="Logo"
                className="w-12 h-12 rounded-xl object-contain border border-[#eae0d0] bg-[#faf8f5] p-1 shadow-xs shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#2563eb]/10 text-[#2563eb] flex items-center justify-center border border-[#2563eb]/20 shadow-xs shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
            )}

            <div className="min-w-0">
              {/* Thai Name & Badges Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-[#1c1917] tracking-tight truncate">
                  {school.school_name_th || "—"}
                </h2>

                <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                  รหัส สช: {school.school_code || "—"}
                </span>

                {school.province && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-[#f5f5f4] text-[#57534e] border border-[#e7e5e4]">
                    {school.province}
                  </span>
                )}

                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                    school.government_support && school.government_support.includes("รับ") && !school.government_support.includes("ไม่")
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]"
                  }`}
                >
                  {school.government_support || "ไม่รับเงินอุดหนุน"}
                </span>
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
            className="p-2 rounded-xl hover:bg-[#eae0d0]/50 text-[#78716c] hover:text-[#1c1917] transition-colors shrink-0"
            title="ปิดหน้าต่าง (กด Esc ได้)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =========================================================================
            2. SCROLLABLE LANDSCAPE BODY (2-Column Grid matching reference image)
           ========================================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 scrollbar-thin bg-[#faf8f5]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4.5">
            {/* -------------------------------------------------------------
                CARD 1: ระดับชั้นที่เปิดสอน & หลักสูตร (Top Left)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                <GraduationCap className="w-4 h-4 text-[#2563eb]" />
                <span>ระดับชั้นที่เปิดสอน & หลักสูตร</span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Levels Offered Row */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                    ระดับชั้นที่เปิดสอน:
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5 flex-1">
                    {allPossibleLevels.map((lvl) => {
                      const isActive = activeLevels.includes(lvl);
                      return (
                        <span
                          key={lvl}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${
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
                  <span className="font-bold text-[#2563eb] text-right">
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
                          className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] text-right"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-[#78716c]">—</span>
                    )}
                  </div>
                </div>

                {/* Government Support */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    การรับเงินอุดหนุน:
                  </span>
                  <span className="font-semibold text-[#1c1917] text-right">
                    {school.government_support || "ไม่รับเงินอุดหนุน"}
                  </span>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 2: จำนวนนักเรียน ครู และบุคลากร (Top Right)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                <Users className="w-4 h-4 text-[#2563eb]" />
                <span>จำนวนนักเรียน ครู และบุคลากร</span>
              </div>

              {/* 2 Side-by-side Metric Highlight Boxes */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-3 text-center shadow-2xs">
                  <div className="text-xl sm:text-2xl font-black text-[#16a34a]">
                    {studentCount > 0 ? `${studentCount.toLocaleString()} คน` : "—"}
                  </div>
                  <div className="text-[11px] text-[#166534] font-medium mt-0.5 flex items-center justify-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>จำนวนนักเรียนทั้งหมด</span>
                  </div>
                </div>

                <div className="flex-1 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3 text-center shadow-2xs">
                  <div className="text-xl sm:text-2xl font-black text-[#2563eb]">
                    {teacherCount > 0 ? `${teacherCount.toLocaleString()} คน` : "—"}
                  </div>
                  <div className="text-[11px] text-[#1e40af] font-medium mt-0.5 flex items-center justify-center gap-1">
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
                  <div className="space-y-1 pl-1 text-[#1c1917] font-medium leading-relaxed">
                    {admins.map((admin, idx) => (
                      <div key={idx} className="flex items-baseline gap-1.5">
                        <span className="text-[#78716c]">•</span>
                        <span>{admin}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[#a8a29e] italic">— ไม่ระบุในฐานข้อมูล สช. —</span>
                )}
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 3: ที่ตั้ง & ภูมิศาสตร์ (Middle Left)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                <Building2 className="w-4 h-4 text-[#2563eb]" />
                <span>ที่ตั้ง & ภูมิศาสตร์</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    รหัสโรงเรียน สช.:
                  </span>
                  <span className="font-mono font-bold text-[#2563eb] text-right">
                    {school.school_code || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    จังหวัด:
                  </span>
                  <span className="font-semibold text-[#1c1917] text-right">
                    {school.province || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    เขต / อำเภอ:
                  </span>
                  <span className="font-medium text-[#1c1917] text-right">
                    {school.district || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    แขวง / ตำบล:
                  </span>
                  <span className="font-medium text-[#1c1917] text-right">
                    {school.subdistrict || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-1 border-t border-[#eae0d0]/60">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    ที่อยู่เต็ม (สช.):
                  </span>
                  <span className="font-medium text-[#1c1917] text-right leading-relaxed flex-1">
                    {school.address || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 4: เว็บไซต์ & ช่องทางออนไลน์ (Middle Right)
               ------------------------------------------------------------- */}
            <div className="bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                <Globe className="w-4 h-4 text-[#2563eb]" />
                <span>เว็บไซต์ & ช่องทางออนไลน์</span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Website */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0 pt-0.5">
                    เว็บไซต์ (Website):
                  </span>
                  <div className="flex-1 flex items-center justify-end gap-1.5 flex-wrap">
                    {school.website ? (
                      <>
                        <a
                          href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#2563eb] hover:underline truncate max-w-[240px]"
                        >
                          {school.website}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyWebsite(school.website!)}
                          className="p-1 rounded-lg hover:bg-[#faf5ee] border border-[#eae0d0] text-[#78716c] hover:text-[#1c1917] transition-colors"
                          title="คัดลอก URL เว็บไซต์"
                        >
                          {copiedWeb ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    ) : (
                      <span className="text-[#a8a29e] italic">— ยังไม่มี Website —</span>
                    )}
                  </div>
                </div>

                {/* Website Source */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                    แหล่งข้อมูลเว็บไซต์:
                  </span>
                  <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
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
                      className="font-semibold text-[#2563eb] hover:underline inline-flex items-center gap-1 text-right"
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
                        className="text-[#1c1917] hover:underline font-semibold"
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
            <div className="lg:col-span-2 bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                <Phone className="w-4 h-4 text-[#2563eb]" />
                <span>การติดต่อ & พิกัดแผนที่</span>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* 3 Contact Columns Top */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-[#faf8f5] border border-[#eae0d0]/60">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">เบอร์โทรศัพท์:</span>
                    <span className="font-bold text-[#1c1917] text-sm">{school.telephone || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">เบอร์มือถือ:</span>
                    <span className="font-semibold text-[#1c1917]">{school.mobile || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#78716c] font-medium">อีเมลติดต่อ:</span>
                    <span className="font-semibold text-[#1c1917] truncate">{school.email || "—"}</span>
                  </div>
                </div>

                {/* GPS details row */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      พิกัด GPS (Lat, Lon):
                    </span>
                    <span className="font-mono font-bold text-[#1c1917] text-right">
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
                            <span>พิกัดประมาณการ (ระดับอำเภอ/ตำบล)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
                            <span>แม่นยำระดับอาคาร / วิทยาเขต / ถนน</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[#a8a29e] italic">— ไม่มีพิกัด GPS —</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      แหล่งที่มา GPS:
                    </span>
                    <span className="font-semibold text-[#1c1917] text-right">
                      {gpsSource || "OPEC Official"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5">
                    <span className="text-[#78716c] font-medium min-w-[130px] shrink-0">
                      แผนที่นำทาง:
                    </span>
                    {hasGps ? (
                      <a
                        href={`https://www.google.com/maps?q=${lat},${lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-white hover:bg-[#faf5ee] border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-rose-500" />
                        <span>เปิดดูใน Google Maps {isApproxGps ? "(พิกัดคร่าวๆ)" : ""}</span>
                      </a>
                    ) : (
                      <span className="text-[#a8a29e] text-xs italic">(ไม่มีพิกัด GPS)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* -------------------------------------------------------------
                CARD 6: ข้อมูลประวัติ วิสัยทัศน์ & อัตลักษณ์ (Optional)
               ------------------------------------------------------------- */}
            {hasExtra && (
              <div className="lg:col-span-2 bg-white border border-[#eae0d0] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
                <div className="flex items-center gap-2 pb-2.5 border-b border-[#eae0d0]/80 text-[#2563eb] font-bold text-xs uppercase tracking-wide">
                  <School className="w-4 h-4 text-[#2563eb]" />
                  <span>ประวัติ วิสัยทัศน์ & อัตลักษณ์โรงเรียน</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {school.school_history && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[#78716c] font-medium">ประวัติโรงเรียน:</span>
                      <p className="text-[#1c1917] font-medium leading-relaxed pl-2 border-l-2 border-[#2563eb]/40">
                        {school.school_history}
                      </p>
                    </div>
                  )}

                  {(school.vision || school.mission) && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">วิสัยทัศน์ / พันธกิจ:</span>
                      <p className="text-[#1c1917] font-medium leading-relaxed pl-2 border-l-2 border-[#0f9488]/40">
                        {[school.vision, school.mission ? `พันธกิจ: ${school.mission}` : ""].filter(Boolean).join(" / ")}
                      </p>
                    </div>
                  )}

                  {(school.uniqueness || school.identity || school.maxim) && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">เอกลักษณ์ / อัตลักษณ์:</span>
                      <p className="text-[#1c1917] font-medium pl-2 border-l-2 border-[#ab8e72]/40">
                        {[school.uniqueness, school.identity, school.maxim].filter(Boolean).join(" | ")}
                      </p>
                    </div>
                  )}

                  {school.tags && (
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-[#78716c] font-medium">แท็ก / ป้ายกำกับ:</span>
                      <p className="text-[#1c1917] font-medium">{school.tags}</p>
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
              className="text-xs font-bold text-[#78716c] hover:text-[#1c1917] flex items-center gap-1.5 py-1 transition-colors"
            >
              <FileJson className="w-4 h-4 text-[#ab8e72]" />
              <span>{showJson ? "ซ่อน Raw JSON ข้อมูลดิบ" : "ดูข้อมูลดิบ สช. (Raw JSON)"}</span>
            </button>
            {showJson && (
              <div className="mt-2 relative animate-fadeIn">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="absolute top-3 right-3 p-1.5 bg-[#2d2825] hover:bg-[#3d3835] text-[#eae0d0] rounded-lg text-xs flex items-center gap-1 transition-colors"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-[#0f9488]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? "คัดลอกแล้ว" : "คัดลอก JSON"}</span>
                </button>
                <pre className="bg-[#1c1917] text-[#eae0d0] p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-60 border border-[#2d2825]">
                  {JSON.stringify(school, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            3. FOOTER ACTION BAR
           ========================================================================= */}
        <div className="p-3.5 sm:p-4.5 border-t border-[#eae0d0] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-[#78716c] flex items-center gap-2">
            <span>ดึงข้อมูลเมื่อ: {school.fetched_at || "—"}</span>
            <span>•</span>
            <span>อัปเดตล่าสุด: {school.last_updated || school.fetched_at || "—"}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-[#faf5ee] border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#78716c]" />
              <span>ปิดหน้าต่าง (Esc)</span>
            </button>

            <button
              type="button"
              onClick={() => onEditWebsite(school)}
              className="px-4 py-2 bg-[#faf5ee] hover:bg-[#eae0d0]/50 border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Edit className="w-3.5 h-3.5 text-[#ab8e72]" />
              <span>แก้ไข Official Website</span>
            </button>

            {onResolveSchoolWebsite && (
              <button
                type="button"
                onClick={() => onResolveSchoolWebsite(school.school_code)}
                className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ค้นหาเฉพาะโรงเรียนนี้</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
