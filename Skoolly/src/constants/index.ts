/**
 * constants/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UI-only constants — filter options and limits.
 *
 * School data comes from Supabase via src/api/schoolsApi.ts. Province and curriculum
 * options are built from that data, so only the fixed lists live here.
 */
import type { SortKey } from "@/types";

/** OPEC level names (the values in School.levels) with the short label shown on the chip */
export const LEVEL_OPTIONS = [
  { value: "ก่อนอนุบาล", label: "ก่อนอนุบาล" },
  { value: "อนุบาล", label: "อนุบาล" },
  { value: "ประถมศึกษา", label: "ประถม" },
  { value: "มัธยมศึกษาตอนต้น", label: "ม.ต้น" },
  { value: "มัธยมศึกษาตอนปลาย", label: "ม.ปลาย" },
];

/** Yearly fee slider in baht; the top end means no limit */
export const FEE_SLIDER = { min: 100_000, max: 1_500_000, step: 50_000 };

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name-th", label: "ชื่อ ก–ฮ" },
  { value: "name-en", label: "ชื่ออังกฤษ A–Z" },
  { value: "opec", label: "ลำดับรหัส สช." },
  { value: "distance", label: "ใกล้ฉันที่สุด" },
  { value: "students", label: "นักเรียนมากที่สุด" },
  { value: "fee-asc", label: "ค่าเทอมน้อยไปมาก" },
  { value: "fee-desc", label: "ค่าเทอมมากไปน้อย" },
];

export const MAX_COMPARE = 3;
