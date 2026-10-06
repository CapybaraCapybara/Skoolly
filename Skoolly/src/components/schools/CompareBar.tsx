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
    <div className="compare-bar fixed bottom-0 left-0 right-0 z-[1100] border-t border-warm-accent bg-warm-cream/95 shadow-lg" style={{ backdropFilter: "blur(8px)" }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold text-warm-charcoal shrink-0">
            Compare ({compareIds.length}/{MAX_COMPARE})
          </span>
          <div className="flex gap-2 flex-wrap">
            {selected.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 bg-warm-card text-warm-charcoal text-xs font-medium px-2.5 py-1 rounded-full border border-warm-accent">
                {s.name}
                <button onClick={() => onRemove(s.id)} className="text-warm-charcoal/50 hover:text-warm-charcoal transition-colors cursor-pointer" aria-label={`Remove ${s.name}`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {[...Array(MAX_COMPARE - compareIds.length)].map((_, i) => (
              <span key={i} className="flex items-center border border-dashed border-warm-accent text-warm-charcoal/40 text-xs px-2.5 py-1 rounded-full">
                + Add school
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onClear} className="text-xs text-warm-charcoal/60 hover:text-warm-charcoal transition-colors cursor-pointer">
            Clear
          </button>
          <button
            onClick={onCompareClick}
            disabled={compareIds.length < 2}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
}
