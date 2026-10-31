import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import type { CurriculumReviewItem, CurriculumReviewResponse } from "@/types/opec";
import { clearSchoolCurriculums, confirmSchoolCurriculums, getCurriculumReview } from "@/api/opecApi";
import { cn } from "@/lib/utils";
import { placeInitials, review } from "@/components/admin/reviewStyles";

interface CurriculumReviewProps {
  onShowToast: (msg: string) => void;
  /** Number of schools still waiting for a decision, for the menu badge */
  onCountChange: (count: number) => void;
}

export function CurriculumReview({ onShowToast, onCountChange }: CurriculumReviewProps) {
  const [data, setData] = useState<CurriculumReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await getCurriculumReview();
      setData(res);
      setError(null);
      onCountChange(res.conflicts.length);
    } catch (err: any) {
      setError(err.message || "โหลดรายการไม่สำเร็จ");
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async (item: CurriculumReviewItem, codes: string[]) => {
    setBusyCode(item.school_code);
    try {
      await confirmSchoolCurriculums(item.school_code, codes);
      onShowToast(`บันทึกหลักสูตรของ ${item.name_th || item.name_en} แล้ว`);
      setEditingCode(null);
      await load();
    } catch (err: any) {
      onShowToast(`บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
      setBusyCode(null);
    }
  };

  const clear = async (item: CurriculumReviewItem) => {
    setBusyCode(item.school_code);
    try {
      await clearSchoolCurriculums(item.school_code);
      onShowToast(`ยกเลิกการยืนยันของ ${item.name_th || item.name_en} แล้ว`);
      await load();
    } catch (err: any) {
      onShowToast(`ยกเลิกไม่สำเร็จ: ${err.message}`);
    } finally {
      setBusyCode(null);
    }
  };

  const labels = data?.labels ?? {};
  // Short names keep the line readable: "สหราชอาณาจักร (British)" -> "British"
  const short = (c: string) => (c === "IB" ? "IB" : labels[c]?.match(/\(([^)]+)\)/)?.[1] ?? labels[c] ?? c);
  const names = (codes: string[]) => (codes.length ? codes.map(short).join(", ") : "ไม่ระบุ");

  // Square, chips row, name and the details line, laid out like the fee-draft cards
  const header = (item: CurriculumReviewItem, chip: React.ReactNode, details: React.ReactNode) => (
    <div className="flex items-start gap-4">
      <div className={review.monogram}>{placeInitials(item.province)}</div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {chip}
          <span className={cn(review.meta, "font-mono")}>{item.school_code}</span>
          {item.province && (
            <span className={review.meta}>
              {item.province} {item.district ? `(${item.district})` : ""}
            </span>
          )}
        </div>
        <h3 className={review.title}>{item.name_th || item.name_en}</h3>
        {item.name_th && item.name_en && <p className="text-xs text-[#78716c] font-medium">{item.name_en}</p>}
        <div className={review.details}>{details}</div>
      </div>
    </div>
  );

  const websiteLink = (item: CurriculumReviewItem) =>
    item.website_url && (
      <a href={item.website_url} target="_blank" rel="noreferrer" className={review.linkIcon} title="เปิดเว็บโรงเรียน">
        <ExternalLink className="w-4 h-4" />
      </a>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-warm-charcoal/70">
          OPEC กับเว็บโรงเรียนบอกหลักสูตรไม่ตรงกัน เลือกว่าจะใช้แบบไหน
          {data && data.conflicts.length > 0 && (
            <span className="font-semibold text-warm-charcoal"> · {data.conflicts.length} รายการ</span>
          )}
        </p>
        <button type="button" onClick={load} className={review.toolbarBtn}>
          <RefreshCw className="w-3.5 h-3.5" />
          <span>รีเฟรช</span>
        </button>
      </div>

      {error ? (
        <div className={cn(review.empty, "text-sm text-rose-700")}>{error}</div>
      ) : !data ? (
        <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-16 text-center shadow-xs">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-[#78716c]">กำลังโหลด…</p>
        </div>
      ) : (
        <>
          {data.conflicts.length === 0 ? (
            <div className={review.empty}>
              <div className={review.emptyIcon}>
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-warm-charcoal">ไม่มีโรงเรียนที่หลักสูตรขัดกัน</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {data.conflicts.map((item) => {
                const busy = busyCode === item.school_code;
                const editing = editingCode === item.school_code;
                return (
                  <div key={item.school_code} className={cn(review.card, "space-y-4")}>
                    <div className={review.row}>
                      {header(
                        item,
                        <span className={review.chipAmber}>หลักสูตรไม่ตรงกัน</span>,
                        <>
                          <div title={item.opec_text.length ? `OPEC เขียนว่า ${item.opec_text.join(" · ")}` : undefined}>
                            <span className={review.label}>ตาม OPEC: </span>
                            <strong>{names(item.opec_codes)}</strong>
                          </div>
                          <span className="text-warm-accent">•</span>
                          <div>
                            <span className={review.label}>ตามเว็บ: </span>
                            <strong className="text-emerald-800 font-bold">{names(item.website_codes)}</strong>
                          </div>
                          <span className="text-warm-accent">•</span>
                          <div>
                            <span className={review.label}>แสดงอยู่: </span>
                            <strong>{names(item.current_codes)}</strong>
                          </div>
                        </>
                      )}

                      <div className={review.actions}>
                        {busy && <Loader2 className="w-4 h-4 animate-spin text-warm-bronze" />}
                        {websiteLink(item)}
                        {editing ? (
                          <>
                            <button type="button" onClick={() => setEditingCode(null)} className={review.btnOutline}>
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              disabled={busy || picked.length === 0}
                              onClick={() => confirm(item, picked)}
                              className={review.btnGreen}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>บันทึกที่เลือก</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => confirm(item, item.opec_codes)}
                              className={review.btnNavy}
                            >
                              ใช้ตาม OPEC
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => confirm(item, item.website_codes)}
                              className={review.btnNavy}
                            >
                              ใช้ตามเว็บโรงเรียน
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setEditingCode(item.school_code);
                                setPicked(item.current_codes.filter((c) => c !== "SCHOOL_SPECIFIC"));
                              }}
                              className={review.btnOutline}
                            >
                              เลือกเอง
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editing && (
                      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-warm-accent pt-4">
                        {Object.keys(labels).map((c) => (
                          <label key={c} className="inline-flex items-center gap-1.5 text-xs text-warm-charcoal cursor-pointer">
                            <input
                              type="checkbox"
                              checked={picked.includes(c)}
                              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))}
                            />
                            {labels[c]}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {data.confirmed.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-sm font-bold text-warm-charcoal">ยืนยันแล้ว ({data.confirmed.length})</h3>
              <div className="grid grid-cols-1 gap-4">
                {data.confirmed.map((item) => (
                  <div key={item.school_code} className={cn(review.card, review.row)}>
                    {header(
                      item,
                      <span className={review.chipGreen}>ยืนยันแล้ว</span>,
                      <>
                        <div>
                          <span className={review.label}>หลักสูตร: </span>
                          <strong className="text-emerald-800 font-bold">{names(item.current_codes)}</strong>
                        </div>
                        <span className="text-warm-accent">•</span>
                        <div>
                          <span className={review.label}>ยืนยันเมื่อ: </span>
                          <strong>
                            {item.confirmed_at
                              ? new Date(item.confirmed_at).toLocaleDateString("th-TH", {
                                  timeZone: "Asia/Bangkok",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "-"}
                          </strong>
                        </div>
                      </>
                    )}
                    <div className={review.actions}>
                      {websiteLink(item)}
                      <button
                        type="button"
                        disabled={busyCode === item.school_code}
                        onClick={() => clear(item)}
                        className={review.btnOutline}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>ยกเลิกการยืนยัน</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
