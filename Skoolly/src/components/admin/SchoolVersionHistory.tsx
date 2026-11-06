import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Layers, RotateCcw } from "lucide-react";
import { getSchoolVersions, restoreSchoolVersion } from "@/api/adminApi";
import { ConfirmActionModal } from "@/components/admin/ConfirmActionModal";
import { VersionCompare } from "@/components/admin/VersionCompare";
import type { SchoolVersion } from "@/types/admin";

// Keys of a version's link, pin and curriculums (data_snapshot->'school', db/schema.sql school_fields)
const FIELD_LABELS: Record<string, string> = {
  official_website_url: "เว็บไซต์",
  website_source: "ที่มาของเว็บไซต์",
  website_confirmed_at: "ยืนยันเว็บไซต์เมื่อ",
  latitude: "ละติจูด",
  longitude: "ลองจิจูด",
  gps_precision: "ความแม่นยำของพิกัด",
  gps_source: "ที่มาของพิกัด",
  curriculums: "หลักสูตร",
  curriculums_confirmed_at: "ยืนยันหลักสูตรเมื่อ",
  curriculums_confirmed_by: "ยืนยันหลักสูตรโดย",
};

// diff_summary.action, and the action tag_versions() gave an audit_log row (SchoolChangeHistory) -> what was done
export const ACTION_LABELS: Record<string, string> = {
  edit_website: "แอดมินแก้ลิงก์เว็บไซต์",
  set_gps: "แอดมินปักหมุด",
  clear_gps: "แอดมินลบหมุดที่ปักเอง",
  confirm_curriculums: "แอดมินยืนยันหลักสูตร",
  clear_curriculums: "แอดมินยกเลิกการยืนยันหลักสูตร",
  opec_import: "นำเข้าข้อมูลจาก สช.",
  gps_step: "ขั้นหาพิกัด",
  website_step: "ขั้นหาเว็บไซต์",
  registry_sync: "ซิงค์ทะเบียนเว็บไซต์",
  rollback: "แอดมินย้อนเวอร์ชัน",
  approve_version: "แอดมินอนุมัติข้อมูลจากเว็บ",
  close_school: "แอดมินปิดโรงเรียน",
  reopen_school: "แอดมินเปิดโรงเรียนอีกครั้ง",
  opec_presence: "ตรวจรายชื่อ สช.",
  name_en_step: "ขั้นหาชื่อภาษาอังกฤษ",
  isat_step: "ขั้นดึงข้อมูล ISAT",
};

const STATUS: Record<SchoolVersion["status"], { label: string; chip: string }> = {
  published: { label: "เผยแพร่อยู่", chip: "bg-warm-charcoal text-white" },
  superseded: { label: "ฉบับเก่า", chip: "bg-warm-card text-[#78716c]" },
  pending_review: { label: "รออนุมัติ", chip: "bg-amber-100 text-amber-800" },
  approved: { label: "อนุมัติแล้ว", chip: "bg-warm-card text-[#78716c]" },
  rejected: { label: "ไม่อนุมัติ", chip: "bg-rose-50 text-rose-700" },
};

const SHOWN_AT_FIRST = 4;

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (key.endsWith("_at") && typeof value === "string") return when(value);
  return String(value);
}

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

/** "336,000 – 554,000 บาท/ปี", or why there is none */
function tuition(v: SchoolVersion): string {
  if (!v.has_web_data) return "ไม่มีข้อมูลจากเว็บ";
  if (v.annual_min == null || v.annual_max == null) return "ไม่มีค่าเทอมรายปี";
  return v.annual_min === v.annual_max
    ? `${baht(v.annual_min)} บาท/ปี`
    : `${baht(v.annual_min)} – ${baht(v.annual_max)} บาท/ปี`;
}

/** Who made the version and where its data came from */
function origin(v: SchoolVersion): string {
  const action = v.diff_summary?.action;
  if (action === "rollback") return `แอดมินย้อนกลับไปใช้ฉบับ ${v.diff_summary?.restored_from}`;
  if (v.source_type === "scraper") {
    return v.status === "published" || v.status === "superseded"
      ? "เก็บจากเว็บโรงเรียน · แอดมินอนุมัติ"
      : "เก็บจากเว็บโรงเรียน";
  }
  if (action && ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (v.source_type === "opec_import") return "นำเข้าข้อมูลจาก สช.";
  if (v.source_type === "admin") return "แอดมิน";
  return "ระบบ";
}

const sameWebData = (a: SchoolVersion, b: SchoolVersion) =>
  a.has_web_data === b.has_web_data && a.annual_min === b.annual_min && a.annual_max === b.annual_max &&
  a.fee_rows === b.fee_rows && a.extra_rows === b.extra_rows;

/** One school's versions as a timeline, highest number first; any version that was published can be restored (UC-11) */
export function SchoolVersionHistory({
  schoolCode,
  onDialogChange,
  onRestored,
}: {
  schoolCode: string;
  /** The confirm dialog opened or closed; the parent modal ignores Escape while it is open */
  onDialogChange?: (open: boolean) => void;
  onRestored?: (restoredFrom: number) => void;
}) {
  const [data, setData] = useState<{ current_version_id: string | null; versions: SchoolVersion[] } | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<SchoolVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  const load = useCallback(() => {
    setError("");
    return getSchoolVersions(schoolCode)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [schoolCode]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (v: SchoolVersion | null) => {
    setRestoring(v);
    setRestoreError("");
    onDialogChange?.(v !== null);
  };

  const restore = async () => {
    if (!restoring || !data) return;
    setBusy(true);
    try {
      // the version the list showed as published: another admin's save since then gets 409
      const res = await restoreSchoolVersion(schoolCode, restoring.version_id, data.current_version_id);
      pick(null);
      setComparing(null);
      await load();
      onRestored?.(res.restored_from);
    } catch (e: any) {
      pick(null);
      setRestoreError(e.message || "ย้อนเวอร์ชันไม่สำเร็จ");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const versions = data?.versions ?? [];
  const current = versions.find((v) => v.version_id === data?.current_version_id);
  const shown = showAll ? versions : versions.slice(0, SHOWN_AT_FIRST);

  const notes = (v: SchoolVersion): string => {
    const parts = [];
    if (!v.school) parts.push("ฉบับนี้บันทึกก่อนที่ลิงก์ หมุด และหลักสูตรจะเป็นเวอร์ชัน จึงย้อนเฉพาะข้อมูลจากเว็บ ส่วนลิงก์ หมุด และหลักสูตรคงค่าปัจจุบัน");
    if (!v.has_web_data) parts.push("ฉบับนี้ไม่มีข้อมูลจากเว็บ ค่าเทอม ค่าใช้จ่ายแฝง และความปลอดภัยจะหายจากหน้าเว็บ");
    return parts.join(" ");
  };

  return (
    <div className="lg:col-span-2 bg-white border border-warm-accent rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-warm-accent/80">
        <div className="flex items-center gap-2 text-warm-bronze font-bold text-xs uppercase tracking-wide">
          <Layers className="w-4 h-4" />
          <span>ประวัติเวอร์ชัน</span>
        </div>
        {data && <span className="text-xs text-[#78716c]">{versions.length} ฉบับ</span>}
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!data && !error && <p className="text-xs text-[#78716c]">กำลังโหลด…</p>}
      {data && !versions.length && <p className="text-xs text-[#a8a29e] italic">ยังไม่มีเวอร์ชัน</p>}
      {restoreError && <p className="text-xs text-rose-700">{restoreError}</p>}

      {shown.length > 0 && (
        <ol className="relative text-xs">
          {shown.map((v, i) => {
            const isCurrent = v.version_id === data?.current_version_id;
            const muted = v.status === "rejected" || v.status === "pending_review";
            const fields = Object.entries(v.diff_summary?.fields ?? {});
            const differs = !isCurrent && !muted && current && !sameWebData(v, current);
            return (
              <li key={v.version_id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* timeline rail and dot */}
                {i < shown.length - 1 && (
                  <span className="absolute left-[5px] top-4 bottom-0 w-px bg-warm-accent" aria-hidden />
                )}
                <span
                  className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                    isCurrent ? "border-warm-charcoal bg-warm-charcoal" : "border-warm-accent bg-white"
                  }`}
                  aria-hidden
                />

                <div className={`flex-1 min-w-0 ${muted ? "opacity-70" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-warm-charcoal">ฉบับ {v.version_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS[v.status].chip}`}>
                      {STATUS[v.status].label}
                    </span>
                    <span className="text-[#a8a29e]">{when(v.reviewed_at ?? v.submitted_at)}</span>
                    {!isCurrent && (
                      <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setComparing(comparing === v.version_id ? null : v.version_id)}
                          aria-expanded={comparing === v.version_id}
                          className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-lg text-warm-bronze font-semibold hover:bg-warm-card transition-colors"
                        >
                          <span>{comparing === v.version_id ? "ซ่อนความต่าง" : "ดูความต่าง"}</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${comparing === v.version_id ? "rotate-180" : ""}`}
                          />
                        </button>
                        {v.status === "superseded" && (
                          <button
                            type="button"
                            onClick={() => pick(v)}
                            className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-lg text-warm-charcoal font-semibold hover:bg-warm-card transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>ย้อนกลับไปใช้ฉบับนี้</span>
                          </button>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 text-warm-charcoal">{origin(v)}</div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[#78716c]">
                    <span className="font-semibold text-warm-charcoal">{tuition(v)}</span>
                    {v.has_web_data && (
                      <span>{`· ค่าเทอม ${v.fee_rows} รายการ · ค่าใช้จ่ายอื่น ${v.extra_rows} รายการ`}</span>
                    )}
                    {v.web_from_number && <span>{`· ข้อมูลจากเว็บของฉบับ ${v.web_from_number}`}</span>}
                    {differs && (
                      <span className="px-1.5 py-0.5 rounded-md bg-warm-bronze/15 text-[#8a6a22] font-semibold">
                        ต่างจากฉบับที่ใช้อยู่
                      </span>
                    )}
                  </div>

                  {v.source_type === "scraper" && v.scraped_page_url && (
                    <a
                      href={v.scraped_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={v.scraped_page_url}
                      className="mt-1 inline-flex max-w-full items-center gap-1 text-warm-bronze hover:underline"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{v.scraped_page_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                    </a>
                  )}

                  {fields.length > 0 && (
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-warm-cream border border-warm-accent/70 px-2.5 py-1.5">
                      {fields.map(([k, [before, after]]) => (
                        <div key={k} className="contents">
                          <dt className="text-[#78716c]">{FIELD_LABELS[k] ?? k}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="line-through text-[#a8a29e]">{show(k, before)}</span>
                            <span className="text-[#78716c]">{" → "}</span>
                            <span className="text-warm-charcoal font-medium">{show(k, after)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {v.status === "rejected" && v.rejection_reason && (
                    <div className="mt-1 text-rose-700">เหตุผล: {v.rejection_reason}</div>
                  )}

                  {comparing === v.version_id && (
                    <div className="mt-2">
                      <VersionCompare schoolCode={schoolCode} versionId={v.version_id} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {versions.length > SHOWN_AT_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="self-start text-xs font-semibold text-warm-bronze hover:underline"
        >
          {showAll ? "แสดงน้อยลง" : `แสดงอีก ${versions.length - SHOWN_AT_FIRST} ฉบับ`}
        </button>
      )}

      <ConfirmActionModal
        isOpen={restoring !== null}
        onClose={() => pick(null)}
        onConfirm={restore}
        title={`ย้อนกลับไปใช้ฉบับ ${restoring?.version_number ?? ""}?`}
        description={
          `ระบบจะสร้างฉบับใหม่ที่มีค่าเหมือนฉบับ ${restoring?.version_number ?? ""} แล้วเผยแพร่แทนฉบับปัจจุบัน ` +
          "ฉบับเก่าทั้งหมดยังอยู่ในประวัติ" +
          (restoring && notes(restoring) ? ` ${notes(restoring)}` : "")
        }
        confirmText="ย้อนกลับ"
        variant="warning"
        iconType="help"
        isLoading={busy}
      />
    </div>
  );
}
