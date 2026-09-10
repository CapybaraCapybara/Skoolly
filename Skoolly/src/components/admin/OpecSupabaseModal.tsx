import React, { useState, useEffect } from "react";
import {
  Database,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Wand2,
  ShieldAlert,
  Server,
  Loader2,
} from "lucide-react";
import type { SupabaseStatusResponse } from "@/api/opecApi";
import { saveSupabaseConfig, initSupabaseSchema } from "@/api/opecApi";

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
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const handleSaveAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!databaseUrl.trim()) return;

    setSaving(true);
    setActionMessage(null);
    try {
      const res = await saveSupabaseConfig(databaseUrl.trim());
      await onRefreshStatus();
      if (res.connection.connected) {
        setActionMessage({
          type: "success",
          text: `เชื่อมต่อ Supabase สำเร็จ! (Latency: ${res.connection.latency_ms}ms, พบ ${res.connection.school_count || 0} โรงเรียน)`,
        });
        setDatabaseUrl("");
      } else {
        setActionMessage({
          type: "error",
          text: `บันทึกแล้ว แต่ไม่สามารถเชื่อมต่อได้: ${res.connection.error || "ตรวจสอบรหัสผ่านหรือ Connection String"}`,
        });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "เกิดข้อผิดพลาดในการบันทึก" });
    } finally {
      setSaving(false);
    }
  };

  const handleInitSchema = async () => {
    if (!window.confirm("คุณต้องการรัน db/schema.sql เพื่อสร้าง Schemas (school_data, community ฯลฯ) และ Tables บน Supabase ใช่หรือไม่?")) {
      return;
    }

    setInitializingSchema(true);
    setActionMessage(null);
    try {
      const res = await initSupabaseSchema();
      await onRefreshStatus();
      setActionMessage({ type: "success", text: res.message || "สร้าง Schema และ Tables บน Supabase เรียบร้อยแล้ว!" });
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#faf8f5] border border-[#eae0d0] text-[#1c1917] rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-scaleUp flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#faf5ee] border-b border-[#eae0d0] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0f9488]/15 text-[#0f9488] flex items-center justify-center border border-[#0f9488]/30 shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1c1917]">ตั้งค่าเชื่อมต่อ Supabase Database</h2>
                <span
                  className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                    isConnected
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {isConnected ? "● Connected" : "○ Disconnected"}
                </span>
              </div>
              <p className="text-xs text-[#1c1917]/60">
                ซิงค์ข้อมูลโรงเรียนนานาชาติเข้าสู่ PostgreSQL Database จริงของ Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#1c1917]/50 hover:text-[#1c1917] hover:bg-[#eae0d0]/50 transition-colors"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Status Box */}
          <div
            className={`p-4 rounded-2xl border ${
              isConnected
                ? "bg-emerald-50/70 border-emerald-200/80 text-emerald-900"
                : "bg-amber-50/70 border-amber-200/80 text-amber-900"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {isConnected
                      ? "เชื่อมต่อฐานข้อมูล Supabase สำเร็จ"
                      : "ยังไม่ได้เชื่อมต่อหรือยังไม่พบ DATABASE_URL"}
                  </div>
                  {isConnected ? (
                    <div className="mt-1 text-[11px] space-y-0.5 opacity-90">
                      <div>
                        • Connection: <span className="font-mono">{status?.masked_url}</span>
                      </div>
                      <div>
                        • Latency: <span className="font-bold">{status?.latency_ms} ms</span> | โรงเรียนในตาราง:{" "}
                        <span className="font-bold text-emerald-700">{status?.school_count || 0} แห่ง</span>
                      </div>
                      <div>
                        • สถานะ Schema:{" "}
                        <span className="font-bold">
                          {hasSchema ? "พร้อมใช้งาน (school_data.schools มีอยู่แล้ว)" : "ยังไม่มีตาราง (ต้องรัน Schema)"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-amber-800">
                      {status?.error || "กรุณาใส่ Supabase Connection String เพื่อให้ระบบสามารถบันทึกข้อมูลเข้าฐานข้อมูลจริง"}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRefreshStatus()}
                className="p-1.5 rounded-lg bg-white/80 border border-current/20 hover:bg-white text-xs font-bold transition-all flex items-center gap-1 shrink-0 shadow-xs"
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

          {/* Database URL Form */}
          <form onSubmit={handleSaveAndTest} className="space-y-3 bg-[#faf5ee] p-4 rounded-2xl border border-[#eae0d0]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1c1917] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[#ab8e72]" />
                <span>Supabase Connection String (DATABASE_URL)</span>
              </label>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#0f9488] hover:underline flex items-center gap-1 font-medium"
              >
                <span>Supabase Dashboard</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
                className="w-full bg-white border border-[#eae0d0] rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#0f9488]/40 focus:border-[#0f9488]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#1c1917]/40 hover:text-[#1c1917]"
                title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-[#1c1917]/60">
                ระบบจะบันทึกลงในไฟล์ <code className="bg-[#eae0d0]/50 px-1 py-0.5 rounded font-mono">.env</code> อัตโนมัติ (ปลอดภัยและถูก gitignore)
              </p>

              <button
                type="submit"
                disabled={saving || !databaseUrl.trim()}
                className="px-4 py-2 rounded-xl bg-[#0f9488] hover:bg-[#0d7d72] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                <span>{saving ? "กำลังทดสอบ..." : "บันทึกและเชื่อมต่อ"}</span>
              </button>
            </div>
          </form>

          {/* Quick Actions & Helpers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Initialize Schema Card */}
            <div className="bg-[#faf5ee] border border-[#eae0d0] p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[#1c1917]">
                <Layers className="w-4 h-4 text-[#ab8e72]" />
                <span>สร้าง Schema & Tables อัตโนมัติ</span>
              </div>
              <p className="text-[11px] text-[#1c1917]/60">
                รันคำสั่ง DDL จาก <code className="font-mono">db/schema.sql</code> เพื่อสร้าง Schema (school_data ฯลฯ) พร้อม Seeds ข้อมูลหลักสูตรและระดับชั้น
              </p>
              <button
                type="button"
                onClick={handleInitSchema}
                disabled={initializingSchema || !isConnected}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-[#eae0d0] hover:bg-[#eae0d0]/40 text-[#1c1917] text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                {initializingSchema ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-[#ab8e72]" />}
                <span>{initializingSchema ? "กำลังสร้าง Tables..." : "รัน db/schema.sql"}</span>
              </button>
            </div>

            {/* Sync Options Card */}
            <div className="bg-[#faf5ee] border border-[#eae0d0] p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[#1c1917]">
                <Database className="w-4 h-4 text-[#0f9488]" />
                <span>คำสั่งนำเข้าสู่ Supabase</span>
              </div>
              <p className="text-[11px] text-[#1c1917]/60">
                เลือกรูปแบบการนำเข้าข้อมูลเข้าสู่ Supabase Database พร้อมรายงาน Progress สด
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartSync(false);
                  }}
                  disabled={!isConnected || isSyncing}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#1c1917] hover:bg-[#1c1917]/90 text-white text-[11px] font-bold transition-all shadow-xs disabled:opacity-50"
                  title="นำเข้าข้อมูลที่มีอยู่ 291 โรงเรียนเข้าสู่ Supabase ทันที"
                >
                  นำเข้า 291 รร. ทันที
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartSync(true);
                  }}
                  disabled={!isConnected || isSyncing}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#0f9488] hover:bg-[#0d7d72] text-white text-[11px] font-bold transition-all shadow-xs disabled:opacity-50"
                  title="ดึงจาก API OPEC สช. สดๆ แล้วบันทึกเข้า Supabase"
                >
                  ดึงสด + นำเข้า
                </button>
              </div>
            </div>
          </div>

          {/* Guide / How to find connection string */}
          <div className="bg-[#faf5ee]/60 border border-[#eae0d0]/60 p-3.5 rounded-xl space-y-1.5 text-[11px] text-[#1c1917]/70">
            <div className="font-bold text-[#1c1917] flex items-center gap-1.5">
              <span>💡 วิธีคัดลอก Connection String จาก Supabase:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>
                เปิด <strong>Supabase Dashboard</strong> ของโปรเจกต์คุณ
              </li>
              <li>
                ไปที่เมนู <strong>Project Settings</strong> (ไอคอนเฟืองล่างซ้าย) &gt; <strong>Database</strong>
              </li>
              <li>
                เลื่อนลงมาที่หัวข้อ <strong>Connection string</strong> &gt; เลือกแท็บ <strong>URI</strong>
              </li>
              <li>
                เลือกโหมด <strong>Session pooler (พอร์ต 6543)</strong> หรือ <strong>Direct (พอร์ต 5432)</strong>
              </li>
              <li>
                คัดลอก Connection String แล้วแทนที่ <code className="font-mono text-rose-600">[YOUR-PASSWORD]</code> ด้วยรหัสผ่านฐานข้อมูลของคุณ
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#faf5ee] border-t border-[#eae0d0] px-6 py-4 flex items-center justify-between">
          <div className="text-[11px] text-[#1c1917]/60">
            กดปุ่ม <kbd className="px-1.5 py-0.5 rounded bg-[#eae0d0]/60 font-mono text-[10px]">Esc</kbd> เพื่อปิด
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#eae0d0]/70 hover:bg-[#eae0d0] text-[#1c1917] text-xs font-bold transition-all"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
