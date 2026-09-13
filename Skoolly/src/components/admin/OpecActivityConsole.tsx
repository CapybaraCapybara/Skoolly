import { useState, useMemo, useRef, useEffect } from "react";
import {
  Copy,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
  ArrowDownCircle,
  Filter,
  Sparkles,
  Layers,
} from "lucide-react";
import type { ScraperProgressState } from "@/types/opec";

interface OpecActivityConsoleProps {
  state: ScraperProgressState | null;
  onClearLogs: () => void;
}

type LogLevel = "all" | "info" | "success" | "warning" | "error";

interface ParsedLogLine {
  id: number;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  schoolCode?: string;
  schoolName?: string;
  message: string;
  raw: string;
}

export function OpecActivityConsole({ state, onClearLogs }: OpecActivityConsoleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>("all");
  const [autoScroll, setAutoScroll] = useState(true);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Parse each log line into structured data
  const parsedLogs: ParsedLogLine[] = useMemo(() => {
    if (!state?.logs) return [];

    return state.logs.map((line, idx) => {
      let timestamp = "";
      let content = line;

      // Extract [HH:MM:SS]
      const timeMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/);
      if (timeMatch) {
        timestamp = timeMatch[1];
        content = timeMatch[2];
      }

      // Determine level
      let level: "info" | "success" | "warning" | "error" = "info";
      const lower = content.toLowerCase();

      if (
        lower.includes("สำเร็จ") ||
        lower.includes("success") ||
        lower.includes("verified") ||
        lower.includes("สมบูรณ์") ||
        lower.includes("พบเว็บไซต์")
      ) {
        level = "success";
      } else if (
        lower.includes("ผิดพลาด") ||
        lower.includes("error") ||
        lower.includes("failed") ||
        lower.includes("ล้มเหลว") ||
        lower.includes("ไม่สำเร็จ")
      ) {
        level = "error";
      } else if (
        lower.includes("เตือน") ||
        lower.includes("warning") ||
        lower.includes("ไม่พบ") ||
        lower.includes("ข้าม") ||
        lower.includes("retry")
      ) {
        level = "warning";
      }

      // Extract school code if format like [1110700001]
      const codeMatch = content.match(/\[(\d{8,10})\]/);
      const schoolCode = codeMatch ? codeMatch[1] : undefined;

      return {
        id: idx,
        timestamp,
        level,
        schoolCode,
        message: content,
        raw: line,
      };
    });
  }, [state?.logs]);

  // Statistics
  const counts = useMemo(() => {
    let success = 0;
    let warning = 0;
    let error = 0;
    parsedLogs.forEach((p) => {
      if (p.level === "success") success++;
      else if (p.level === "warning") warning++;
      else if (p.level === "error") error++;
    });
    return {
      all: parsedLogs.length,
      success,
      warning,
      error,
      info: parsedLogs.length - (success + warning + error),
    };
  }, [parsedLogs]);

  // Filter logs by search and level
  const filteredLogs = useMemo(() => {
    return parsedLogs.filter((log) => {
      if (selectedLevel !== "all" && log.level !== selectedLevel) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return log.raw.toLowerCase().includes(q);
      }
      return true;
    });
  }, [parsedLogs, selectedLevel, searchTerm]);

  // Auto scroll to bottom if enabled and new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const handleCopy = () => {
    if (state?.logs && state.logs.length > 0) {
      const text = filteredLogs.map((l) => l.raw).join("\n");
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Safe early return after all hooks have been declared
  if (!state || (!state.is_running && (!state.logs || state.logs.length === 0) && !state.task)) {
    return null;
  }

  return (
    <div className="bg-white border border-[#eae0d0] rounded-3xl p-4 sm:p-5 shadow-xs transition-all space-y-3.5">
      {/* ── Top Header Row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Task Name and Animated Status */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs shrink-0 transition-all ${
              state.is_running
                ? "bg-[#ab8e72]/15 text-[#ab8e72] border border-[#ab8e72]/30"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            {state.is_running ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#1c1917] tracking-tight">
                {state.task || (state.is_running ? "Data Pipeline กำลังประมวลผล..." : "เสร็จสิ้นกระบวนการ")}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  state.is_running
                    ? "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {state.is_running ? "RUNNING" : "COMPLETED"}
              </span>
            </div>
            <p className="text-[11px] text-[#78716c]">
              บันทึกกิจกรรมเรียลไทม์ (Live Pipeline Telemetry)
            </p>
          </div>
        </div>

        {/* Right: Actions Toolbar */}
        <div className="flex items-center gap-2 text-xs">
          {/* Progress Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#faf5ee] border border-[#eae0d0] font-mono font-bold text-[#78593a]">
            <span>{state.current || 0}</span>
            <span className="text-[#a8a29e]">/</span>
            <span>{state.total || 0}</span>
            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md text-[10px] ml-1">
              {state.percent || 0}%
            </span>
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 bg-white hover:bg-[#faf5ee] border border-[#eae0d0] rounded-xl text-[#1c1917] transition-all flex items-center gap-1 shadow-xs cursor-pointer"
            title="คัดลอกบันทึก Log ที่กำลังแสดงอยู่"
          >
            <Copy className="w-3.5 h-3.5 text-[#ab8e72]" />
            <span className="hidden sm:inline font-semibold text-[11px]">
              {copied ? "คัดลอกแล้ว!" : "คัดลอก"}
            </span>
          </button>

          {/* Expand / Minimize */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 bg-white hover:bg-[#faf5ee] border border-[#eae0d0] rounded-xl text-[#78716c] hover:text-[#1c1917] transition-all shadow-xs cursor-pointer"
            title={isExpanded ? "ย่อขนาดกล่อง" : "ขยายกล่อง Log"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Collapse / Open */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 bg-white hover:bg-[#faf5ee] border border-[#eae0d0] rounded-xl text-[#78716c] hover:text-[#1c1917] transition-all shadow-xs cursor-pointer"
            title={isCollapsed ? "แสดงหน้าต่าง Log" : "พับเก็บหน้าต่าง Log"}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            onClick={onClearLogs}
            className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl transition-all shadow-xs cursor-pointer"
            title="ล้างข้อมูล Log ทั้งหมด"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Visual Progress Bar ───────────────────────────────────── */}
      <div className="w-full h-2 bg-[#eae0d0]/60 rounded-full overflow-hidden border border-[#eae0d0]/80">
        <div
          className="h-full bg-gradient-to-r from-[#ab8e72] via-[#0f9488] to-[#25508a] transition-all duration-300 rounded-full"
          style={{ width: `${Math.max(state.percent || 0, 3)}%` }}
        />
      </div>

      {/* ── Structured Console Box ────────────────────────────────── */}
      {!isCollapsed && (
        <div className="bg-[#181615] rounded-2xl border border-[#2e2a28] shadow-inner overflow-hidden flex flex-col">
          {/* Sub-toolbar: Level Filters, Search Input, Auto-Scroll toggle */}
          <div className="bg-[#24201e] px-3.5 py-2 border-b border-[#2e2a28] flex flex-wrap items-center justify-between gap-2.5 text-xs text-[#d6cec7]">
            {/* Level Filter Tabs */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedLevel("all")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  selectedLevel === "all"
                    ? "bg-[#ab8e72] text-white shadow-xs"
                    : "text-[#a8a29e] hover:text-white hover:bg-white/5"
                }`}
              >
                ทั้งหมด ({counts.all})
              </button>

              <button
                type="button"
                onClick={() => setSelectedLevel("success")}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedLevel === "success"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-950/40"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>สำเร็จ ({counts.success})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLevel("warning")}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedLevel === "warning"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/40"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>แจ้งเตือน ({counts.warning})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLevel("error")}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedLevel === "error"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/40"
                }`}
              >
                <XCircle className="w-3 h-3" />
                <span>ข้อผิดพลาด ({counts.error})</span>
              </button>
            </div>

            {/* Right: Search Filter + AutoScroll */}
            <div className="flex items-center gap-2.5">
              {/* Search input */}
              <div className="relative flex items-center">
                <Search className="w-3 h-3 text-[#a8a29e] absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ค้นหาใน Log..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-3 py-1 rounded-lg bg-[#181615] border border-[#3d3834] text-[#eae0d0] placeholder-[#78716c] text-[11px] focus:outline-none focus:border-[#ab8e72] transition-colors w-32 sm:w-44 font-mono"
                />
              </div>

              {/* Auto Scroll toggle */}
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1 border transition-all cursor-pointer ${
                  autoScroll
                    ? "bg-teal-950/60 text-teal-400 border-teal-800/80"
                    : "bg-[#181615] text-[#78716c] border-[#3d3834]"
                }`}
                title={autoScroll ? "ปิดการเลื่อนลงอัตโนมัติ" : "เปิดการเลื่อนลงอัตโนมัติเมื่อมีข้อความใหม่"}
              >
                <ArrowDownCircle className="w-3 h-3" />
                <span className="hidden md:inline">Auto-scroll</span>
              </button>
            </div>
          </div>

          {/* Log Lines Container */}
          <div
            ref={logContainerRef}
            className={`font-mono text-[11px] sm:text-xs p-3 overflow-y-auto space-y-1 select-text scrollbar-thin ${
              isExpanded ? "h-[30rem]" : "h-52"
            }`}
          >
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                let badgeColor = "text-[#ab8e72] bg-[#ab8e72]/10 border-[#ab8e72]/30";
                let icon = <Info className="w-3 h-3 text-[#ab8e72]" />;
                let rowBg = "hover:bg-white/[0.03]";

                if (log.level === "success") {
                  badgeColor = "text-emerald-400 bg-emerald-950/40 border-emerald-800/40";
                  icon = <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />;
                  rowBg = "hover:bg-emerald-950/20";
                } else if (log.level === "warning") {
                  badgeColor = "text-amber-400 bg-amber-950/40 border-amber-800/40";
                  icon = <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />;
                  rowBg = "hover:bg-amber-950/20";
                } else if (log.level === "error") {
                  badgeColor = "text-rose-400 bg-rose-950/40 border-rose-800/40";
                  icon = <XCircle className="w-3 h-3 text-rose-400 shrink-0" />;
                  rowBg = "bg-rose-950/10 hover:bg-rose-950/25";
                }

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2.5 px-2.5 py-1 rounded-lg transition-colors group ${rowBg}`}
                  >
                    {/* Line Index & Timestamp */}
                    <div className="flex items-center gap-1.5 shrink-0 text-[#78716c] text-[10px] select-none pt-0.5">
                      <span className="w-6 text-right font-mono text-[#57534e] group-hover:text-[#ab8e72]">
                        {log.id + 1}
                      </span>
                      {log.timestamp && (
                        <span className="font-mono text-[#a8a29e]/80">
                          {log.timestamp}
                        </span>
                      )}
                    </div>

                    {/* Level Icon */}
                    <div className="shrink-0 pt-0.5">
                      {icon}
                    </div>

                    {/* School Code Tag if found */}
                    {log.schoolCode && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-mono bg-blue-950/60 text-blue-300 border border-blue-800/40 shrink-0">
                        {log.schoolCode}
                      </span>
                    )}

                    {/* Main Log Text */}
                    <div className="flex-1 leading-relaxed text-[#eae0d0] break-words">
                      {log.message}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-10 text-[#78716c] space-y-1">
                <Terminal className="w-6 h-6 text-[#57534e]" />
                <p className="text-xs">
                  {searchTerm
                    ? "ไม่พบข้อความที่ตรงกับการค้นหา"
                    : "พร้อมรับคำสั่งประมวลผล..."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
