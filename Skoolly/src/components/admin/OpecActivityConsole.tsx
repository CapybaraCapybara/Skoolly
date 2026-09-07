import { useState } from "react";
import { Copy, Terminal, CheckCircle2, Loader2, Maximize2, Minimize2, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { ScraperProgressState } from "@/types/opec";

interface OpecActivityConsoleProps {
  state: ScraperProgressState | null;
  onClearLogs: () => void;
}

export function OpecActivityConsole({ state, onClearLogs }: OpecActivityConsoleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!state || (!state.is_running && (!state.logs || state.logs.length === 0) && !state.task)) {
    return null;
  }

  const handleCopy = () => {
    if (state.logs && state.logs.length > 0) {
      navigator.clipboard.writeText(state.logs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#faf5ee] border border-[#eae0d0] rounded-3xl p-5 shadow-xs transition-all">
      {/* Top row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 font-bold text-sm md:text-base text-[#1c1917]">
          {state.is_running ? (
            <Loader2 className="w-5 h-5 text-[#ab8e72] animate-spin flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#0f9488] flex-shrink-0" />
          )}
          <span className="truncate max-w-md">
            {state.task || (state.is_running ? "กำลังประมวลผล..." : "เสร็จสิ้นกระบวนการ")}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="bg-white text-[#78716c] px-3 py-1 rounded-full border border-[#eae0d0] font-mono font-medium shadow-xs">
            {state.logs?.length || 0} บรรทัด
          </span>
          <span className="bg-teal-50 text-[#0f9488] font-bold px-3 py-1 rounded-full border border-teal-200">
            {state.percent || 0}%
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-white hover:bg-[#faf8f5] border border-[#eae0d0] rounded-xl text-[#1c1917] transition-colors shadow-xs"
            title={isExpanded ? "ย่อขนาด" : "ขยายกล่อง"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 bg-white hover:bg-[#faf8f5] border border-[#eae0d0] rounded-xl text-[#1c1917] transition-colors shadow-xs"
            title={isCollapsed ? "แสดง" : "ซ่อน"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 bg-white hover:bg-[#faf8f5] border border-[#eae0d0] rounded-xl text-[#1c1917] transition-colors flex items-center gap-1 shadow-xs"
            title="คัดลอก Logs ทั้งหมด"
          >
            <Copy className="w-4 h-4 text-[#ab8e72]" />
            <span className="hidden sm:inline font-bold text-xs">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
          </button>
          <button
            type="button"
            onClick={onClearLogs}
            className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl transition-colors shadow-xs"
            title="ล้าง Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 bg-[#eae0d0]/80 rounded-full overflow-hidden mb-3.5 border border-[#eae0d0]">
        <div
          className="h-full bg-gradient-to-r from-[#ab8e72] via-[#0f9488] to-[#25508a] transition-all duration-300 rounded-full"
          style={{ width: `${Math.max(state.percent || 0, 3)}%` }}
        />
      </div>

      {/* Log Console Box */}
      {!isCollapsed && (
        <div
          className={`bg-[#1c1917] font-mono text-xs rounded-2xl p-4 border border-[#2d2825] text-[#eae0d0] overflow-y-auto space-y-1 select-text scrollbar-thin shadow-inner ${
            isExpanded ? "h-96" : "h-44"
          }`}
        >
          {state.logs && state.logs.length > 0 ? (
            state.logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-white/5 px-2 py-0.5 rounded transition-colors">
                <span className="text-[#ab8e72]/70 select-none mr-2 font-mono">{idx + 1}.</span>
                {log}
              </div>
            ))
          ) : (
            <div className="text-[#ab8e72]/60 italic flex items-center gap-2 py-6 justify-center">
              <Terminal className="w-4 h-4" />
              พร้อมรับคำสั่งประมวลผล...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
