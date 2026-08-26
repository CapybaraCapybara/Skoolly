/**
 * constants/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI-only constants — filter option labels and limits.
 *
 * School seed data has been moved to src/db/schools.ts
 * School API access is via src/api/schoolsApi.ts
 */

export const CURRICULA = ["All Curricula", "British", "American", "IB", "French", "Bilingual"];
export const GRADES = [
  "All Grades",
  "Pre-K / Kindergarten",
  "Primary (Gr 1–5)",
  "Middle School (Gr 6–8)",
  "High School (Gr 9–12)",
];
export const LANGUAGES = [
  "All Languages",
  "English",
  "English / Thai",
  "French",
  "Chinese (Mandarin)",
  "German",
];
export const LOCATIONS = [
  "Any Distance",
  "Within 5 km",
  "Within 10 km",
  "Within 20 km",
  "Anywhere in Bangkok",
  "Chiang Mai",
  "Phuket",
];

export const MAX_COMPARE = 3;
