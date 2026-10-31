import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import type { CurriculumReviewItem, CurriculumReviewResponse } from "@/types/opec";
import { clearSchoolCurriculums, confirmSchoolCurriculums, getCurriculumReview } from "@/api/opecApi";

interface CurriculumReviewProps {
  onShowToast: (msg: string) => void;
  /** Number of schools still waiting for a decision, for the menu badge */
  onCountChange: (count: number) => void;
}

function Chips({ codes, labels }: { codes: string[]; labels: Record<string, string> }) {
  if (!codes.length) return <span className="text-xs text-warm-charcoal/40">ไม่มีข้อมูล</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <span key={c} className="px-2 py-0.5 rounded-full bg-warm-bg border border-warm-accent text-[11px] text-warm-charcoal">
          {labels[c] ?? c}
        </span>
      ))}
    </div>
  );
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

  if (error) {
    return (
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-8 text-center text-sm text-rose-700">
        {error}
        <button type="button" onClick={load} className="ml-3 underline cursor-pointer">ลองใหม่</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-12 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      </div>
    );
  }

  const labels = data.labels;
  const allCodes = Object.keys(labels);

  return (
    <div className="space-y-5">
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-6 shadow-xs space-y-4">
        <p className="text-sm text-warm-charcoal/70 leading-relaxed">
          หลักสูตรที่ผู้ปกครองใช้กรองมาจากทะเบียน สช. (OPEC) รายการนี้คือโรงเรียนที่ OPEC กับเว็บโรงเรียนระบุหลักสูตรคนละแบบ
          ตรวจจากเว็บหรือเอกสารของโรงเรียนแล้วเลือกค่าที่ถูกต้อง การดึงข้อมูล OPEC รอบต่อไปจะไม่เขียนทับค่าที่ยืนยันแล้ว
        </p>
        <div className="flex">
          <button
            type="button"
            onClick={load}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-warm-accent px-3 py-1.5 text-xs text-warm-charcoal hover:border-warm-bronze cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> รีเฟรช
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-warm-charcoal">รอตรวจ ({data.conflicts.length})</h3>
        {data.conflicts.length === 0 && (
          <div className="bg-warm-cream border border-warm-accent rounded-2xl p-6 text-center text-sm text-warm-charcoal/60">
            ไม่มีโรงเรียนที่ข้อมูลขัดกัน
          </div>
        )}
        {data.conflicts.map((item) => {
          const busy = busyCode === item.school_code;
          const editing = editingCode === item.school_code;
          return (
            <article key={item.school_code} className="bg-warm-cream border border-warm-accent rounded-2xl p-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-warm-charcoal">{item.name_th || item.name_en}</h4>
                <p className="text-xs text-warm-charcoal/60">
                  {item.name_en} · {item.school_code}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-warm-charcoal/70">ตาม OPEC</p>
                  <Chips codes={item.opec_codes} labels={labels} />
                  <p className="text-[11px] text-warm-charcoal/50 leading-relaxed">{item.opec_text.join(" · ")}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-warm-charcoal/70">ตามเว็บโรงเรียน</p>
                  <Chips codes={item.website_codes} labels={labels} />
                  <p className="text-[11px] text-warm-charcoal/50">{item.website_text}</p>
                  {item.website_url && (
                    <a
                      href={item.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-warm-bronze hover:underline"
                    >
                      เปิดเว็บโรงเรียน <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-warm-charcoal/70">ที่แสดงอยู่ตอนนี้</p>
                  <Chips codes={item.current_codes} labels={labels} />
                </div>
              </div>

              {editing && (
                <div className="flex flex-wrap gap-2 border-t border-warm-accent pt-3">
                  {allCodes.map((c) => (
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

              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || picked.length === 0}
                      onClick={() => confirm(item, picked)}
                      className="rounded-full bg-warm-charcoal px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                    >
                      บันทึกที่เลือก
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCode(null)}
                      className="rounded-full border border-warm-accent px-4 py-1.5 text-xs text-warm-charcoal cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => confirm(item, item.opec_codes)}
                      className="rounded-full bg-warm-charcoal px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                    >
                      ใช้ตาม OPEC
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => confirm(item, item.website_codes)}
                      className="rounded-full bg-warm-charcoal px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
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
                      className="rounded-full border border-warm-accent px-4 py-1.5 text-xs text-warm-charcoal disabled:opacity-50 cursor-pointer"
                    >
                      เลือกเอง
                    </button>
                  </>
                )}
                {busy && <Loader2 className="w-4 h-4 animate-spin text-warm-bronze self-center" />}
              </div>
            </article>
          );
        })}
      </section>

      {data.confirmed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-warm-charcoal">ยืนยันแล้ว ({data.confirmed.length})</h3>
          {data.confirmed.map((item) => (
            <div
              key={item.school_code}
              className="bg-warm-cream border border-warm-accent rounded-2xl p-4 flex flex-wrap items-center gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-warm-charcoal">{item.name_th || item.name_en}</p>
                <Chips codes={item.current_codes} labels={labels} />
                <p className="text-[11px] text-warm-charcoal/50">
                  ยืนยันเมื่อ{" "}
                  {item.confirmed_at ? new Date(item.confirmed_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : ""}
                  {item.confirmed_by && ` โดย ${item.confirmed_by}`}
                </p>
              </div>
              <button
                type="button"
                disabled={busyCode === item.school_code}
                onClick={() => clear(item)}
                className="inline-flex items-center gap-1.5 rounded-full border border-warm-accent px-3 py-1.5 text-xs text-warm-charcoal hover:border-warm-bronze disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> ยกเลิกการยืนยัน
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
