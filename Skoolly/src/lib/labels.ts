/**
 * Thai display text for values that stay in English inside the data and filter logic.
 * Only what the user sees changes; comparisons keep using the original values.
 */
import type { School } from "@/types";

// Curriculum names (British, IB, ...) stay as they are; only generic words are translated
const CURRICULUM_TH: Record<string, string> = {
  International: "นานาชาติ",
  Bilingual: "สองภาษา",
  Thai: "ไทย",
  "Own Curriculum": "หลักสูตรเฉพาะ",
};

const LANGUAGE_TH: Record<string, string> = {
  English: "อังกฤษ",
  "English / Thai": "อังกฤษ / ไทย",
  French: "ฝรั่งเศส",
};

const BADGE_TH: Record<string, string> = {
  "ISAT Member": "สมาชิก ISAT",
  "Boarding School": "โรงเรียนประจำ",
  "Top Rated": "คะแนนรีวิวสูง",
};

const FORUM_CATEGORY_TH: Record<string, string> = {
  All: "ทั้งหมด",
  Review: "รีวิว",
  Question: "คำถาม",
  Update: "ข่าวสาร",
  Tips: "เคล็ดลับ",
};

export const curriculumLabel = (value: string) => CURRICULUM_TH[value] ?? value;
export const forumCategoryLabel = (value: string) => FORUM_CATEGORY_TH[value] ?? value;
export const languageLabel = (value: string) => LANGUAGE_TH[value] ?? value;
export const badgeLabel = (value: string) => BADGE_TH[value] ?? value;

/** Thai name first, English name as the second line when both exist */
export function schoolNames(school: Pick<School, "name" | "nameTh">): { primary: string; secondary: string | null } {
  const th = school.nameTh?.trim();
  if (th && th !== school.name) return { primary: th, secondary: school.name };
  return { primary: th || school.name, secondary: null };
}
