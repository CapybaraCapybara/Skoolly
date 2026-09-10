import { useState, useEffect, useMemo } from "react";
import {
  Calculator,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  Download,
  Share2,
  Building2,
  Clock,
  Layers,
  Search,
  X,
  Users,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CALCULATOR_SEED_SCHOOLS } from "@/lib/calculatorSeed";
import {
  ScrapedSchoolData,
  CalculatorState,
  calculateSchoolCosts,
  formatCurrency,
  getSchoolGrades,
  getSchoolAvailableAddons,
  getAddonAnnualMultiplier,
  CURRENCY_RATES,
} from "@/lib/calculatorUtils";

interface CostCalculatorPageProps {
  initialSchoolId?: number;
  onBack: () => void;
  onSelectSchool?: (id: number) => void;
}

const DEFAULT_SCHOOLS: ScrapedSchoolData[] = CALCULATOR_SEED_SCHOOLS;

export function CostCalculatorPage({
  initialSchoolId,
  onBack,
}: CostCalculatorPageProps) {
  const [schoolsData, setSchoolsData] = useState<ScrapedSchoolData[]>(DEFAULT_SCHOOLS);
  const [selectedSchoolIndex, setSelectedSchoolIndex] = useState<number | null>(() => {
    if (initialSchoolId && initialSchoolId > 0 && initialSchoolId <= DEFAULT_SCHOOLS.length) {
      return initialSchoolId - 1;
    }
    return null;
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showYearlyTable, setShowYearlyTable] = useState<boolean>(true);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Form State
  const [calcState, setCalcState] = useState<CalculatorState>({
    schoolName: "",
    startingGradeIndex: 0,
    durationYears: 6,
    selectedAddonNames: [],
    childTier: "first_child",
    customSiblingDiscountPercent: 0,
    currency: "THB",
  });

  // Dynamic fetch in case results.json was updated at runtime
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/results.json");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setSchoolsData(data);
          }
        }
      } catch (err) {
        console.debug("Runtime results.json fetch bypassed, using bundled seed data:", err);
      }
    }
    loadData();
  }, []);

  const currentSchool =
    selectedSchoolIndex !== null && selectedSchoolIndex >= 0 && selectedSchoolIndex < schoolsData.length
      ? schoolsData[selectedSchoolIndex]
      : null;

  const grades = useMemo(() => {
    return currentSchool ? getSchoolGrades(currentSchool) : [];
  }, [currentSchool]);

  const availableAddons = useMemo(() => {
    return currentSchool ? getSchoolAvailableAddons(currentSchool) : [];
  }, [currentSchool]);

  // Check if current school has specific sibling discount in scraped data
  const hasPatanaSiblingDiscount = useMemo(() => {
    return Boolean(
      currentSchool?.hidden_costs?.some((c) =>
        c.name.toLowerCase().includes("second and subsequent")
      )
    );
  }, [currentSchool]);

  // Check if current school has alumni discount entry
  const hasHarrowAlumniDiscount = useMemo(() => {
    return Boolean(
      currentSchool?.hidden_costs?.some((c) =>
        (c.notes || "").toLowerCase().includes("alumni")
      )
    );
  }, [currentSchool]);

  // Filtered schools for search dropdown (no fee shown)
  const filteredSchools = useMemo(() => {
    if (!searchQuery.trim()) return schoolsData;
    const q = searchQuery.toLowerCase();
    return schoolsData.filter(
      (s) =>
        s.school_name.toLowerCase().includes(q) ||
        (s.curriculum && s.curriculum.toLowerCase().includes(q))
    );
  }, [schoolsData, searchQuery]);

  // Maximum duration years remaining from current starting grade
  const maxDurationYears = Math.max(
    1,
    grades.length > 0 ? grades.length - calcState.startingGradeIndex : 1
  );

  // When starting grade changes, clamp duration to remaining years
  const handleStartingGradeChange = (newIdx: number) => {
    const newMaxYears = Math.max(1, grades.length - newIdx);
    setCalcState((prev) => ({
      ...prev,
      startingGradeIndex: newIdx,
      durationYears: Math.min(prev.durationYears, newMaxYears),
    }));
  };

  // Update startingGradeIndex and duration bounds if school changes
  useEffect(() => {
    if (!currentSchool) return;
    const validStartIndex = Math.min(calcState.startingGradeIndex, Math.max(0, grades.length - 1));
    const validMaxYears = Math.max(1, grades.length - validStartIndex);
    setCalcState((prev) => ({
      ...prev,
      startingGradeIndex: validStartIndex,
      durationYears: Math.min(prev.durationYears, validMaxYears),
      childTier: "first_child",
      selectedAddonNames: [],
    }));
  }, [selectedSchoolIndex, currentSchool, grades.length]);

  // Calculate costs deterministically
  const results = useMemo(() => {
    if (!currentSchool) return null;
    return calculateSchoolCosts(currentSchool, calcState);
  }, [currentSchool, calcState]);

  // Extract mandatory fee amounts for current school (or null if not published in scraped data)
  const mandatoryAppFee = useMemo(() => {
    if (!currentSchool) return null;
    const item = currentSchool?.hidden_costs?.find((c) => /application/i.test(c.name));
    return item && typeof item.amount_thb === "number" ? item.amount_thb : null;
  }, [currentSchool]);

  const mandatoryRegFee = useMemo(() => {
    if (!currentSchool) return null;
    if (calcState.childTier === "second_child") {
      const item2 = currentSchool?.hidden_costs?.find((c) => /second and subsequent/i.test(c.name));
      if (item2 && typeof item2.amount_thb === "number") return item2.amount_thb;
    }
    const item = currentSchool?.hidden_costs?.find(
      (c) => !/second and subsequent/i.test(c.name) && /entrance|registration|admission|guaranteed/i.test(c.name)
    );
    if (!item || typeof item.amount_thb !== "number") return null;
    let fee = item.amount_thb;
    if (calcState.childTier === "alumni" && /harrow/i.test(currentSchool.school_name)) {
      fee = Math.max(0, fee - 100000);
    }
    return fee;
  }, [currentSchool, calcState.childTier]);

  const mandatoryDeposit = useMemo(() => {
    if (!currentSchool) return null;
    const item = currentSchool?.hidden_costs?.find(
      (c) => /deposit/i.test(c.name) && !/boarding/i.test(c.name)
    );
    return item && typeof item.amount_thb === "number" ? item.amount_thb : null;
  }, [currentSchool]);


  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const curr = calcState.currency;

  return (
    <div className="min-h-screen bg-warm-bg text-warm-charcoal pb-32 lg:pb-24 selection:bg-warm-bronze/20">
      {/* ── TOP HEADER / BREADCRUMB ─────────────────────────────────────────── */}
      <div className="border-b border-warm-accent/40 bg-warm-cream/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-warm-charcoal/70 hover:text-warm-bronze transition-colors px-3 py-1.5 rounded-full border border-warm-accent bg-warm-cream cursor-pointer"
            >
              <ArrowLeft className="size-3.5" /> Back
            </button>
            <div className="h-4 w-px bg-warm-accent" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-bronze text-white shadow-xs">
                <Calculator className="size-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-warm-charcoal tracking-tight leading-none">
                  Tuition & Cost Calculator
                </h1>
                <span className="text-[11px] text-warm-charcoal/60">
                  Direct formula calculation · Real scraped fee schedules
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Currency Selector */}
            <div className="flex items-center rounded-full border border-warm-accent bg-warm-cream p-1 shadow-2xs">
              {(Object.keys(CURRENCY_RATES) as (keyof typeof CURRENCY_RATES)[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCalcState((prev) => ({ ...prev, currency: c }))}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${calcState.currency === c
                    ? "bg-warm-charcoal text-white shadow-xs"
                    : "text-warm-charcoal/60 hover:text-warm-charcoal hover:bg-warm-accent/40"
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="hidden sm:inline-flex rounded-full border-warm-accent bg-warm-cream text-warm-charcoal hover:bg-warm-accent/50 text-xs gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5" /> Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="rounded-full border-warm-accent bg-warm-cream text-warm-charcoal hover:bg-warm-accent/50 text-xs gap-1.5 cursor-pointer"
            >
              <Share2 className="size-3.5" />
              {copiedNotification ? "Link Copied!" : "Share"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── HERO BANNER ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-warm-accent/50">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-warm-accent/50 text-warm-charcoal mb-2 border border-warm-accent">
              <Sparkles className="size-3.5 text-warm-bronze" /> 100% Transparent Fee Schedules
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-medium text-warm-charcoal tracking-tight">
              Plan your child's complete schooling budget
            </h2>
            <p className="text-sm text-warm-charcoal/70 mt-1.5 max-w-2xl">
              Calculate total education expenses from early years to graduation. Includes accurate tuition tiers, mandatory admission fees, bus transport, catering, and sibling discounts.
            </p>
          </div>
        </div>
      </div>

      {/* ── MAIN 2-COLUMN LAYOUT ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ════════ LEFT COLUMN: CONFIGURATION CONTROLS (7 Cols) ════════════ */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* 1. School Selector (Search & Dropdown - No tuition shown) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs relative">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <Building2 className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    1. Select International School
                  </h3>
                </div>
                <span className="text-xs text-warm-charcoal/50 font-medium">
                  {schoolsData.length} schools available
                </span>
              </div>

              {/* Search & Dropdown Input */}
              <div className="relative">
                <div className="relative flex items-center">
                  <Search className="size-4 text-warm-charcoal/50 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Search school name or curriculum (e.g. Patana, British, IB)..."
                    className="w-full rounded-2xl border border-warm-accent bg-warm-card pl-10 pr-10 py-3 text-sm font-medium text-warm-charcoal placeholder:text-warm-charcoal/40 focus:border-warm-bronze focus:outline-none transition-colors"
                  />
                  {searchQuery ? (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setIsDropdownOpen(false);
                      }}
                      className="absolute right-3.5 text-warm-charcoal/50 hover:text-warm-charcoal cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-3.5 text-warm-charcoal/50 hover:text-warm-charcoal cursor-pointer"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Menu (No tuition shown per request) */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-40 max-h-64 overflow-y-auto rounded-2xl border border-warm-accent bg-warm-cream shadow-xl divide-y divide-warm-accent/40">
                    {filteredSchools.length > 0 ? (
                      filteredSchools.map((sch) => {
                        const originalIdx = schoolsData.indexOf(sch);
                        const isSelected = selectedSchoolIndex === originalIdx;
                        return (
                          <button
                            key={sch.school_name}
                            onClick={() => {
                              setSelectedSchoolIndex(originalIdx);
                              setIsDropdownOpen(false);
                              setSearchQuery("");
                            }}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-warm-card/80 cursor-pointer ${isSelected ? "bg-warm-card font-bold text-warm-bronze" : "text-warm-charcoal"
                              }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold text-warm-charcoal">
                                {sch.school_name}
                              </span>
                              <span className="text-xs text-warm-charcoal/60">
                                {sch.curriculum ? `${sch.curriculum} Curriculum` : "International"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-warm-accent bg-warm-cream text-warm-charcoal">
                                {sch.curriculum || "International"}
                              </Badge>
                              {isSelected && <Check className="size-4 text-warm-bronze" />}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-xs text-warm-charcoal/60">
                        No schools found matching "{searchQuery}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected School Active Card (Empty by default) */}
              {currentSchool ? (
                <div className="mt-3.5 p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card/70 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-warm-bronze text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {currentSchool.school_name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-warm-charcoal line-clamp-1">
                        {currentSchool.school_name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-warm-charcoal/70 mt-0.5">
                        <span className="font-medium text-warm-bronze">
                          {currentSchool.curriculum || "International Curriculum"}
                        </span>
                        {currentSchool.page_scraped && (
                          <>
                            <span>·</span>
                            <a
                              href={currentSchool.page_scraped}
                              target="_blank"
                              rel="noreferrer"
                              className="text-warm-charcoal/60 underline hover:text-warm-bronze"
                            >
                              Official Fee Schedule ↗
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="text-xs font-semibold text-warm-bronze hover:underline px-2.5 py-1 rounded-full border border-warm-accent bg-warm-cream cursor-pointer"
                  >
                    Change School
                  </button>
                </div>
              ) : null}
            </div>

            {/* 2. Grade Stage & Duration (Dynamically Clamped to Remaining Years) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                  <Clock className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                  2. Starting Grade & Duration
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Starting Grade Selector */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal/80 mb-2">
                    Starting Grade Level
                  </label>
                  <select
                    disabled={!currentSchool}
                    value={calcState.startingGradeIndex}
                    onChange={(e) => handleStartingGradeChange(Number(e.target.value))}
                    className="w-full rounded-2xl border border-warm-accent bg-warm-card px-3.5 py-2.5 text-xs font-semibold text-warm-charcoal focus:border-warm-bronze focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {grades.length > 0 ? (
                      grades.map((g, idx) => {
                        const yearsLeft = grades.length - idx;
                        return (
                          <option key={idx} value={idx}>
                            {g.grade_level} (Max {yearsLeft} yr{yearsLeft > 1 ? "s" : ""} to graduation)
                          </option>
                        );
                      })
                    ) : (
                      <option value={0}>— กรุณาเลือกโรงเรียนก่อน —</option>
                    )}
                  </select>
                  <span className="text-[11px] text-warm-charcoal/60 mt-1.5 block">
                    {currentSchool && grades.length > 0 ? (
                      <>
                        Starting at {grades[calcState.startingGradeIndex]?.grade_level || "selected grade"} leaves <strong>{maxDurationYears} year{maxDurationYears > 1 ? "s" : ""} max</strong> to graduation.
                      </>
                    ) : (
                      "กรุณาเลือกโรงเรียนเพื่อแสดงระดับชั้น"
                    )}
                  </span>
                </div>

                {/* Duration Slider Clamped to maxDurationYears */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-warm-charcoal/80">
                      Study Duration
                    </label>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-warm-charcoal text-white">
                      {calcState.durationYears} {calcState.durationYears > 1 ? "Years" : "Year"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={maxDurationYears}
                    step="1"
                    value={calcState.durationYears}
                    onChange={(e) =>
                      setCalcState((prev) => ({
                        ...prev,
                        durationYears: Math.min(Number(e.target.value), maxDurationYears),
                      }))
                    }
                    className="w-full cursor-pointer h-2 bg-warm-accent rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[10px] text-warm-charcoal/50 mt-1">
                    <span>1 yr</span>
                    {maxDurationYears > 3 && (
                      <span>{Math.round(maxDurationYears / 2)} yrs</span>
                    )}
                    <span className="font-semibold text-warm-bronze">
                      Max {maxDurationYears} yrs (to {grades[grades.length - 1]?.grade_level?.split(' ')[0] || "Graduation"})
                    </span>
                  </div>
                  <span className="text-[11px] text-warm-charcoal/70 mt-1.5 block">
                    Range: <strong>{grades[calcState.startingGradeIndex]?.grade_level || "Year 1"}</strong> through <strong>{grades[Math.min(calcState.startingGradeIndex + calcState.durationYears - 1, grades.length - 1)]?.grade_level || "Final Year"}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 3. One-Time Mandatory Admission Fees (Non-optional, Mandatory for Enrollment) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <ShieldCheck className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    3. One-Time Mandatory Admission Fees (ค่าแรกเข้าภาคบังคับ)
                  </h3>
                </div>
                <Badge className="bg-warm-charcoal text-white text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
                  บังคับชำระ (Mandatory)
                </Badge>
              </div>
              <p className="text-xs text-warm-charcoal/70 mb-4">
                รายการค่าธรรมเนียมแรกเข้าภาคบังคับ ชำระเฉพาะปีแรกที่เข้าเรียน ไม่สามารถข้ามได้เนื่องจากเป็นเงื่อนไขในการขึ้นทะเบียนนักเรียน
              </p>

              {/* Cards showing the 3 mandatory fees */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {/* Application Fee Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        Application Fee
                      </span>
                      {mandatoryAppFee !== null ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          บังคับ
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-warm-charcoal/60 bg-warm-accent/40 border border-warm-accent px-1.5 py-0.5 rounded">
                          ไม่มีระบุในเอกสาร
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-warm-charcoal mt-1">
                      {mandatoryAppFee !== null ? (
                        formatCurrency(mandatoryAppFee, curr)
                      ) : (
                        <span className="text-xs text-warm-bronze font-semibold">
                          ติดต่อโรงเรียน
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryAppFee !== null
                      ? "ค่าสมัครและประเมินพัฒนาการ (ไม่คืนเงิน)"
                      : "ไม่มีระบุในเอกสารทางการ (โปรดติดต่อโรงเรียน)"}
                  </span>
                </div>

                {/* Registration Fee Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        Entrance Fee
                      </span>
                      {mandatoryRegFee !== null ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          บังคับ
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-warm-charcoal/60 bg-warm-accent/40 border border-warm-accent px-1.5 py-0.5 rounded">
                          ไม่มีระบุในเอกสาร
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-warm-charcoal mt-1">
                      {mandatoryRegFee !== null ? (
                        formatCurrency(mandatoryRegFee, curr)
                      ) : (
                        <span className="text-xs text-warm-bronze font-semibold">
                          ติดต่อโรงเรียน
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryRegFee !== null
                      ? "ค่าแรกเข้าและสิทธิ์ขึ้นทะเบียน (ไม่คืนเงิน)"
                      : "ไม่มีระบุในเอกสารทางการ (โปรดติดต่อโรงเรียน)"}
                  </span>
                </div>

                {/* Refundable Deposit Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        Refundable Deposit
                      </span>
                      {mandatoryDeposit !== null ? (
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                          คืนเงินได้
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-warm-charcoal/60 bg-warm-accent/40 border border-warm-accent px-1.5 py-0.5 rounded">
                          ไม่มีระบุในเอกสาร
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-warm-charcoal mt-1">
                      {mandatoryDeposit !== null ? (
                        formatCurrency(mandatoryDeposit, curr)
                      ) : (
                        <span className="text-xs text-warm-bronze font-semibold">
                          ติดต่อโรงเรียน
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryDeposit !== null
                      ? "เงินมัดจำความเสียหาย (คืนเมื่อลาออก/จบ)"
                      : "ไม่มีระบุในเอกสารทางการ (โปรดติดต่อโรงเรียน)"}
                  </span>
                </div>
              </div>

              {/* Official Refundable Deposit Scraped Note (Or contact school if not present) */}
              {currentSchool?.hidden_costs?.find((c) => /deposit/i.test(c.name) && !/boarding/i.test(c.name))?.notes ? (
                <div className="p-3.5 rounded-2xl border border-warm-accent/70 bg-warm-bg/70 text-xs text-warm-charcoal/80 flex items-start gap-2.5">
                  <Info className="size-4 text-warm-bronze shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-warm-charcoal">เงื่อนไขจากเอกสารทางการ:</span>
                    <p className="text-[11px] text-warm-charcoal/70 mt-0.5">
                      {currentSchool.hidden_costs.find((c) => /deposit/i.test(c.name) && !/boarding/i.test(c.name))?.notes}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl border border-warm-accent/70 bg-warm-bg/60 text-xs text-warm-charcoal/70 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 text-warm-charcoal/40 shrink-0" />
                    <span className="text-[11px]">ไม่มีข้อมูลเงื่อนไขเงินมัดจำระบุในเอกสารทางการ</span>
                  </div>
                  <span className="text-xs font-semibold text-warm-bronze shrink-0">ติดต่อโรงเรียน</span>
                </div>
              )}
            </div>

            {/* 4. Add-on Services (Rendered Dynamically Based on School's Actual Scraped Data) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <Layers className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    4. Add-on Services (ค่าบริการเสริม)
                  </h3>
                </div>
                <span className="text-xs text-warm-charcoal/60">
                  {availableAddons.length} รายการที่โรงเรียนมีระบุ
                </span>
              </div>
              <p className="text-xs text-warm-charcoal/70 mb-4">
                สามารถเลือกติ๊กเฉพาะรายการที่ต้องการใช้บริการได้
              </p>

              {availableAddons.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableAddons.map((addon) => {
                    const isChecked = calcState.selectedAddonNames.includes(addon.name);
                    const multiplier = getAddonAnnualMultiplier(addon);
                    const annualizedCost = multiplier === 0 ? addon.amount_thb : addon.amount_thb * multiplier;

                    return (
                      <div
                        key={addon.name}
                        onClick={() => {
                          setCalcState((prev) => {
                            const next = isChecked
                              ? prev.selectedAddonNames.filter((n) => n !== addon.name)
                              : [...prev.selectedAddonNames, addon.name];
                            return { ...prev, selectedAddonNames: next };
                          });
                        }}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${isChecked
                          ? "border-warm-bronze bg-warm-card ring-1 ring-warm-bronze shadow-xs"
                          : "border-warm-accent bg-warm-bg/70 hover:border-warm-bronze/50 opacity-75"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="size-4 rounded accent-warm-bronze cursor-pointer pointer-events-none"
                            />
                            <span className="text-xs font-bold text-warm-charcoal">
                              {addon.name}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-warm-bronze shrink-0">
                            {formatCurrency(addon.amount_thb, curr)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-warm-charcoal/60 pt-1 border-t border-warm-accent/40">
                          <span className="line-clamp-1">
                            {addon.notes || (multiplier === 0 ? "จ่ายครั้งเดียว" : "ตามรอบปีการศึกษา")}
                          </span>
                          {multiplier > 1 && (
                            <span className="text-warm-bronze font-semibold shrink-0 ml-2">
                              ~{formatCurrency(annualizedCost, curr)}/ปี
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-warm-accent/70 bg-warm-bg/60 text-center flex flex-col items-center gap-1.5">
                  <Info className="size-5 text-warm-charcoal/40" />
                  <span className="text-xs font-semibold text-warm-charcoal">
                    โรงเรียนนี้ไม่มีรายการค่าบริการเสริมระบุในเอกสารค่าธรรมเนียมทางการ
                  </span>
                  <p className="text-[11px] text-warm-charcoal/60 max-w-md">
                    ค่าบริการเสริม เช่น รถรับส่ง หรืออาหารกลางวัน อาจรวมอยู่ในค่าเทอมหลักแล้ว หรือจัดการโดยผู้ให้บริการภายนอก โปรดติดต่อโรงเรียนโดยตรง
                  </p>
                </div>
              )}
            </div>

            {/* 5. Sibling & Family Discounts (Rendered Dynamically Based on School's Policy) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-warm-bronze" />
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    5. Sibling & Family Discount (ส่วนลดครอบครัว)
                  </h3>
                </div>
              </div>

              {/* Case 1: School has explicit sibling entry in results.json (e.g. Bangkok Patana) */}
              {hasPatanaSiblingDiscount ? (
                <div className="space-y-3">
                  <p className="text-xs text-warm-charcoal/70">
                    โรงเรียนนี้มีระบุส่วนลดค่าแรกเข้าสำหรับบุตรคนที่สองและคนถัดไปอย่างเป็นทางการในเอกสาร:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setCalcState((p) => ({ ...p, childTier: "first_child" }))}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${calcState.childTier === "first_child"
                        ? "border-warm-bronze bg-warm-card ring-1 ring-warm-bronze shadow-xs"
                        : "border-warm-accent bg-warm-bg/70 hover:border-warm-bronze/50"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-warm-charcoal">บุตรคนแรก (First Child)</span>
                        {calcState.childTier === "first_child" && <Check className="size-3.5 text-warm-bronze" />}
                      </div>
                      <span className="text-[11px] text-warm-charcoal/60 mt-1">
                        ค่าแรกเข้าอัตราปกติ: ฿250,000
                      </span>
                    </button>

                    <button
                      onClick={() => setCalcState((p) => ({ ...p, childTier: "second_child" }))}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${calcState.childTier === "second_child"
                        ? "border-emerald-600 bg-emerald-50/80 ring-1 ring-emerald-600 shadow-xs"
                        : "border-warm-accent bg-warm-bg/70 hover:border-emerald-500/50"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">บุตรคนที่สองขึ้นไป (Second Child)</span>
                        <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">ลด ฿50,000</Badge>
                      </div>
                      <span className="text-[11px] text-emerald-800/80 mt-1">
                        ค่าแรกเข้าลดเหลือ: ฿200,000 (ตามประกาศทางการ)
                      </span>
                    </button>
                  </div>
                </div>
              ) : hasHarrowAlumniDiscount ? (
                /* Case 2: Harrow alumni discount */
                <div className="space-y-3">
                  <p className="text-xs text-warm-charcoal/70">
                    โรงเรียนนี้มีระบุส่วนลดค่าแรกเข้าสำหรับบุตรของศิษย์เก่าในเอกสารทางการ:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setCalcState((p) => ({ ...p, childTier: "first_child" }))}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${calcState.childTier !== "alumni"
                        ? "border-warm-bronze bg-warm-card ring-1 ring-warm-bronze shadow-xs"
                        : "border-warm-accent bg-warm-bg/70 hover:border-warm-bronze/50"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-warm-charcoal">นักเรียนทั่วไป (Standard Student)</span>
                        {calcState.childTier !== "alumni" && <Check className="size-3.5 text-warm-bronze" />}
                      </div>
                      <span className="text-[11px] text-warm-charcoal/60 mt-1">
                        ค่าแรกเข้าอัตราปกติ: ฿225,000
                      </span>
                    </button>

                    <button
                      onClick={() => setCalcState((p) => ({ ...p, childTier: "alumni" }))}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${calcState.childTier === "alumni"
                        ? "border-emerald-600 bg-emerald-50/80 ring-1 ring-emerald-600 shadow-xs"
                        : "border-warm-accent bg-warm-bg/70 hover:border-emerald-500/50"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">บุตรของศิษย์เก่า (Alumni Family)</span>
                        <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">ลด ฿100,000</Badge>
                      </div>
                      <span className="text-[11px] text-emerald-800/80 mt-1">
                        ค่าแรกเข้าลดเหลือ: ฿125,000 (ตามประกาศทางการ)
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Case 3: School has no official sibling discount entry in scraped results ("อันไหนไม่มีก็ว่างไว้") */
                <div className="p-6 rounded-2xl border border-warm-accent/70 bg-warm-bg/60 text-center flex flex-col items-center gap-1.5">
                  <Info className="size-5 text-warm-charcoal/40" />
                  <span className="text-xs font-semibold text-warm-charcoal">
                    ไม่มีรายการส่วนลดพี่น้องระบุในตารางค่าธรรมเนียมทางการของโรงเรียนนี้
                  </span>
                  <p className="text-[11px] text-warm-charcoal/60 max-w-md">
                    โรงเรียนไม่ได้ระบุอัตราส่วนลดพี่น้องในประกาศสาธารณะ (ว่างไว้ — ไม่มีตัวเลือกส่วนลดให้เลือก เงื่อนไขส่วนลดเป็นไปตามการพิจารณาของฝ่ายรับสมัคร)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ════════ RIGHT COLUMN: RESULTS & BREAKDOWN DASHBOARD (5 Cols) ════ */}
          <div id="cost-dashboard" className="lg:col-span-5 flex flex-col gap-6 sticky top-20">
            {/* Main Total Banner Card */}
            <div className="p-6 sm:p-8 rounded-3xl border border-warm-accent bg-warm-charcoal text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-warm-bronze/15 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <Badge className="bg-warm-bronze text-white text-xs px-2.5 py-0.5 border-0 rounded-full font-medium">
                    {calcState.durationYears}-Year Projected Total
                  </Badge>
                  <span className="text-xs text-white/60 font-medium line-clamp-1">
                    {currentSchool?.school_name || "ยังไม่ได้เลือกโรงเรียน"}
                  </span>
                </div>

                <div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
                    {results ? formatCurrency(results.totalJourneyCostTHB, curr) : "฿0"}
                  </div>
                  <span className="text-xs text-white/60 mt-1 block">
                    {currentSchool ? `Calculated over ${calcState.durationYears} school years (${curr})` : "กรุณาเลือกโรงเรียนเพื่อเริ่มคำนวณงบประมาณ"}
                  </span>
                </div>

                {/* Sub Stats Grid */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      Year 1 Upfront
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.year1CostTHB, curr) : "฿0"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      Annual Avg
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.averageAnnualCostTHB, curr) : "฿0"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      Monthly Equiv.
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.monthlyEquivalentTHB, curr) : "฿0"}
                    </span>
                  </div>
                </div>

                {/* Visual Distribution Bar */}
                {results && results.totalJourneyCostTHB > 0 && (
                  <div className="pt-2">
                    <div className="flex justify-between text-[11px] text-white/70 mb-1.5 font-medium">
                      <span>Expense Allocation</span>
                      <span>100% Verified</span>
                    </div>
                    <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex gap-0.5">
                      <div
                        style={{
                          width: `${Math.round(
                            (results.totalTuitionTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-warm-bronze"
                        title="Tuition"
                      />
                      <div
                        style={{
                          width: `${Math.round(
                            (results.oneTimeTotalTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-teal-500"
                        title="One-Time Mandatory Admission"
                      />
                      <div
                        style={{
                          width: `${Math.round(
                            (results.totalAddonsTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-amber-400"
                        title="Selected Add-on Services"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/70 mt-2">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-warm-bronze" /> Base Tuition (
                        {Math.round(
                          (results.totalTuitionTHB / results.totalJourneyCostTHB) * 100
                        )}
                        %)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-teal-500" /> Mandatory (
                        {Math.round(
                          (results.oneTimeTotalTHB / results.totalJourneyCostTHB) * 100
                        )}
                        %)
                      </span>
                      {results.totalAddonsTHB > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="size-2 rounded-full bg-amber-400" /> Add-ons (
                          {Math.round(
                            (results.totalAddonsTHB / results.totalJourneyCostTHB) * 100
                          )}
                          %)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Itemized Line-Item Breakdown Card */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                  Itemized Cost Breakdown
                </h3>
                <span className="text-[11px] font-semibold text-warm-charcoal/60">
                  {results?.lineItems?.length ?? 0} line items
                </span>
              </div>

              <div className="flex flex-col divide-y divide-warm-accent/50 max-h-[360px] overflow-y-auto pr-1">
                {results && results.lineItems.length > 0 ? (
                  results.lineItems.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-warm-charcoal block">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-warm-charcoal/60 block">
                          {item.notes}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-bold ${item.totalAmountTHB < 0 ? "text-emerald-600" : "text-warm-charcoal"
                            }`}
                        >
                          {item.totalAmountTHB < 0 ? "-" : ""}
                          {formatCurrency(Math.abs(item.totalAmountTHB), curr)}
                        </span>
                        <span className="text-[10px] text-warm-charcoal/50 block">
                          {item.isOneTime ? "one-time" : `over ${calcState.durationYears} yrs`}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-warm-charcoal/50">
                    ยังไม่มีรายการค่าใช้จ่าย
                  </div>
                )}
              </div>
            </div>

            {/* Year-by-Year Schedule Toggle Table */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowYearlyTable(!showYearlyTable)}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    Year-by-Year Schedule
                  </h3>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warm-accent">
                    {calcState.durationYears} Years
                  </Badge>
                </div>
                <button className="text-warm-charcoal/60 hover:text-warm-bronze cursor-pointer">
                  {showYearlyTable ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </div>

              {showYearlyTable && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-warm-accent text-warm-charcoal/60 text-[11px]">
                        <th className="pb-2 font-medium">Year</th>
                        <th className="pb-2 font-medium">Grade</th>
                        <th className="pb-2 font-medium">Tuition</th>
                        <th className="pb-2 font-medium">Add-ons</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-accent/40">
                      {results && results.yearlySchedule.length > 0 ? (
                        results.yearlySchedule.map((row) => (
                          <tr key={row.yearNumber} className="hover:bg-warm-card/50 transition-colors">
                            <td className="py-2 font-bold text-warm-bronze">
                              Y{row.yearNumber}
                            </td>
                            <td className="py-2 text-warm-charcoal/80 font-medium">
                              {row.gradeLabel}
                            </td>
                            <td className="py-2 text-warm-charcoal/80">
                              {formatCurrency(row.tuitionTHB, curr)}
                            </td>
                            <td className="py-2 text-warm-charcoal/80">
                              {formatCurrency(row.addonsTHB + row.oneTimeTHB, curr)}
                            </td>
                            <td className="py-2 font-bold text-warm-charcoal text-right">
                              {formatCurrency(row.totalTHB, curr)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-warm-charcoal/50">
                            ยังไม่มีข้อมูลกำหนดการรายปี
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY BOTTOM BAR (Visible only on < lg screens) ─────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-warm-charcoal/95 backdrop-blur-md text-white border-t border-white/10 p-3 px-4 shadow-2xl flex items-center justify-between">
        <div>
          <span className="text-[10px] text-white/60 uppercase font-semibold block">
            {calcState.durationYears}-Year Projected Total ({curr})
          </span>
          <span className="text-base font-extrabold text-white">
            {results ? formatCurrency(results.totalJourneyCostTHB, curr) : "฿0"}
          </span>
        </div>
        <button
          onClick={() => {
            const el = document.getElementById("cost-dashboard");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          className="px-4 py-2 rounded-full bg-warm-bronze text-white text-xs font-bold hover:bg-warm-bronze/90 transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
        >
          <span>ดูสรุปค่าใช้จ่าย</span>
          <span>↓</span>
        </button>
      </div>
    </div>
  );
}
