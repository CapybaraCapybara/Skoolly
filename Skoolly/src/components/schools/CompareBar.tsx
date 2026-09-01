import { School } from "@/types";
import { MAX_COMPARE } from "@/constants";

interface CompareBarProps {
  compareIds: number[];
  schools: School[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onCompareClick: () => void;
}

export function CompareBar({
  compareIds,
  schools,
  onRemove,
  onClear,
  onCompareClick,
}: CompareBarProps) {
  if (compareIds.length === 0) return null;
  const selected = schools.filter((s) => compareIds.includes(s.id));
  return (
    <div className="compare-bar fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 shadow-lg" style={{ backdropFilter: "blur(8px)" }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold text-navy-900 shrink-0">Comparing ({compareIds.length}/{MAX_COMPARE}):</span>
          <div className="flex gap-2 flex-wrap">
            {selected.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 bg-teal-50 text-teal-800 text-xs font-medium px-2.5 py-1 rounded-full border border-teal-200">
                {s.name}
                <button onClick={() => onRemove(s.id)} className="hover:text-teal-900 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {[...Array(MAX_COMPARE - compareIds.length)].map((_, i) => (
              <span key={i} className="flex items-center gap-1.5 border border-dashed border-slate-300 text-slate-400 text-xs px-2.5 py-1 rounded-full">
                + Add school
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors">
            Clear all
          </button>
          <button
            onClick={onCompareClick}
            disabled={compareIds.length < 2}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: "linear-gradient(135deg,#0f9488,#0d7d72)" }}
          >
            Compare Schools →
          </button>
        </div>
      </div>
    </div>
  );
}
