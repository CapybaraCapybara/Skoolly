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
    <div className="card-hover bg-warm-cream rounded-[1.5rem] overflow-hidden border border-warm-accent shadow-xs flex flex-col transition-all hover:shadow-md">
      {/* ── Logo area: OPEC logos are white-background JPEGs cropped tight to the artwork,
             so they sit on plain white with padding to blend in and keep clear of the edges ── */}
      <div
        className="relative h-44 bg-white border-b border-warm-accent/50 flex items-center justify-center px-12 pt-10 pb-6 cursor-pointer group"
        onClick={() => onSchoolClick(school.id)}
      >
        {logoSrc && !imgFailed ? (
          <img
            src={logoSrc}
            alt={`${school.name} logo`}
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-warm-cream border border-warm-accent flex items-center justify-center text-warm-bronze font-bold text-xl tracking-wider select-none group-hover:scale-105 transition-transform">
            {getSchoolInitials(school.name)}
          </div>
        )}

        {/* Badge in top-left (e.g. ISAT Member, Boarding School) */}
        {school.badge && (
          <span className="absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white bg-warm-bronze select-none">
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
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border border-warm-accent hover:scale-105 active:scale-95"
          style={{ background: isFav ? "#ef4444" : "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFav ? "white" : "none"} stroke={isFav ? "white" : "#14284b"} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <button
            onClick={() => onSchoolClick(school.id)}
            className="font-bold text-warm-charcoal text-[15px] leading-snug text-left hover:text-warm-bronze transition-colors line-clamp-2"
          >
            {school.name}
          </button>
          {school.nameTh && school.nameTh !== school.name && (
            <div className="text-xs text-warm-charcoal/65 line-clamp-1 mt-0.5">
              {school.nameTh}
            </div>
          )}

          <div className="mt-2.5 space-y-1 text-xs text-warm-charcoal/80">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="line-clamp-1">
                {school.location}
                {school.distance > 0 && (
                  <span className="text-warm-charcoal/60">
                    {" · "}
                    {school.distance < 1 ? `${(school.distance * 1000).toFixed(0)} m` : `${school.distance.toFixed(1)} km`}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11.5v4.5c0 1.1 3.1 3 7 3s7-1.9 7-3v-4.5" />
              </svg>
              <span className="line-clamp-1">{school.grades || "Grades not listed"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="bg-warm-accent/60 text-warm-charcoal px-2.5 py-0.5 rounded-md font-semibold">
            {school.curriculum}
          </span>
          {school.isBoarding && (
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
              Boarding
            </span>
          )}
          {school.language && (
            <span className="bg-white text-warm-charcoal/80 px-2 py-0.5 rounded-md font-medium border border-warm-accent">
              {school.language}
            </span>
          )}
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between border-t border-warm-accent/60">
          <div>
            <div className="text-[11px] uppercase font-bold tracking-wider text-warm-charcoal/60">
              {school.tuitionStart > 0 ? "Tuition from" : "Tuition"}
            </div>
            <div className="font-extrabold text-warm-charcoal text-base leading-tight mt-0.5">
              {school.tuitionStart > 0 ? (
                <>
                  {formatTuition(school.tuitionStart)}
                  <span className="text-xs font-normal text-warm-charcoal/60">/yr</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-warm-charcoal/75">Not published</span>
              )}
            </div>
          </div>
          <div className="text-right">
            {school.reviewCount > 0 && school.rating > 0 ? (
              <>
                <StarRating rating={school.rating} />
                <div className="text-xs text-warm-charcoal/60 mt-0.5">{school.reviewCount} reviews</div>
              </>
            ) : (
              <div className="text-xs text-warm-charcoal/60">No reviews yet</div>
            )}
          </div>
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
          title={compareAtLimit ? `You already have ${MAX_COMPARE} schools. Click to swap one.` : undefined}
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
            {isCompared ? "Added to compare" : "Add to compare"}
          </span>
          {compareAtLimit && (
            <span className="ml-auto text-[11px] font-semibold text-warm-charcoal/60">
              {MAX_COMPARE}/{MAX_COMPARE} · swap
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
