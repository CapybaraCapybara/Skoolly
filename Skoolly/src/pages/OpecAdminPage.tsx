import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers,
  CloudDownload,
  Languages,
  MapPin,
  Globe,
  Wand2,
  Trash2,
  Download,
  LayoutDashboard,
  School,
  CheckCircle2,
  MessageSquare,
  Ticket,
  Bot,
  ShieldCheck,
  Users,
  ArrowLeft,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { OpecSchoolRecord, ScraperProgressState } from "@/types/opec";
import {
  getOpecSchools,
  getScraperProgress,
  postAction,
  updateSchoolWebsite,
  resolveSchoolWebsite,
  enrichSchoolData,
} from "@/api/opecApi";
import { OpecDashboard } from "@/components/admin/OpecDashboard";
import { OpecSchoolsTable } from "@/components/admin/OpecSchoolsTable";
import { OpecActivityConsole } from "@/components/admin/OpecActivityConsole";
import { OpecSchoolDetailModal } from "@/components/admin/OpecSchoolDetailModal";
import { OpecEditWebsiteModal } from "@/components/admin/OpecEditWebsiteModal";
import { OpecDrillDownModal } from "@/components/admin/OpecDrillDownModal";

interface OpecAdminPageProps {
  onBack: () => void;
}

type AdminTab = "dashboard" | "schools" | "verify" | "reviews" | "tickets" | "ai-logs" | "audit-log" | "users";

export function OpecAdminPage({ onBack }: OpecAdminPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [schools, setSchools] = useState<OpecSchoolRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ScraperProgressState | null>(null);
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);

  // Modals state
  const [selectedSchool, setSelectedSchool] = useState<OpecSchoolRecord | null>(null);
  const [editingWebsiteSchool, setEditingWebsiteSchool] = useState<OpecSchoolRecord | null>(null);
  const [drillDown, setDrillDown] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    schools: OpecSchoolRecord[];
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
    schools: [],
  });

  // Toast state
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Polling ref
  const isPollingRef = useRef<boolean>(false);

  // Fetch schools
  const loadSchoolsData = useCallback(async () => {
    try {
      const data = await getOpecSchools();
      setSchools(data);
    } catch (err) {
      console.error("[OpecAdminPage] Failed to load schools:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll progress
  const pollProgress = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const state = await getScraperProgress();
      setProgress(state);

      if (state && state.is_running) {
        setTimeout(() => {
          isPollingRef.current = false;
          pollProgress();
        }, 1200);
      } else {
        isPollingRef.current = false;
        // If task finished, refresh schools list
        if (state && !state.is_running && state.percent >= 100) {
          loadSchoolsData();
        }
      }
    } catch (e) {
      isPollingRef.current = false;
    }
  }, [loadSchoolsData]);

  useEffect(() => {
    loadSchoolsData();
    pollProgress();
  }, [loadSchoolsData, pollProgress]);

  // Actions
  const handleTriggerAction = async (endpoint: string, label: string) => {
    try {
      showToast(`เริ่ม ${label}...`);
      await postAction(endpoint);
      pollProgress();
    } catch (err: any) {
      showToast(`ผิดพลาด: ${err.message || "ไม่สามารถดำเนินการได้"}`);
    }
  };

  const handleClearData = async () => {
    if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลโรงเรียนและ Logs ทั้งหมด?")) {
      try {
        await postAction("/api/clear-data");
        setSchools([]);
        setProgress(null);
        showToast("ล้างข้อมูลเรียบร้อยแล้ว");
      } catch (err: any) {
        showToast(`ล้างข้อมูลไม่สำเร็จ: ${err.message}`);
      }
    }
  };

  const handleClearLogs = async () => {
    try {
      await postAction("/api/clear-logs");
      if (progress) {
        setProgress({ ...progress, logs: [], log: "" });
      }
      showToast("ล้าง Logs เรียบร้อยแล้ว");
    } catch (err: any) {
      showToast(`ไม่สามารถล้าง Logs: ${err.message}`);
    }
  };

  const handleSaveWebsite = async (schoolCode: string, newWebsite: string): Promise<boolean> => {
    try {
      const ok = await updateSchoolWebsite(schoolCode, newWebsite);
      if (ok) {
        setSchools((prev) =>
          prev.map((s) =>
            s.school_code === schoolCode
              ? { ...s, website: newWebsite, website_source: "Manual Edit", last_updated: new Date().toISOString() }
              : s
          )
        );
        showToast("บันทึกเว็บไซต์ทางการเรียบร้อยแล้ว");
        return true;
      }
      return false;
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
      return false;
    }
  };

  const handleResolveSingleWebsite = async (code: string) => {
    setActionLoadingCode(code);
    try {
      showToast(`กำลังค้นหา Official Website สำหรับรหัส ${code}...`);
      const updated = await resolveSchoolWebsite(code);
      if (updated) {
        setSchools((prev) => prev.map((s) => (s.school_code === code ? updated : s)));
        showToast(`อัปเดตเว็บไซต์สำหรับ ${updated.school_name_th} สำเร็จ`);
      } else {
        showToast("ไม่พบเว็บไซต์ที่ตรงกัน");
      }
    } catch (err: any) {
      showToast(`ค้นหาเว็บไซต์ไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionLoadingCode(null);
    }
  };

  const handleEnrichSingleSchool = async (code: string) => {
    setActionLoadingCode(code);
    try {
      showToast(`กำลังปักหมุด GPS และเติมชื่อ EN สำหรับรหัส ${code}...`);
      const res = await enrichSchoolData(code);
      if (res && res.school) {
        setSchools((prev) => prev.map((s) => (s.school_code === code ? res.school : s)));
        showToast(`เติมเต็มข้อมูล ${res.school.school_name_th} สำเร็จ`);
      }
    } catch (err: any) {
      showToast(`เติมข้อมูลไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionLoadingCode(null);
    }
  };

  const openDrillDown = (title: string, subtitle: string, list: OpecSchoolRecord[]) => {
    setDrillDown({
      isOpen: true,
      title,
      subtitle,
      schools: list,
    });
  };

  const isRunning = Boolean(progress?.is_running);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3.5 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Back Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="กลับสู่ Skoolly Parent Portal"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">สู่หน้าหลัก Skoolly</span>
            </button>

            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm md:text-base font-bold text-white tracking-tight">
                    ระบบบริหารจัดการข้อมูลโรงเรียนนานาชาติ
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
                    สช. OPEC Pro
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  เชื่อมต่อ API สช. (school.opec.go.th) 100% พร้อมระบบค้นหา Official Website & GPS อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerAction("/api/fetch-opec", "ดึงข้อมูล OPEC")}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ดึงข้อมูลโรงเรียนนานาชาติจากระบบ OPEC สช."
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">1. ดึงข้อมูล OPEC</span>
              <span className="xl:hidden">OPEC</span>
            </button>

            <button
              onClick={() => handleTriggerAction("/api/enrich-names-en", "เติมชื่อ EN")}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="แปลงและเติมชื่อภาษาอังกฤษทางการ"
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">2. เติมชื่อ EN</span>
              <span className="xl:hidden">ชื่อ EN</span>
            </button>

            <button
              onClick={() => handleTriggerAction("/api/enrich-gps", "ปักหมุด GPS")}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ค้นหาพิกัด GPS ความแม่นยำสูงระดับอาคาร/ถนน"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">3. ปักหมุด GPS</span>
              <span className="xl:hidden">GPS</span>
            </button>

            <button
              onClick={() => handleTriggerAction("/api/fetch-official-websites", "ค้นหา Website")}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ค้นหาและยืนยัน Official Website ของโรงเรียน"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">4. ค้นหา Website</span>
              <span className="xl:hidden">Website</span>
            </button>

            <button
              onClick={() => handleTriggerAction("/api/enrich-data", "Auto-Enrich ทั้งหมด")}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ระบบรวม เติมเต็มข้อมูลอัตโนมัติ"
            >
              <Wand2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Auto-Enrich</span>
            </button>

            {/* Export dropdown / buttons */}
            <a
              href="/api/export/csv"
              download
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="ส่งออกไฟล์ CSV"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              onClick={handleClearData}
              disabled={isRunning}
              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors disabled:opacity-50"
              title="ล้างข้อมูลทั้งหมด"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar & Content Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 lg:p-8 gap-6">
        {/* Sidebar Nav */}
        <aside className="w-56 hidden md:flex flex-col gap-1.5 flex-shrink-0">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-3 ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("schools")}
            className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between ${
              activeTab === "schools"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <School className="w-4 h-4" />
              <span>Schools</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
              {schools.length}
            </span>
          </button>

          <div className="my-2 border-t border-slate-800/80" />

          <button
            onClick={() => setActiveTab("verify")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "verify" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Verification</span>
          </button>

          <button
            onClick={() => setActiveTab("reviews")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "reviews" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Reviews</span>
          </button>

          <button
            onClick={() => setActiveTab("tickets")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "tickets" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>Tickets</span>
          </button>

          <button
            onClick={() => setActiveTab("ai-logs")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "ai-logs" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>AI / Scraper Logs</span>
          </button>

          <button
            onClick={() => setActiveTab("audit-log")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "audit-log" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Audit Log</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
              activeTab === "users" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900/60"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users</span>
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Real-time Activity Console */}
          <OpecActivityConsole state={progress} onClearLogs={handleClearLogs} />

          {/* Loading Indicator */}
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">กำลังโหลดฐานข้อมูลโรงเรียนนานาชาติ สช....</p>
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                <OpecDashboard
                  schools={schools}
                  onOpenDrillDown={openDrillDown}
                  onGoToSchoolsTable={() => setActiveTab("schools")}
                />
              )}

              {activeTab === "schools" && (
                <OpecSchoolsTable
                  schools={schools}
                  onSelectSchool={setSelectedSchool}
                  onEditWebsite={setEditingWebsiteSchool}
                  onResolveSchoolWebsite={handleResolveSingleWebsite}
                  onEnrichSchool={handleEnrichSingleSchool}
                  onRefresh={loadSchoolsData}
                  actionLoadingCode={actionLoadingCode}
                />
              )}

              {activeTab !== "dashboard" && activeTab !== "schools" && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white capitalize">
                    {activeTab.replace("-", " ")} System
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    ระบบโมดูลนี้พร้อมสำหรับการเชื่อมต่อ API ฐานข้อมูลในขั้นตอนต่อไป
                  </p>
                  <button
                    onClick={() => setActiveTab("schools")}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                  >
                    กลับสู่หน้าตารางโรงเรียน
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <OpecSchoolDetailModal
        school={selectedSchool}
        onClose={() => setSelectedSchool(null)}
        onEditWebsite={(s) => {
          setSelectedSchool(null);
          setEditingWebsiteSchool(s);
        }}
      />

      <OpecEditWebsiteModal
        school={editingWebsiteSchool}
        onClose={() => setEditingWebsiteSchool(null)}
        onSave={handleSaveWebsite}
      />

      <OpecDrillDownModal
        isOpen={drillDown.isOpen}
        title={drillDown.title}
        subtitle={drillDown.subtitle}
        schools={drillDown.schools}
        onClose={() => setDrillDown((prev) => ({ ...prev, isOpen: false }))}
        onSelectSchool={(s) => {
          setDrillDown((prev) => ({ ...prev, isOpen: false }));
          setSelectedSchool(s);
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-2xl animate-slideUp flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
