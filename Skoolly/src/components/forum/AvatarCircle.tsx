/**
 * components/forum/AvatarCircle.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable avatar circle component used throughout the forum.
 * Renders a coloured circle with author initials.
 */

const AVATAR_COLORS: Record<string, string> = {
  NP: "#0f9488", JP: "#7c3aed", SB: "#d97706", AP: "#64748b",
  CH: "#dc2626", KT: "#0891b2", MR: "#059669", SV: "#7c3aed",
  PA: "#d97706", DK: "#1d4ed8", LM: "#be185d", TP: "#0f9488",
  RF: "#7c3aed", MJ: "#dc2626",
};

interface AvatarCircleProps {
  initials: string;
  size?: "sm" | "md" | "lg";
}

export function AvatarCircle({ initials, size = "md" }: AvatarCircleProps) {
  const bg = AVATAR_COLORS[initials] ?? "#152d55";
  const sz =
    size === "sm"
      ? "w-7 h-7 text-xs"
      : size === "lg"
      ? "w-12 h-12 text-base"
      : "w-9 h-9 text-sm";

  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: bg }}
    >
      {initials}
    </div>
  );
}
