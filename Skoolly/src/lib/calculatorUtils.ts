/**
 * lib/calculatorUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic calculation engine for international school costs in Thailand.
 * Real fee rates and grade tiers are ingested directly from results.json.
 * 
 * 100% Mathematical & formula-based — Zero AI dependencies.
 */

export interface ScrapedTuitionGrade {
  grade_level: string;
  order_start?: number | null;
  order_end?: number | null;
  display_name?: string | null;
  level_code?: string | null;
  annual_thb: number;
  semester_thb?: number | null;
  notes?: string;
}

export type FeeFrequency =
  | "once"
  | "per_year"
  | "per_semester"
  | "per_term"
  | "per_month"
  | "conditional"
  | "unknown";

export interface ScrapedHiddenCost {
  name: string;
  amount_thb: number;
  /** school_data.fee_frequency; "unknown" or missing falls back to reading the notes */
  frequency?: FeeFrequency | null;
  notes?: string;
}

export interface ScrapedSchoolData {
  school_name: string;
  /** OPEC school code, used to open the calculator on a school chosen elsewhere */
  school_code?: string | null;
  homepage_url?: string;
  status?: string;
  page_scraped?: string;
  curriculum?: string;
  tuition_found?: boolean;
  tuition_by_grade: ScrapedTuitionGrade[];
  hidden_costs: ScrapedHiddenCost[];
  tuition_min_thb?: number | null;
  tuition_max_thb?: number | null;
}

export interface CalculatorState {
  schoolName: string;
  startingGradeIndex: number;
  durationYears: number;
  // Selected add-ons, as indexes into the school's hidden_costs (names repeat across grades)
  selectedAddonIndexes: number[];
  // Child / Sibling status
  childTier: "first_child" | "second_child";
  currency: CurrencyCode;
}

export type CurrencyCode = "THB" | "USD" | "GBP" | "EUR" | "SGD" | "CNY";

// Rates below are offline fallbacks only; loadLiveCurrencyRates() overwrites them with the
// latest ECB reference rates when the calculator opens.
export const CURRENCY_RATES: Record<CurrencyCode, { rate: number; symbol: string; label: string }> = {
  THB: { rate: 1, symbol: "฿", label: "Thai Baht (THB)" },
  USD: { rate: 0.029, symbol: "$", label: "US Dollar (USD)" },
  GBP: { rate: 0.023, symbol: "£", label: "British Pound (GBP)" },
  EUR: { rate: 0.027, symbol: "€", label: "Euro (EUR)" },
  SGD: { rate: 0.038, symbol: "S$", label: "Singapore Dollar (SGD)" },
  CNY: { rate: 0.21, symbol: "¥", label: "Chinese Yuan (CNY)" },
};

export interface FeeItemBreakdown {
  category: "One-Time Mandatory" | "Annual Tuition" | "Selected Campus Add-on";
  name: string;
  unitAmountTHB: number;
  totalAmountTHB: number;
  isOneTime: boolean;
  notes?: string;
  /** Admission fee with no single amount: several rows by grade, or none published */
  amountUnknown?: "by_grade" | "missing";
}

export interface YearlyScheduleRow {
  yearNumber: number;
  gradeLabel: string;
  displayName?: string;
  tuitionTHB: number;
  oneTimeTHB: number;
  addonsTHB: number;
  totalTHB: number;
}

export interface CalculationResult {
  totalJourneyCostTHB: number;
  year1CostTHB: number;
  averageAnnualCostTHB: number;
  monthlyEquivalentTHB: number;
  oneTimeTotalTHB: number;
  totalTuitionTHB: number;
  totalAddonsTHB: number;
  lineItems: FeeItemBreakdown[];
  yearlySchedule: YearlyScheduleRow[];
}

export interface CurrencyRateInfo {
  live: boolean;
  /** Date the reference rates were published (YYYY-MM-DD), null when using fallbacks */
  date: string | null;
}

const RATES_URL = "https://api.frankfurter.dev/v1/latest";

/**
 * Fetch today's THB reference rates (European Central Bank via Frankfurter, free, no key)
 * and update CURRENCY_RATES in place. Keeps the fallback rates if the request fails.
 */
export async function loadLiveCurrencyRates(): Promise<CurrencyRateInfo> {
  const codes = (Object.keys(CURRENCY_RATES) as CurrencyCode[]).filter((c) => c !== "THB");
  try {
    const res = await fetch(`${RATES_URL}?base=THB&symbols=${codes.join(",")}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { date?: string; rates?: Record<string, number> } = await res.json();
    codes.forEach((code) => {
      const rate = data.rates?.[code];
      if (typeof rate === "number" && rate > 0) CURRENCY_RATES[code].rate = rate;
    });
    return { live: true, date: data.date ?? null };
  } catch (err) {
    console.debug("[calculator] live exchange rates unavailable, using fallback rates:", err);
    return { live: false, date: null };
  }
}

/**
 * Format currency amount with symbol safely
 */
export function formatCurrency(amountTHB: number, currency: CurrencyCode | string = "THB"): string {
  const conf = CURRENCY_RATES[currency as CurrencyCode] || CURRENCY_RATES.THB;
  const num = typeof amountTHB === "number" && !isNaN(amountTHB) ? amountTHB : 0;
  const converted = num * conf.rate;

  if (currency === "THB") {
    return `${conf.symbol}${Math.round(converted).toLocaleString("en-US")}`;
  }
  return `${conf.symbol}${Math.round(converted).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Grades with a published annual tuition. A grade without one is left out rather than
 * given a made-up price, so it cannot be picked in the calculator.
 */
export function getSchoolGrades(school?: ScrapedSchoolData): ScrapedTuitionGrade[] {
  return (school?.tuition_by_grade ?? []).filter((g) => typeof g.annual_thb === "number" && g.annual_thb > 0);
}

// "enrol" covers Enrolment/Enrollment; re-enrolment is charged again each year, so it isn't an entrance fee
const ENTRANCE_FEE_RE = /entrance|registration|admission|guaranteed|enrol/i;
const RE_ENROL_RE = /re-?\s?(enrol|registration)/i;
const SIBLING_FEE_RE = /second and subsequent|2nd child|second child|subsequent child|sibling/i;

function hasAmount(cost: ScrapedHiddenCost | undefined): cost is ScrapedHiddenCost {
  return Boolean(cost && typeof cost.amount_thb === "number");
}

/** Row behind an admission card; "by_grade" when several rows have amounts (one per grade), so none is picked */
export type FeePick = ScrapedHiddenCost | "by_grade" | undefined;

function pickFee(school: ScrapedSchoolData | null | undefined, test: (name: string) => boolean): FeePick {
  const rows = (school?.hidden_costs ?? []).filter((c) => c?.name && test(c.name));
  const priced = rows.filter(hasAmount);
  return priced.length > 1 ? "by_grade" : priced[0] ?? rows[0];
}

/** Rows for the application, entrance (first child / later child) and deposit cards */
export function findAdmissionFees(school?: ScrapedSchoolData | null) {
  return {
    application: pickFee(school, (n) => /application/i.test(n)),
    entrance: pickFee(school, (n) => ENTRANCE_FEE_RE.test(n) && !RE_ENROL_RE.test(n) && !SIBLING_FEE_RE.test(n)),
    // Sibling rows are tiers (second child, subsequent children), not grades: the first one is the second-child rate
    sibling: school?.hidden_costs?.find(
      (c) => hasAmount(c) && ENTRANCE_FEE_RE.test(c.name) && SIBLING_FEE_RE.test(c.name)
    ),
    deposit: pickFee(school, (n) => /deposit/i.test(n) && !/boarding/i.test(n)),
  };
}

/**
 * Helper to identify if an item is a sibling / alumni specific discount entry
 */
export function isSiblingOrAlumniEntry(cost: ScrapedHiddenCost): boolean {
  if (!cost || !cost.name) return false;
  const name = cost.name.toLowerCase();
  const notes = (cost.notes || "").toLowerCase();
  return (
    SIBLING_FEE_RE.test(name) ||
    name.includes("alumni") ||
    notes.includes("alumni") ||
    notes.includes("subsequent children")
  );
}

/**
 * Get dynamic optional add-on items that actually exist for this school in results.json
 */
export function getSchoolAvailableAddons(school?: ScrapedSchoolData): (ScrapedHiddenCost & { index: number })[] {
  if (!school?.hidden_costs) return [];
  const { application, entrance, deposit } = findAdmissionFees(school);
  const onCards: FeePick[] = [application, entrance, deposit];
  return school.hidden_costs
    .map((c, index) => ({ ...c, index }))
    .filter((c, i) => !onCards.includes(school.hidden_costs[i]) && !isSiblingOrAlumniEntry(c));
}

// Times a year each frequency is charged; 0 means only once, in year 1
const FREQUENCY_MULTIPLIER: Partial<Record<FeeFrequency, number>> = {
  once: 0,
  per_year: 1,
  per_semester: 2,
  per_term: 3,
  per_month: 12,
};

// Same phrases as FEE_FREQUENCY_PATTERNS in supabase_sync.py, for rows still marked unknown
const FREQUENCY_PATTERNS: [FeeFrequency, RegExp][] = [
  ["once", /\bonce\b|one[- ]?time|one[- ]?off|lump[- ]sum|ครั้งเดียว|แรกเข้า/i],
  ["per_year", /per (?:academic |school )?year|per annum|\bannual(?:ly)?\b|\byearly\b|a year\b|ต่อปี|รายปี/i],
  ["per_semester", /(?:per|each|a|every) semester|semesterly|\/\s?semester|ต่อภาค|รายภาค/i],
  ["per_term", /(?:per|each|a|every) term\b|\btermly\b|\/\s?term\b|\bterm (?:rate|fee)|\bterm 1\b|ต่อเทอม|รายเทอม/i],
  ["per_month", /per month|\bmonthly\b|a month\b|\/\s?month\b|ต่อเดือน|รายเดือน/i],
];

/** Frequency from the wording; the earliest phrase wins, since notes like "per year (or 10,000 per semester)" give two rates */
function guessFrequency(text: string): FeeFrequency | null {
  let best: { at: number; freq: FeeFrequency } | null = null;
  for (const [freq, re] of FREQUENCY_PATTERNS) {
    const at = text.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { at, freq };
  }
  return best?.freq ?? null;
}

/**
 * Annualized cost multiplier for an add-on item: the stored frequency when known,
 * otherwise read from the notes, then the name. Defaults to once a year.
 */
export function getAddonAnnualMultiplier(cost: ScrapedHiddenCost): number {
  const freq = (cost.frequency && FREQUENCY_MULTIPLIER[cost.frequency] !== undefined)
    ? cost.frequency
    : guessFrequency(cost.notes || "") ?? guessFrequency(cost.name);
  return (freq && FREQUENCY_MULTIPLIER[freq]) ?? 1;
}

/**
 * Core deterministic calculation function with dynamic school-specific add-ons
 */
export function calculateSchoolCosts(school: ScrapedSchoolData, state: CalculatorState): CalculationResult {
  const grades = getSchoolGrades(school);

  // 1. One-Time Mandatory Admission Costs: application, entrance (by child tier), deposit
  let oneTimeTotalTHB = 0;
  const lineItems: FeeItemBreakdown[] = [];
  const fees = findAdmissionFees(school);
  const admissionCards: [string, FeePick, string][] = [
    ["ค่าสมัคร", fees.application, ""],
    ["ค่าแรกเข้า", (state.childTier === "second_child" && fees.sibling) || fees.entrance, ""],
    ["เงินประกัน", fees.deposit, "คืนเมื่อลาออกหรือจบ"],
  ];
  for (const [name, row, defaultNote] of admissionCards) {
    const amount = row !== "by_grade" && hasAmount(row) ? row.amount_thb : null;
    oneTimeTotalTHB += amount ?? 0;
    lineItems.push({
      category: "One-Time Mandatory",
      name,
      unitAmountTHB: amount ?? 0,
      totalAmountTHB: amount ?? 0,
      isOneTime: true,
      notes: row === "by_grade" ? "เลือกตามชั้นในบริการเสริม" : amount === null ? "ไม่ระบุในเอกสาร" : (row?.notes || defaultNote),
      amountUnknown: row === "by_grade" ? "by_grade" : amount === null ? "missing" : undefined,
    });
  }

  // 2. Multi-Year Schedule & Annual Tuition
  // 17 = every year from pre-nursery to ม.6 (the 0-16 scale in grade_years.py)
  const duration = Math.max(1, Math.min(state.durationYears || 1, 17));
  const startIndex = Math.max(0, Math.min(state.startingGradeIndex || 0, Math.max(0, grades.length - 1)));

  // 3. Dynamic Add-ons calculation (Only for selected items that this school actually has)
  const availableAddons = getSchoolAvailableAddons(school);
  let annualAddonsPerYear = 0;
  let oneTimeAddonsTotal = 0;

  availableAddons.forEach((addon) => {
    if (state.selectedAddonIndexes.includes(addon.index)) {
      const multiplier = getAddonAnnualMultiplier(addon);
      if (multiplier === 0) {
        // One-time add-on (e.g. Learning Resources one-time)
        oneTimeAddonsTotal += addon.amount_thb;
        lineItems.push({
          category: "Selected Campus Add-on",
          name: addon.name,
          unitAmountTHB: addon.amount_thb,
          totalAmountTHB: addon.amount_thb,
          isOneTime: true,
          notes: addon.notes || "จ่ายครั้งเดียว",
        });
      } else {
        const annualCost = addon.amount_thb * multiplier;
        annualAddonsPerYear += annualCost;
        lineItems.push({
          category: "Selected Campus Add-on",
          name: addon.name,
          unitAmountTHB: annualCost,
          totalAmountTHB: annualCost * duration,
          isOneTime: false,
          notes: addon.notes || (multiplier > 1 ? `${multiplier} ครั้งต่อปี` : "ต่อปี"),
        });
      }
    }
  });

  oneTimeTotalTHB += oneTimeAddonsTotal;

  let totalTuitionTHB = 0;
  const totalAddonsTHB = annualAddonsPerYear * duration + oneTimeAddonsTotal;
  const yearlySchedule: YearlyScheduleRow[] = [];

  // Build year-by-year schedule
  for (let y = 0; y < duration; y++) {
    const gradeItem = grades[Math.min(startIndex + y, grades.length - 1)];
    if (!gradeItem) break;   // no grade has a published price: nothing to schedule
    const tuitionForYear = gradeItem.annual_thb as number;

    const oneTimeForYear = y === 0 ? oneTimeTotalTHB : 0;
    const addonsForYear = annualAddonsPerYear;
    const rowTotal = tuitionForYear + addonsForYear + oneTimeForYear;

    totalTuitionTHB += tuitionForYear;

    yearlySchedule.push({
      yearNumber: y + 1,
      gradeLabel: gradeItem.grade_level || `Grade ${y + 1}`,
      displayName: gradeItem.display_name || gradeItem.grade_level || `Grade ${y + 1}`,
      tuitionTHB: tuitionForYear,
      oneTimeTHB: oneTimeForYear,
      addonsTHB: addonsForYear,
      totalTHB: rowTotal,
    });
  }

  const startLabel = grades[startIndex]?.display_name || grades[startIndex]?.grade_level || "ชั้นปีที่ 1";
  const endLabel = grades[Math.min(startIndex + duration - 1, grades.length - 1)]?.display_name || grades[Math.min(startIndex + duration - 1, grades.length - 1)]?.grade_level || `ชั้นปีที่ ${duration}`;

  // Insert Base Tuition line item at position 3
  lineItems.splice(3, 0, {
    category: "Annual Tuition",
    name: `ค่าเทอม ${duration} ปี`,
    unitAmountTHB: Math.round(totalTuitionTHB / duration),
    totalAmountTHB: totalTuitionTHB,
    isOneTime: false,
    notes: `${startLabel} ถึง ${endLabel}`,
  });

  const totalJourneyCostTHB = totalTuitionTHB + (annualAddonsPerYear * duration) + oneTimeTotalTHB;
  const year1CostTHB = yearlySchedule.length > 0 ? yearlySchedule[0].totalTHB : 0;
  const averageAnnualCostTHB = Math.round(totalJourneyCostTHB / duration);
  const monthlyEquivalentTHB = Math.round(averageAnnualCostTHB / 12);

  return {
    totalJourneyCostTHB,
    year1CostTHB,
    averageAnnualCostTHB,
    monthlyEquivalentTHB,
    oneTimeTotalTHB,
    totalTuitionTHB,
    totalAddonsTHB,
    lineItems,
    yearlySchedule,
  };
}
