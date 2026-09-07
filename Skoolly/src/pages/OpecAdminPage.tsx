import { useState, useEffect, useCallback, useRef } from "react";
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

  // Toast state — a single reusable timer instead of one orphaned timeout per toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Polling refs
  const isPollingRef = useRef<boolean>(false);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

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

  // Poll progress — self-rescheduling only while a job runs and the page is mounted
  const pollProgress = useCallback(async () => {
    if (isPollingRef.current || !isMountedRef.current) return;
    isPollingRef.current = true;

    let rescheduled = false;
    try {
      const state = await getScraperProgress();
      if (!isMountedRef.current) return;
      setProgress(state);

      if (state?.is_running) {
        rescheduled = true;
        pollTimerRef.current = window.setTimeout(() => {
          isPollingRef.current = false;
          pollProgress();
        }, 1200);
      } else if (state && state.percent >= 100) {
        loadSchoolsData();
      }
    } catch {
      // Backend service not running — stop polling until the next user action
    } finally {
      if (!rescheduled) isPollingRef.current = false;
    }
  }, [loadSchoolsData]);

  useEffect(() => {
    isMountedRef.current = true;
    loadSchoolsData();
    pollProgress();
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [loadSchoolsData, pollProgress]);

  // Actions
  const handleTriggerAction = async (endpoint: string, label: string) => {
    try {
      showToast(`กำลังเริ่ม ${label}...`);
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
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1917] font-sans flex flex-col antialiased">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 bg-[#faf8f5]/95 backdrop-blur-md border-b border-[#eae0d0]/80 px-4 sm:px-6 lg:px-10 py-3.5 shadow-sm">
        <div className="w-full max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Back Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-2xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#1c1917] transition-all flex items-center gap-2 text-xs font-bold shadow-xs hover:shadow-sm"
              title="กลับสู่ Skoolly Parent Portal"
            >
              <ArrowLeft className="w-4 h-4 text-[#ab8e72]" />
              <span className="hidden sm:inline">สู่หน้าหลัก Skoolly</span>
            </button>

            <div className="h-6 w-px bg-[#eae0d0] hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#ab8e72] text-white flex items-center justify-center shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm md:text-base font-bold text-[#1c1917] tracking-tight">
                    ระบบบริหารจัดการข้อมูลโรงเรียนนานาชาติ
                  </h1>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#ab8e72]/15 text-[#ab8e72] border border-[#ab8e72]/30 font-bold">
                    สช. OPEC Pro
                  </span>
                </div>
                <p className="text-[11px] text-[#1c1917]/60 hidden sm:block">
                  เชื่อมต่อ API สช. (school.opec.go.th) 100% พร้อมระบบค้นหา Official Website & GPS อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleTriggerAction("/api/fetch-opec", "ดึงข้อมูล OPEC")}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-[#1c1917] hover:bg-[#1c1917]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ดึงข้อมูลโรงเรียนนานาชาติจากระบบ OPEC สช."
            >
              <CloudDownload className="w-4 h-4" />
              <span className="hidden xl:inline">1. ดึงข้อมูล OPEC</span>
              <span className="xl:hidden">OPEC</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerAction("/api/enrich-names-en", "เติมชื่อ EN")}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-[#ab8e72] hover:bg-[#ab8e72]/90 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="แปลงและเติมชื่อภาษาอังกฤษทางการ"
            >
              <Languages className="w-4 h-4" />
              <span className="hidden xl:inline">2. เติมชื่อ EN</span>
              <span className="xl:hidden">ชื่อ EN</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerAction("/api/enrich-gps", "ปักหมุด GPS")}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-[#0f9488] hover:bg-[#0d7d72] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ค้นหาพิกัด GPS ความแม่นยำสูงระดับอาคาร/ถนน"
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden xl:inline">3. ปักหมุด GPS</span>
              <span className="xl:hidden">GPS</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerAction("/api/fetch-official-websites", "ค้นหา Website")}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-[#25508a] hover:bg-[#1d3d6e] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ค้นหาและยืนยัน Official Website ของโรงเรียน"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden xl:inline">4. ค้นหา Website</span>
              <span className="xl:hidden">Website</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerAction("/api/enrich-data", "Auto-Enrich ทั้งหมด")}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-[#faf5ee] hover:bg-[#eae0d0]/50 text-[#1c1917] border border-[#eae0d0] text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="ระบบรวม เติมเต็มข้อมูลอัตโนมัติ"
            >
              <Wand2 className="w-4 h-4 text-[#ab8e72]" />
              <span>Auto-Enrich</span>
            </button>

            {/* Export buttons */}
            <button
              type="button"
              onClick={() => {
                const link = document.createElement("a");
                link.href = "/api/export/csv";
                link.setAttribute("download", "international_schools_opec.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="p-2.5 rounded-xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#1c1917] transition-all shadow-xs"
              title="ส่งออกไฟล์ CSV"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleClearData}
              disabled={isRunning}
              className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 transition-all shadow-xs disabled:opacity-50"
              title="ล้างข้อมูลทั้งหมด"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Wide Fluid Container */}
      <div className="flex-1 flex w-full max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-10 gap-6">
        {/* Sidebar Nav */}
        <aside className="w-60 hidden md:flex flex-col gap-2 flex-shrink-0">
          <div className="bg-[#faf5ee] border border-[#eae0d0] rounded-[2rem] p-3 shadow-xs space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`w-full px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center gap-3 ${
                activeTab === "dashboard"
                  ? "bg-[#1c1917] text-white shadow-md"
                  : "text-[#1c1917]/70 hover:bg-[#eae0d0]/40 hover:text-[#1c1917]"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("schools")}
              className={`w-full px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between ${
                activeTab === "schools"
                  ? "bg-[#1c1917] text-white shadow-md"
                  : "text-[#1c1917]/70 hover:bg-[#eae0d0]/40 hover:text-[#1c1917]"
              }`}
            >
              <div className="flex items-center gap-3">
                <School className="w-4 h-4" />
                <span>Schools</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === "schools" ? "bg-white/20 text-white" : "bg-[#eae0d0] text-[#1c1917]"
              }`}>
                {schools.length}
              </span>
            </button>

            <div className="my-2 border-t border-[#eae0d0]/80" />

            <button
              type="button"
              onClick={() => setActiveTab("verify")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "verify" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#0f9488]" />
              <span>Verification</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("reviews")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "reviews" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <MessageSquare className="w-4 h-4 text-[#ab8e72]" />
              <span>Reviews</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tickets")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "tickets" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <Ticket className="w-4 h-4 text-amber-600" />
              <span>Tickets</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ai-logs")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "ai-logs" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <Bot className="w-4 h-4 text-[#25508a]" />
              <span>AI / Scraper Logs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("audit-log")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "audit-log" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Audit Log</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-3 ${
                activeTab === "users" ? "bg-[#eae0d0] text-[#1c1917] font-bold" : "text-[#1c1917]/60 hover:bg-[#eae0d0]/30 hover:text-[#1c1917]"
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Users</span>
            </button>
          </div>
        </aside>

        {/* Content Area - Fluid width */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Real-time Activity Console */}
          <OpecActivityConsole state={progress} onClearLogs={handleClearLogs} />

          {/* Loading Indicator */}
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-8 h-8 text-[#ab8e72] animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#1c1917]/60">กำลังโหลดฐานข้อมูลโรงเรียนนานาชาติ สช....</p>
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
                <div className="bg-[#faf5ee] border border-[#eae0d0] rounded-[2rem] p-12 text-center space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-[#ab8e72]/15 text-[#ab8e72] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1c1917] capitalize">
                    {activeTab.replace("-", " ")} System
                  </h3>
                  <p className="text-xs text-[#1c1917]/60 max-w-md mx-auto">
                    ระบบโมดูลนี้พร้อมสำหรับการเชื่อมต่อ API ฐานข้อมูลในขั้นตอนต่อไป
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("schools")}
                    className="px-5 py-2.5 bg-[#1c1917] hover:bg-[#1c1917]/85 text-white rounded-xl text-xs font-bold shadow-sm"
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
        onResolveSchoolWebsite={handleResolveSingleWebsite}
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
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-[#1c1917] text-white text-xs font-bold shadow-xl border border-white/10 animate-slideUp flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#0f9488]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
