import { ExternalLink } from "lucide-react";
import type { PendingVersionRecord } from "@/types/admin";

// Reasons admins give most; one click fills the box, which stays editable
const QUICK_REASONS = [
  "ข้อมูลเหมือนฉบับที่ใช้อยู่",
  "ตัวเลขไม่ตรงกับเว็บโรงเรียน",
  "อ่านผิดหน้าหรือผิดโรงเรียน",
  "ข้อมูลไม่ครบ",
];

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

function when(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

/** The draft being rejected and the reason, inside the reject dialog (AdminPage) */
export function RejectDraftForm({
  version,
  reason,
  onReasonChange,
}: {
  version: PendingVersionRecord;
  reason: string;
  onReasonChange: (reason: string) => void;
}) {
  const annual = version.fees.map((f) => f.annual_thb).filter((n): n is number => n != null && n > 0);
  const tuition = annual.length
    ? Math.min(...annual) === Math.max(...annual)
      ? `${baht(annual[0])} บาท/ปี`
      : `${baht(Math.min(...annual))} – ${baht(Math.max(...annual))} บาท/ปี`
    : "ไม่มีค่าเทอมรายปี";
  const confidence = version.confidence_score != null ? Math.round(version.confidence_score * 100) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-warm-accent bg-white p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-warm-charcoal leading-snug">{version.name_th}</p>
            {version.name_en && <p className="text-xs text-[#78716c] truncate">{version.name_en}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            ร่างฉบับ {version.version_number}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#78716c]">
          <span className="font-semibold text-warm-charcoal">{tuition}</span>
          <span>ค่าเทอม {version.fees.length} รายการ</span>
          <span>ค่าใช้จ่ายอื่น {version.extra_fees.length} รายการ</span>
          {confidence !== null && <span>ความมั่นใจ {confidence}%</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#a8a29e]">
          {version.submitted_at && <span>เก็บเมื่อ {when(version.submitted_at)}</span>}
          {version.scraped_page_url && (
            <a
              href={version.scraped_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-warm-bronze hover:underline"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{version.scraped_page_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            </a>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="reject-reason" className="text-xs font-semibold text-warm-charcoal">
          เหตุผล <span className="font-normal text-[#a8a29e]">(ไม่บังคับ)</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onReasonChange(reason === r ? "" : r)}
              aria-pressed={reason === r}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                reason === r
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-warm-accent bg-white text-[#78716c] hover:bg-warm-card"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          placeholder="หรือพิมพ์เหตุผลเอง"
          className="mt-2 w-full rounded-xl border border-warm-accent bg-white px-3 py-2 text-xs text-warm-charcoal placeholder:text-[#a8a29e] focus:outline-hidden focus:ring-2 focus:ring-rose-200 resize-none"
        />
        <p className="mt-1 text-[11px] text-[#a8a29e]">
          ร่างยังเก็บไว้ในประวัติเวอร์ชันพร้อมเหตุผลนี้ ผู้ใช้ทั่วไปไม่เห็น
        </p>
      </div>
    </div>
  );
}
