import { School } from "@/types";
import { MAX_COMPARE } from "@/constants";

export function formatTuition(n: number) {
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(1)}M`;
  return `฿${(n / 1000).toFixed(0)}K`;
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
}

export function SchoolCard({
  school,
  compareIds,
  favorites,
  onToggleCompare,
  onToggleFavorite,
  onRestrictedAction,
  onSchoolClick,
}: SchoolCardProps) {
  const isCompared = compareIds.includes(school.id);
  const isFav = favorites.has(school.id);
  const compareAtLimit = compareIds.length >= MAX_COMPARE && !isCompared;

  return (
    <div className="card-hover bg-warm-cream rounded-[2rem] overflow-hidden border border-warm-accent shadow-sm flex flex-col p-3">
      {/* Cover image */}
      <div className="relative h-56 bg-warm-accent rounded-[1.5rem] overflow-hidden cursor-pointer" onClick={() => onSchoolClick(school.id)}>
        <img
          src={`https://images.unsplash.com/${school.image}?w=600&h=350&fit=crop&auto=format`}
          alt={`${school.name} campus`}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {school.badge && (
          <span className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full text-white bg-warm-bronze">
            {school.badge}
          </span>
        )}
        <button
          onClick={() => onToggleFavorite(school.id)}
          title={isFav ? "Remove from saved" : "Save school"}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{ background: isFav ? "#ef4444" : "rgba(250,248,245,0.9)", backdropFilter: "blur(4px)" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFav ? "white" : "none"} stroke={isFav ? "white" : "#1c1917"} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-2.5 flex-1">
        <div>
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => onSchoolClick(school.id)} className="font-bold text-warm-charcoal text-sm leading-snug text-left hover:text-warm-bronze transition-colors">
              {school.name}
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-warm-charcoal/60">
            <svg className="w-3 h-3 shrink-0 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{school.location}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="bg-warm-accent/50 text-warm-charcoal/80 px-2.5 py-0.5 rounded-md font-medium border border-warm-accent/30">{school.curriculum}</span>
          <span className="bg-warm-accent/50 text-warm-charcoal/80 px-2.5 py-0.5 rounded-md font-medium border border-warm-accent/30">{school.language}</span>
        </div>

        <div className="mt-auto pt-2.5 flex items-end justify-between border-t border-warm-accent/30">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-warm-charcoal/50">Starting from</div>
            <div className="font-extrabold text-warm-charcoal text-base">{formatTuition(school.tuitionStart)}<span className="text-xs font-normal text-warm-charcoal/50">/yr</span></div>
          </div>
          <div className="text-right">
            <StarRating rating={school.rating} />
            <div className="text-xs text-warm-charcoal/50 mt-0.5">{school.reviewCount} reviews</div>
          </div>
        </div>

        <div className="text-[11px] text-warm-charcoal/60 flex items-center gap-1">
          <svg className="w-3 h-3 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
          </svg>
          {school.distance < 1 ? `${(school.distance * 1000).toFixed(0)} m away` : `${school.distance.toFixed(1)} km away`}
          <span className="mx-1 text-warm-charcoal/30">·</span>
          <span>{school.grades}</span>
        </div>

        {/* Compare */}
        <label
          className={`flex items-center gap-2 mt-1 text-xs cursor-pointer select-none group ${compareAtLimit ? "opacity-40" : ""}`}
          title={compareAtLimit ? `Compare limit reached (${MAX_COMPARE} schools max as guest)` : ""}
        >
          <input
            type="checkbox"
            checked={isCompared}
            disabled={compareAtLimit}
            onChange={() => {
              if (compareAtLimit) {
                onRestrictedAction("Guest comparisons are limited to 3 schools per session. Sign in to compare more and save your comparisons.");
              } else {
                onToggleCompare(school.id);
              }
            }}
            className="w-4 h-4 rounded accent-warm-bronze border-warm-accent"
          />
          <span className="text-warm-charcoal/80 group-hover:text-warm-bronze transition-colors font-medium">Add to Compare</span>
          {compareAtLimit && (
            <svg className="w-3.5 h-3.5 text-warm-bronze ml-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
        </label>
      </div>
    </div>
  );
}

