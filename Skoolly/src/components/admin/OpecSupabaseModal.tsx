import { useEffect, useState } from "react";
import {
  Database,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  RefreshCw,
  ExternalLink,
  Wand2,
  ShieldAlert,
  Loader2,
  ArrowRight,
  Server,
} from "lucide-react";
import type { SupabaseStatusResponse } from "@/api/opecApi";
import { initSupabaseSchema } from "@/api/opecApi";

interface OpecSupabaseModalProps {
  isOpen: boolean;
  status: SupabaseStatusResponse | null;
  onClose: () => void;
  onRefreshStatus: () => Promise<void>;
  onStartSync: (fetchFresh: boolean) => void;
  isSyncing: boolean;
}

export function OpecSupabaseModal({
  isOpen,
  status,
  onClose,
  onRefreshStatus,
  onStartSync,
  isSyncing,
}: OpecSupabaseModalProps) {
  const [initializingSchema, setInitializingSchema] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Esc key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInitSchema = async () => {
    if (
      !window.confirm(
        "คุณต้องการรัน db/schema.sql เพื่อสร้าง Schemas (school_data, community ฯลฯ) และ Tables บน Supabase ใช่หรือไม่?"
      )
    ) {
      return;
    }

    setInitializingSchema(true);
    setActionMessage(null);
    try {
      const res = await initSupabaseSchema();
      await onRefreshStatus();
      setActionMessage({
        type: "success",
        text: res.message || "สร้าง Schema และ Tables บน Supabase เรียบร้อยแล้ว!",
      });
    } catch (err: any) {
      setActionMessage({ type: "error", text: `สร้าง Schema ไม่สำเร็จ: ${err.message}` });
    } finally {
      setInitializingSchema(false);
    }
  };

  const isConnected = Boolean(status?.connected);
  const hasSchema = Boolean(status?.has_schema);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white/70 border border-warm-accent text-warm-charcoal rounded-[2rem] w-full max-w-xl overflow-hidden shadow-2xl animate-scaleUp flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-warm-cream border-b border-warm-accent px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center border border-[#456ca6]/30 shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-warm-charcoal">สถานะฐานข้อมูล Supabase</h2>
                <span
                  className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                    isConnected
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                  }`}
                >
                  {isConnected ? "● Connected" : "○ Disconnected"}
                </span>
              </div>
              <p className="text-xs text-warm-charcoal/60">
                ระบบจัดการและนำเข้าข้อมูลโรงเรียนนานาชาติสู่ PostgreSQL Database จริง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-warm-charcoal/50 hover:text-warm-charcoal hover:bg-warm-accent/50 transition-colors"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Status Box */}
          <div
            className={`p-4 rounded-2xl border ${
              isConnected
                ? "bg-emerald-50/70 border-emerald-200/80 text-emerald-950"
                : "bg-amber-50/70 border-amber-200/80 text-amber-950"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-sm">
                    {isConnected
                      ? "เชื่อมต่อฐานข้อมูล Supabase สำเร็จ"
                      : "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}
                  </div>

                  {isConnected ? (
                    <div className="text-xs space-y-1 opacity-90 pt-1">
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Host:</span>
                        <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded text-[11px]">
                          {status?.masked_url}
                        </code>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-white/60 p-2 rounded-xl border border-emerald-200/60">
                          <div className="text-[11px] text-emerald-800/70 font-medium">ความเร็ว Ping</div>
                          <div className="font-bold text-emerald-900 text-xs">
                            {status?.latency_ms ? `${status.latency_ms} ms` : "-"}
                          </div>
                        </div>
                        <div className="bg-white/60 p-2 rounded-xl border border-emerald-200/60">
                          <div className="text-[11px] text-emerald-800/70 font-medium">โรงเรียนใน Supabase</div>
                          <div className="font-bold text-emerald-900 text-xs">
                            {status?.school_count ?? 0} แห่ง
                          </div>
                        </div>
                      </div>
                      <div className="pt-1 flex items-center gap-1.5 text-xs">
                        <span className="font-medium">สถานะ Schema:</span>
                        <span
                          className={`font-bold ${
                            hasSchema ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {hasSchema
                            ? "✓ พร้อมใช้งาน (school_data.schools พร้อมรับข้อมูล)"
                            : "⚠️ ยังไม่พบตาราง school_data (ต้องรัน schema.sql ก่อน)"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1 text-xs text-amber-900">
                      <p className="font-medium">
                        {status?.error || "กรุณาตรวจสอบการตั้งค่า DATABASE_URL ในไฟล์ .env ของเซิร์ฟเวอร์"}
                      </p>
                      <p className="text-[11px] opacity-75">
                        ระบบอ่านค่าการเชื่อมต่อจากไฟล์ <code className="font-mono bg-white/80 px-1 py-0.5 rounded">.env</code> ฝั่งเซิร์ฟเวอร์โดยตรงเพื่อความปลอดภัยสูงสุด
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRefreshStatus()}
                className="p-2 rounded-xl bg-white/90 border border-current/20 hover:bg-white text-xs font-bold transition-all flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                title="ทดสอบและรีเฟรชสถานะ"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          {/* Action Message Alert */}
          {actionMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium animate-slideUp ${
                actionMessage.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {actionMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {/* Actions Section */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs text-warm-charcoal flex items-center gap-1.5">
              <span>คำสั่งนำเข้าและซิงค์ข้อมูล (Database Actions)</span>
            </h3>

            {/* Sync Card */}
            <div className="bg-warm-cream border border-warm-accent p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-warm-charcoal">ซิงค์ข้อมูลโรงเรียนนานาชาติสู่ Supabase</div>
                  <div className="text-xs text-warm-charcoal/60">
                    นำเข้าข้อมูล 291 โรงเรียน (พร้อมชื่อ EN, พิกัด GPS, Official Website, และการ Map หลักสูตร)
                  </div>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#456ca6]/15 text-[#456ca6] font-bold">
                  Idempotent
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartSync(false);
                  }}
                  disabled={!isConnected || isSyncing}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#456ca6] hover:bg-[#36578b] text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  title="นำเข้าข้อมูลที่มีอยู่ 291 โรงเรียนเข้าสู่ Supabase ทันที"
                >
                  <Database className="w-4 h-4" />
                  <span>นำเข้า 291 รร. สู่ Supabase ทันที</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartSync(true);
                  }}
                  disabled={!isConnected || isSyncing}
                  className="px-4 py-3 rounded-xl bg-white border border-warm-accent hover:bg-warm-accent/40 text-warm-charcoal text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  title="ดึงข้อมูลสดจาก API OPEC สช. แล้วนำเข้าสู่ Supabase"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-warm-bronze" />
                  <span>ดึงสดจาก สช. + นำเข้า</span>
                </button>
              </div>
            </div>

            {/* Run Schema Card (if schema is missing or for re-init) */}
            {!hasSchema && isConnected && (
              <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                  <Layers className="w-4 h-4 text-amber-700" />
                  <span>ยังไม่พบตารางใน Supabase</span>
                </div>
                <p className="text-xs text-amber-900/80">
                  ต้องการสร้าง Schemas และ Tables บนฐานข้อมูล Supabase ก่อนเริ่มนำเข้าข้อมูล
                </p>
                <button
                  type="button"
                  onClick={handleInitSchema}
                  disabled={initializingSchema}
                  className="w-full mt-1 px-3 py-2.5 rounded-full bg-warm-charcoal hover:bg-warm-charcoal/90 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {initializingSchema ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 text-warm-bronze" />
                  )}
                  <span>{initializingSchema ? "กำลังสร้าง Tables..." : "รัน db/schema.sql อัตโนมัติ"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Architecture Note */}
          <div className="bg-warm-cream/60 border border-warm-accent/60 p-3.5 rounded-xl space-y-1 text-xs text-warm-charcoal/70">
            <div className="font-bold text-warm-charcoal flex items-center justify-between">
              <span>🔒 ความปลอดภัยของระบบ (Production Architecture):</span>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#456ca6] hover:underline flex items-center gap-1 font-medium"
              >
                <span>เปิด Supabase Dashboard</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p>
              รหัสผ่านและการเชื่อมต่อถูกจัดการผ่านไฟล์ <code className="font-mono bg-warm-accent/50 px-1 py-0.5 rounded text-[11px]">.env</code> ของเซิร์ฟเวอร์โดยตรง โดยไม่เปิดให้แก้ไขผ่านหน้าเว็บ เพื่อความปลอดภัยสูงสุดตามมาตรฐานสากล
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-warm-cream border-t border-warm-accent px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-warm-charcoal/60">
            กดปุ่ม <kbd className="px-1.5 py-0.5 rounded bg-warm-accent/60 font-mono text-[11px]">Esc</kbd> เพื่อปิด
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-warm-accent/70 hover:bg-warm-accent text-warm-charcoal text-xs font-bold transition-all cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
