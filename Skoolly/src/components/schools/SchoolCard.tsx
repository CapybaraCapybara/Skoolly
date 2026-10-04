import { useState } from "react";
import { School } from "@/types";
import { MAX_COMPARE } from "@/constants";

export function formatTuition(n: number) {
  if (!n || n <= 0) return "ติดต่อโรงเรียน";
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(1)}M`;
  return `฿${(n / 1000).toFixed(0)}K`;
}

export function getSchoolInitials(name: string): string {
  if (!name) return "SCH";
  const words = name
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(of|and|the|in|at|for|co|ltd)$/i.test(w));
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className="w-3.5 h-3.5" viewBox="0 0 20 20" fill={s <= Math.round(rating) ? "#f59e0b" : "#d1d5db"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-xs font-medium text-slate-700 ml-0.5">{rating.toFixed(1)}</span>
    </span>
  );
}

interface SchoolCardProps {
  school: School;
  compareIds: number[];
  favorites: Set<number>;
  onToggleCompare: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onRestrictedAction: (reason: string) => void;
  onSchoolClick: (id: number) => void;
  onCompareLimitReached?: (school: School) => void;
}

export function SchoolCard({
  school,
  compareIds,
  favorites,
  onToggleCompare,
  onToggleFavorite,
  onSchoolClick,
  onCompareLimitReached,
}: SchoolCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const isCompared = compareIds.includes(school.id);
  const isFav = favorites.has(school.id);
  const compareAtLimit = compareIds.length >= MAX_COMPARE && !isCompared;

  const logoSrc = (school.logoUrl && school.logoUrl.trim()) ? school.logoUrl : (school.image?.startsWith("http") ? school.image : null);

  return (
    <div className="card-hover bg-warm-cream rounded-[2rem] overflow-hidden border border-warm-accent shadow-xs flex flex-col p-3 transition-all hover:shadow-md">
      {/* ── Official School Logo Container (Replaced stock Unsplash photos) ── */}
      <div
        className="relative h-48 bg-gradient-to-b from-white via-warm-cream/40 to-warm-accent/20 rounded-[1.5rem] border border-warm-accent/40 flex items-center justify-center p-5 cursor-pointer group overflow-hidden"
        onClick={() => onSchoolClick(school.id)}
      >
        {logoSrc && !imgFailed ? (
          <img
            src={logoSrc}
            alt={`โลโก้ ${school.name}`}
            referrerPolicy="no-referrer"
            className="max-h-28 max-w-[82%] object-contain drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-2 select-none">
            <div className="w-16 h-16 rounded-2xl bg-white border border-warm-accent/60 shadow-xs flex items-center justify-center text-warm-bronze font-bold text-xl tracking-wider mb-1.5 group-hover:scale-105 transition-transform">
              {getSchoolInitials(school.name)}
            </div>
            <span className="text-[11px] font-semibold text-warm-charcoal/70 line-clamp-1 max-w-[180px]">{school.name}</span>
            <span className="text-[10px] text-warm-charcoal/40 mt-0.5">ไม่มีโลโก้ในระบบ</span>
          </div>
        )}

        {/* Badge in top-left (e.g. ISAT Member, Boarding School) */}
        {school.badge && (
          <span className="absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white bg-warm-bronze shadow-xs select-none">
            {school.badge}
          </span>
        )}

        {/* Favorite heart button in top-right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(school.id);
          }}
          title={isFav ? "Remove from saved" : "Save school"}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs border border-warm-accent/50 hover:scale-105 active:scale-95"
          style={{ background: isFav ? "#ef4444" : "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFav ? "white" : "none"} stroke={isFav ? "white" : "#14284b"} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* ── Card body ── */}
      <div className="p-3 flex flex-col gap-2.5 flex-1">
        <div>
          <button
            onClick={() => onSchoolClick(school.id)}
            className="font-bold text-warm-charcoal text-sm leading-snug text-left hover:text-warm-bronze transition-colors line-clamp-2"
          >
            {school.name}
          </button>
          {school.nameTh && school.nameTh !== school.name && (
            <div className="text-[11px] text-warm-charcoal/50 line-clamp-1 mt-0.5">
              {school.nameTh}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-warm-charcoal/60">
            <svg className="w-3 h-3 shrink-0 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="line-clamp-1">{school.location}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="bg-warm-accent/50 text-warm-charcoal/80 px-2.5 py-0.5 rounded-md font-medium border border-warm-accent/30">
            {school.curriculum}
          </span>
          {school.isBoarding && (
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
              Boarding
            </span>
          )}
          {school.language && (
            <span className="bg-warm-accent/40 text-warm-charcoal/70 px-2 py-0.5 rounded-md font-medium border border-warm-accent/20">
              {school.language}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2.5 flex items-end justify-between border-t border-warm-accent/30">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-warm-charcoal/50">Starting from</div>
            <div className="font-extrabold text-warm-charcoal text-base">
              {school.tuitionStart > 0 ? (
                <>
                  {formatTuition(school.tuitionStart)}
                  <span className="text-xs font-normal text-warm-charcoal/50">/yr</span>
                </>
              ) : (
                <span className="text-xs font-semibold text-warm-charcoal/60">Contact school</span>
              )}
            </div>
          </div>
          <div className="text-right">
            {school.reviewCount > 0 && school.rating > 0 ? (
              <>
                <StarRating rating={school.rating} />
                <div className="text-xs text-warm-charcoal/50 mt-0.5">{school.reviewCount} reviews</div>
              </>
            ) : (
              <div className="text-[11px] text-warm-charcoal/50 py-1">ยังไม่มีรีวิว</div>
            )}
          </div>
        </div>

        <div className="text-[11px] text-warm-charcoal/60 flex items-center gap-1.5">
          {school.distance > 0 && (
            <>
              <svg className="w-3 h-3 text-warm-bronze shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
              </svg>
              <span>{school.distance < 1 ? `${(school.distance * 1000).toFixed(0)} m away` : `${school.distance.toFixed(1)} km away`}</span>
              <span className="text-warm-charcoal/30">·</span>
            </>
          )}
          <span className="truncate">{school.grades || "ไม่ระบุระดับชั้น"}</span>
        </div>

        {/* Compare */}
        <div
          onClick={(e) => {
            if (compareAtLimit) {
              e.preventDefault();
              onCompareLimitReached?.(school);
            }
          }}
          className="flex items-center gap-2 mt-1 text-xs select-none group cursor-pointer"
          title={compareAtLimit ? `เลือกครบ ${MAX_COMPARE} โรงเรียนแล้ว (คลิกเพื่อเลือกลบและแทนที่)` : isCompared ? "นำออกจากเปรียบเทียบ" : "เพิ่มเข้าเปรียบเทียบ"}
        >
          <input
            type="checkbox"
            checked={isCompared}
            readOnly={compareAtLimit}
            onChange={() => {
              if (!compareAtLimit) {
                onToggleCompare(school.id);
              }
            }}
            className="w-4 h-4 rounded accent-warm-bronze border-warm-accent cursor-pointer"
          />
          <span className={`transition-colors font-medium ${isCompared ? "text-warm-bronze font-bold" : "text-warm-charcoal/80 group-hover:text-warm-bronze"}`}>
            {isCompared ? "อยู่ในรายการเปรียบเทียบ" : "Add to Compare"}
          </span>
          {compareAtLimit && (
            <span className="ml-auto text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
              3/3 เต็ม (สลับ)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
