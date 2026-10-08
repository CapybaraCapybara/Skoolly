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

export interface ScrapedHiddenCost {
  name: string;
  amount_thb: number;
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
  // Selected dynamic add-on cost names from school's actual hidden_costs
  selectedAddonNames: string[];
  // Child / Sibling status
  childTier: "first_child" | "second_child" | "alumni";
  customSiblingDiscountPercent: number; // 0, 5, 10, 15
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
  category: "One-Time Mandatory" | "Annual Tuition" | "Selected Campus Add-on" | "Discount";
  name: string;
  unitAmountTHB: number;
  totalAmountTHB: number;
  isOneTime: boolean;
  notes?: string;
}

export interface YearlyScheduleRow {
  yearNumber: number;
  gradeLabel: string;
  displayName?: string;
  tuitionTHB: number;
  oneTimeTHB: number;
  addonsTHB: number;
  discountTHB: number;
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
  totalDiscountTHB: number;
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
 * Grades with published tuition. Returns an empty list rather than inventing tiers
 * when a school has no per-grade fees.
 */
export function getSchoolGrades(school?: ScrapedSchoolData): ScrapedTuitionGrade[] {
  return school?.tuition_by_grade ?? [];
}

/**
 * Helper to identify if an item is a mandatory one-time admission fee
 */
export function isMandatoryAdmissionFee(cost: ScrapedHiddenCost): boolean {
  if (!cost || !cost.name) return false;
  const name = cost.name.toLowerCase();
  return (
    name.includes("application") ||
    name.includes("entrance") ||
    name.includes("registration") ||
    name.includes("admission") ||
    name.includes("guaranteed place") ||
    name.includes("deposit")
  );
}

/**
 * Helper to identify if an item is a sibling / alumni specific discount entry
 */
export function isSiblingOrAlumniEntry(cost: ScrapedHiddenCost): boolean {
  if (!cost || !cost.name) return false;
  const name = cost.name.toLowerCase();
  const notes = (cost.notes || "").toLowerCase();
  return (
    name.includes("second and subsequent") ||
    name.includes("sibling") ||
    name.includes("alumni") ||
    notes.includes("alumni") ||
    notes.includes("subsequent children")
  );
}

/**
 * Get dynamic optional add-on items that actually exist for this school in results.json
 */
export function getSchoolAvailableAddons(school?: ScrapedSchoolData): ScrapedHiddenCost[] {
  if (!school?.hidden_costs) return [];
  return school.hidden_costs.filter(
    (c) => !isMandatoryAdmissionFee(c) && !isSiblingOrAlumniEntry(c)
  );
}

/**
 * Annualized cost multiplier for an add-on item based on notes (e.g. per semester = x2, per term = x3)
 */
export function getAddonAnnualMultiplier(cost: ScrapedHiddenCost): number {
  const notes = (cost.notes || "").toLowerCase();
  const name = cost.name.toLowerCase();
  if (notes.includes("semester") || name.includes("semester")) {
    return 2;
  }
  if (notes.includes("term") || name.includes("term")) {
    return 3;
  }
  if (notes.includes("once only") || notes.includes("one-time") || notes.includes("one-off")) {
    return 0; // 0 means charged only once in year 1
  }
  return 1; // standard per year
}

/**
 * Core deterministic calculation function with dynamic school-specific add-ons
 */
export function calculateSchoolCosts(
  school: ScrapedSchoolData | undefined,
  state: CalculatorState
): CalculationResult {
  const safeSchool: ScrapedSchoolData = school || {
    school_name: "โรงเรียนนานาชาติ",
    homepage_url: "",
    status: "ok",
    page_scraped: "",
    curriculum: "International",
    tuition_found: true,
    tuition_by_grade: [],
    hidden_costs: [],
    tuition_min_thb: null,
    tuition_max_thb: null,
  };

  const grades = getSchoolGrades(safeSchool);
  const hiddenCosts = safeSchool.hidden_costs || [];

  // 1. One-Time Mandatory Admission Costs (Non-optional)
  let oneTimeTotalTHB = 0;
  const lineItems: FeeItemBreakdown[] = [];

  // Application Fee (Mandatory)
  const appFeeObj = hiddenCosts.find((c) => c && c.name && /application/i.test(c.name));
  const hasAppFee = appFeeObj && typeof appFeeObj.amount_thb === "number";
  const appFee = hasAppFee ? appFeeObj.amount_thb : 0;
  oneTimeTotalTHB += appFee;
  lineItems.push({
    category: "One-Time Mandatory",
    name: "ค่าสมัคร",
    unitAmountTHB: appFee,
    totalAmountTHB: appFee,
    isOneTime: true,
    notes: hasAppFee ? (appFeeObj.notes || "") : "ไม่ระบุในเอกสาร",
  });

  // Registration / Entrance / Capital Fee (Mandatory, with child tier awareness)
  let regFeeObj: ScrapedHiddenCost | undefined;
  if (state.childTier === "second_child") {
    regFeeObj = hiddenCosts.find((c) => c && c.name && /second and subsequent/i.test(c.name));
  }
  if (!regFeeObj) {
    regFeeObj = hiddenCosts.find(
      (c) => c && c.name && !/second and subsequent/i.test(c.name) && /entrance|registration|admission|guaranteed/i.test(c.name)
    );
  }

  const hasRegFee = Boolean(regFeeObj && typeof regFeeObj.amount_thb === "number");
  let regFee = (regFeeObj && typeof regFeeObj.amount_thb === "number") ? regFeeObj.amount_thb : 0;
  // If alumni discount applies (e.g. Harrow THB 100,000 discount)
  if (hasRegFee && state.childTier === "alumni" && /harrow/i.test(safeSchool.school_name)) {
    regFee = Math.max(0, regFee - 100000);
  }

  oneTimeTotalTHB += regFee;
  lineItems.push({
    category: "One-Time Mandatory",
    name: "ค่าแรกเข้า",
    unitAmountTHB: regFee,
    totalAmountTHB: regFee,
    isOneTime: true,
    notes: regFeeObj ? (regFeeObj.notes || "") : "ไม่ระบุในเอกสาร",
  });

  // Refundable Deposit (Mandatory)
  const depositObj = hiddenCosts.find((c) => c && c.name && /deposit/i.test(c.name) && !/boarding/i.test(c.name));
  const hasDeposit = depositObj && typeof depositObj.amount_thb === "number";
  const depositFee = hasDeposit ? depositObj.amount_thb : 0;
  oneTimeTotalTHB += depositFee;
  lineItems.push({
    category: "One-Time Mandatory",
    name: "เงินประกัน",
    unitAmountTHB: depositFee,
    totalAmountTHB: depositFee,
    isOneTime: true,
    notes: hasDeposit ? (depositObj.notes || "คืนเมื่อลาออกหรือจบ") : "ไม่ระบุในเอกสาร",
  });

  // 2. Multi-Year Schedule & Annual Tuition
  const duration = Math.max(1, Math.min(state.durationYears || 1, 15));
  const startIndex = Math.max(0, Math.min(state.startingGradeIndex || 0, Math.max(0, grades.length - 1)));

  // 3. Dynamic Add-ons calculation (Only for selected items that this school actually has)
  const availableAddons = getSchoolAvailableAddons(safeSchool);
  let annualAddonsPerYear = 0;
  let oneTimeAddonsTotal = 0;

  availableAddons.forEach((addon) => {
    if (state.selectedAddonNames && state.selectedAddonNames.includes(addon.name)) {
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
  let totalAddonsTHB = annualAddonsPerYear * duration + oneTimeAddonsTotal;
  let totalDiscountTHB = 0;
  const yearlySchedule: YearlyScheduleRow[] = [];

  // Build year-by-year schedule
  for (let y = 0; y < duration; y++) {
    const gradeIdx = Math.min(startIndex + y, Math.max(0, grades.length - 1));
    const gradeItem = grades[gradeIdx] || { grade_level: `Year ${y + 1}`, annual_thb: 500000, semester_thb: null };
    const tuitionForYear = gradeItem.annual_thb || (gradeItem.semester_thb ? gradeItem.semester_thb * 2 : 500000);

    const oneTimeForYear = y === 0 ? oneTimeTotalTHB : 0;
    const addonsForYear = annualAddonsPerYear;

    // Sibling discount on tuition only
    const discountForYear = state.customSiblingDiscountPercent > 0
      ? Math.round(tuitionForYear * (state.customSiblingDiscountPercent / 100))
      : 0;

    const rowTotal = (tuitionForYear - discountForYear) + addonsForYear + oneTimeForYear;

    totalTuitionTHB += tuitionForYear;
    totalDiscountTHB += discountForYear;

    yearlySchedule.push({
      yearNumber: y + 1,
      gradeLabel: gradeItem.grade_level || `Grade ${y + 1}`,
      displayName: gradeItem.display_name || gradeItem.grade_level || `Grade ${y + 1}`,
      tuitionTHB: tuitionForYear,
      oneTimeTHB: oneTimeForYear,
      addonsTHB: addonsForYear,
      discountTHB: discountForYear,
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

  if (state.customSiblingDiscountPercent > 0) {
    lineItems.push({
      category: "Discount",
      name: `ส่วนลดพี่น้อง ${state.customSiblingDiscountPercent}%`,
      unitAmountTHB: Math.round(totalDiscountTHB / duration),
      totalAmountTHB: -totalDiscountTHB,
      isOneTime: false,
      notes: "ลดจากค่าเทอม",
    });
  }

  const totalJourneyCostTHB = (totalTuitionTHB - totalDiscountTHB) + (annualAddonsPerYear * duration) + oneTimeTotalTHB;
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
    totalDiscountTHB,
    lineItems,
    yearlySchedule,
  };
}
