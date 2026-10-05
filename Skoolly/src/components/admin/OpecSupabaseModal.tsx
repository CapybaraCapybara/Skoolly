import { useEffect, useState, type ReactNode } from "react";
import { Database, X, RefreshCw, ExternalLink, Wand2, Loader2, AlertTriangle } from "lucide-react";
import type { SupabaseStatusResponse } from "@/api/opecApi";
import { initSupabaseSchema } from "@/api/opecApi";
import { cn } from "@/lib/utils";

interface OpecSupabaseModalProps {
  isOpen: boolean;
  status: SupabaseStatusResponse | null;
  onClose: () => void;
  onRefreshStatus: () => Promise<void>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-warm-charcoal/60 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-warm-charcoal text-right min-w-0">{children}</dd>
    </div>
  );
}

export function OpecSupabaseModal({ isOpen, status, onClose, onRefreshStatus }: OpecSupabaseModalProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [initializingSchema, setInitializingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isConnected = Boolean(status?.connected);
  const hasSchema = Boolean(status?.has_schema);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStatus();
    } finally {
      setRefreshing(false);
    }
  };

  const handleInitSchema = async () => {
    if (!window.confirm("รัน db/schema.sql เพื่อสร้าง Schemas และ Tables บน Supabase ใช่หรือไม่?")) return;
    setInitializingSchema(true);
    setSchemaError(null);
    try {
      await initSupabaseSchema();
      await onRefreshStatus();
    } catch (err: any) {
      setSchemaError(`สร้าง Schema ไม่สำเร็จ: ${err.message}`);
    } finally {
      setInitializingSchema(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/60 backdrop-blur-sm modal-overlay"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supabase-modal-title"
        className="w-full max-w-md overflow-hidden rounded-[2rem] border border-warm-accent bg-warm-cream text-warm-charcoal shadow-2xl modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-warm-card text-warm-bronze">
              <Database className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 id="supabase-modal-title" className="text-base font-bold">
                ฐานข้อมูล Supabase
              </h2>
              <p className="text-sm text-warm-charcoal/60">สถานะการเชื่อมต่อ PostgreSQL</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-warm-charcoal/50 transition-colors hover:bg-warm-accent/50 hover:text-warm-charcoal cursor-pointer"
            title="ปิด (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Status + refresh on one row */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-warm-accent bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2.5">
                {isConnected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    isConnected ? "bg-emerald-500" : "bg-rose-500"
                  )}
                />
              </span>
              <span className={cn("text-sm font-semibold", isConnected ? "text-emerald-700" : "text-rose-700")}>
                {isConnected ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่ได้"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full border border-warm-accent bg-warm-cream px-3 py-1.5 text-sm font-medium text-warm-charcoal transition-colors hover:border-warm-bronze hover:text-warm-bronze disabled:opacity-60 cursor-pointer"
              title="ทดสอบการเชื่อมต่ออีกครั้ง"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              ตรวจอีกครั้ง
            </button>
          </div>

          {isConnected ? (
            <dl className="divide-y divide-warm-accent/70 rounded-2xl border border-warm-accent bg-white/70 px-4">
              <div className="py-3 space-y-1">
                <dt className="text-sm text-warm-charcoal/60">Host</dt>
                <dd>
                  <code className="block break-all font-mono text-xs text-warm-charcoal/80">{status?.masked_url || "-"}</code>
                </dd>
              </div>
              <InfoRow label="Ping">
                <span className="tabular-nums">{status?.latency_ms ? `${status.latency_ms} ms` : "-"}</span>
              </InfoRow>
              <InfoRow label="โรงเรียนในฐานข้อมูล">
                <span className="tabular-nums">{(status?.school_count ?? 0).toLocaleString()} แห่ง</span>
              </InfoRow>
              <InfoRow label="Schema">
                {hasSchema ? (
                  <span className="text-emerald-700">พร้อมใช้งาน</span>
                ) : (
                  <span className="text-amber-700">ไม่พบตาราง school_data</span>
                )}
              </InfoRow>
            </dl>
          ) : (
            <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-rose-800">
                  {status?.error || "ตรวจสอบค่า DATABASE_URL ในไฟล์ .env ของเซิร์ฟเวอร์"}
                </p>
                <p className="text-rose-800/70">ค่าการเชื่อมต่ออ่านจากไฟล์ .env ฝั่งเซิร์ฟเวอร์เท่านั้น</p>
              </div>
            </div>
          )}

          {/* Only needed on a fresh database */}
          {isConnected && !hasSchema && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleInitSchema}
                disabled={initializingSchema}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-warm-charcoal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-warm-charcoal/90 disabled:opacity-60 cursor-pointer"
              >
                {initializingSchema ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4 text-warm-bronze" />
                )}
                {initializingSchema ? "กำลังสร้าง Tables..." : "สร้าง Tables จาก db/schema.sql"}
              </button>
              {schemaError && <p className="text-center text-sm text-rose-700">{schemaError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-warm-accent px-6 py-4">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-warm-charcoal/70 transition-colors hover:text-warm-bronze"
          >
            Supabase Dashboard
            <ExternalLink className="size-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-warm-charcoal px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-warm-charcoal/90 cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
