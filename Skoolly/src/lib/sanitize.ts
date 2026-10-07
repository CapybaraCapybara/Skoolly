import type { School } from "@/types";

export function sanitizeSearchQuery(input: string): string {
  if (!input || typeof input !== "string") return "";

  let clean = input.normalize("NFKC");
  clean = clean.replace(/[\x00-\x1F\x7F]/g, "                                     ");
  clean = clean.replace(/<[^>]*>?/gm, "");
  clean = clean.replace(/[`$;|&\\{}^~]/g, "");
  clean = clean.replace(/javascript:|data:|vbscript:/gi, "");
  clean = clean.replace(/--|\/\*|\*\//g, "");
  clean = clean.slice(0, 100);
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}
export function matchSchoolSearch(school: School, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const nameMatch = school.name ? school.name.toLowerCase().includes(q) : false;
  const nameThMatch = school.nameTh ? school.nameTh.toLowerCase().includes(q) : false;
  const locationMatch = school.location ? school.location.toLowerCase().includes(q) : false;
  const codeMatch = school.schoolCode ? school.schoolCode.toLowerCase().includes(q) : false;
  const curriculumMatch = school.curriculum ? school.curriculum.toLowerCase().includes(q) : false;
  return Boolean(nameMatch || nameThMatch || locationMatch || codeMatch || curriculumMatch);
}
