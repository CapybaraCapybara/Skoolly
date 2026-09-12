import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Globe,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  RefreshCw,
  Upload,
  Check,
  Edit2,
  ShieldCheck,
  Loader2,
  Clock,
  Activity,
  AlertTriangle,
  School,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import type { WebsiteRegistryItem, WebsiteRegistryResponse, WebsiteHealthState } from "@/types/opec";
import {
  getWebsiteRegistry,
  verifySchoolWebsite,
  syncWebsiteRegistryFromText,
  triggerWebsiteHealthCheck,
  getWebsiteHealthCheckStatus,
} from "@/api/opecApi";

interface OpecUrlVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

type FilterTab = "all" | "verified" | "broken" | "pending" | "missing";

export function OpecUrlVerificationModal({
  isOpen,
  onClose,
  onDataChanged,
}: OpecUrlVerificationModalProps) {
  const [data, setData] = useState<WebsiteRegistryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [healthCheckState, setHealthCheckState] = useState<WebsiteHealthState | null>(null);
  const [isStartingHealthCheck, setIsStartingHealthCheck] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editUrlValue, setEditUrlValue] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWebsiteRegistry();
      setData(res);
      if (res.health_state) {
        setHealthCheckState(res.health_state);
      }
    } catch (err: any) {
      showMsg(err.message || "ไม่สามารถโหลดข้อมูลทะเบียนได้", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle Run Health Check
  const handleRunHealthCheck = async () => {
    setIsStartingHealthCheck(true);
    try {
      await triggerWebsiteHealthCheck();
      showMsg("เริ่มต้นระบบตรวจสอบสุขภาพเว็บไซต์ (Link Health Check)...");
      const status = await getWebsiteHealthCheckStatus();
      setHealthCheckState(status);
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการเริ่มตรวจสุขภาพ", "error");
    } finally {
      setIsStartingHealthCheck(false);
    }
  };

  // Poll Health Check while running
  useEffect(() => {
    let timer: number | null = null;
    if (healthCheckState?.is_running) {
      timer = window.setInterval(async () => {
        try {
          const status = await getWebsiteHealthCheckStatus();
          setHealthCheckState(status);
          if (!status.is_running) {
            await loadData();
            if (onDataChanged) onDataChanged();
            showMsg(status.message || "ตรวจสุขภาพเว็บไซต์เสร็จสิ้น!");
          }
        } catch (e) {
          // ignore polling errors
        }
      }, 1500);
    }
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [healthCheckState?.is_running, loadData, onDataChanged]);

  // Handle single URL verify
  const handleVerify = async (item: WebsiteRegistryItem) => {
    if (!item.website) {
      showMsg("ไม่สามารถรับรองได้เนื่องจากยังไม่มี URL เว็บไซต์", "error");
      return;
    }
    setActionLoadingCode(item.school_code);
    try {
      await verifySchoolWebsite(item.school_code, item.website, true);
      showMsg(`รับรองเว็บไซต์ทางการสำหรับ "${item.school_name_th}" สำเร็จ`);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการรับรอง", "error");
    } finally {
      setActionLoadingCode(null);
    }
  };

  // Handle single URL edit submit
  const handleSaveEdit = async (schoolCode: string) => {
    setActionLoadingCode(schoolCode);
    try {
      await verifySchoolWebsite(schoolCode, editUrlValue.trim(), true);
      showMsg(`บันทึกและรับรอง URL โรงเรียน [${schoolCode}] สำเร็จ`);
      setEditingCode(null);
      setEditUrlValue("");
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
    } finally {
      setActionLoadingCode(null);
    }
  };

  // Handle bulk sync from schoolAndURL.txt
  const handleBulkSync = async () => {
    if (
      !window.confirm(
        "ต้องการซิงค์รายชื่อเว็บไซต์ทั้งหมด 284 โรงเรียนจาก reference/schoolAndURL.txt เข้าสู่ระบบและ Supabase ใช่หรือไม่?"
      )
    ) {
      return;
    }
    setIsSyncingAll(true);
    try {
      const res = await syncWebsiteRegistryFromText();
      showMsg(`ซิงค์ข้อมูลจาก schoolAndURL.txt สำเร็จ! (Local: +${res.synced_local}, Supabase: +${res.synced_supabase} แห่ง)`);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการซิงค์ข้อมูล", "error");
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    let list = data.items;

    if (activeTab === "verified") {
      list = list.filter((i) => i.status === "verified");
    } else if (activeTab === "broken") {
      list = list.filter((i) => i.is_broken);
    } else if (activeTab === "pending") {
      list = list.filter((i) => i.status === "opec" || i.status === "probed");
    } else if (activeTab === "missing") {
      list = list.filter((i) => i.status === "missing");
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.school_code.includes(q) ||
          i.school_name_th.toLowerCase().includes(q) ||
          (i.school_name_en && i.school_name_en.toLowerCase().includes(q)) ||
          (i.province && i.province.toLowerCase().includes(q)) ||
          i.website.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, activeTab, search]);

  const pendingCount = useMemo(() => {
    if (!data) return 0;
    return (data.opec_count ?? 0) + (data.probed_count ?? 0);
  }, [data]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-900/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#faf8f5] border border-[#eae0d0] rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#eae0d0] bg-white flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0f9488]/10 text-[#0f9488] flex items-center justify-center shadow-xs shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1c1917] tracking-tight">
                  ศูนย์ตรวจสอบและรับรองเว็บไซต์ทางการ
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0f9488]/10 text-[#0f9488] border border-[#0f9488]/20">
                  Supabase Registry
                </span>
              </div>
              <p className="text-xs text-[#78716c] mt-0.5">
                Official Website Registry & Link Health Monitor · ข้อมูลจะถูกบันทึกถาวร ไม่สูญหายเมื่อ Re-scrape
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Health Check Button */}
            <button
              type="button"
              onClick={handleRunHealthCheck}
              disabled={healthCheckState?.is_running || isStartingHealthCheck}
              className="px-4 py-2 rounded-xl bg-[#1c1917] hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              title="ตรวจสอบสถานะการเข้าถึงของทุกลิงก์ (Link Health Check)"
            >
              {healthCheckState?.is_running || isStartingHealthCheck ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>
                {healthCheckState?.is_running
                  ? `กำลังตรวจ (${healthCheckState.percent}%)`
                  : "ตรวจสุขภาพทุกลิงก์"}
              </span>
            </button>

            {/* Sync from txt button */}
            <button
              type="button"
              onClick={handleBulkSync}
              disabled={isSyncingAll}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 text-[#1c1917] border border-[#eae0d0] text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="ซิงค์ข้อมูล URL 284 แห่งจาก schoolAndURL.txt เข้าสู่ Supabase"
            >
              {isSyncingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-stone-500" />
              )}
              <span>ซิงค์ไฟล์อ้างอิง</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-white border border-[#eae0d0] hover:bg-stone-50 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Progress Banner when running health check */}
        {healthCheckState?.is_running && (
          <div className="bg-[#faf5ee] border-b border-[#eae0d0] px-6 py-2.5 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-[#1c1917] font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-[#0f9488]" />
              <span>
                กำลังสแกนลิงก์ทั้ง {healthCheckState.total} แห่งพร้อมกัน... (ตรวจแล้ว {healthCheckState.current}/{healthCheckState.total})
              </span>
            </div>
            <div className="flex items-center gap-3 w-48 sm:w-64">
              <div className="flex-1 h-2 bg-stone-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0f9488] to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${healthCheckState.percent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono font-bold text-[#0f9488] w-10 text-right">
                {healthCheckState.percent}%
              </span>
            </div>
          </div>
        )}

        {/* Message Banner */}
        {message && (
          <div
            className={`px-6 py-2 text-xs font-semibold flex items-center gap-2 transition-all ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
                : "bg-rose-50 text-rose-800 border-b border-rose-200"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 4 Clean Executive Metric Cards */}
        <div className="px-6 py-4 bg-[#faf5ee]/60 border-b border-[#eae0d0] shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* Card 1: Total Schools */}
            <div className="p-4 bg-white rounded-2xl border border-[#eae0d0] shadow-xs">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>โรงเรียนทั้งหมด</span>
                <School className="w-4 h-4 text-stone-400" />
              </div>
              <div className="text-2xl font-black text-[#1c1917] tracking-tight mt-1.5">
                {data?.total ?? "—"} <span className="text-xs font-normal text-stone-400">แห่ง</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                มีเว็บไซต์ {data?.with_website ?? 0} · ไม่มี {data?.missing_count ?? 0} แห่ง
              </div>
            </div>

            {/* Card 2: Verified Official */}
            <div className="p-4 bg-white rounded-2xl border border-[#eae0d0] shadow-xs">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>รับรองทางการแล้ว</span>
                <ShieldCheck className="w-4 h-4 text-[#0f9488]" />
              </div>
              <div className="text-2xl font-black text-[#0f9488] tracking-tight mt-1.5">
                {data?.verified_count ?? "—"} <span className="text-xs font-normal text-stone-400">แห่ง</span>
              </div>
              <div className="text-[11px] text-[#0f9488] font-medium mt-1">
                Ground Truth ใน Database
              </div>
            </div>

            {/* Card 3: Healthy Online */}
            <div className="p-4 bg-white rounded-2xl border border-[#eae0d0] shadow-xs">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>สถานะออนไลน์ปกติ</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-700 tracking-tight mt-1.5">
                {data?.healthy_count ?? "—"} <span className="text-xs font-normal text-stone-400">แห่ง</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">
                Online / HTTP 200 OK
              </div>
            </div>

            {/* Card 4: Issues Detected */}
            <div
              onClick={() => setActiveTab("broken")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                (data?.broken_count ?? 0) > 0
                  ? "bg-rose-50/50 border-rose-200 hover:border-rose-300"
                  : "bg-white border-[#eae0d0]"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium">
                <span className={(data?.broken_count ?? 0) > 0 ? "text-rose-800" : "text-stone-500"}>
                  พบปัญหาต้องตรวจสอบ
                </span>
                <AlertTriangle
                  className={`w-4 h-4 ${
                    (data?.broken_count ?? 0) > 0 ? "text-rose-600" : "text-stone-400"
                  }`}
                />
              </div>
              <div
                className={`text-2xl font-black tracking-tight mt-1.5 ${
                  (data?.broken_count ?? 0) > 0 ? "text-rose-700" : "text-stone-700"
                }`}
              >
                {data?.broken_count ?? 0} <span className="text-xs font-normal text-stone-400">แห่ง</span>
              </div>
              <div className="text-[11px] mt-1 flex items-center gap-1 font-medium text-rose-600">
                {(data?.broken_count ?? 0) > 0 ? (
                  <>
                    <span>ดูรายการลิงก์เสีย</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                ) : (
                  <span className="text-stone-400">ทุกลิงก์ใช้งานได้ปกติ</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: Segmented Tabs & Search */}
        <div className="px-6 py-3.5 bg-white border-b border-[#eae0d0] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center bg-[#faf5ee] p-1 rounded-2xl border border-[#eae0d0] text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "all"
                  ? "bg-white text-[#1c1917] font-bold shadow-xs border border-[#eae0d0]"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span>ทั้งหมด</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-stone-200/70 text-stone-700">
                {data?.total ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("verified")}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "verified"
                  ? "bg-white text-emerald-800 font-bold shadow-xs border border-emerald-200"
                  : "text-stone-600 hover:text-emerald-800"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>รับรองแล้ว</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800">
                {data?.verified_count ?? 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("broken")}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "broken"
                  ? "bg-rose-600 text-white font-bold shadow-xs"
                  : (data?.broken_count ?? 0) > 0
                  ? "text-rose-700 font-bold hover:bg-rose-100/60"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${activeTab === "broken" ? "text-white" : "text-rose-600"}`} />
              <span>พบปัญหา</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeTab === "broken"
                    ? "bg-white/20 text-white"
                    : (data?.broken_count ?? 0) > 0
                    ? "bg-rose-100 text-rose-800 font-bold"
                    : "bg-stone-200/70 text-stone-700"
                }`}
              >
                {data?.broken_count ?? 0}
              </span>
            </button>

            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "pending"
                    ? "bg-white text-amber-800 font-bold shadow-xs border border-amber-200"
                    : "text-stone-600 hover:text-amber-800"
                }`}
              >
                <span>รอรับรอง</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800">
                  {pendingCount}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab("missing")}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "missing"
                  ? "bg-white text-stone-800 font-bold shadow-xs border border-stone-300"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span>ไม่มีเว็บไซต์</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-stone-200/70 text-stone-700">
                {data?.missing_count ?? 0}
              </span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อโรงเรียน หรือ URL..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-white border border-[#eae0d0] text-xs text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#0f9488]/30 placeholder:text-stone-400 shadow-xs"
            />
          </div>
        </div>

        {/* Auditable Checklist Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Helpful alert when viewing broken tab */}
          {activeTab === "broken" && (
            <div className="mb-3.5 px-4 py-3 rounded-2xl bg-rose-50/80 border border-rose-200/70 flex items-center justify-between text-xs text-rose-900 shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>พบเว็บไซต์ที่เข้าถึงไม่ได้ {data?.broken_count ?? 0} แห่ง</strong> (DNS Error, Server Error, หรือ Connection Timeout) คุณสามารถคลิกไอคอน ✏️ เพื่อแก้ไข URL ใหม่ได้ทันที
                </span>
              </div>
            </div>
          )}

          <div className="bg-white border border-[#eae0d0] rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#faf5ee] border-b border-[#eae0d0] text-stone-600 font-semibold">
                  <th className="py-3 px-4 min-w-[240px]">โรงเรียนนานาชาติ</th>
                  <th className="py-3 px-3 w-28">จังหวัด</th>
                  <th className="py-3 px-4 min-w-[280px]">Official Website & ลิงก์</th>
                  <th className="py-3 px-3.5 w-32">การรับรอง</th>
                  <th className="py-3 px-4 w-28 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eae0d0]/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-stone-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0f9488] mb-2" />
                      กำลังโหลดข้อมูลทะเบียนเว็บไซต์...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-stone-500">
                      ไม่พบข้อมูลโรงเรียนตามเงื่อนไขที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isEditing = editingCode === item.school_code;
                    const isActing = actionLoadingCode === item.school_code;

                    return (
                      <tr
                        key={item.school_code}
                        className={`transition-colors ${
                          item.is_broken
                            ? "bg-rose-50/25 hover:bg-rose-50/50"
                            : "hover:bg-[#faf5ee]/50"
                        }`}
                      >
                        {/* School Name & Code */}
                        <td className="py-3 px-4">
                          <div className="flex items-start gap-2">
                            <div className="space-y-0.5">
                              <div className="font-bold text-[#1c1917] leading-snug">
                                {item.school_name_th}
                              </div>
                              <div className="text-[11px] text-stone-500 truncate max-w-sm">
                                {item.school_name_en || "—"}
                              </div>
                              <div className="pt-0.5">
                                <span className="font-mono text-[10px] text-[#78593a] bg-[#faf5ee] px-1.5 py-0.5 rounded border border-[#eae0d0]">
                                  {item.school_code}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Province */}
                        <td className="py-3 px-3 text-stone-600 whitespace-nowrap">
                          {item.province || "—"}
                        </td>

                        {/* Website & Health Check Status */}
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editUrlValue}
                                onChange={(e) => setEditUrlValue(e.target.value)}
                                placeholder="https://www.example.ac.th"
                                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-[#0f9488] bg-white focus:outline-none shadow-xs"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item.school_code)}
                                disabled={isActing}
                                className="px-2.5 py-1 rounded-lg bg-[#0f9488] text-white font-semibold hover:bg-[#0d7d72] transition-colors cursor-pointer"
                              >
                                {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : "บันทึก"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCode(null)}
                                className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : item.website ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={
                                    item.website.startsWith("http")
                                      ? item.website
                                      : `https://${item.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1.5 font-medium hover:underline max-w-[260px] truncate ${
                                    item.is_broken
                                      ? "text-rose-700 font-semibold"
                                      : "text-[#25508a]"
                                  }`}
                                  title="คลิกเพื่อเปิดหน้าเว็บไซต์"
                                >
                                  <Globe className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                  <span className="truncate">{item.website}</span>
                                </a>
                              </div>

                              {/* Health Badge */}
                              <div className="flex items-center gap-1.5">
                                {item.is_broken ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 font-mono"
                                    title={`ข้อผิดพลาด: ${item.error_reason || "เปิดไม่ติด"} (ตรวจเมื่อ: ${item.last_checked_at_display || "ล่าสุด"})`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                    <span>{item.error_reason || "ลิงก์เข้าถึงไม่ได้"}</span>
                                  </span>
                                ) : item.http_status ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-700"
                                    title={`สถานะ HTTP ${item.http_status} (ตรวจเมื่อ: ${item.last_checked_at_display || "ล่าสุด"})`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    <span>200 OK</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-stone-400">ยังไม่ได้ตรวจ</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic text-[11px]">
                              — ไม่มีเว็บไซต์ —
                            </span>
                          )}
                        </td>

                        {/* Verification Status */}
                        <td className="py-3 px-3.5">
                          {item.status === "verified" ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>รับรองแล้ว</span>
                              </span>
                              {item.verified_at_display && (
                                <div
                                  className="text-[10px] text-stone-400 mt-0.5"
                                  title={`รับรองโดย: ${item.verified_by || "Admin"}`}
                                >
                                  {item.verified_at_display.split(" ")[0]}
                                </div>
                              )}
                            </div>
                          ) : item.status === "opec" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              จาก สช.
                            </span>
                          ) : item.status === "probed" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              บอทตรวจพบ
                            </span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {item.website && (
                              <a
                                href={
                                  item.website.startsWith("http")
                                    ? item.website
                                    : `https://${item.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-stone-400 hover:text-[#25508a] hover:bg-stone-100 transition-colors"
                                title="เปิดเว็บไซต์ในแท็บใหม่"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {!item.is_verified && item.website && (
                              <button
                                type="button"
                                onClick={() => handleVerify(item)}
                                disabled={isActing}
                                className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-semibold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                                title="กดยืนยันว่าเป็นเว็บไซต์ทางการที่ถูกต้อง (Verified Official)"
                              >
                                {isActing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>รับรอง</span>
                              </button>
                            )}

                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCode(item.school_code);
                                  setEditUrlValue(item.website || "");
                                }}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                                title="แก้ไข URL ทางการ"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="px-6 py-3.5 bg-[#faf5ee]/70 border-t border-[#eae0d0] flex items-center justify-between text-xs text-stone-500 shrink-0">
          <div>
            แสดง {filteredItems.length} จาก {data?.total ?? 0} โรงเรียน
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-[#eae0d0] hover:bg-stone-50 text-stone-700 font-semibold transition-all shadow-xs cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
