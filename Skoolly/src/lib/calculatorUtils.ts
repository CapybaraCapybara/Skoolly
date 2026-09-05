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
  annual_thb: number;
  semester_thb: number | null;
  notes?: string;
}

export interface ScrapedHiddenCost {
  name: string;
  amount_thb: number;
  notes?: string;
}

export interface ScrapedSchoolData {
  school_name: string;
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
  currency: "THB" | "USD" | "GBP" | "EUR" | "SGD" | "CNY";
}

export const CURRENCY_RATES: Record<string, { rate: number; symbol: string; label: string }> = {
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

/**
 * Format currency amount with symbol safely
 */
export function formatCurrency(amountTHB: number, currency: string = "THB"): string {
  const conf = CURRENCY_RATES[currency] || CURRENCY_RATES.THB;
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
 * Fallback grades when school tuition data is not broken down per grade
 */
export function getSchoolGrades(school?: ScrapedSchoolData): ScrapedTuitionGrade[] {
  if (school?.tuition_by_grade && school.tuition_by_grade.length > 0) {
    return school.tuition_by_grade;
  }
  const min = school?.tuition_min_thb || 520000;
  const max = school?.tuition_max_thb || 750000;
  const mid = Math.round((min + max) / 2);

  return [
    { grade_level: "Early Years / Kindergarten", annual_thb: min, semester_thb: Math.round(min / 2), notes: "Standard Early Years rate" },
    { grade_level: "Primary (Years 1–6 / Grades 1–5)", annual_thb: mid, semester_thb: Math.round(mid / 2), notes: "Standard Primary rate" },
    { grade_level: "Secondary & High School", annual_thb: max, semester_thb: Math.round(max / 2), notes: "Standard High School / Diploma rate" },
  ];
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
    school_name: "International School",
    homepage_url: "",
    status: "ok",
    page_scraped: "",
    curriculum: "International",
    tuition_found: true,
    tuition_by_grade: [],
    hidden_costs: [],
    tuition_min_thb: 500000,
    tuition_max_thb: 800000,
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
    name: "Application & Assessment Fee (Mandatory)",
    unitAmountTHB: appFee,
    totalAmountTHB: appFee,
    isOneTime: true,
    notes: hasAppFee
      ? (appFeeObj.notes || "Mandatory to submit enrollment application")
      : "ติดต่อโรงเรียน (ไม่มีระบุในเอกสารทางการ)",
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

  const hasRegFee = regFeeObj && typeof regFeeObj.amount_thb === "number";
  let regFee = hasRegFee ? regFeeObj.amount_thb : 0;
  // If alumni discount applies (e.g. Harrow THB 100,000 discount)
  if (hasRegFee && state.childTier === "alumni" && /harrow/i.test(safeSchool.school_name)) {
    regFee = Math.max(0, regFee - 100000);
  }

  oneTimeTotalTHB += regFee;
  lineItems.push({
    category: "One-Time Mandatory",
    name: "Registration & Entrance Fee (Mandatory)",
    unitAmountTHB: regFee,
    totalAmountTHB: regFee,
    isOneTime: true,
    notes: hasRegFee
      ? (regFeeObj.notes || "Non-refundable one-time enrollment admission fee")
      : "ติดต่อโรงเรียน (ไม่มีระบุในเอกสารทางการ)",
  });

  // Refundable Deposit (Mandatory)
  const depositObj = hiddenCosts.find((c) => c && c.name && /deposit/i.test(c.name) && !/boarding/i.test(c.name));
  const hasDeposit = depositObj && typeof depositObj.amount_thb === "number";
  const depositFee = hasDeposit ? depositObj.amount_thb : 0;
  oneTimeTotalTHB += depositFee;
  lineItems.push({
    category: "One-Time Mandatory",
    name: "Refundable Campus Deposit (Mandatory)",
    unitAmountTHB: depositFee,
    totalAmountTHB: depositFee,
    isOneTime: true,
    notes: hasDeposit
      ? (depositObj.notes || "Refundable upon withdrawal per school policy")
      : "ติดต่อโรงเรียน (ไม่มีระบุในเอกสารทางการ)",
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
          notes: addon.notes || "One-time campus service",
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
          notes: addon.notes || `Annualized (${multiplier > 1 ? `${multiplier}x per year` : "per year"})`,
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
      tuitionTHB: tuitionForYear,
      oneTimeTHB: oneTimeForYear,
      addonsTHB: addonsForYear,
      discountTHB: discountForYear,
      totalTHB: rowTotal,
    });
  }

  const startLabel = grades[startIndex]?.grade_level || "Grade 1";
  const endLabel = grades[Math.min(startIndex + duration - 1, grades.length - 1)]?.grade_level || `Grade ${duration}`;

  // Insert Base Tuition line item at position 3
  lineItems.splice(3, 0, {
    category: "Annual Tuition",
    name: `Base Tuition (${duration} year${duration > 1 ? "s" : ""})`,
    unitAmountTHB: Math.round(totalTuitionTHB / duration),
    totalAmountTHB: totalTuitionTHB,
    isOneTime: false,
    notes: `${startLabel} through to ${endLabel}`,
  });

  if (state.customSiblingDiscountPercent > 0) {
    lineItems.push({
      category: "Discount",
      name: `Simulated Family / Sibling Discount (${state.customSiblingDiscountPercent}%)`,
      unitAmountTHB: Math.round(totalDiscountTHB / duration),
      totalAmountTHB: -totalDiscountTHB,
      isOneTime: false,
      notes: "Simulated tuition reduction",
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
