/**
 * api/schoolsApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend service layer for School data with Anti-Corruption Layer (ACL).
 *
 * Architecture Principles:
 * 1. Strict Decoupling: UI components never interact directly with database
 *    schemas or Supabase column names (e.g. opec_school_code, pub_tuition_min_thb).
 * 2. Single Domain Model: All database records are mapped through pure adapters
 *    into Domain Types (School, SchoolDetail).
 * 3. No Silent Fallback: If Supabase is unconfigured or offline, the getters
 *    reject so the UI can tell the user, instead of showing sample schools.
 * 4. Versioning Preservation: Read paths only query published records;
 *    scraped enrichments overlay without mutating source database records directly.
 */

import type { School, SchoolCoords, SchoolDetail, SchoolFee, SchoolReview } from "@/types";
import type { SupabaseSchoolRecord } from "@/types/opec";
import { getSupabaseSchools } from "@/api/opecApi";

type MergedData = {
  schools: School[];
  details: Record<number, SchoolDetail>;
};

// Cache the in-flight promise to avoid duplicate concurrent fetches on mount
let mergedDataPromise: Promise<MergedData> | null = null;

export function getMergedData(): Promise<MergedData> {
  mergedDataPromise ??= loadMergedData().catch((error) => {
    // Drop the failed promise so the next caller retries instead of reusing the error
    mergedDataPromise = null;
    throw error;
  });
  return mergedDataPromise;
}

// ─── Anti-Corruption Layer (Mappers & Adapters) ──────────────────────────────

function normalizeCurriculum(curriculums?: string[]): string {
  if (!curriculums || curriculums.length === 0) return "International";
  const joined = curriculums.join(" ");
  if (/british|สหราชอาณาจักร|อังกฤษ|cambridge|igcse|a-level/i.test(joined)) return "British";
  if (/american|สหรัฐอเมริกา|อเมริกัน|ap|common core/i.test(joined)) return "American";
  if (/\bib\b|international baccalaureate|ibdp|pyp|myp/i.test(joined)) return "IB";
  if (/french|ฝรั่งเศส|lyc[eé]e/i.test(joined)) return "French";
  if (/singapore|สิงคโปร์/i.test(joined)) return "Singapore";
  if (/bilingual|สองภาษา|english\s*\/\s*thai/i.test(joined)) return "Bilingual";
  return curriculums[0] || "International";
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

function formatSchoolName(nameEn?: string | null, nameTh?: string): string {
  if (nameEn && nameEn.trim()) {
    const trimmed = nameEn.trim();
    if (trimmed.length > 4 && trimmed === trimmed.toUpperCase()) {
      return toTitleCase(trimmed);
    }
    return trimmed;
  }
  return nameTh?.trim() || "ไม่ระบุชื่อโรงเรียน";
}

function formatLocation(record: SupabaseSchoolRecord): string {
  const parts = [record.district, record.province].filter((p) => p && p.trim() && p !== "-");
  if (parts.length > 0) {
    return parts.join(", ");
  }
  return record.address?.slice(0, 35) || "ไม่ระบุที่ตั้ง";
}

function formatGrades(record: SupabaseSchoolRecord): string {
  if (record.level_range && record.level_range.trim()) {
    return record.level_range;
  }
  if (record.levels_offered && record.levels_offered.length > 0) {
    return record.levels_offered.join(" – ");
  }
  return "ไม่ระบุระดับชั้น";
}

// OPEC has no language-of-instruction field, so infer it from the curriculum family
function deriveLanguage(curriculum: string): string {
  if (curriculum === "Bilingual") return "English / Thai";
  if (curriculum === "French") return "French";
  return "English";
}

function mapCoords(record: SupabaseSchoolRecord): SchoolCoords | undefined {
  const precision = (record.gps_precision || "").trim().toLowerCase();
  if (precision === "none" || record.latitude == null || record.longitude == null) return undefined;

  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;

  // Only a pin the GPS pipeline marked Exact is shown as exact; an unlabelled one counts as approximate
  return {
    lat,
    lng,
    precision: precision === "exact" ? "Exact" : "Approximate",
    source: record.gps_source ?? null,
  };
}

function parseNumericId(
  record: SupabaseSchoolRecord,
  index: number,
  claimedIds?: Set<number>
): number {
  // Try parsing OPEC natural code if pure number
  if (record.opec_school_code && /^\d+$/.test(record.opec_school_code)) {
    const parsed = parseInt(record.opec_school_code, 10);
    if (!isNaN(parsed) && parsed > 0 && (!claimedIds || !claimedIds.has(parsed))) {
      claimedIds?.add(parsed);
      return parsed;
    }
  }

  // Fallback deterministic index, ensuring uniqueness
  let fallbackId = 1000 + index;
  while (claimedIds && claimedIds.has(fallbackId)) {
    fallbackId += 10000;
  }
  claimedIds?.add(fallbackId);
  return fallbackId;
}

/**
 * Pure adapter: Converts Supabase DB row to Domain School interface
 * STRICT: Only uses authentic database values. No mock ratings, distances, or stock images.
 */
export function mapSupabaseToDomainSchool(
  record: SupabaseSchoolRecord,
  index: number,
  claimedIds?: Set<number>
): School {
  const id = parseNumericId(record, index, claimedIds);

  const name = formatSchoolName(record.name_en, record.name_th);
  const nameTh = record.name_th?.trim() || undefined;
  const schoolCode = record.opec_school_code || null;
  const curriculum = normalizeCurriculum(record.curriculums);
  const location = formatLocation(record);
  const tuitionStart = record.pub_tuition_min_thb ?? 0;
  const tuitionMax = record.pub_tuition_max_thb ?? null;
  const rating = record.rating_avg ? Number(record.rating_avg.toFixed(1)) : 0;
  const reviewCount = record.review_count ?? 0;
  const distance = 0; // True distance only; 0 indicates not computed rather than fake mock formula
  const language = deriveLanguage(curriculum);
  const grades = formatGrades(record);
  
  // Official OPEC PDC school logo from database
  const logoUrl = record.logo_url || null;
  const image = logoUrl || "";

  let badge: string | null = null;
  if (record.is_isat_member) {
    badge = "ISAT Member";
  } else if (record.is_boarding) {
    badge = "Boarding School";
  } else if (rating >= 4.7 && reviewCount >= 10) {
    badge = "Top Rated";
  }

  const lastUpdated =
    record.pub_data_updated_at ||
    record.updated_at ||
    record.created_at ||
    undefined;

  return {
    id,
    name,
    nameTh,
    schoolCode,
    curriculum,
    location,
    tuitionStart,
    tuitionMax,
    rating,
    reviewCount,
    distance,
    language,
    grades,
    image,
    logoUrl,
    badge,
    lastUpdated,
    studentCount: record.student_count ?? null,
    teacherCount: record.teacher_count ?? null,
    isBoarding: record.is_boarding ?? false,
    isIsatMember: record.is_isat_member ?? false,
    websiteUrl: record.official_website_url || null,
    phone: record.official_phone || record.official_mobile || null,
    coords: mapCoords(record),
  };
}

/**
 * Pure adapter: Converts Supabase DB row to Domain SchoolDetail interface
 * STRICT: Only factual verified data. No mock facilities, fake 24/7 security, or fake reviews.
 */
export function mapSupabaseToDomainDetail(
  record: SupabaseSchoolRecord,
  school: School
): SchoolDetail {
  const founded = record.year_established
    ? String(record.year_established)
    : "ไม่มีข้อมูล";
  const students = record.student_count
    ? `${record.student_count.toLocaleString()} คน`
    : "ไม่มีข้อมูล";
  const teacherCount = record.teacher_count ?? null;
  const studentTeacherRatio =
    record.student_count && record.teacher_count && record.teacher_count > 0
      ? (record.student_count / record.teacher_count).toFixed(1)
      : null;

  const accreditation =
    record.accreditations && record.accreditations.length > 0
      ? record.accreditations
      : record.is_isat_member
      ? ["ISAT"]
      : [];

  const website = record.official_website_url || "";
  const logoUrl = record.logo_url || null;

  const loc = [record.district, record.province].filter((p) => p && p.trim() && p !== "-").join(" ");
  const curric = record.curriculums && record.curriculums.length > 0 ? record.curriculums.join(", ") : "นานาชาติ";
  const levels = record.level_range || (record.levels_offered ? record.levels_offered.join(", ") : "");
  const about = `${record.name_th ? record.name_th + " (" + school.name + ")" : school.name} เป็นโรงเรียนนานาชาติสังกัดสำนักงานคณะกรรมการส่งเสริมการศึกษาเอกชน (สช.) ตั้งอยู่ที่ ${record.address || loc || "ประเทศไทย"} จัดการเรียนการสอนตามหลักสูตร ${curric}${levels ? ` เปิดสอนระดับ ${levels}` : ""}${record.is_isat_member ? " และเป็นสมาชิกสมาคมโรงเรียนนานาชาติแห่งประเทศไทย (ISAT)" : ""}`;

  const fees: SchoolFee[] = [];
  if (record.pub_tuition_min_thb && record.pub_tuition_min_thb > 0) {
    fees.push({
      label: "ค่าธรรมเนียมการศึกษาเริ่มต้น (Starting Tuition)",
      amount: `฿${record.pub_tuition_min_thb.toLocaleString()} / ปี`,
    });
    if (record.pub_tuition_max_thb && record.pub_tuition_max_thb > record.pub_tuition_min_thb) {
      fees.push({
        label: "ค่าธรรมเนียมการศึกษาสูงสุด (Maximum Tuition)",
        amount: `฿${record.pub_tuition_max_thb.toLocaleString()} / ปี`,
      });
    }
  }

  // Strictly empty if not verified in database
  const gallery: string[] = [];
  const facilities: string[] = [];
  const reviews: SchoolReview[] = [];

  const safety: SchoolDetail["safety"] = record.pub_has_safeguarding_policy
    ? {
        safeguardingPolicy: "ผ่านการตรวจสอบนโยบายคุ้มครองสวัสดิภาพเด็ก (Child Safeguarding Policy)",
        summary: "โรงเรียนมีนโยบายคุ้มครองความปลอดภัยและสวัสดิภาพของนักเรียนตามเกณฑ์มาตรฐานการรับรองของ สช./ISAT",
        highlights: ["Child Safeguarding Policy Verified"],
      }
    : undefined;

  return {
    founded,
    students,
    teacherCount,
    studentTeacherRatio,
    levelRange: record.level_range || null,
    levelsOffered: record.levels_offered || [],
    curriculums: record.curriculums || [],
    isBoarding: record.is_boarding ?? false,
    isIsatMember: record.is_isat_member ?? false,
    officialPhone: record.official_phone || record.official_mobile || null,
    officialEmail: record.official_email || null,
    facebookUrl: record.facebook_url || null,
    address: record.address || null,
    district: record.district || null,
    subdistrict: record.subdistrict || null,
    province: record.province || null,
    accreditation,
    website,
    about,
    fees,
    gallery,
    facilities,
    reviews,
    safety,
    lastUpdated: record.pub_data_updated_at || record.updated_at || record.created_at || "ไม่มีข้อมูล",
    logoUrl,
    schoolCode: record.opec_school_code || null,
  };
}

// ─── Main Aggregator ─────────────────────────────────────────────────────────

async function loadMergedData(): Promise<MergedData> {
  const res = await getSupabaseSchools({ limit: 1000 });
  if (!res || !Array.isArray(res.schools)) {
    throw new Error("Unexpected response from /api/supabase/schools");
  }
  console.info(`[schoolsApi] Connected to Supabase: loaded ${res.schools.length} schools.`);

  const schools: School[] = [];
  const details: Record<number, SchoolDetail> = {};
  const claimedIds = new Set<number>();

  res.schools.forEach((record, index) => {
    const domainSchool = mapSupabaseToDomainSchool(record, index, claimedIds);
    schools.push(domainSchool);
    details[domainSchool.id] = mapSupabaseToDomainDetail(record, domainSchool);
  });

  return { schools, details };
}

// ─── Public API Exports ──────────────────────────────────────────────────────

/**
 * Fetch all schools (Domain Model).
 */
export async function getSchools(): Promise<School[]> {
  const data = await getMergedData();
  return data.schools;
}

/**
 * Fetch the extended detail record for a school (Domain Model).
 */
export async function getSchoolDetail(id: number): Promise<SchoolDetail | undefined> {
  const data = await getMergedData();
  if (data.details[id]) {
    return data.details[id];
  }

  // Build detail dynamically from School if not in the cached details
  const matchedSchool = data.schools.find((s) => s.id === id);
  if (matchedSchool) {
    return mapSupabaseToDomainDetail(
      {
        school_id: String(matchedSchool.id),
        slug: "",
        name_th: matchedSchool.nameTh || matchedSchool.name,
        name_en: matchedSchool.name,
        status: "active",
        province: matchedSchool.location,
        levels_offered: [matchedSchool.grades],
        curriculums: [matchedSchool.curriculum],
        opec_school_code: matchedSchool.schoolCode,
        logo_url: matchedSchool.logoUrl,
        official_website_url: matchedSchool.websiteUrl,
        official_phone: matchedSchool.phone,
        pub_tuition_min_thb: matchedSchool.tuitionStart,
        pub_tuition_max_thb: matchedSchool.tuitionMax,
        is_isat_member: matchedSchool.isIsatMember ?? false,
        is_boarding: matchedSchool.isBoarding ?? false,
      } as SupabaseSchoolRecord,
      matchedSchool
    );
  }

  return undefined;
}
