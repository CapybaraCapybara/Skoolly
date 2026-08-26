interface NoResultsProps {
  onReset: () => void;
}

export function NoResults({ onReset }: NoResultsProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="font-semibold text-navy-900 text-lg mb-1">No schools found</h3>
      <p className="text-slate-500 text-sm max-w-xs mb-5">
        Try relaxing your filters — fewer criteria will return more results.
      </p>
      <div className="flex flex-col gap-2 text-xs text-slate-400 mb-6">
        <p>Suggestions:</p>
        <ul className="space-y-1">
          <li>→ Increase the tuition fee range</li>
          <li>→ Select "Any Distance" for location</li>
          <li>→ Try "All Curricula" instead of a specific one</li>
        </ul>
      </div>
      <button
        onClick={onReset}
        className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#0f9488,#0d7d72)" }}
      >
        Reset all filters
      </button>
    </div>
  );
}
