import { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers,
  CloudDownload,
  Trash2,
  Download,
  LayoutDashboard,
  Workflow,
  School,
  CheckCircle2,
  MessageSquare,
  Ticket,
  Bot,
  ShieldCheck,
  Users,
  Loader2,
  Database,
  MapPin,
  Globe,
  Wand2,
  Languages,
  Award,
  Zap,
  Stamp,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Eye,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo, HeaderShell, NAV_PILL_CLASS } from "@/components/layout/HeaderShell";
import type { OpecSchoolRecord, ScraperProgressState, PendingVersionRecord } from "@/types/opec";
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
  getPendingVersions,
  approveVersion,
  rejectVersion,
  scrapeSchoolTuition,
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
import { VersionApprovalModal } from "@/components/admin/VersionApprovalModal";
import { ScraperLogsDashboard } from "@/components/admin/ScraperLogsDashboard";

interface SupabaseAdminPageProps {
  onBack: () => void;
}

type AdminTab = "dashboard" | "schools" | "approvals" | "pipeline" | "verify" | "reviews" | "tickets" | "ai-logs" | "audit-log" | "users";

export function SupabaseAdminPage({
  onBack,
}: SupabaseAdminPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [schools, setSchools] = useState<OpecSchoolRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ScraperProgressState | null>(null);
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const scrapingSchoolCodeRef = useRef<string | null>(null);

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

  // Version Review & Approvals State
  const [pendingVersions, setPendingVersions] = useState<PendingVersionRecord[]>([]);
  const [isPendingLoading, setIsPendingLoading] = useState(false);
  const [reviewingVersion, setReviewingVersion] = useState<PendingVersionRecord | null>(null);
  const [isVersionActionLoading, setIsVersionActionLoading] = useState(false);

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

  const loadPendingVersions = useCallback(async () => {
    setIsPendingLoading(true);
    try {
      const vers = await getPendingVersions();
      setPendingVersions(vers);
    } catch {
      // Backend service idle or table empty
    } finally {
      setIsPendingLoading(false);
    }
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
        // A coordinate nobody has verified is not "Exact"
        gps_precision: s.gps_precision || (s.latitude ? "Approximate" : "None"),
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
        is_isat_member: Boolean(s.is_isat_member),
        is_boarding: Boolean(s.is_boarding),
        year_established: s.year_established || undefined,
        accreditations: s.accreditations || [],
        isat_school_name: s.isat_school_name || "",
        fetched_at: s.fetched_at || s.created_at || "",
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
      } else {
        await loadSchoolsData();
        const freshVers = await getPendingVersions().catch(() => []);
        setPendingVersions(freshVers);

        if (scrapingSchoolCodeRef.current) {
          const targetCode = scrapingSchoolCodeRef.current;
          scrapingSchoolCodeRef.current = null;
          const match = freshVers.find(
            (v) => v.opec_school_code === targetCode || v.school_id === targetCode
          );
          if (match) {
            setReviewingVersion(match);
            showToast("Scrape ข้อมูลเรียบร้อย กำลังเปิดหน้าต่างเปรียบเทียบข้อมูลก่อน vs หลัง");
          } else if (freshVers.length > 0) {
            setReviewingVersion(freshVers[0]);
          }
        }
      }
    } catch {
      // Backend service idle
    } finally {
      if (!rescheduled) isPollingRef.current = false;
    }
  }, [loadSchoolsData, showToast]);

  // Start polling immediately when a scrape is initiated
  const startPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    isPollingRef.current = false;
    setProgress((prev) => ({
      is_running: true,
      task: prev?.task || "กำลังเริ่มกระบวนการ Scrape...",
      current: prev?.current || 0,
      total: prev?.total || 100,
      percent: prev?.percent || 0,
      log: prev?.log || "กำลังเชื่อมต่อเพื่อดึงข้อมูล...",
      logs: prev?.logs || [],
    }));
    pollProgress();
  }, [pollProgress]);

  useEffect(() => {
    isMountedRef.current = true;
    loadSchoolsData();
    loadPendingVersions();
    pollProgress();
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [loadSchoolsData, loadPendingVersions, pollProgress]);

  // Handle Approve Version (Publish to Supabase)
  const handleApproveVersion = async (versionId: string) => {
    setIsVersionActionLoading(true);
    try {
      await approveVersion(versionId);
      showToast("อนุมัติและเผยแพร่ค่าเทอมแล้ว");
      setReviewingVersion(null);
      await loadPendingVersions();
      await loadSchoolsData();
    } catch (err: any) {
      showToast(`อนุมัติไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setIsVersionActionLoading(false);
    }
  };

  // Handle Approve All Versions
  const handleApproveAll = async () => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการอนุมัติทั้งหมด ${pendingVersions.length} รายการ?`)) return;
    setIsVersionActionLoading(true);
    let successCount = 0;
    try {
      showToast("กำลังดำเนินการอนุมัติทั้งหมด...");
      for (const version of pendingVersions) {
        await approveVersion(version.version_id);
        successCount++;
      }
      showToast(`อนุมัติสำเร็จ ${successCount} รายการ`);
      await loadPendingVersions();
      await loadSchoolsData();
    } catch (err: any) {
      showToast(`อนุมัติสำเร็จ ${successCount} รายการ, เกิดข้อผิดพลาด: ${err.message || "มีบางรายการไม่สำเร็จ"}`);
      await loadPendingVersions();
      await loadSchoolsData();
    } finally {
      setIsVersionActionLoading(false);
    }
  };

  // Handle Reject Version
  const handleRejectVersion = async (versionId: string, reason?: string) => {
    setIsVersionActionLoading(true);
    try {
      await rejectVersion(versionId, reason);
      showToast("ปฏิเสธเวอร์ชันนี้แล้ว");
      setReviewingVersion(null);
      await loadPendingVersions();
    } catch (err: any) {
      showToast(`ปฏิเสธไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setIsVersionActionLoading(false);
    }
  };

  // Handle Scrape Single School Tuition
  const handleScrapeSchool = async (school: OpecSchoolRecord) => {
    if (!school.website) {
      showToast("โรงเรียนนี้ยังไม่มีเว็บไซต์ทางการ จึง scrape ไม่ได้");
      return;
    }
    setActionLoading(true);
    scrapingSchoolCodeRef.current = school.school_code;
    try {
      showToast(`กำลังเริ่ม scrape ค่าเทอมและข้อมูลของ ${school.school_name_th}`);
      await scrapeSchoolTuition(
        school.school_code,
        school.school_name_en || school.school_name_th,
        school.website
      );
      showToast("เริ่ม scrape แล้ว ระบบจะเปิดหน้าต่างตรวจสอบความแตกต่างเมื่อเสร็จสิ้น");
      pollProgress();
      await loadPendingVersions();
    } catch (err: any) {
      scrapingSchoolCodeRef.current = null;
      showToast(`Scrape ค่าเทอมไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Trigger OPEC scrape directly into Supabase
  const handleConfirmSyncOpec = async () => {
    setIsSyncConfirmOpen(false);
    setActionLoading(true);
    try {
      showToast("กำลังดึงข้อมูลจาก สช.");
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
      showToast("ล้าง log แล้ว");
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
        showToast("บันทึกเว็บไซต์แล้ว");
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
      showToast(`กำลังค้นหาเว็บไซต์ของโรงเรียน ${code}`);
      const updated = await resolveSchoolWebsite(code);
      if (updated && updated.website) {
        showToast(`พบเว็บไซต์: ${updated.website}`);
        await loadSchoolsData();
      } else {
        showToast("ไม่พบเว็บไซต์ทางการ");
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
      showToast(`กำลังเติมข้อมูลโรงเรียน ${code}`);
      const res = await enrichSchoolData(code);
      if (res) {
        showToast(`เติมข้อมูลสำเร็จ: ${res.changes.length > 0 ? res.changes.join(", ") : "ข้อมูลครบอยู่แล้ว"}`);
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
      showToast("ขั้นที่ 2: กำลังเติมชื่อภาษาอังกฤษ");
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
      showToast("ขั้นที่ 4: กำลังปักหมุด GPS");
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
      showToast("ขั้นที่ 3: กำลังค้นหาเว็บไซต์");
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
      showToast("กำลังรัน Auto-Enrich");
      await postAction("/api/enrich-data");
      pollProgress();
    } catch (err: any) {
      showToast(`Auto-Enrich ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnrichIsat = async () => {
    setActionLoading(true);
    try {
      showToast("กำลังดึงและซิงค์ข้อมูลสมาคม ISAT สู่ระบบ...");
      await postAction("/api/enrich/isat");
      pollProgress();
    } catch (err: any) {
      showToast(`ซิงค์ ISAT ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunFullPipeline = async () => {
    setActionLoading(true);
    try {
      showToast("เริ่มรันครบทุกขั้นตอน");
      await postAction("/api/pipeline/run-all");
      pollProgress();
    } catch (err: any) {
      showToast(`รัน Full Pipeline ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
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
    showToast("ส่งออก CSV แล้ว");
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

  const navSections: {
    label: string;
    items: { tab: AdminTab; label: string; icon: typeof LayoutDashboard; badge?: number; highlight?: boolean; onSelect?: () => void }[];
  }[] = [
    {
      label: "เมนูหลัก",
      items: [
        { tab: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
        { tab: "schools", label: "รายชื่อโรงเรียน", icon: School, badge: schools.length },
        {
          tab: "approvals",
          label: "รออนุมัติค่าเทอม",
          icon: Stamp,
          badge: pendingVersions.length,
          highlight: pendingVersions.length > 0,
          onSelect: loadPendingVersions,
        },
      ],
    },
    {
      label: "ระบบจัดการ",
      items: [
        { tab: "pipeline", label: "Data Pipeline", icon: Workflow },
        { tab: "verify", label: "ตรวจรับรอง URL", icon: CheckCircle2 },
        { tab: "reviews", label: "รีวิวผู้ปกครอง", icon: MessageSquare },
        { tab: "tickets", label: "แจ้งปัญหา", icon: Ticket },
        { tab: "ai-logs", label: "AI & Scraper Logs", icon: Bot },
        { tab: "audit-log", label: "ประวัติการแก้ไข", icon: ShieldCheck },
        { tab: "users", label: "ผู้ใช้งาน", icon: Users },
      ],
    },
  ];
  const navItems = navSections.flatMap((s) => s.items);
  const activeNav = navItems.find((i) => i.tab === activeTab) ?? navItems[0];
  const selectTab = (item: (typeof navItems)[number]) => {
    setActiveTab(item.tab);
    item.onSelect?.();
  };

  // Websites before GPS: the pins a school puts on its own site are one of the GPS sources
  const pipelineSteps = [
    { step: 1, label: "ดึงข้อมูล OPEC", onClick: () => setIsSyncConfirmOpen(true), title: "ขั้นที่ 1: ดึงข้อมูลโรงเรียนนานาชาติจากระบบ สช. แล้วบันทึกลง Supabase" },
    { step: 2, label: "เติมชื่อ EN", onClick: handleEnrichNamesEn, title: "ขั้นที่ 2: เติมชื่อภาษาอังกฤษให้โรงเรียนที่ยังไม่มีหรือชื่อเพี้ยน" },
    { step: 3, label: "ค้นหา Website", onClick: handleEnrichWebsites, title: "ขั้นที่ 3: หาเว็บไซต์ทางการจากทะเบียนที่ยืนยันแล้ว แล้วตรวจว่าเปิดได้จริง" },
    { step: 4, label: "ปักหมุด GPS", onClick: handleEnrichGps, title: "ขั้นที่ 4: ตรวจพิกัดโดยเทียบหลายแหล่ง" },
  ];
  const pipelineBusy = isRunning || actionLoading;
  // Members already matched in the DB — the ISAT directory size itself is only known during a sync
  const isatMemberCount = schools.filter((s) => s.is_isat_member).length;
  const pillBtn =
    "inline-flex items-center gap-2 rounded-full border border-warm-accent bg-white/70 py-1.5 text-sm font-medium text-warm-charcoal transition-colors hover:border-warm-bronze hover:text-warm-bronze disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

  return (
    <div className="min-h-screen bg-warm-bg text-warm-charcoal flex flex-col antialiased">
      {/* Same header shell as the public Navbar; the Admin switch outside the pill leads back to the site */}
      <HeaderShell adminActive onToggleAdmin={onBack}>
        <nav aria-label="Admin Navigation" className={NAV_PILL_CLASS}>
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo onClick={onBack} label="กลับหน้าหลัก Skoolly" />
            <span className="hidden h-5 w-px bg-warm-accent sm:block" />
            <span className="hidden truncate text-sm font-medium text-warm-charcoal/70 sm:block">
              ระบบจัดการข้อมูลโรงเรียนนานาชาติ
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenSupabaseModal}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-warm-accent bg-white/70 px-3.5 text-sm font-medium text-warm-charcoal transition-colors hover:border-warm-bronze cursor-pointer"
            title="จัดการและตรวจสอบการเชื่อมต่อ Supabase Database"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <Database className="size-4 text-warm-bronze" />
            <span className="hidden sm:inline">Supabase</span>
          </button>
        </nav>
      </HeaderShell>

      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex gap-6 lg:gap-8">
        {/* Sidebar Nav */}
        <aside className="w-60 hidden md:block flex-shrink-0">
          <div className="sticky top-28 rounded-[2rem] border border-warm-accent bg-warm-cream p-3 shadow-xs">
            {navSections.map((section) => (
              <div key={section.label} className="pb-1">
                <p className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-wider text-warm-charcoal/45">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = activeTab === item.tab;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => selectTab(item)}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                          active
                            ? "bg-warm-charcoal text-white"
                            : "text-warm-charcoal/75 hover:bg-warm-accent/50 hover:text-warm-charcoal"
                        )}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <Icon className={cn("size-4 shrink-0", active ? "text-warm-bronze" : "text-warm-charcoal/45")} />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge !== undefined && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              item.highlight
                                ? "bg-warm-bronze text-white"
                                : active
                                  ? "bg-white/15 text-white"
                                  : "bg-warm-accent/60 text-warm-charcoal/70"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Page heading — deep green banner with gold eyebrow */}
          <div className="relative overflow-hidden rounded-[2rem] bg-warm-charcoal px-6 py-6 sm:px-8 text-white shadow-md">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border-[28px] border-warm-bronze/15"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-24 -bottom-20 size-40 rounded-full bg-warm-bronze/10"
            />
            <div className="relative">
              <span className="text-xs font-bold tracking-widest text-warm-bronze uppercase">
                Admin Console · สช. OPEC
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
                {activeNav.label}
              </h1>
            </div>
          </div>

          {/* Mobile tab strip (sidebar is hidden below md) */}
          <div className="md:hidden -mx-4 px-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {navItems.map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => selectTab(item)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  activeTab === item.tab
                    ? "border-warm-charcoal bg-warm-charcoal text-white"
                    : "border-warm-accent bg-warm-cream text-warm-charcoal/75"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Running-job strip on other tabs, so progress stays visible without the full pipeline card */}
          {activeTab !== "pipeline" && isRunning && (
            <button
              type="button"
              onClick={() => setActiveTab("pipeline")}
              className="w-full flex items-center gap-4 rounded-full border border-warm-accent bg-warm-cream px-5 py-3 text-left shadow-xs transition-colors hover:border-warm-bronze cursor-pointer"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-warm-bronze" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-warm-charcoal">{progress?.task || "กำลังทำงาน..."}</span>
              <span className="hidden sm:block h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-warm-accent">
                <span className="block h-full rounded-full bg-warm-bronze transition-all" style={{ width: `${progress?.percent ?? 0}%` }} />
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-warm-charcoal">{progress?.percent ?? 0}%</span>
              <span className="shrink-0 text-sm font-medium text-warm-bronze">ดูรายละเอียด</span>
            </button>
          )}

          {activeTab === "pipeline" && (
            <>
              {/* Data Pipeline */}
              <section className="rounded-[2rem] border border-warm-accent bg-warm-cream p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-warm-charcoal">Data Pipeline</h2>
                    <p className="text-sm text-warm-charcoal/60">ดึงและเติมข้อมูลทีละขั้น หรือรันครบทุกขั้นในปุ่มเดียว</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="flex size-9 items-center justify-center rounded-full border border-warm-accent bg-white/70 text-warm-charcoal transition-colors hover:border-warm-bronze hover:text-warm-bronze cursor-pointer"
                      title="ส่งออกไฟล์ CSV"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsClearConfirmOpen(true)}
                      disabled={pipelineBusy}
                      className="flex size-9 items-center justify-center rounded-full border border-rose-200 bg-white/70 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                      title="ล้างข้อมูลใน Supabase Database ทั้งหมด"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRunFullPipeline}
                      disabled={pipelineBusy}
                      className="inline-flex items-center gap-2 rounded-full bg-warm-charcoal px-4 sm:px-5 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-warm-charcoal/90 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                      title="รัน Data Pipeline ครบทุกขั้นตอน: OPEC -> เติมชื่อ EN -> ซิงค์ ISAT -> ค้นหา Website -> ปักหมุด GPS"
                    >
                      <Zap className={cn("size-4 text-warm-bronze", isRunning ? "animate-pulse" : "fill-current")} />
                      <span>รันครบทุกขั้นตอน</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-warm-accent/60">
                  {pipelineSteps.map((s) => (
                    <button
                      key={s.step}
                      type="button"
                      onClick={s.onClick}
                      disabled={pipelineBusy}
                      className={cn(pillBtn, "pl-1.5 pr-4")}
                      title={s.title}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-warm-card text-xs font-bold text-warm-bronze">
                        {s.step}
                      </span>
                      {s.label}
                    </button>
                  ))}

                  <span className="hidden sm:block h-6 w-px bg-warm-accent mx-1" />

                  <button
                    type="button"
                    onClick={() => setIsUrlVerificationModalOpen(true)}
                    className={cn(pillBtn, "px-3.5")}
                    title="เปิดศูนย์ตรวจสอบและรับรองเว็บไซต์ทางการ (Official URL Registry)"
                  >
                    <ShieldCheck className="size-4 text-warm-bronze" />
                    ตรวจรับรอง URL
                  </button>
                  <button
                    type="button"
                    onClick={handleEnrichIsat}
                    disabled={pipelineBusy}
                    className={cn(pillBtn, "px-3.5")}
                    title={`ดึงและซิงค์ข้อมูลจากสมาคมโรงเรียนนานาชาติ (ISAT): โลโก้, ปีก่อตั้ง, การรับรองมาตรฐานสากล (CIS/WASC), โรงเรียนประจำ${isatMemberCount > 0 ? ` — ตอนนี้จับคู่เป็นสมาชิกแล้ว ${isatMemberCount} โรงเรียน` : ""}`}
                  >
                    <Award className="size-4 text-warm-bronze" />
                    ซิงค์ ISAT
                    {isatMemberCount > 0 && (
                      <span className="rounded-full bg-warm-card px-2 py-0.5 text-xs font-semibold tabular-nums text-warm-bronze">
                        {isatMemberCount} รร.
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoEnrichAll}
                    disabled={pipelineBusy}
                    className={cn(pillBtn, "px-3.5")}
                    title="รันต่อกัน: เติมชื่อ EN -> ค้นหา Website -> ปักหมุด GPS (ไม่ดึง OPEC ใหม่)"
                  >
                    <Wand2 className="size-4 text-warm-bronze" />
                    Auto-Enrich
                  </button>
                </div>
              </section>

              {/* Real-time Activity Console */}
              <OpecActivityConsole state={progress} onClearLogs={handleClearLogs} />
              {/* The console hides itself until something has run */}
              {!isRunning && !progress?.task && !progress?.logs?.length && (
                <p className="rounded-[2rem] border border-dashed border-warm-accent px-6 py-8 text-center text-sm text-warm-charcoal/60">
                  ยังไม่มีงานที่รัน log จะแสดงที่นี่เมื่อเริ่มขั้นตอนใดขั้นตอนหนึ่ง
                </p>
              )}
            </>
          )}

          {/* Loading Indicator */}
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-8 h-8 text-[#456ca6] animate-spin mx-auto mb-3" />
              <p className="text-xs text-warm-charcoal/60">กำลังโหลดฐานข้อมูลโรงเรียนนานาชาติจาก Supabase...</p>
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                <OpecDashboard
                  schools={schools}
                  onOpenDrillDown={openDrillDown}
                />
              )}

              {activeTab === "schools" && (
                <OpecSchoolsTable
                  schools={schools}
                  onSelectSchool={(s) => setSelectedSchool(s)}
                  onRefresh={loadSchoolsData}
                  onScrapeSchool={handleScrapeSchool}
                />
              )}

              {activeTab === "approvals" && (
                <div className="space-y-6">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-warm-charcoal/70">
                      ตรวจค่าเทอมที่ scrape มาก่อนเผยแพร่
                      {pendingVersions.length > 0 && <span className="font-semibold text-warm-charcoal"> · {pendingVersions.length} รายการ</span>}
                    </p>

                    <div className="flex items-center gap-2">
                      {pendingVersions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleApproveAll}
                          disabled={isVersionActionLoading}
                          className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>อนุมัติทั้งหมด ({pendingVersions.length})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={loadPendingVersions}
                        disabled={isPendingLoading}
                        className="px-3.5 py-2 rounded-full bg-warm-cream border border-warm-accent hover:border-warm-bronze text-warm-charcoal text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isPendingLoading ? "animate-spin" : ""}`} />
                        <span>รีเฟรช</span>
                      </button>
                    </div>
                  </div>

                  {/* List / Empty State */}
                  {isPendingLoading ? (
                    <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-16 text-center shadow-xs">
                      <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
                      <p className="text-xs text-[#78716c]">กำลังโหลด…</p>
                    </div>
                  ) : pendingVersions.length === 0 ? (
                    <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-12 text-center shadow-xs space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="max-w-md mx-auto space-y-1">
                        <h3 className="text-sm font-bold text-warm-charcoal">
                          ไม่มีรายการรออนุมัติ
                        </h3>
                        <p className="text-xs text-[#78716c] leading-relaxed">
                          กด Scrape ในหน้ารายชื่อโรงเรียนเพื่อดึงค่าเทอมใหม่
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("schools")}
                        className="px-4 py-2 rounded-full bg-warm-charcoal hover:bg-black text-white text-xs font-bold shadow-xs transition-all inline-flex items-center gap-2 cursor-pointer"
                      >
                        <School className="w-4 h-4 text-warm-bronze" />
                        <span>ไปที่รายชื่อโรงเรียน</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {pendingVersions.map((v) => {
                        const confScore = v.confidence_score ? Math.round(v.confidence_score * 100) : null;
                        const annualAmounts = (v.fees || [])
                          .map((f) => f.annual_thb || (f.semester_thb ? f.semester_thb * 2 : null))
                          .filter((amt): amt is number => amt !== null && amt > 0);
                        const minTuition = annualAmounts.length > 0 ? Math.min(...annualAmounts) : null;
                        const maxTuition = annualAmounts.length > 0 ? Math.max(...annualAmounts) : null;

                        return (
                          <div
                            key={v.version_id}
                            className="bg-warm-cream border border-warm-accent hover:border-amber-400/60 rounded-[2rem] p-5 sm:p-6 shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-warm-cream border border-warm-accent flex items-center justify-center shrink-0 text-warm-bronze font-bold text-sm">
                                {v.province ? v.province.substring(0, 2) : "รร"}
                              </div>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold uppercase">
                                    ฉบับร่าง v{v.version_number}
                                  </span>
                                  <span className="text-xs font-mono text-[#78716c]">
                                    {v.opec_school_code}
                                  </span>
                                  {v.province && (
                                    <span className="text-xs text-[#78716c]">
                                      {v.province} {v.district ? `(${v.district})` : ""}
                                    </span>
                                  )}
                                  {confScore !== null && (
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                      confScore >= 80
                                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                        : "bg-amber-100 text-amber-800 border border-amber-200"
                                    }`}>
                                      ความมั่นใจ {confScore}%
                                    </span>
                                  )}
                                </div>

                                <h3 className="text-base font-bold text-warm-charcoal">{v.name_th}</h3>
                                {v.name_en && (
                                  <p className="text-xs text-[#78716c] font-medium">{v.name_en}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[#57534e]">
                                  <div>
                                    <span className="text-[#a8a29e]">ค่าเทอม: </span>
                                    <strong className="text-emerald-800 font-bold">
                                      {minTuition && maxTuition
                                        ? `฿${minTuition.toLocaleString()} - ฿${maxTuition.toLocaleString()} / ปี`
                                        : minTuition
                                        ? `฿${minTuition.toLocaleString()} / ปี`
                                        : "ตามตารางระดับชั้น"}
                                    </strong>
                                  </div>
                                  <span className="text-warm-accent">•</span>
                                  <div>
                                    <span className="text-[#a8a29e]">ระดับชั้น: </span>
                                    <strong>{v.fees?.length || 0} ระดับ</strong>
                                  </div>
                                  <span className="text-warm-accent">•</span>
                                  <div>
                                    <span className="text-[#a8a29e]">ค่าใช้จ่ายอื่น: </span>
                                    <strong>{v.extra_fees?.length || 0} รายการ</strong>
                                  </div>
                                  {v.safety?.child_safeguarding_policy && (
                                    <>
                                      <span className="text-warm-accent">•</span>
                                      <span className="text-emerald-700 font-medium">มีนโยบายคุ้มครองเด็ก</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                              {v.scraped_page_url && (
                                <a
                                  href={v.scraped_page_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-2.5 rounded-xl bg-warm-cream hover:bg-warm-accent text-[#78716c] hover:text-warm-charcoal transition-all border border-warm-accent"
                                  title="เปิดดูหน้าเว็บต้นทาง"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setReviewingVersion(v)}
                                className="px-4 py-2.5 rounded-full bg-warm-charcoal hover:bg-black text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-4 h-4 text-warm-bronze" />
                                <span>ตรวจข้อมูล (Diff)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveVersion(v.version_id)}
                                disabled={isVersionActionLoading}
                                className="px-3.5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                                title="อนุมัติและเผยแพร่ข้อมูลลงฐานข้อมูลทันที"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>อนุมัติ</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const reason = window.prompt("ระบุเหตุผลในการปฏิเสธข้อมูล (ถ้ามี):");
                                  if (reason !== null) handleRejectVersion(v.version_id, reason);
                                }}
                                disabled={isVersionActionLoading}
                                className="px-3 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="ปฏิเสธแบบร่างนี้"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>ปฏิเสธ</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "verify" && (
                <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-sm text-warm-charcoal/70">
                    เปิดเว็บไซต์ของแต่ละโรงเรียน แก้ URL และกดรับรอง ผลจะบันทึกลง Supabase และ reference/schoolAndURL.txt
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsUrlVerificationModalOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-warm-charcoal hover:bg-warm-charcoal/90 text-white text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-warm-bronze" />
                    <span>เปิดหน้าตรวจรับรอง</span>
                  </button>
                </div>
              )}

              {activeTab === "ai-logs" && (
                <ScraperLogsDashboard
                  pendingVersions={pendingVersions}
                  progress={progress}
                  onReviewVersion={(v) => setReviewingVersion(v)}
                  onRefreshData={() => {
                    loadSchoolsData();
                    loadPendingVersions();
                  }}
                  onShowToast={showToast}
                  onStartScraping={startPolling}
                />
              )}

              {activeTab !== "dashboard" &&
                activeTab !== "schools" &&
                activeTab !== "approvals" &&
                activeTab !== "pipeline" &&
                activeTab !== "verify" &&
                activeTab !== "ai-logs" && (
                <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-12 text-center shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-warm-cream border border-warm-accent text-warm-bronze flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal">
                    ยังไม่เปิดใช้งาน
                  </h3>
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
        onScrapeTuition={handleScrapeSchool}
      />

      <VersionApprovalModal
        version={reviewingVersion}
        onClose={() => setReviewingVersion(null)}
        onApprove={handleApproveVersion}
        onReject={handleRejectVersion}
        onApproveAll={handleApproveAll}
        totalPendingCount={pendingVersions.length}
        isActionLoading={isVersionActionLoading}
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
        title="ดึงข้อมูลจาก สช.?"
        description="ดึงรายชื่อโรงเรียนนานาชาติทั้งหมดจาก school.opec.go.th แล้วบันทึกลง Supabase"
        confirmText="เริ่มดึงข้อมูล"
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
        title="ล้างข้อมูลทั้งหมด?"
        description="ลบโรงเรียนและค่าเทอมที่อนุมัติแล้วทั้งหมดใน Supabase ดึงข้อมูล OPEC ใหม่ได้ แต่ค่าเทอมจะหายถาวร"
        confirmText="ล้างข้อมูล"
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
      />

      {/* Official URL Verification & Registry Modal */}
      <OpecUrlVerificationModal
        isOpen={isUrlVerificationModalOpen}
        onClose={() => setIsUrlVerificationModalOpen(false)}
        onDataChanged={loadSchoolsData}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-warm-charcoal text-white text-xs font-bold shadow-xl border border-white/10 animate-slideUp flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#456ca6]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
