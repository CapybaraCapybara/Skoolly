import { useState, useEffect, useMemo, useDeferredValue } from "react";
import {
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Cpu,
  Eye,
  Play,
  Loader2,
} from "lucide-react";
import type { ScrapeLogRecord, PendingVersionRecord, ScraperProgressState } from "@/types/opec";
import { getScrapeLogs, triggerBatchScrape } from "@/api/opecApi";

interface ScraperLogsDashboardProps {
  pendingVersions?: PendingVersionRecord[];
  progress: ScraperProgressState | null;
  onReviewVersion: (version: PendingVersionRecord) => void;
  onRefreshData?: () => void;
  onShowToast: (message: string) => void;
  onStartScraping?: () => void;
}

export function ScraperLogsDashboard({
  pendingVersions = [],
  progress,
  onReviewVersion,
  onRefreshData,
  onShowToast,
  onStartScraping,
}: ScraperLogsDashboardProps) {
  const [logs, setLogs] = useState<ScrapeLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isTriggeringBatch, setIsTriggeringBatch] = useState(false);

  const isScraperRunning = Boolean(progress?.is_running);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getScrapeLogs(200, 0);
      setLogs(data);
    } catch (err: any) {
      console.error("[ScraperLogsDashboard] Failed to fetch logs:", err);
      onShowToast(`โหลด Logs ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Handle Trigger Batch Scrape
  const handleBatchScrapeClick = async () => {
    if (isScraperRunning) {
      onShowToast("ระบบกำลังทำงาน Scrape อยู่แล้ว");
      return;
    }
    const confirmed = window.confirm(
      "คุณต้องการสั่ง Scrape โรงเรียนนานาชาติที่มีเว็บไซต์ทางการทั้งหมดในระบบใช่หรือไม่?\n\nระบบจะเก็บข้อมูลและบันทึกประวัติการขูดลงใน Supabase log โดยอัตโนมัติ"
    );
    if (!confirmed) return;

    setIsTriggeringBatch(true);
    try {
      onShowToast("กำลังเริ่มรัน Batch Scraper สำหรับทุกโรงเรียนที่มีเว็บไซต์...");
      await triggerBatchScrape();
      onShowToast("เริ่มกระบวนการ Scrape อัตโนมัติแล้ว ตรวจดูความคืบหน้าได้ในแถบสถานะ");
      if (onStartScraping) {
        onStartScraping();
      }
      if (onRefreshData) onRefreshData();
      await fetchLogs();
    } catch (err: any) {
      onShowToast(`สั่งรันไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setIsTriggeringBatch(false);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = logs.length;
    const okCount = logs.filter((l) => l.status === "ok").length;
    const noTuitionCount = logs.filter((l) => l.status === "no_tuition_found").length;
    const errorCount = logs.filter((l) => ["error", "nav_failed", "blocked", "timeout"].includes(l.status)).length;

    const validElapsed = logs.map((l) => l.elapsed_sec).filter((e): e is number => typeof e === "number" && e > 0);
    const avgSec = validElapsed.length > 0 ? (validElapsed.reduce((a, b) => a + b, 0) / validElapsed.length).toFixed(1) : "0.0";

    return { total, okCount, noTuitionCount, errorCount, avgSec };
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) {
        if (statusFilter === "failed" && !["error", "nav_failed", "blocked", "timeout"].includes(l.status)) {
          return false;
        } else if (statusFilter !== "failed") {
          return false;
        }
      }

      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase().trim();
        const matchTh = l.name_th?.toLowerCase().includes(q);
        const matchEn = l.name_en?.toLowerCase().includes(q);
        const matchCode = l.opec_school_code?.toLowerCase().includes(q);
        const matchUrl = l.page_scraped?.toLowerCase().includes(q);
        if (!matchTh && !matchEn && !matchCode && !matchUrl) return false;
      }

      return true;
    });
  }, [logs, statusFilter, deferredSearch]);

  // Handle click on View Diff / View Details
  const handleOpenLogDiff = (log: ScrapeLogRecord) => {
    // 1. Try to find in pending versions by version_id
    if (log.version_id) {
      const match = pendingVersions.find((pv) => pv.version_id === log.version_id);
      if (match) {
        onReviewVersion(match);
        return;
      }
    }
    // 2. Try to find by school_id or OPEC code
    const matchBySchool = pendingVersions.find(
      (pv) =>
        (log.school_id && pv.school_id === log.school_id) ||
        (log.opec_school_code && pv.opec_school_code === log.opec_school_code)
    );
    if (matchBySchool) {
      onReviewVersion(matchBySchool);
      return;
    }

    // 3. Construct a virtual PendingVersionRecord from log data for inspection
    const virtualVersion: PendingVersionRecord = {
      version_id: log.version_id || `log-${log.log_id}`,
      school_id: log.school_id || "",
      version_number: 1,
      status: log.status === "ok" ? "published" : "pending_review",
      source_type: "scraper",
      confidence_score: log.status === "ok" ? 0.9 : 0.4,
      confidence_reasoning: log.ai_reasoning || log.error_message || "ผลการ Scrape บันทึกจาก school_scrape_log",
      scraped_page_url: log.page_scraped || log.official_website_url,
      submitted_at: log.created_at,
      name_th: log.name_th || "โรงเรียน",
      name_en: log.name_en,
      opec_school_code: log.opec_school_code,
      fees: [],
      extra_fees: [],
      safety: null,
    };
    onReviewVersion(virtualVersion);
  };

  return (
    <div className="space-y-6">
      {/* Header and Action Banner */}
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-600" />
              <span>Database Log Table: school_scrape_log</span>
            </span>
            <span className="text-xs text-[#a8a29e] font-mono">290 Schools Index</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-warm-charcoal tracking-tight">
            ประวัติการรัน AI & Scraper (Scrape Logs)
          </h2>
          <p className="text-xs sm:text-sm text-[#78716c] leading-relaxed">
            ติดตามประวัติการดึงข้อมูล ค่าเทอม หลักสูตร สิ่งอำนวยความสะดวก และนโยบายความปลอดภัยของทุกโรงเรียนที่มีเว็บไซต์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="px-4 py-2.5 rounded-full bg-white border border-warm-accent hover:border-warm-bronze text-warm-charcoal text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 shrink-0 whitespace-nowrap"
            title="รีเฟรชประวัติ Log ล่าสุด"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>รีเฟรช Logs</span>
          </button>

          <button
            type="button"
            onClick={handleBatchScrapeClick}
            disabled={isScraperRunning || isTriggeringBatch}
            className="px-5 py-2.5 rounded-full bg-warm-charcoal hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shrink-0 whitespace-nowrap"
            title="สั่ง Scrape ข้อมูลโรงเรียนนานาชาติที่มีเว็บไซต์ทางการทั้งหมด"
          >
            {isScraperRunning || isTriggeringBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                <span>กำลังดำเนินการ Scrape…</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                <span>🚀 สั่ง Scrape โรงเรียนที่มีลิงก์ทั้งหมด</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Running Progress Card (if scraper is currently executing) */}
      {isScraperRunning && (
        <div className="p-5 sm:p-6 rounded-[2rem] bg-amber-50/80 border-2 border-amber-300 text-amber-950 space-y-3 shadow-xs animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
              <span>กำลัง Scrape ข้อมูลในระบบ (Background Task)</span>
            </span>
            <span className="text-xs font-mono font-bold">
              {progress?.current || 0} / {progress?.total || 0} ({progress?.percent || 0}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-amber-200 overflow-hidden">
            <div
              className="h-full bg-amber-600 transition-all duration-300"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>
          <div className="text-xs text-amber-800 font-mono truncate">{progress?.log}</div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-warm-accent shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#a8a29e]">จำนวนรอบทั้งหมด</span>
          <div className="text-xl font-bold text-warm-charcoal font-mono">{stats.total}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">สำเร็จ (OK)</span>
          <div className="text-xl font-bold text-emerald-900 font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{stats.okCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">ไม่พบค่าเทอม</span>
          <div className="text-xl font-bold text-amber-900 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>{stats.noTuitionCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">ล้มเหลว / บล็อก</span>
          <div className="text-xl font-bold text-rose-900 font-mono flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-rose-600" />
            <span>{stats.errorCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-warm-accent shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#a8a29e]">เวลาเฉลี่ย / โรงเรียน</span>
          <div className="text-xl font-bold text-warm-charcoal font-mono flex items-center gap-1">
            <Clock className="w-4 h-4 text-warm-bronze" />
            <span>{stats.avgSec} วิ</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-warm-cream border border-warm-accent rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหาชื่อโรงเรียน หรือรหัส OPEC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-[#e5dcce] text-warm-charcoal placeholder-[#a8a29e] focus:outline-hidden focus:ring-2 focus:ring-warm-bronze/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto w-full sm:w-auto mt-3 sm:mt-0">
          {[
            { id: "all", label: "ทั้งหมด" },
            { id: "ok", label: "สำเร็จ (OK)" },
            { id: "no_tuition_found", label: "ไม่พบค่าเทอม" },
            { id: "failed", label: "ข้อผิดพลาด" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === item.id
                  ? "bg-warm-charcoal text-white"
                  : "bg-white/80 hover:bg-white text-[#78716c] border border-warm-accent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrape Logs Table */}
      <div className="border border-warm-accent rounded-[2rem] bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-warm-cream/80 text-[#78716c] font-bold border-b border-warm-accent">
              <tr>
                <th className="py-3.5 px-4 font-mono text-center w-14">#</th>
                <th className="py-3.5 px-4 min-w-[130px]">เวลา / วันที่</th>
                <th className="py-3.5 px-4 min-w-[200px]">โรงเรียน (ชื่อ / รหัส OPEC)</th>
                <th className="py-3.5 px-4 min-w-[140px]">สถานะ (Status)</th>
                <th className="py-3.5 px-4 text-right">เวลาที่ใช้</th>
                <th className="py-3.5 px-4 min-w-[240px]">AI Model & ผลการวิเคราะห์</th>
                <th className="py-3.5 px-4 text-center min-w-[140px]">การกระทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ece4d8]">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[#78716c]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-warm-bronze mb-2" />
                    <span>กำลังโหลดประวัติ Scrape Logs จาก Supabase...</span>
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log, idx) => {
                  const isOk = log.status === "ok";
                  const isNoTuition = log.status === "no_tuition_found";

                  const dateFormatted = log.created_at
                    ? new Date(log.created_at).toLocaleString("th-TH", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  return (
                    <tr key={log.log_id || idx} className="hover:bg-[#faf7f2]/80 transition-colors odd:bg-white even:bg-[#faf7f2]/30">
                      <td className="py-3.5 px-4 text-center text-[#a8a29e] font-mono">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-mono text-[#78716c] whitespace-nowrap">
                        <div className="font-semibold text-warm-charcoal">{dateFormatted}</div>
                        <div className="text-[10px] text-[#a8a29e]">Phase: {log.phase}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-warm-charcoal">
                          {log.name_th || `โรงเรียน ID: ${log.school_id?.substring(0, 8) || "—"}`}
                        </div>
                        <div className="text-[11px] text-[#78716c] flex items-center gap-2 mt-0.5">
                          {log.opec_school_code && (
                            <span className="font-mono bg-warm-cream px-1.5 py-0.2 rounded border border-warm-accent">
                              {log.opec_school_code}
                            </span>
                          )}
                          {log.name_en && <span className="truncate max-w-[180px]">{log.name_en}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isOk ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>สำเร็จ (OK)</span>
                          </span>
                        ) : isNoTuition ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>ไม่พบค่าเทอม</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>{log.status}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-[#78716c] whitespace-nowrap">
                        {log.elapsed_sec ? `${log.elapsed_sec.toFixed(1)}s` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#57534e]">
                        <div className="font-mono text-[10px] text-warm-bronze font-semibold mb-0.5">
                          {log.ai_model || "gemini-flash-lite"}
                        </div>
                        <p className="line-clamp-2 leading-relaxed" title={log.ai_reasoning || log.error_message || ""}>
                          {log.ai_reasoning || log.error_message || "ไม่มีบันทึกเหตุผล"}
                        </p>
                        {log.page_scraped && (
                          <a
                            href={log.page_scraped}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-teal-700 hover:underline mt-1 font-mono"
                          >
                            <span>หน้าต้นทาง</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenLogDiff(log)}
                          className="px-3.5 py-1.5 rounded-full bg-warm-cream hover:bg-warm-charcoal hover:text-white border border-warm-accent text-warm-charcoal font-semibold text-xs transition-all inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="ดูข้อมูลที่ Scrape ได้และเปรียบเทียบ Diff"
                        >
                          <Eye className="w-3.5 h-3.5 text-warm-bronze" />
                          <span>ดูข้อมูล / Diff</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[#a8a29e] italic">
                    ไม่พบบันทึกการ Scrape ในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
