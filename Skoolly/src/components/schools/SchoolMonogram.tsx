import { cn } from "@/lib/utils";

// Initials starting A–M: navy with gold letters. N–Z: light cream with navy letters. Thai initials: navy.
// The light tone keeps neighbouring cards from competing for attention.
function toneFor(initials: string): string {
  const first = initials.charAt(0).toUpperCase();
  return first >= "N" && first <= "Z"
    ? "bg-warm-card text-warm-charcoal border border-warm-accent"
    : "bg-warm-charcoal text-warm-bronze";
}

interface SchoolMonogramProps {
  initials: string;
  /** Size, corner radius and base font size come from the caller */
  className?: string;
}

/** Stands in for the school logo, which we don't display without the school's permission. */
export function SchoolMonogram({ initials, className }: SchoolMonogramProps) {
  // 4–5 letters need a smaller font to fit the same box
  const scale = initials.length <= 3 ? 1 : initials.length === 4 ? 0.82 : 0.68;
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-bold tracking-wide",
        toneFor(initials),
        className
      )}
    >
      <span style={{ fontSize: `${scale}em` }}>{initials}</span>
    </div>
  );
}
