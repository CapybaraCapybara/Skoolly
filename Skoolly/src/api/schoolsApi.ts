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

import type { School, SchoolDetail, SchoolFee, SchoolReview } from "@/types";
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

function parseNumericId(record: SupabaseSchoolRecord, index: number, seedSchools: School[]): number {
  // 1. Preserve seed ID if school matches existing seed (e.g. Bangkok Patana -> 1, NIST -> 2)
  const enName = (record.name_en || "").toLowerCase();
  const thName = (record.name_th || "").toLowerCase();
  const matchedSeed = seedSchools.find((s) => {
    const sName = s.name.toLowerCase();
    return (
      (enName && (enName.includes(sName) || sName.includes(enName))) ||
      (thName && (thName.includes(sName) || sName.includes(thName)))
    );
  });
  if (matchedSeed) {
    return matchedSeed.id;
  }

  // 2. Try parsing OPEC natural code if pure number
  if (record.opec_school_code && /^\d+$/.test(record.opec_school_code)) {
    const parsed = parseInt(record.opec_school_code, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 3. Fallback deterministic index
  return 1000 + index;
}

/**
 * Pure adapter: Converts Supabase DB row to Domain School interface
 */
export function mapSupabaseToDomainSchool(
  record: SupabaseSchoolRecord,
  index: number,
  seedSchools: School[]
): School {
  const id = parseNumericId(record, index, seedSchools);
  const fallback = seedSchools.find((s) => s.id === id);

  const name = formatSchoolName(record.name_en, record.name_th);
  const curriculum = normalizeCurriculum(record.curriculums);
  const location = formatLocation(record);
  const tuitionStart = record.pub_tuition_min_thb ?? fallback?.tuitionStart ?? 0;
  const rating = record.rating_avg ? Number(record.rating_avg.toFixed(1)) : fallback?.rating ?? 4.5;
  const reviewCount = record.review_count ?? fallback?.reviewCount ?? 0;
  const distance = fallback?.distance ?? Number((2 + (index % 15) * 0.8).toFixed(1));
  const language = fallback?.language ?? "English";
  const grades = formatGrades(record);
  const image =
    fallback?.image ||
    (record.logo_url && record.logo_url.startsWith("http") && !record.logo_url.includes("opec.go.th")
      ? record.logo_url
      : FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]);

  let badge: string | null = null;
  if (record.is_isat_member) {
    badge = "ISAT Member";
  } else if (rating >= 4.7 && reviewCount > 10) {
    badge = "Top Rated";
  } else if (fallback?.badge) {
    badge = fallback.badge;
  }

  const lastUpdated =
    record.pub_data_updated_at ||
    record.updated_at ||
    fallback?.lastUpdated ||
    "September 2026";

  return {
    id,
    name,
    curriculum,
    location,
    tuitionStart,
    rating,
    reviewCount,
    distance,
    language,
    grades,
    image,
    badge,
    lastUpdated,
  };
}

/**
 * Pure adapter: Converts Supabase DB row to Domain SchoolDetail interface
 */
export function mapSupabaseToDomainDetail(
  record: SupabaseSchoolRecord,
  school: School,
  fallbackDetail?: SchoolDetail
): SchoolDetail {
  const founded = record.year_established
    ? String(record.year_established)
    : fallbackDetail?.founded || "N/A";
  const students = record.student_count
    ? `${record.student_count.toLocaleString()} students`
    : fallbackDetail?.students || "N/A";
  const accreditation =
    record.accreditations && record.accreditations.length > 0
      ? record.accreditations
      : fallbackDetail?.accreditation ||
        (record.is_isat_member ? ["ISAT", "ONESQA"] : ["ONESQA", "OPEC"]);
  const website = record.official_website_url || fallbackDetail?.website || "";
  const about =
    fallbackDetail?.about ||
    `${school.name} is an international school in ${record.province || "Thailand"}, offering high academic standards, comprehensive campus facilities, and supportive student care.`;

  const fees: SchoolFee[] = fallbackDetail?.fees ? [...fallbackDetail.fees] : [];
  if (fees.length === 0) {
    if (record.pub_tuition_min_thb) {
      fees.push({
        label: "Annual Tuition (Starting)",
        amount: `฿${record.pub_tuition_min_thb.toLocaleString()} / yr`,
      });
      if (record.pub_tuition_max_thb && record.pub_tuition_max_thb > record.pub_tuition_min_thb) {
        fees.push({
          label: "Annual Tuition (Senior / Max)",
          amount: `฿${record.pub_tuition_max_thb.toLocaleString()} / yr`,
        });
      }
    } else {
      fees.push({ label: "Tuition", amount: "Contact school" });
    }
  }

  const gallery = fallbackDetail?.gallery || [
    school.image,
    FALLBACK_IMAGES[(school.id + 1) % FALLBACK_IMAGES.length],
    FALLBACK_IMAGES[(school.id + 2) % FALLBACK_IMAGES.length],
  ];

  const facilities = fallbackDetail?.facilities || [
    "Sports Complex & Playing Fields",
    "Science & Technology Laboratories",
    "Auditorium & Performing Arts Center",
    "Library & Digital Learning Commons",
    "Cafeteria & Clean Dining Space",
  ];

  const reviews: SchoolReview[] = fallbackDetail?.reviews || [];

  const safety: SchoolDetail["safety"] = fallbackDetail?.safety || {
    securityGuards: "24/7 Professional Security Guards Stationed & Patrol",
    cctv: "Full CCTV Monitoring & Perimeter Surveillance",
    medicalNurse: "Certified School Nurse & Medical Clinic On-site",
    safeguardingPolicy: record.pub_has_safeguarding_policy
      ? "Comprehensive Child Safeguarding & Welfare Policy Verified"
      : "School Safety Code of Conduct",
    visitorControl: "Strict Gated Entry & Visitor RFID Badge Verification",
    emergencyDrill: "Termly evacuation, fire safety, and emergency response drills",
    summary: "Campus safety protocols and student safeguarding standards maintained.",
    highlights: ["24/7 Gated Entry", "Dedicated Nurse", "CCTV Coverage"],
  };

  return {
    founded,
    students,
    accreditation,
    website,
    about,
    fees,
    gallery,
    facilities,
    reviews,
    safety,
    lastUpdated: school.lastUpdated || "September 2026",
  };
}

// ─── Scraped Data Mappers ────────────────────────────────────────────────────

function parseScrapedFees(item: any): SchoolFee[] {
  const fees: SchoolFee[] = [];

  // 1. Grade tuition lines
  if (Array.isArray(item.tuition_by_grade)) {
    for (const g of item.tuition_by_grade) {
      if (!g?.grade_level) continue;
      const amountText = g.annual_thb
        ? `฿${g.annual_thb.toLocaleString()} / yr`
        : g.semester_thb
        ? `฿${(g.semester_thb * 2).toLocaleString()} / yr`
        : "Contact school";
      fees.push({ label: `Tuition (${g.grade_level})`, amount: amountText });
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
  const seedSchools = initSeedSchools();
  const seedDetails = initSeedDetails();

  let schools: School[] = seedSchools;
  let details: Record<number, SchoolDetail> = seedDetails;

  // ── Step 1: Attempt to load from Supabase via Anti-Corruption Layer ──
  try {
    const res = await getSupabaseSchools({ limit: 1000 });
    if (res && Array.isArray(res.schools) && res.schools.length > 0) {
      console.info(`[schoolsApi] Connected to Supabase: loaded ${res.schools.length} schools.`);

      const mappedSchools: School[] = [];
      const mappedDetails: Record<number, SchoolDetail> = {};

      res.schools.forEach((record, index) => {
        const domainSchool = mapSupabaseToDomainSchool(record, index, seedSchools);
        const fallbackDetail = seedDetails[domainSchool.id];
        const domainDetail = mapSupabaseToDomainDetail(record, domainSchool, fallbackDetail);

        mappedSchools.push(domainSchool);
        mappedDetails[domainSchool.id] = domainDetail;
      });

      // Preserve any seed schools not in Supabase
      seedSchools.forEach((s) => {
        if (!mappedSchools.some((ms) => ms.id === s.id)) {
          mappedSchools.push(s);
          if (seedDetails[s.id]) {
            mappedDetails[s.id] = seedDetails[s.id];
          }
        }
      });

      schools = mappedSchools;
      details = mappedDetails;
    }
  } catch (error) {
    console.debug("[schoolsApi] Supabase fetch unavailable, using seed data:", error);
    schools = seedSchools;
    details = seedDetails;
  }

  // ── Step 2: Dynamically overlay scraped results from results.json ──
  try {
    const res = await fetch("/results.json");
    if (res.ok) {
      const scraped = await res.json();
      if (Array.isArray(scraped)) {
        for (const item of scraped) {
          applyScrapedItem(item, schools, details);
        }
      }
    }
  } catch (error) {
    console.debug("[schoolsApi] scraper results.json not loaded:", error);
  }

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

  // Build detail dynamically from School if not in pre-seeded cache
  const matchedSchool = data.schools.find((s) => s.id === id);
  if (matchedSchool) {
    return mapSupabaseToDomainDetail(
      {
        school_id: String(matchedSchool.id),
        slug: "",
        name_th: matchedSchool.name,
        name_en: matchedSchool.name,
        status: "active",
        province: matchedSchool.location,
        levels_offered: [matchedSchool.grades],
        curriculums: [matchedSchool.curriculum],
      } as SupabaseSchoolRecord,
      matchedSchool,
      data.details[1]
    );
  }

  return data.details[1];
}
