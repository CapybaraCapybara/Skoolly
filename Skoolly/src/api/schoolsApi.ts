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
 * 3. Resilient Fallback: If Supabase is unconfigured or offline, seamlessly
 *    falls back to seed data without UI degradation or runtime exceptions.
 * 4. Versioning Preservation: Read paths only query published records;
 *    scraped enrichments overlay without mutating source database records directly.
 */

import type { School, SchoolCoords, SchoolDetail, SchoolFee, SchoolReview } from "@/types";
import type { SupabaseSchoolRecord } from "@/types/opec";
import { SCHOOLS_SEED } from "@/api/mock/schools";
import { SCHOOL_DETAILS_SEED } from "@/api/mock/schoolDetails";
import { getSupabaseSchools } from "@/api/opecApi";

type MergedData = {
  schools: School[];
  details: Record<number, SchoolDetail>;
};

const FALLBACK_IMAGES = [
  "photo-1580582932707-520aed937b7b",
  "photo-1523050854058-8df90110c9f1",
  "photo-1509062522246-3755977927d7",
  "photo-1541829070764-84a7d30dd3f3",
  "photo-1562774053-701939374585",
  "photo-1592280771190-3e2e4d571952",
  "photo-1577896851231-70ef18881754",
  "photo-1510531704581-5b2870972060",
];

// Cache the in-flight promise to avoid duplicate concurrent fetches on mount
let mergedDataPromise: Promise<MergedData> | null = null;

export function getMergedData(): Promise<MergedData> {
  mergedDataPromise ??= loadMergedData();
  return mergedDataPromise;
}

// ─── Pure Initializers ────────────────────────────────────────────────────────

function initSeedSchools(): School[] {
  return SCHOOLS_SEED.map((s) => ({
    ...s,
    lastUpdated: s.lastUpdated || "September 2026",
  }));
}

function initSeedDetails(): Record<number, SchoolDetail> {
  return Object.keys(SCHOOL_DETAILS_SEED).reduce((acc, key) => {
    const id = Number(key);
    const detail = SCHOOL_DETAILS_SEED[id];
    acc[id] = {
      ...detail,
      lastUpdated: detail?.lastUpdated || "September 2026",
      fees: detail.fees.map((f) => ({ ...f })),
      accreditation: [...detail.accreditation],
      gallery: [...detail.gallery],
      facilities: [...detail.facilities],
      reviews: detail.reviews.map((r) => ({ ...r })),
    };
    return acc;
  }, {} as Record<number, SchoolDetail>);
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
  return nameTh?.trim() || "International School";
}

function formatLocation(record: SupabaseSchoolRecord): string {
  const parts = [record.district, record.province].filter((p) => p && p.trim() && p !== "-");
  if (parts.length > 0) {
    return parts.join(", ");
  }
  return record.address?.slice(0, 35) || "Bangkok, Thailand";
}

function formatGrades(record: SupabaseSchoolRecord): string {
  if (record.level_range && record.level_range.trim()) {
    return record.level_range;
  }
  if (record.levels_offered && record.levels_offered.length > 0) {
    return record.levels_offered.join(" – ");
  }
  return "Pre-K–Grade 12";
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
  const language = record.curriculums && record.curriculums.length > 0 ? "English" : "English";
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

// ─── Scraped Data Mappers ────────────────────────────────────────────────────

function parseScrapedFees(item: any): SchoolFee[] {
  const fees: SchoolFee[] = [];

  // 1. Grade tuition lines
  if (Array.isArray(item.tuition_by_grade)) {
    for (const g of item.tuition_by_grade) {
      if (!g?.grade_level && !g?.display_name) continue;
      const labelName = g.display_name || g.grade_level;
      const amountText = g.annual_thb
        ? `฿${g.annual_thb.toLocaleString()} / yr`
        : g.semester_thb
        ? `฿${(g.semester_thb * 2).toLocaleString()} / yr`
        : "Contact school";
      fees.push({ label: `Tuition (${labelName})`, amount: amountText });
    }
  }

  // 2. Hidden / additional cost lines
  if (Array.isArray(item.hidden_costs)) {
    for (const c of item.hidden_costs) {
      if (!c?.name) continue;
      const note = c.notes ? ` (${c.notes})` : "";
      const amountText = c.amount_thb ? `฿${c.amount_thb.toLocaleString()}` : "Contact school";
      fees.push({ label: `${c.name}${note}`, amount: amountText });
    }
  }

  return fees;
}

function mapSafetyInfo(
  rawSafety: any,
  fallback?: SchoolDetail["safety"],
  pageUrl?: string
): SchoolDetail["safety"] {
  return {
    securityGuards: rawSafety.security_guards
      ? "24/7 Professional Security Guards Stationed & Patrol"
      : "Standard Campus Security",
    cctv: rawSafety.cctv_monitoring
      ? "Full CCTV Monitoring & Perimeter Surveillance"
      : "Campus Security System",
    medicalNurse: rawSafety.nurse_medical_clinic
      ? "Certified School Nurse & Medical Clinic On-site"
      : "First-Aid Station",
    safeguardingPolicy: rawSafety.child_safeguarding_policy
      ? "Comprehensive Child Protection & Safeguarding Policy Verified"
      : "School Safety Code of Conduct",
    airQualityPM25: rawSafety.air_quality_pm25_protocol
      ? "Automated PM2.5 Clean-Air Positive Pressure System"
      : "Indoor Air Quality Monitored",
    visitorControl: rawSafety.visitor_access_control
      ? "Strict Gated Entry & Visitor RFID Badge Verification"
      : "Controlled Campus Entry",
    emergencyDrill: "Termly evacuation, fire safety, and emergency response drills",
    summary:
      rawSafety.policy_summary ||
      fallback?.summary ||
      "Comprehensive campus safety protocols and child safeguarding standards.",
    highlights:
      Array.isArray(rawSafety.highlights) && rawSafety.highlights.length > 0
        ? rawSafety.highlights
        : fallback?.highlights || [],
    policyUrl: rawSafety.policy_url || fallback?.policyUrl || pageUrl,
  };
}

function extractLastUpdated(item: any): string | null {
  const val =
    item.last_updated ??
    item.lastUpdated ??
    item.updated_at ??
    item.updatedAt ??
    item.scraped_at ??
    item.last_scraped ??
    item.date_updated;
  return val ? String(val) : null;
}

function applyScrapedItem(
  item: any,
  schools: School[],
  details: Record<number, SchoolDetail>
): void {
  if (!item || item.status !== "ok" || !item.school_name) return;

  const targetName = item.school_name.toLowerCase();
  const matchedSchool = schools.find((s) => {
    const sName = s.name.toLowerCase();
    return sName.includes(targetName) || targetName.includes(sName);
  });

  if (!matchedSchool) return;

  // Update curriculum if detected
  if (item.curriculum && item.curriculum.toLowerCase() !== "unclear") {
    matchedSchool.curriculum = item.curriculum;
  }

  // Update starting tuition if detected
  if (item.tuition_min_thb != null) {
    matchedSchool.tuitionStart = item.tuition_min_thb;
  }

  const detailRecord = details[matchedSchool.id];
  if (!detailRecord) return;

  // Update fees
  const newFees = parseScrapedFees(item);
  if (newFees.length > 0) {
    detailRecord.fees = newFees;
  }

  // Update safety & safeguarding
  if (item.safety_and_security) {
    detailRecord.safety = mapSafetyInfo(
      item.safety_and_security,
      detailRecord.safety,
      item.page_scraped
    );
  }

  // Update timestamps
  const lastUpdated = extractLastUpdated(item);
  if (lastUpdated) {
    detailRecord.lastUpdated = lastUpdated;
    matchedSchool.lastUpdated = lastUpdated;
  }
}

// ─── Main Aggregator ─────────────────────────────────────────────────────────

async function loadMergedData(): Promise<MergedData> {
  // ── Step 1: Attempt to load from Supabase via Anti-Corruption Layer ──
  try {
    const res = await getSupabaseSchools({ limit: 1000 });
    if (res && Array.isArray(res.schools) && res.schools.length > 0) {
      console.info(`[schoolsApi] Connected to Supabase: loaded ${res.schools.length} real schools.`);

      const mappedSchools: School[] = [];
      const mappedDetails: Record<number, SchoolDetail> = {};
      const claimedIds = new Set<number>();

      res.schools.forEach((record, index) => {
        const domainSchool = mapSupabaseToDomainSchool(record, index, claimedIds);
        const domainDetail = mapSupabaseToDomainDetail(record, domainSchool);

        mappedSchools.push(domainSchool);
        mappedDetails[domainSchool.id] = domainDetail;
      });

      // ONLY return real schools from Supabase, NO fake mock seed schools injected!
      return { schools: mappedSchools, details: mappedDetails };
    }
  } catch (error) {
    console.warn("[schoolsApi] Supabase fetch unavailable, using seed data fallback:", error);
  }

  // Fallback ONLY if backend/database is completely unavailable
  const seedSchools = initSeedSchools();
  const seedDetails = initSeedDetails();
  return { schools: seedSchools, details: seedDetails };
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

  // Build detail dynamically from School if not in pre-seeded cache
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
