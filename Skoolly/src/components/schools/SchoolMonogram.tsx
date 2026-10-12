import { cn } from "@/lib/utils";

// Theme pairs (navy / gold / muted blue), picked per school so a grid of cards isn't one flat block
const TONES = [
  "bg-warm-charcoal text-warm-bronze",
  "bg-warm-bronze text-warm-charcoal",
  "bg-teal-700 text-white",
  "bg-teal-100 text-warm-charcoal",
];

function toneFor(seed: string): string {
  // Case-insensitive so the raw OPEC name (admin) and the title-cased name (public) match
  let h = 0;
  for (const ch of seed.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

interface SchoolMonogramProps {
  initials: string;
  /** Picks the colour; pass the school name so schools sharing initials still look different */
  seed: string;
  /** Size, corner radius and base font size come from the caller */
  className?: string;
}

/** Stands in for the school logo, which we don't display without the school's permission. */
export function SchoolMonogram({ initials, seed, className }: SchoolMonogramProps) {
  // 4–5 letters need a smaller font to fit the same box
  const scale = initials.length <= 3 ? 1 : initials.length === 4 ? 0.82 : 0.68;
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-bold tracking-wide",
        toneFor(seed),
        className
      )}
    >
      <span style={{ fontSize: `${scale}em` }}>{initials}</span>
    </div>
  );
}
