import { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers,
  CloudDownload,
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
  Database,
  MapPin,
  Globe,
  Wand2,
  Languages,
} from "lucide-react";
import type { OpecSchoolRecord, ScraperProgressState } from "@/types/opec";
import {
  getSupabaseSchools,
  clearSupabaseData,
  syncOpecToSupabase,
  getScraperProgress,
  postAction,
  updateSchoolWebsite,
  resolveSchoolWebsite,
  enrichSchoolData,
  getSupabaseStatus,
  type SupabaseStatusResponse,
} from "@/api/opecApi";
import { OpecDashboard } from "@/components/admin/OpecDashboard";
import { OpecSchoolsTable } from "@/components/admin/OpecSchoolsTable";
import { OpecActivityConsole } from "@/components/admin/OpecActivityConsole";
import { OpecSchoolDetailModal } from "@/components/admin/OpecSchoolDetailModal";
import { OpecEditWebsiteModal } from "@/components/admin/OpecEditWebsiteModal";
import { OpecDrillDownModal } from "@/components/admin/OpecDrillDownModal";
import { OpecSupabaseModal } from "@/components/admin/OpecSupabaseModal";
import { OpecUrlVerificationModal } from "@/components/admin/OpecUrlVerificationModal";
import { ConfirmActionModal } from "@/components/admin/ConfirmActionModal";

interface SupabaseAdminPageProps {
  onBack: () => void;
}

type AdminTab = "dashboard" | "schools" | "verify" | "reviews" | "tickets" | "ai-logs" | "audit-log" | "users";

export function SupabaseAdminPage({
  onBack,
}: SupabaseAdminPageProps) {
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

  // Confirmation Modals
  const [isSyncConfirmOpen, setIsSyncConfirmOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isUrlVerificationModalOpen, setIsUrlVerificationModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
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

  // Fetch schools from Supabase
  const loadSchoolsData = useCallback(async () => {
    try {
      const res = await getSupabaseSchools({ limit: 1000 });
      // Map Supabase rows to OpecSchoolRecord format
      const mapped: OpecSchoolRecord[] = (res.schools as any[]).map((s, idx) => ({
        no: idx + 1,
        school_code: s.school_code || s.opec_school_code || String(s.school_id || ""),
        school_name_th: s.school_name_th || s.name_th || "",
        school_name_en: s.school_name_en || s.name_en || "",
        province: s.province || "",
        district: s.district || "",
        subdistrict: s.subdistrict || "",
        address: s.address || "",
        website: s.website || s.official_website_url || "",
        website_source: s.website_source || "Supabase DB",
        opec_profile_url: s.opec_profile_url || "",
        telephone: s.telephone || s.official_phone || "",
        mobile: s.mobile || s.official_mobile || "",
        email: s.email || s.official_email || "",
        facebook: s.facebook || s.facebook_url || "",
        line_id: s.line_id || "",
        instagram: s.instagram || s.instagram_url || "",
        youtube: s.youtube || s.youtube_url || "",
        latitude: s.latitude ?? undefined,
        longitude: s.longitude ?? undefined,
        gps_source: s.gps_source || "Supabase PostGIS",
        gps_precision: s.gps_precision || (s.latitude ? "Exact" : "None"),
        levels_offered: s.levels_offered || [],
        level_range: s.level_range || "",
        curriculums: s.curriculums || [],
        student_count: s.student_count ?? 0,
        teacher_count: s.teacher_count ?? 0,
        licensee_name: s.licensee_name || "",
        director_name: s.director_name || "",
        manager_name: s.manager_name || "",
        government_support: s.government_support || "",
        school_logo_url: s.school_logo_url || s.logo_url || "",
        last_updated: s.last_updated || s.updated_at || s.created_at || "",
      }));
      setSchools(mapped);
    } catch (err) {
      console.error("[SupabaseAdminPage] Failed to load schools:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll progress
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
      // Backend service idle
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

  // Action: Trigger OPEC scrape directly into Supabase
  const handleConfirmSyncOpec = async () => {
    setIsSyncConfirmOpen(false);
    setActionLoading(true);
    try {
      showToast("กำลังเริ่มดึงข้อมูลสดจากระบบ OPEC สช. เข้าสู่ Supabase...");
      await syncOpecToSupabase({ fetchFresh: true, publishInitial: true });
      pollProgress();
    } catch (err: any) {
      showToast(`ดึงข้อมูล OPEC ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Supabase Status & Modal
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatusResponse | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  const fetchSupabaseStatus = useCallback(async () => {
    try {
      const s = await getSupabaseStatus();
      setSupabaseStatus(s);
    } catch {
      // ignore
    }
  }, []);

  const handleOpenSupabaseModal = async () => {
    await fetchSupabaseStatus();
    setIsSupabaseModalOpen(true);
  };

  // Action: Clear Supabase database
  const handleConfirmClearData = async () => {
    setIsClearConfirmOpen(false);
    setActionLoading(true);
    try {
      const res = await clearSupabaseData();
      if (res.status === "success" || res.status === "cleared") {
        setSchools([]);
        setProgress(null);
        showToast(res.message || "ลบล้างข้อมูลใน Supabase Database ทั้งหมดเรียบร้อยแล้ว");
        await loadSchoolsData();
      } else {
        showToast(`ลบล้างข้อมูลไม่สำเร็จ: ${res.message || "เกิดข้อผิดพลาด"}`);
      }
    } catch (err: any) {
      showToast(`ลบล้างข้อมูลไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionLoading(false);
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
      showToast(`กำลังค้นหา Official Website สำหรับโรงเรียน ${code}...`);
      const updated = await resolveSchoolWebsite(code);
      if (updated && updated.website) {
        showToast(`ค้นพบเว็บไซต์: ${updated.website}`);
        await loadSchoolsData();
      } else {
        showToast("ไม่พบเว็บไซต์ทางการเพิ่มเติมสำหรับโรงเรียนนี้");
      }
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setActionLoadingCode(null);
    }
  };

  const handleEnrichSingleSchool = async (code: string) => {
    setActionLoadingCode(code);
    try {
      showToast(`กำลังเติมข้อมูลสำหรับโรงเรียน ${code}...`);
      const res = await enrichSchoolData(code);
      if (res) {
        showToast(`เติมข้อมูลสำเร็จ: ${res.changes.length > 0 ? res.changes.join(", ") : "ข้อมูลครบถ้วนอยู่แล้ว"}`);
        await loadSchoolsData();
      }
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setActionLoadingCode(null);
    }
  };

  const handleEnrichNamesEn = async () => {
    setActionLoading(true);
    try {
      showToast("ขั้นตอนที่ 2: กำลังดึงและเติมชื่อภาษาอังกฤษ (Official English Name) สู่ Supabase...");
      await postAction("/api/enrich-names-en");
      pollProgress();
    } catch (err: any) {
      showToast(`เติมชื่อภาษาอังกฤษไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnrichGps = async () => {
    setActionLoading(true);
    try {
      showToast("ขั้นตอนที่ 3: กำลังค้นหาและปักหมุดพิกัด GPS ความแม่นยำสูงสู่ Supabase...");
      await postAction("/api/enrich-gps");
      pollProgress();
    } catch (err: any) {
      showToast(`ปักหมุด GPS ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnrichWebsites = async () => {
    setActionLoading(true);
    try {
      showToast("ขั้นตอนที่ 4: กำลังค้นหาและตรวจสอบ Official Website สู่ Supabase...");
      await postAction("/api/fetch-official-websites");
      pollProgress();
    } catch (err: any) {
      showToast(`ค้นหาเว็บไซต์ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoEnrichAll = async () => {
    setActionLoading(true);
    try {
      showToast("ระบบ Auto-Enrich: กำลังประมวลผล Pipeline ข้อมูลแบบครบวงจร...");
      await postAction("/api/enrich-data");
      pollProgress();
    } catch (err: any) {
      showToast(`Auto-Enrich ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (schools.length === 0) {
      showToast("ไม่มีข้อมูลโรงเรียนสำหรับส่งออก");
      return;
    }
    const headers = ["school_code", "school_name_th", "school_name_en", "province", "district", "website", "levels_offered", "curriculums", "student_count", "teacher_count"];
    const rows = schools.map((s) => [
      s.school_code,
      `"${(s.school_name_th || "").replace(/"/g, '""')}"`,
      `"${(s.school_name_en || "").replace(/"/g, '""')}"`,
      s.province || "",
      s.district || "",
      s.website || "",
      `"${(s.levels_offered || []).join(", ")}"`,
      `"${(s.curriculums || []).join(", ")}"`,
      s.student_count ?? 0,
      s.teacher_count ?? 0,
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `international_schools_supabase_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("ส่งออกไฟล์ CSV เรียบร้อยแล้ว");
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
      <header className="sticky top-0 z-40 bg-[#faf8f5]/95 backdrop-blur-md border-b border-[#eae0d0]/80 px-4 sm:px-6 lg:px-10 py-3 shadow-xs space-y-2.5">
        {/* Row 1: Brand & Back Button & Mode Tabs */}
        <div className="w-full max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
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
              <div className="w-9 h-9 rounded-xl bg-[#ab8e72] text-white flex items-center justify-center shadow-xs shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm md:text-base font-bold text-[#1c1917] tracking-tight">
                    ระบบบริหารจัดการข้อมูลโรงเรียนนานาชาติ
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#eae0d0]/70 text-[#78593a] font-bold border border-[#eae0d0]">
                    สช. OPEC Pro
                  </span>
                </div>
                <p className="text-[11px] text-[#78716c] hidden sm:block">
                  เชื่อมต่อ API สช. (school.opec.go.th) 100% พร้อมระบบค้นหา Official Website & GPS อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Supabase Database Active Status Badge */}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white border border-[#eae0d0] shadow-xs">
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#1c1917]">Supabase Cloud DB</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold font-mono">Direct PostgreSQL</span>
            </div>
          </div>
        </div>

        {/* Row 2: Action Buttons Toolbar (Matching Reference Image) */}
        <div className="w-full max-w-[1720px] mx-auto flex flex-wrap items-center gap-2 pt-1 border-t border-[#eae0d0]/50">
          {/* 1. ดึงข้อมูล OPEC */}
          <button
            type="button"
            onClick={() => setIsSyncConfirmOpen(true)}
            disabled={isRunning || actionLoading}
            className="px-4 py-2 rounded-xl bg-[#1c1917] hover:bg-black text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            title="ขั้นที่ 1: ดึงข้อมูลโรงเรียนนานาชาติสดจากระบบ สช. OPEC บันทึกลง Supabase Database"
          >
            <CloudDownload className="w-4 h-4" />
            <span>1. ดึงข้อมูล OPEC</span>
          </button>

          {/* จัดการ Supabase DB */}
          <button
            type="button"
            onClick={handleOpenSupabaseModal}
            className="px-3.5 py-2 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] hover:bg-[#d1fae5] text-[#059669] text-xs font-bold shadow-xs transition-all flex items-center gap-2"
            title="ตรวจสอบการเชื่อมต่อและโครงสร้างตาราง Supabase Database"
          >
            <Database className="w-4 h-4" />
            <span>จัดการ Supabase DB</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          {/* 2. เติมชื่อ EN */}
          <button
            type="button"
            onClick={handleEnrichNamesEn}
            disabled={isRunning || actionLoading}
            className="px-3.5 py-2 rounded-xl bg-[#ab8e72] hover:bg-[#96775d] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            title="ขั้นที่ 2: เติมชื่อภาษาอังกฤษทางการของโรงเรียนเพื่อใช้ค้นหาต่อ"
          >
            <Languages className="w-4 h-4" />
            <span>2. เติมชื่อ EN</span>
          </button>

          {/* 3. ปักหมุด GPS */}
          <button
            type="button"
            onClick={handleEnrichGps}
            disabled={isRunning || actionLoading}
            className="px-3.5 py-2 rounded-xl bg-[#0f9488] hover:bg-[#0d7d72] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            title="ขั้นที่ 3: ค้นหาพิกัด GPS ระดับอาคารจริงและข้อมูล Google Places"
          >
            <MapPin className="w-4 h-4" />
            <span>3. ปักหมุด GPS</span>
          </button>

          {/* 4. ค้นหา Website */}
          <button
            type="button"
            onClick={handleEnrichWebsites}
            disabled={isRunning || actionLoading}
            className="px-3.5 py-2 rounded-xl bg-[#25508a] hover:bg-[#1d4070] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            title="ขั้นที่ 4: ค้นหาและคัดกรอง Official Website ด้วย AI Verification"
          >
            <Globe className="w-4 h-4" />
            <span>4. ค้นหา Website</span>
          </button>

          {/* ตรวจรับรอง URL */}
          <button
            type="button"
            onClick={() => setIsUrlVerificationModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
            title="เปิดศูนย์ตรวจสอบและรับรองเว็บไซต์ทางการ (Official URL Registry)"
          >
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>ตรวจรับรอง URL</span>
          </button>

          {/* Auto-Enrich */}
          <button
            type="button"
            onClick={handleAutoEnrichAll}
            disabled={isRunning || actionLoading}
            className="px-3.5 py-2 rounded-xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/60 text-[#78593a] text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
            title="รันระบบอัตโนมัติครบทุกขั้นตอน: เติมชื่อ EN -> GPS -> Website"
          >
            <Wand2 className="w-4 h-4" />
            <span>Auto-Enrich</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="p-2.5 rounded-xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#1c1917] transition-all shadow-xs"
            title="ส่งออกไฟล์ CSV"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear Database button */}
          <button
            type="button"
            onClick={() => setIsClearConfirmOpen(true)}
            disabled={isRunning || actionLoading}
            className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 transition-all shadow-xs disabled:opacity-50"
            title="ล้างข้อมูลใน Supabase Database ทั้งหมด"
          >
            <Trash2 className="w-4 h-4" />
          </button>
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
              <Loader2 className="w-8 h-8 text-[#0f9488] animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#1c1917]/60">กำลังโหลดฐานข้อมูลโรงเรียนนานาชาติจาก Supabase...</p>
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
                  onSelectSchool={(s) => setSelectedSchool(s)}
                  onEditWebsite={(s) => setEditingWebsiteSchool(s)}
                  onResolveSchoolWebsite={handleResolveSingleWebsite}
                  onEnrichSchool={handleEnrichSingleSchool}
                  onRefresh={loadSchoolsData}
                  actionLoadingCode={actionLoadingCode}
                />
              )}

              {activeTab === "verify" && (
                <div className="bg-white border border-[#eae0d0] rounded-3xl p-8 sm:p-10 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#eae0d0] pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[#1c1917]">
                          ศูนย์ตรวจสอบและรับรองเว็บไซต์ทางการ (Official URL Verification Center)
                        </h2>
                        <p className="text-xs text-[#78716c] mt-0.5">
                          ตรวจสอบความถูกต้องของ Official Website ทุกโรงเรียน พร้อมการซิงค์แบบสองทิศทางกับ reference/schoolAndURL.txt และ Supabase Database
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsUrlVerificationModalOpen(true)}
                      className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 self-start sm:self-center cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>เปิดศูนย์ตรวจสอบและรับรอง URL</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-[#faf5ee] border border-[#eae0d0]">
                      <span className="text-[11px] font-bold text-[#78593a]">การตรวจสอบอัตโนมัติ</span>
                      <p className="text-xs text-[#1c1917]/70 mt-1">
                        บอทตรวจสอบสถาปัตยกรรมโดเมน (.ac.th, .sch.id, .edu) และ SSL/TLS ป้องกันลิงก์ปลอมหรือโดเมนหมดอายุ
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#faf5ee] border border-[#eae0d0]">
                      <span className="text-[11px] font-bold text-[#78593a]">2-Way Synced Registry</span>
                      <p className="text-xs text-[#1c1917]/70 mt-1">
                        ข้อมูลที่ได้รับการรับรองจะถูกบันทึกสู่ Supabase Cloud และซิงค์กลับสู่ schoolAndURL.txt อัตโนมัติ
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#faf5ee] border border-[#eae0d0]">
                      <span className="text-[11px] font-bold text-[#78593a]">Human-in-the-loop</span>
                      <p className="text-xs text-[#1c1917]/70 mt-1">
                        แอดมินสามารถคลิกทดสอบเปิดลิงก์สด แก้ไข URL ได้ทันที และกดปุ่มรับรอง (Verify) ด้วยตนเอง
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab !== "dashboard" && activeTab !== "schools" && activeTab !== "verify" && (
                <div className="bg-white border border-[#eae0d0] rounded-3xl p-12 text-center shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-[#faf5ee] border border-[#eae0d0] text-[#ab8e72] flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-[#1c1917] capitalize">
                    {activeTab} Management Module
                  </h3>
                  <p className="text-xs text-[#1c1917]/60 mt-1 max-w-sm mx-auto">
                    เชื่อมต่อกับฐานข้อมูล Supabase PostgreSQL (Cloud Database) เรียบร้อยแล้ว
                  </p>
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

      {/* OPEC Sync Confirmation Modal */}
      <ConfirmActionModal
        isOpen={isSyncConfirmOpen}
        onClose={() => setIsSyncConfirmOpen(false)}
        onConfirm={handleConfirmSyncOpec}
        title="ยืนยันการดึงข้อมูลสดจาก OPEC เข้าสู่ Supabase"
        description="ระบบจะทำการดึงข้อมูลโรงเรียนนานาชาติจากระบบ OPEC สช. (school.opec.go.th) ทั้งหมด และบันทึกข้อมูลเข้า Supabase PostgreSQL Cloud โดยตรง&#10;&#10;คุณต้องการเริ่มดำเนินการหรือไม่?"
        confirmText="เริ่มดึงข้อมูลทันที"
        cancelText="ยกเลิก"
        variant="primary"
        iconType="database"
        isLoading={actionLoading}
      />

      {/* Clear Data Confirmation Modal */}
      <ConfirmActionModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleConfirmClearData}
        title="ยืนยันการลบล้างข้อมูลใน Supabase ทั้งหมด"
        description="⚠️ การกระทำนี้จะลบข้อมูลโรงเรียนและ Scrape Logs ในฐานข้อมูล Supabase PostgreSQL ทั้งหมด&#10;&#10;คุณสามารถกดปุ่ม 'ดึงข้อมูล OPEC' เพื่อนำเข้าข้อมูลใหม่อีกครั้งได้ทุกเมื่อ คุณแน่ใจหรือไม่ว่าต้องการดำเนินการ?"
        confirmText="ยืนยันการลบล้างข้อมูลทั้งหมด"
        cancelText="ยกเลิก"
        variant="danger"
        iconType="trash"
        isLoading={actionLoading}
      />

      {/* Supabase Database Status & Management Modal */}
      <OpecSupabaseModal
        isOpen={isSupabaseModalOpen}
        status={supabaseStatus}
        onClose={() => setIsSupabaseModalOpen(false)}
        onRefreshStatus={fetchSupabaseStatus}
        onStartSync={() => {
          setIsSupabaseModalOpen(false);
          setIsSyncConfirmOpen(true);
        }}
        isSyncing={isRunning || actionLoading}
      />

      {/* Official URL Verification & Registry Modal */}
      <OpecUrlVerificationModal
        isOpen={isUrlVerificationModalOpen}
        onClose={() => setIsUrlVerificationModalOpen(false)}
        onDataChanged={loadSchoolsData}
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
