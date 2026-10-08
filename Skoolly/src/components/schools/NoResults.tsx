interface NoResultsProps {
  onReset: () => void;
}

export function NoResults({ onReset }: NoResultsProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-warm-card flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="font-semibold text-warm-charcoal text-lg mb-1">ไม่พบโรงเรียน</h3>
      <p className="text-warm-charcoal/60 text-sm max-w-xs mb-5">
        ลองลดตัวกรอง หรือเพิ่มเพดานค่าเทอม
      </p>
      <button
        onClick={onReset}
        className="px-5 py-2 rounded-full text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 transition-colors cursor-pointer"
      >
        ล้างตัวกรอง
      </button>
    </div>
  );
}
