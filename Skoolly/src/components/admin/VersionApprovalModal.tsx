import { useState } from "react";
import {
  X,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Coins,
  Shield,
  Layers,
  Sparkles,
  ArrowRight,
  School,
  FileText,
  AlertTriangle,
  Loader2,
  Building,
  Check,
  Eye,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  BookOpen,
  Info,
  Building2,
  Clock,
  HeartPulse,
} from "lucide-react";
import type { PendingVersionRecord, VersionFeeItem } from "@/types/opec";

interface VersionApprovalModalProps {
  version: PendingVersionRecord | null;
  onClose: () => void;
  onApprove: (versionId: string) => Promise<void>;
  onReject: (versionId: string, reason?: string) => Promise<void>;
  onApproveAll?: () => Promise<void>;
  totalPendingCount?: number;
  isActionLoading?: boolean;
}

type TabKey = "diff" | "fees" | "curriculums" | "general" | "facilities" | "safety";

export function VersionApprovalModal({
  version,
  onClose,
  onApprove,
  onReject,
  onApproveAll,
  totalPendingCount = 0,
  isActionLoading = false,
}: VersionApprovalModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("diff");
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  if (!version) return null;

  // Calculate scraped min & max from fees if present
  let scrapedMin: number | null = null;
  let scrapedMax: number | null = null;
  if (version.fees && version.fees.length > 0) {
    const annualAmounts = version.fees
      .map((f) => f.annual_thb || (f.semester_thb ? f.semester_thb * 2 : null))
      .filter((v): v is number => v !== null && v > 0);
    if (annualAmounts.length > 0) {
      scrapedMin = Math.min(...annualAmounts);
      scrapedMax = Math.max(...annualAmounts);
    }
  }

  // Previous min & max from previous fees or published fields
  let prevMin: number | null = version.current_pub_min_thb ?? null;
  let prevMax: number | null = version.current_pub_max_thb ?? null;
  if ((!prevMin || !prevMax) && version.previous_fees && version.previous_fees.length > 0) {
    const prevAnnualAmounts = version.previous_fees
      .map((f) => f.annual_thb || (f.semester_thb ? f.semester_thb * 2 : null))
      .filter((v): v is number => v !== null && v > 0);
    if (prevAnnualAmounts.length > 0) {
      prevMin = Math.min(...prevAnnualAmounts);
      prevMax = Math.max(...prevAnnualAmounts);
    }
  }

  const confidenceScore = version.confidence_score ? Math.round(version.confidence_score * 100) : null;
  const isHighConfidence = confidenceScore !== null && confidenceScore >= 80;
  const isMediumConfidence = confidenceScore !== null && confidenceScore >= 50 && confidenceScore < 80;

  // Format dates
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  };

  const currentDateLabel = formatDate(version.submitted_at) || "รอบล่าสุด";
  const prevDateLabel =
    formatDate(version.previous_submitted_at) ||
    formatDate(version.current_pub_data_updated_at);
  const isFirstScrape = !version.current_published_version_id && (!version.previous_fees || version.previous_fees.length === 0);

  // Curriculums diff
  const prevCurriculums: string[] =
    version.previous_curriculums ||
    version.current_curriculums ||
    [];
  const newCurriculums: string[] = version.scraped_curriculums || [];
  const addedCurriculums = newCurriculums.filter(
    (c) => !prevCurriculums.some((pc) => pc.toLowerCase().trim() === c.toLowerCase().trim())
  );
  const unchangedCurriculums = newCurriculums.filter((c) =>
    prevCurriculums.some((pc) => pc.toLowerCase().trim() === c.toLowerCase().trim())
  );
  const removedCurriculums = prevCurriculums.filter(
    (pc) => !newCurriculums.some((c) => c.toLowerCase().trim() === pc.toLowerCase().trim())
  );

  // Map fees for before vs after comparison
  const gradeFeeMap = new Map<
    string,
    { grade: string; prevAnnual?: number | null; newAnnual?: number | null; notes?: string | null; newNotes?: string | null }
  >();

  (version.previous_fees || []).forEach((pf) => {
    gradeFeeMap.set(pf.grade_label, {
      grade: pf.grade_label,
      prevAnnual: pf.annual_thb ?? (pf.semester_thb ? pf.semester_thb * 2 : null),
      notes: pf.notes,
    });
  });

  (version.fees || []).forEach((nf) => {
    const existing = gradeFeeMap.get(nf.grade_label);
    const newAnnual = nf.annual_thb ?? (nf.semester_thb ? nf.semester_thb * 2 : null);
    if (existing) {
      existing.newAnnual = newAnnual;
      existing.newNotes = nf.notes;
    } else {
      gradeFeeMap.set(nf.grade_label, {
        grade: nf.grade_label,
        newAnnual,
        newNotes: nf.notes,
      });
    }
  });

  const combinedFeeRows = Array.from(gradeFeeMap.values());

  // General info comparison
  const genInfo = version.scraped_general_info || {};
  const prevGenInfo = version.previous_general_info || {};

  // Safety list comparison
  const safetyChecklist = [
    {
      key: "security_guards",
      label: "รปภ. และระบบรักษาความปลอดภัย",
      prev: version.previous_safety?.security_guards,
      now: version.safety?.security_guards,
    },
    {
      key: "cctv_monitoring",
      label: "กล้องวงจรปิด (CCTV)",
      prev: version.previous_safety?.cctv_monitoring,
      now: version.safety?.cctv_monitoring,
    },
    {
      key: "nurse_medical_clinic",
      label: "ห้องพยาบาล / แพทย์ประจำ",
      prev: version.previous_safety?.nurse_medical_clinic,
      now: version.safety?.nurse_medical_clinic,
    },
    {
      key: "child_safeguarding_policy",
      label: "นโยบายคุ้มครองความปลอดภัยเด็ก (Child Safeguarding)",
      prev: version.previous_safety?.child_safeguarding_policy ?? version.current_has_safeguarding,
      now: version.safety?.child_safeguarding_policy,
    },
    {
      key: "air_quality_pm25_protocol",
      label: "มาตรการฝุ่น PM2.5 / เครื่องฟอกอากาศ",
      prev: version.previous_safety?.air_quality_pm25_protocol,
      now: version.safety?.air_quality_pm25_protocol,
    },
    {
      key: "visitor_access_control",
      label: "ระบบคัดกรองผู้มาติดต่อภายนอก (Visitor Control)",
      prev: version.previous_safety?.visitor_access_control,
      now: version.safety?.visitor_access_control,
    },
  ];

  const isVirtualLog = version.version_id?.startsWith("log-");

  const handleConfirmReject = async () => {
    await onReject(version.version_id, rejectionReason || "ข้อมูลไม่ถูกต้องหรือไม่ผ่านเกณฑ์ตรวจสอบ");
    setIsRejecting(false);
  };

  const handleConfirmApprove = async () => {
    await onApprove(version.version_id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-warm-charcoal/65 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-warm-cream border border-[#e5dcce] rounded-[2rem] shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-warm-charcoal text-white p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-warm-charcoal text-[11px] font-bold uppercase tracking-wider">
                ร่างฉบับที่ {version.version_number} (Scraped Draft)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/80 text-[11px] font-mono">
                {version.opec_school_code || version.school_id.substring(0, 8)}
              </span>
              {version.province && (
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/80 text-[11px]">
                  📍 {version.province} {version.district ? `(${version.district})` : ""}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{version.name_th}</h2>
            {version.name_en && (
              <p className="text-xs sm:text-sm text-white/60 font-medium">{version.name_en}</p>
            )}
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            {version.scraped_page_url && (
              <a
                href={version.scraped_page_url}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5"
                title="เปิดดูหน้าเว็บไซต์ต้นทางที่ Scrape ข้อมูล"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>ดูหน้าต้นทาง</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Comparison Banner (ก่อน Scrape vs หลัง Scrape) */}
        <div className="bg-[#faf6ee] border-b border-warm-accent px-5 sm:px-7 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-warm-accent">
              <Calendar className="w-3.5 h-3.5 text-[#78716c]" />
              <span className="text-[#a8a29e]">ฉบับเดิม (ก่อน):</span>
              <strong className="text-warm-charcoal">
                {isFirstScrape ? "Scrape ครั้งแรก (ไม่มีข้อมูลเก่า)" : prevDateLabel || "ฉบับก่อนหน้า"}
              </strong>
            </div>
            <ArrowRight className="w-4 h-4 text-[#a8a29e]" />
            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">ฉบับใหม่ที่ Scrape (หลัง):</span>
              <strong className="text-emerald-950 font-bold">{currentDateLabel}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {confidenceScore !== null && (
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                  isHighConfidence
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : isMediumConfidence
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300"
                }`}
              >
                AI Confidence: {confidenceScore}%
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-7 pt-3 bg-warm-cream border-b border-warm-accent flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("diff")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "diff"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <Layers className="w-4 h-4 text-warm-bronze" />
            <span>ภาพรวมความต่าง (Diff Summary)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("fees")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "fees"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <Coins className="w-4 h-4 text-amber-600" />
            <span>ค่าเทอม ({version.fees?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("curriculums")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "curriculums"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>หลักสูตร ({newCurriculums.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "general"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <Info className="w-4 h-4 text-blue-600" />
            <span>ข้อมูลทั่วไป</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("facilities")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "facilities"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <Building2 className="w-4 h-4 text-teal-600" />
            <span>สิ่งอำนวยความสะดวก ({version.scraped_facilities?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "safety"
                ? "bg-white border-warm-charcoal text-warm-charcoal shadow-xs"
                : "border-transparent text-[#78716c] hover:text-warm-charcoal"
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>ความปลอดภัย (Safety)</span>
          </button>
        </div>

        {/* Tab Body Content (Scrollable) */}
        <div className="p-5 sm:p-7 overflow-y-auto flex-1 space-y-6 bg-white">
          {/* TAB 1: DIFF SUMMARY */}
          {activeTab === "diff" && (
            <div className="space-y-6">
              {/* Diff Hero Cards: Before vs After */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Before Card */}
                <div className="p-5 rounded-2xl bg-[#faf7f2] border border-[#e8dfd2] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#78716c] flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      ฉบับเดิม (ก่อน)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#e8dfd2] text-[#57534e]">
                      {prevDateLabel || "ก่อนหน้า"}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="text-[#a8a29e]">ช่วงค่าเทอมต่อปี:</div>
                      <div className="text-base font-bold text-[#78716c]">
                        {prevMin && prevMax
                          ? `฿${prevMin.toLocaleString()} - ฿${prevMax.toLocaleString()} / ปี`
                          : prevMin
                          ? `฿${prevMin.toLocaleString()} / ปี`
                          : "ยังไม่มีข้อมูลค่าเทอม"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#a8a29e]">หลักสูตร:</div>
                      <div className="font-medium text-[#57534e]">
                        {prevCurriculums.length > 0 ? prevCurriculums.join(", ") : "ไม่มีระบุ"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#a8a29e]">นโยบายคุ้มครองเด็ก:</div>
                      <div className="font-medium text-[#57534e]">
                        {version.current_has_safeguarding ? "✅ มีนโยบาย" : "❌ ไม่มีข้อมูล"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. After Card */}
                <div className="p-5 rounded-2xl bg-emerald-50/50 border-2 border-emerald-400/70 space-y-3 relative shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      ฉบับใหม่ที่ Scrape ได้ (หลัง)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-200 text-emerald-900">
                      V.{version.version_number} (Pending Review)
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="text-emerald-700 font-medium">ช่วงค่าเทอมต่อปี:</div>
                      <div className="text-base font-bold text-emerald-950 flex items-center gap-2">
                        <span>
                          {scrapedMin && scrapedMax
                            ? `฿${scrapedMin.toLocaleString()} - ฿${scrapedMax.toLocaleString()} / ปี`
                            : scrapedMin
                            ? `฿${scrapedMin.toLocaleString()} / ปี`
                            : "ตามตารางระดับชั้น"}
                        </span>
                        {prevMin && scrapedMin && scrapedMin !== prevMin && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-0.5 ${
                              scrapedMin > prevMin
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {scrapedMin > prevMin ? (
                              <>
                                <TrendingUp className="w-3 h-3" />
                                +฿{(scrapedMin - prevMin).toLocaleString()}
                              </>
                            ) : (
                              <>
                                <TrendingDown className="w-3 h-3" />
                                -฿{(prevMin - scrapedMin).toLocaleString()}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-emerald-700 font-medium">หลักสูตร:</div>
                      <div className="font-bold text-emerald-950 flex flex-wrap items-center gap-1">
                        {newCurriculums.length > 0 ? (
                          newCurriculums.map((c, idx) => (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                addedCurriculums.includes(c)
                                  ? "bg-amber-200 text-amber-900 border border-amber-300"
                                  : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              {c} {addedCurriculums.includes(c) ? "(ใหม่)" : ""}
                            </span>
                          ))
                        ) : (
                          <span>ไม่มีระบุ</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-emerald-700 font-medium">นโยบายคุ้มครองเด็ก:</div>
                      <div className="font-bold text-emerald-950">
                        {version.safety?.child_safeguarding_policy ? "✅ ตรวจพบบนเว็บไซต์" : "❌ ไม่พบ"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diff Highlights Checklist */}
              <div className="p-4 sm:p-5 rounded-2xl bg-warm-cream/50 border border-warm-accent space-y-3">
                <h4 className="text-xs font-bold text-warm-charcoal uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-warm-bronze" />
                  <span>สรุปการเปลี่ยนแปลงในรอบนี้</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">1. ระดับชั้นที่พบค่าเทอม</span>
                    <p className="font-bold text-warm-charcoal">{version.fees?.length || 0} ระดับชั้น</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">2. หลักสูตรใหม่ที่เพิ่มขึ้น</span>
                    <p className="font-bold text-amber-900">
                      {addedCurriculums.length > 0
                        ? `+${addedCurriculums.length} หลักสูตร (${addedCurriculums.join(", ")})`
                        : "ไม่มีการเพิ่มหลักสูตร"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">3. สิ่งอำนวยความสะดวก</span>
                    <p className="font-bold text-warm-charcoal">
                      พบ {version.scraped_facilities?.length || 0} รายการ
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">4. ค่าใช้จ่ายแอบแฝง/เพิ่มเติม</span>
                    <p className="font-bold text-warm-charcoal">{version.extra_fees?.length || 0} รายการ</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">5. มาตรการความปลอดภัย</span>
                    <p className="font-bold text-emerald-900">
                      ผ่าน {safetyChecklist.filter((s) => s.now).length} จาก 6 รายการ
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#e5dcce] space-y-1">
                    <span className="text-[#a8a29e]">6. ข้อมูลทั่วไป</span>
                    <p className="font-bold text-warm-charcoal">
                      {genInfo.about ? "มีประวัติ/ข้อมูลสรุป" : "ไม่มีข้อมูลสรุป"}
                    </p>
                  </div>
                </div>

                {version.confidence_reasoning && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    <strong>AI Note / ที่มาข้อมูล: </strong>
                    {version.confidence_reasoning}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TUITION & FEES */}
          {activeTab === "fees" && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-warm-charcoal uppercase tracking-wider mb-2">
                  ตารางเปรียบเทียบค่าเทอมรายระดับชั้น (ก่อน vs หลัง)
                </h4>
                {combinedFeeRows.length > 0 ? (
                  <div className="border border-[#e5dcce] rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-warm-cream text-[#78716c] font-bold border-b border-[#e5dcce]">
                        <tr>
                          <th className="py-3 px-4">ระดับชั้น</th>
                          <th className="py-3 px-4 text-right">ก่อนหน้า (บาท/ปี)</th>
                          <th className="py-3 px-4 text-right">ฉบับใหม่ (บาท/ปี)</th>
                          <th className="py-3 px-4 text-center">ส่วนต่าง / การเปลี่ยนแปลง</th>
                          <th className="py-3 px-4">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0e8dc]">
                        {combinedFeeRows.map((row, idx) => {
                          const hasPrev = row.prevAnnual !== undefined && row.prevAnnual !== null;
                          const hasNew = row.newAnnual !== undefined && row.newAnnual !== null;
                          const diff = hasPrev && hasNew ? row.newAnnual! - row.prevAnnual! : null;
                          const pct = hasPrev && hasNew && row.prevAnnual! > 0 ? (diff! / row.prevAnnual!) * 100 : null;

                          return (
                            <tr key={idx} className="hover:bg-[#faf6ee] transition-colors">
                              <td className="py-3 px-4 font-bold text-warm-charcoal">{row.grade}</td>
                              <td className="py-3 px-4 text-right font-mono text-[#78716c]">
                                {hasPrev ? `฿${row.prevAnnual!.toLocaleString()}` : "—"}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-950">
                                {hasNew ? `฿${row.newAnnual!.toLocaleString()}` : "—"}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {!hasPrev && hasNew ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                    + ระดับใหม่
                                  </span>
                                ) : diff === null || diff === 0 ? (
                                  <span className="text-[#a8a29e] text-[11px] font-medium flex items-center justify-center gap-1">
                                    <Minus className="w-3 h-3" /> เท่าเดิม
                                  </span>
                                ) : diff > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold inline-flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3 text-amber-700" />
                                    +฿{diff.toLocaleString()} {pct !== null ? `(+${pct.toFixed(1)}%)` : ""}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 text-[11px] font-bold inline-flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3 text-teal-700" />
                                    -฿{Math.abs(diff).toLocaleString()} {pct !== null ? `(${pct.toFixed(1)}%)` : ""}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-xs text-[#78716c]">
                                {row.newNotes || row.notes || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-[#78716c] bg-[#faf7f2] rounded-2xl border border-dashed border-[#e5dcce]">
                    ไม่พบรายการค่าเทอม
                  </div>
                )}
              </div>

              {/* Extra Fees */}
              {version.extra_fees && version.extra_fees.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-warm-charcoal uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-warm-bronze" />
                    <span>ค่าใช้จ่ายเพิ่มเติม / ค่าธรรมเนียมอื่นๆ ({version.extra_fees.length})</span>
                  </h4>
                  <div className="border border-[#e5dcce] rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-warm-cream text-[#78716c] font-bold border-b border-[#e5dcce]">
                        <tr>
                          <th className="py-2.5 px-4">รายการ</th>
                          <th className="py-2.5 px-4 text-right">จำนวนเงิน</th>
                          <th className="py-2.5 px-4">รอบการจ่าย</th>
                          <th className="py-2.5 px-4">คำอธิบาย</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0e8dc]">
                        {version.extra_fees.map((ef, idx) => (
                          <tr key={idx} className="hover:bg-[#faf6ee]">
                            <td className="py-2.5 px-4 font-bold text-warm-charcoal">{ef.name}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-900">
                              {ef.amount_thb ? `฿${ef.amount_thb.toLocaleString()}` : "ตามประเมิน"}
                            </td>
                            <td className="py-2.5 px-4 text-[#57534e]">
                              <span className="px-2 py-0.5 rounded-full bg-[#f3ece2] text-[11px] font-medium">
                                {ef.frequency}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-[#78716c]">{ef.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CURRICULUMS */}
          {activeTab === "curriculums" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Previous Curriculums */}
                <div className="p-5 rounded-2xl bg-[#faf7f2] border border-[#e8dfd2] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#78716c]">หลักสูตรเดิมในระบบ (Before)</span>
                    <span className="text-xs font-mono text-[#a8a29e]">{prevCurriculums.length} หลักสูตร</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {prevCurriculums.length > 0 ? (
                      prevCurriculums.map((c, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#e5dcce] text-warm-charcoal text-xs font-semibold"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#a8a29e] italic">ไม่มีข้อมูลหลักสูตรเดิม</span>
                    )}
                  </div>
                </div>

                {/* Scraped Curriculums */}
                <div className="p-5 rounded-2xl bg-emerald-50/50 border-2 border-emerald-400/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950">หลักสูตรที่พบจากการ Scrape (After)</span>
                    <span className="text-xs font-mono text-emerald-800">{newCurriculums.length} หลักสูตร</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {newCurriculums.length > 0 ? (
                      newCurriculums.map((c, idx) => {
                        const isNew = addedCurriculums.includes(c);
                        return (
                          <span
                            key={idx}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                              isNew
                                ? "bg-amber-100 border border-amber-300 text-amber-900"
                                : "bg-emerald-100 border border-emerald-300 text-emerald-900"
                            }`}
                          >
                            {isNew && <Plus className="w-3.5 h-3.5 text-amber-700" />}
                            <span>{c}</span>
                            {isNew && (
                              <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                                ใหม่
                              </span>
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-[#a8a29e] italic">ไม่พบหลักสูตรระบุชัดเจน</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Curriculums Diff Explanation */}
              <div className="p-4 rounded-2xl bg-warm-cream/50 border border-warm-accent text-xs space-y-2">
                <span className="font-bold text-warm-charcoal">การสรุปหลักสูตร:</span>
                <p className="text-[#78716c] leading-relaxed">
                  หากกดอนุมัติ ระบบจะปรับปรุงช่องหลักสูตรของโรงเรียนนี้เป็น <strong>[{newCurriculums.join(", ")}]</strong> เพื่อให้ผู้ปกครองสามารถค้นหาและกรองด้วยหลักสูตรใหม่ได้ทันที
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: GENERAL INFO */}
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#faf7f2] border border-[#e8dfd2] space-y-3">
                  <span className="text-xs font-bold text-[#78716c]">ข้อมูลเดิมในระบบ</span>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[#a8a29e]">ปีที่ก่อตั้ง: </span>
                      <strong className="text-warm-charcoal">{prevGenInfo.founded || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#a8a29e]">จำนวนนักเรียน: </span>
                      <strong className="text-warm-charcoal">{prevGenInfo.student_count || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#a8a29e]">หอพักประจำ: </span>
                      <strong className="text-warm-charcoal">
                        {prevGenInfo.is_boarding !== undefined ? (prevGenInfo.is_boarding ? "มีหอพัก" : "ไม่มีหอพัก") : "—"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-blue-50/50 border-2 border-blue-400/60 space-y-3">
                  <span className="text-xs font-bold text-blue-950">ข้อมูลใหม่ที่ Scrape ได้</span>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-blue-700">ปีที่ก่อตั้ง: </span>
                      <strong className="text-blue-950 font-bold">{genInfo.founded || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-blue-700">จำนวนนักเรียน: </span>
                      <strong className="text-blue-950 font-bold">{genInfo.student_count || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-blue-700">หอพักประจำ: </span>
                      <strong className="text-blue-950 font-bold">
                        {genInfo.is_boarding !== undefined ? (genInfo.is_boarding ? "มีหอพักประจำ" : "ไป-กลับเท่านั้น") : "—"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {genInfo.about && (
                <div className="p-5 rounded-2xl bg-warm-cream/50 border border-warm-accent space-y-2">
                  <span className="text-xs font-bold text-warm-charcoal">ข้อมูลสรุปเกี่ยวกับโรงเรียน (About):</span>
                  <p className="text-xs text-[#78716c] leading-relaxed whitespace-pre-line">
                    {genInfo.about}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: FACILITIES */}
          {activeTab === "facilities" && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-warm-charcoal uppercase tracking-wider">
                สิ่งอำนวยความสะดวกที่ตรวจพบบนเว็บไซต์ ({version.scraped_facilities?.length || 0})
              </h4>
              {version.scraped_facilities && version.scraped_facilities.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {version.scraped_facilities.map((fac, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-warm-cream/60 border border-warm-accent flex items-center gap-2.5 text-xs text-warm-charcoal"
                    >
                      <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="font-semibold">{fac}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-[#78716c] bg-[#faf7f2] rounded-2xl border border-dashed border-[#e5dcce]">
                  ไม่พบรายการสิ่งอำนวยความสะดวกระบุไว้ชัดเจน
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SAFETY POLICIES */}
          {activeTab === "safety" && (
            <div className="space-y-6">
              <h4 className="text-xs font-bold text-warm-charcoal uppercase tracking-wider">
                6 มาตรการความปลอดภัยและนโยบายคุ้มครอง (ก่อน vs หลัง)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {safetyChecklist.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                      item.now
                        ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold"
                        : "bg-[#faf7f2] border-[#e8dfd2] text-[#78716c]"
                    }`}
                  >
                    <div>
                      <div className="text-xs">{item.label}</div>
                      <div className="text-[11px] font-normal text-[#a8a29e] mt-0.5">
                        ก่อนหน้า: {item.prev ? "✅ มี" : "❌ ไม่มี"} ➜ รอบใหม่: {item.now ? "✅ มี" : "❌ ไม่พบ"}
                      </div>
                    </div>
                    {item.now ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-[#a8a29e] shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {version.safety?.policy_summary && (
                <div className="p-4 rounded-2xl bg-warm-cream border border-warm-accent space-y-1.5">
                  <div className="text-xs font-bold text-warm-charcoal">สรุปนโยบายความปลอดภัยของโรงเรียน:</div>
                  <p className="text-xs text-[#78716c] leading-relaxed">{version.safety.policy_summary}</p>
                </div>
              )}

              {version.safety?.policy_url && (
                <div className="text-xs flex items-center gap-1.5">
                  <span className="text-[#a8a29e]">ลิงก์หน้านโยบายทางการ: </span>
                  <a
                    href={version.safety.policy_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-700 hover:underline inline-flex items-center gap-1 font-mono font-medium"
                  >
                    {version.safety.policy_url}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer: Action Buttons */}
        <div className="bg-warm-cream border-t border-warm-accent p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-[#78716c]">
            💡 หากกดยืนยัน ข้อมูลจะถูกบันทึกและเผยแพร่ลงในฐานข้อมูล Supabase และขึ้นหน้าเว็บจริงทันที
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            {/* Reject Button */}
            {!isRejecting ? (
              <button
                type="button"
                onClick={() => setIsRejecting(true)}
                disabled={isActionLoading}
                className="px-4 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>ปฏิเสธฉบับนี้</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ระบุเหตุผลการปฏิเสธ (ไม่บังคับ)"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#e5dcce] rounded-xl focus:outline-hidden focus:ring-1 focus:ring-rose-500 bg-white"
                />
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={isActionLoading}
                  className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-xs cursor-pointer"
                >
                  ยืนยันปฏิเสธ
                </button>
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  className="p-2 text-xs text-[#78716c] hover:text-warm-charcoal"
                >
                  ยกเลิก
                </button>
              </div>
            )}

            {/* Approve Button(s) */}
            {isVirtualLog ? (
              <div className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold shadow-sm inline-flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>ประวัติแบบอ่านอย่างเดียว (ไม่อนุมัติ)</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {totalPendingCount > 1 && onApproveAll && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onApproveAll();
                      onClose();
                    }}
                    disabled={isActionLoading}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                    title="อนุมัติทุกโรงเรียนที่รออยู่ในคราวเดียว"
                  >
                    <Check className="w-4 h-4" />
                    <span>อนุมัติทั้งหมด ({totalPendingCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleConfirmApprove}
                  disabled={isActionLoading}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isActionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึกลงฐานข้อมูล…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>อนุมัติเฉพาะรายการนี้</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
