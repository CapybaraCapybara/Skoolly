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
} from "lucide-react";
import type { PendingVersionRecord } from "@/types/opec";

interface VersionApprovalModalProps {
  version: PendingVersionRecord | null;
  onClose: () => void;
  onApprove: (versionId: string) => Promise<void>;
  onReject: (versionId: string, reason?: string) => Promise<void>;
  isActionLoading?: boolean;
}

export function VersionApprovalModal({
  version,
  onClose,
  onApprove,
  onReject,
  isActionLoading = false,
}: VersionApprovalModalProps) {
  const [activeTab, setActiveTab] = useState<"fees" | "extra_fees" | "safety">("fees");
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

  const confidenceScore = version.confidence_score ? Math.round(version.confidence_score * 100) : null;
  const isHighConfidence = confidenceScore !== null && confidenceScore >= 80;
  const isMediumConfidence = confidenceScore !== null && confidenceScore >= 50 && confidenceScore < 80;

  const handleConfirmReject = async () => {
    await onReject(version.version_id, rejectionReason || "ข้อมูลไม่ถูกต้องหรือไม่ผ่านเกณฑ์ตรวจสอบ");
    setIsRejecting(false);
  };

  const handleConfirmApprove = async () => {
    await onApprove(version.version_id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-white border border-[#e5dcce] rounded-3xl shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#1c1917] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-[#1c1917] text-[10px] font-black uppercase tracking-wider">
                Version {version.version_number} (Scraped Draft)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px] font-mono">
                {version.opec_school_code || version.school_id.substring(0, 8)}
              </span>
              {version.province && (
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px]">
                  📍 {version.province}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">{version.name_th}</h2>
            {version.name_en && (
              <p className="text-xs sm:text-sm text-white/60 font-medium">{version.name_en}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {version.scraped_page_url && (
              <a
                href={version.scraped_page_url}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5"
                title="เปิดหน้าเว็บไซต์ต้นทางที่ดึงข้อมูลค่าเทอม"
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

        {/* AI Confidence & Reasoning Banner */}
        <div className="bg-[#faf5ee] border-b border-[#eae0d0] p-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1c1917]">Gemini AI Scraper Extraction</span>
                {confidenceScore !== null && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                      isHighConfidence
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : isMediumConfidence
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-rose-100 text-rose-800 border border-rose-300"
                    }`}
                  >
                    ความมั่นใจ {confidenceScore}%
                  </span>
                )}
              </div>
              <p className="text-xs text-[#78716c] mt-0.5">
                {version.confidence_reasoning ||
                  version.diff_summary ||
                  "ดึงข้อมูลโครงสร้างตารางค่าเทอม ค่าใช้จ่ายแฝง และนโยบายความปลอดภัยจากเว็บไซต์ทางการ"}
              </p>
            </div>
          </div>

          <div className="text-xs text-[#a8a29e] flex-shrink-0 font-mono">
            {version.submitted_at ? new Date(version.submitted_at).toLocaleString("th-TH") : "เพิ่งนำเข้า"}
          </div>
        </div>

        {/* Side-by-Side Diff Summary Comparison */}
        <div className="p-6 sm:p-8 bg-white border-b border-[#eae0d0]">
          <div className="text-xs font-black uppercase tracking-wider text-[#a8a29e] mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            <span>เปรียบเทียบก่อนและหลังการเผยแพร่ (Diff Comparison)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current Published Version */}
            <div className="p-5 rounded-2xl bg-[#faf7f2] border border-[#e8dfd2] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#78716c] flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5" />
                  ฉบับปัจจุบันที่เผยแพร่อยู่ (Published)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e8dfd2] text-[#57534e]">
                  V.1 OPEC Data
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] text-[#a8a29e]">ช่วงค่าเทอมต่อปี:</div>
                  <div className="text-base font-bold text-[#78716c]">
                    {version.current_pub_min_thb && version.current_pub_max_thb
                      ? `฿${version.current_pub_min_thb.toLocaleString()} - ฿${version.current_pub_max_thb.toLocaleString()} / ปี`
                      : version.current_pub_min_thb
                      ? `฿${version.current_pub_min_thb.toLocaleString()} / ปี`
                      : "ยังไม่มีข้อมูล (Contact school)"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#a8a29e]">นโยบาย Child Safeguarding:</div>
                  <div className="text-xs font-semibold text-[#78716c]">
                    {version.current_has_safeguarding === true
                      ? "✅ มีนโยบายคุ้มครองความปลอดภัยเด็ก"
                      : "❌ ยังไม่ได้ระบุในระบบ"}
                  </div>
                </div>
              </div>
            </div>

            {/* New Scraped Draft Version */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 border-2 border-emerald-400/60 space-y-3 relative shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  ฉบับใหม่ที่ Scrape ได้ (New Draft)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-200 text-emerald-900 animate-pulse">
                  V.{version.version_number} Pending Approval
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] text-emerald-700 font-medium">ช่วงค่าเทอมต่อปีที่คำนวณได้:</div>
                  <div className="text-base font-black text-emerald-950">
                    {scrapedMin && scrapedMax
                      ? `฿${scrapedMin.toLocaleString()} - ฿${scrapedMax.toLocaleString()} / ปี`
                      : scrapedMin
                      ? `฿${scrapedMin.toLocaleString()} / ปี`
                      : "ตามตารางระดับชั้นด้านล่าง"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-emerald-700 font-medium">นโยบาย Child Safeguarding:</div>
                  <div className="text-xs font-bold text-emerald-900">
                    {version.safety?.child_safeguarding_policy
                      ? "✅ ตรวจพบนโยบายคุ้มครองความปลอดภัยเด็กบนเว็บไซต์"
                      : "⚠️ ไม่พบนโยบายระบุชัดเจนบนหน้าเว็บ"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 sm:px-8 pt-4 bg-[#faf5ee]/60 border-b border-[#eae0d0] flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("fees")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === "fees"
                ? "bg-white border-[#1c1917] text-[#1c1917] shadow-xs"
                : "border-transparent text-[#78716c] hover:text-[#1c1917]"
            }`}
          >
            <Coins className="w-4 h-4 text-amber-600" />
            <span>ตารางค่าเทอมตามระดับชั้น ({version.fees?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("extra_fees")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === "extra_fees"
                ? "bg-white border-[#1c1917] text-[#1c1917] shadow-xs"
                : "border-transparent text-[#78716c] hover:text-[#1c1917]"
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            <span>ค่าธรรมเนียมแฝง / รายการพิเศษ ({version.extra_fees?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 border-b-2 ${
              activeTab === "safety"
                ? "bg-white border-[#1c1917] text-[#1c1917] shadow-xs"
                : "border-transparent text-[#78716c] hover:text-[#1c1917]"
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>มาตรฐานความปลอดภัย (Safety & Policies)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 sm:p-8 max-h-[380px] overflow-y-auto">
          {/* 1. Tuition Fees by Grade */}
          {activeTab === "fees" && (
            <div className="space-y-4">
              {version.fees && version.fees.length > 0 ? (
                <div className="border border-[#e5dcce] rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#faf5ee] text-[#78716c] font-bold border-b border-[#e5dcce]">
                      <tr>
                        <th className="py-2.5 px-4">ระดับชั้น (Grade)</th>
                        <th className="py-2.5 px-4 text-right">ค่าเทอมรายปี (Annual THB)</th>
                        <th className="py-2.5 px-4 text-right">ค่าเทอมรายภาคเรียน (Semester THB)</th>
                        <th className="py-2.5 px-4">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eae0d0]">
                      {version.fees.map((fee, idx) => (
                        <tr key={fee.fee_id || idx} className="hover:bg-[#faf6f0]">
                          <td className="py-2.5 px-4 font-bold text-[#1c1917]">
                            {fee.grade_label}
                            {fee.level_code && (
                              <span className="ml-2 text-[10px] font-normal text-[#78716c]">
                                ({fee.level_code})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-800">
                            {fee.annual_thb ? `฿${fee.annual_thb.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-[#57534e]">
                            {fee.semester_thb ? `฿${fee.semester_thb.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-2.5 px-4 text-[#78716c] text-[11px]">
                            {fee.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-[#78716c] bg-[#faf7f2] rounded-2xl border border-dashed border-[#e5dcce]">
                  ไม่พบรายการค่าเทอมแยกรายระดับชั้น
                </div>
              )}
            </div>
          )}

          {/* 2. Extra Fees */}
          {activeTab === "extra_fees" && (
            <div className="space-y-4">
              {version.extra_fees && version.extra_fees.length > 0 ? (
                <div className="border border-[#e5dcce] rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#faf5ee] text-[#78716c] font-bold border-b border-[#e5dcce]">
                      <tr>
                        <th className="py-2.5 px-4">รายการค่าใช้จ่าย</th>
                        <th className="py-2.5 px-4 text-right">จำนวนเงิน (THB)</th>
                        <th className="py-2.5 px-4">รอบการจ่าย (Frequency)</th>
                        <th className="py-2.5 px-4">คำอธิบาย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eae0d0]">
                      {version.extra_fees.map((ef, idx) => (
                        <tr key={ef.extra_fee_id || idx} className="hover:bg-[#faf6f0]">
                          <td className="py-2.5 px-4 font-bold text-[#1c1917]">{ef.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-900">
                            {ef.amount_thb ? `฿${ef.amount_thb.toLocaleString()}` : "ตามประเมิน"}
                          </td>
                          <td className="py-2.5 px-4 text-[#57534e]">
                            <span className="px-2 py-0.5 rounded-full bg-[#f3ece2] text-[10px] font-medium">
                              {ef.frequency}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[#78716c] text-[11px]">{ef.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-[#78716c] bg-[#faf7f2] rounded-2xl border border-dashed border-[#e5dcce]">
                  ไม่พบรายการค่าธรรมเนียมแฝงเพิ่มเติม
                </div>
              )}
            </div>
          )}

          {/* 3. Safety & Protocol */}
          {activeTab === "safety" && (
            <div className="space-y-4">
              {version.safety ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        label: "รปภ. และระบบรักษาความปลอดภัย",
                        active: version.safety.security_guards,
                      },
                      {
                        label: "กล้องวงจรปิด CCTV 24 ชม.",
                        active: version.safety.cctv_monitoring,
                      },
                      {
                        label: "ห้องพยาบาล / บุคลากรทางการแพทย์",
                        active: version.safety.nurse_medical_clinic,
                      },
                      {
                        label: "นโยบายคุ้มครองความปลอดภัยเด็ก (Safeguarding)",
                        active: version.safety.child_safeguarding_policy,
                      },
                      {
                        label: "มาตรการรับมือฝุ่น PM2.5 / เครื่องฟอกอากาศ",
                        active: version.safety.air_quality_pm25_protocol,
                      },
                      {
                        label: "ระบบควบคุมการเข้า-ออกของผู้มาติดต่อ",
                        active: version.safety.visitor_access_control,
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                          item.active
                            ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-bold"
                            : "bg-[#faf7f2] border-[#e8dfd2] text-[#78716c]"
                        }`}
                      >
                        <span className="text-xs">{item.label}</span>
                        {item.active ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#a8a29e] flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>

                  {version.safety.policy_summary && (
                    <div className="p-4 rounded-2xl bg-[#faf5ee] border border-[#eae0d0]">
                      <div className="text-xs font-bold text-[#1c1917] mb-1">สรุปนโยบายความปลอดภัย:</div>
                      <p className="text-xs text-[#78716c] leading-relaxed">
                        {version.safety.policy_summary}
                      </p>
                    </div>
                  )}

                  {version.safety.policy_url && (
                    <div className="text-xs">
                      <span className="text-[#a8a29e]">ลิงก์หน้านโยบาย: </span>
                      <a
                        href={version.safety.policy_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 hover:underline inline-flex items-center gap-1 font-mono"
                      >
                        {version.safety.policy_url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-[#78716c] bg-[#faf7f2] rounded-2xl border border-dashed border-[#e5dcce]">
                  ไม่พบข้อมูลมาตรฐานความปลอดภัยของเวอร์ชันนี้
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer: Action Bar */}
        <div className="bg-[#faf5ee] border-t border-[#eae0d0] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-[#78716c]">
            เมื่ออนุมัติ ระบบจะปรับปรุงค่าเทอมในตารางหลัก <span className="font-mono font-bold text-[#1c1917]">school_data.schools</span> ให้แสดงผลทันที
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
                <span>ปฏิเสธ (Reject)</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ระบุเหตุผล (ไม่บังคับ)"
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
                  className="p-2 text-xs text-[#78716c] hover:text-[#1c1917]"
                >
                  ยกเลิก
                </button>
              </div>
            )}

            {/* Approve Button */}
            <button
              type="button"
              onClick={handleConfirmApprove}
              disabled={isActionLoading}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isActionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังบันทึกและเผยแพร่...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>อนุมัติและเผยแพร่ (Approve & Publish)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
