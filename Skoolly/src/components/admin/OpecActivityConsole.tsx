import React, { useState } from "react";
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
    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 md:p-5 shadow-xl text-slate-200 transition-all">
      {/* Top row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 font-medium text-sm md:text-base">
          {state.is_running ? (
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-slate-100 font-semibold truncate max-w-md">
            {state.task || (state.is_running ? "กำลังประมวลผล..." : "เสร็จสิ้นกระบวนการ")}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700 font-mono">
            {state.logs?.length || 0} บรรทัด
          </span>
          <span className="bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1 rounded-full border border-emerald-500/30">
            {state.percent || 0}%
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
            title={isExpanded ? "ย่อขนาด" : "ขยายกล่อง"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
            title={isCollapsed ? "แสดง" : "ซ่อน"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors flex items-center gap-1"
            title="คัดลอก Logs ทั้งหมด"
          >
            <Copy className="w-4 h-4" />
            <span className="hidden sm:inline">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
          </button>
          <button
            onClick={onClearLogs}
            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg transition-colors"
            title="ล้าง Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3 border border-slate-700/50">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-400 transition-all duration-300 rounded-full"
          style={{ width: `${Math.max(state.percent || 0, 3)}%` }}
        />
      </div>

      {/* Log Console Box */}
      {!isCollapsed && (
        <div
          className={`bg-slate-950 font-mono text-xs rounded-xl p-3 border border-slate-800 text-slate-300 overflow-y-auto space-y-1 select-text scrollbar-thin ${
            isExpanded ? "h-96" : "h-44"
          }`}
        >
          {state.logs && state.logs.length > 0 ? (
            state.logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-slate-900/60 px-1.5 py-0.5 rounded transition-colors">
                <span className="text-slate-500 select-none mr-2">{idx + 1}.</span>
                {log}
              </div>
            ))
          ) : (
            <div className="text-slate-500 italic flex items-center gap-2 py-6 justify-center">
              <Terminal className="w-4 h-4" />
              พร้อมรับคำสั่งประมวลผล...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
