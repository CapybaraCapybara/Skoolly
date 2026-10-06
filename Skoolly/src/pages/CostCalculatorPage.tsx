import { useState, useEffect, useMemo } from "react";
import {
  Calculator,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
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
  GraduationCap,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPublishedFees } from "@/api/feesApi";
import { getSchools } from "@/api/schoolsApi";
import {
  ScrapedSchoolData,
  CalculatorState,
  calculateSchoolCosts,
  formatCurrency,
  getSchoolGrades,
  getSchoolAvailableAddons,
  getAddonAnnualMultiplier,
  CURRENCY_RATES,
  loadLiveCurrencyRates,
  type CurrencyRateInfo,
} from "@/lib/calculatorUtils";

interface CostCalculatorPageProps {
  initialSchoolId?: number;
  onBack: () => void;
  onSelectSchool?: (id: number) => void;
}

export function CostCalculatorPage({
  initialSchoolId,
  onBack,
}: CostCalculatorPageProps) {
  const [schoolsData, setSchoolsData] = useState<ScrapedSchoolData[]>([]);
  const [feesLoadState, setFeesLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [rateInfo, setRateInfo] = useState<CurrencyRateInfo>({ live: false, date: null });
  const [selectedSchoolIndex, setSelectedSchoolIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [showYearlyTable, setShowYearlyTable] = useState<boolean>(true);
  const [showTuitionTiers, setShowTuitionTiers] = useState<boolean>(false);
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

  // Published fees from the database; initialSchoolId is a schoolsApi id, matched by OPEC code
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const data = await getPublishedFees();
        if (cancelled) return;
        setSchoolsData(data);
        setFeesLoadState("ready");

        if (initialSchoolId) {
          const schools = await getSchools().catch(() => []);
          const code = schools.find((s) => s.id === initialSchoolId)?.schoolCode;
          const idx = code ? data.findIndex((d) => d.school_code === code) : -1;
          if (!cancelled && idx >= 0) setSelectedSchoolIndex(idx);
        }
      } catch (err) {
        console.error("[calculator] could not load published fees:", err);
        if (!cancelled) setFeesLoadState("error");
      }
    }
    loadData();
    loadLiveCurrencyRates().then((info) => {
      if (!cancelled) setRateInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSchoolId]);

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

  const schoolStages = useMemo(() => {
    if (!grades.length) return [];
    const set = new Set<string>();
    grades.forEach((g) => {
      if (g.level_code === "PRE_NURSERY" || g.display_name?.includes("เตรียมอนุบาล")) set.add("เตรียมอนุบาล");
      else if (g.level_code === "KINDERGARTEN" || g.display_name?.includes("อ.")) set.add("อนุบาล");
      else if (g.level_code === "PRIMARY" || g.display_name?.includes("ป.")) set.add("ประถม");
      else if (g.level_code === "LOWER_SECONDARY" || g.display_name?.includes("ม.1") || g.display_name?.includes("ม.2") || g.display_name?.includes("ม.3")) set.add("มัธยมต้น");
      else if (g.level_code === "UPPER_SECONDARY" || g.display_name?.includes("ม.4") || g.display_name?.includes("ม.5") || g.display_name?.includes("ม.6")) set.add("มัธยมปลาย");
    });
    return Array.from(set);
  }, [grades]);

  // Kindergarten boundary helper index
  const kgEndIdx = useMemo(() => {
    if (!grades.length) return -1;
    for (let i = grades.length - 1; i >= 0; i--) {
      const g = grades[i];
      if (
        g.level_code === "KINDERGARTEN" ||
        g.level_code === "PRE_NURSERY" ||
        (typeof g.order_end === "number" && g.order_end <= 3) ||
        g.display_name?.includes("อ.") ||
        g.display_name?.includes("เตรียมอนุบาล")
      ) {
        return i;
      }
    }
    return -1;
  }, [grades]);

  // Primary boundary helper index
  const primaryEndIdx = useMemo(() => {
    if (!grades.length) return -1;
    for (let i = grades.length - 1; i >= 0; i--) {
      const g = grades[i];
      if (
        g.level_code === "PRIMARY" ||
        (typeof g.order_end === "number" && g.order_end >= 4 && g.order_end <= 9) ||
        g.display_name?.includes("ป.")
      ) {
        return i;
      }
    }
    return -1;
  }, [grades]);

  // Lower secondary boundary helper index
  const lowerSecEndIdx = useMemo(() => {
    if (!grades.length) return -1;
    for (let i = grades.length - 1; i >= 0; i--) {
      const g = grades[i];
      if (
        g.level_code === "LOWER_SECONDARY" ||
        (typeof g.order_end === "number" && g.order_end >= 10 && g.order_end <= 12) ||
        g.display_name?.includes("ม.1") ||
        g.display_name?.includes("ม.2") ||
        g.display_name?.includes("ม.3")
      ) {
        return i;
      }
    }
    return -1;
  }, [grades]);

  // 4 Stage milestone targets for 1-click education journey selection (Option 3)
  const stageMilestones = useMemo(() => {
    const s1Start = 0;
    const s1End = kgEndIdx >= 0 ? kgEndIdx : -1;

    const s2Start = s1End >= 0 ? s1End + 1 : 0;
    const s2End = primaryEndIdx >= 0 ? primaryEndIdx : -1;

    const s3Start = s2End >= 0 ? s2End + 1 : s2Start;
    const s3End = lowerSecEndIdx >= 0 ? lowerSecEndIdx : -1;

    const s4Start = s3End >= 0 ? s3End + 1 : s3Start;
    const s4End = grades.length > 0 ? grades.length - 1 : -1;

    return [
      {
        id: "kg",
        stageNum: "Early Years",
        title: "เตรียม / อนุบาล",
        subtitle: "อ.1 – อ.3",
        startIdx: s1Start,
        endIdx: s1End,
      },
      {
        id: "primary",
        stageNum: "Primary",
        title: "ประถมศึกษา",
        subtitle: "ป.1 – ป.6",
        startIdx: s2Start,
        endIdx: s2End,
      },
      {
        id: "lower_sec",
        stageNum: "Lower Sec",
        title: "มัธยมศึกษาตอนต้น",
        subtitle: "ม.1 – ม.3",
        startIdx: s3Start,
        endIdx: s3End,
      },
      {
        id: "graduation",
        stageNum: "Upper Sec",
        title: "มัธยมศึกษาตอนปลาย",
        subtitle: "ม.4 – ม.6 (จบการศึกษา)",
        startIdx: s4Start,
        endIdx: s4End,
      },
    ];
  }, [grades.length, kgEndIdx, primaryEndIdx, lowerSecEndIdx]);

  // Short label helper for grade node timeline strip
  const getGradeShortLabel = (g: { display_name?: string | null; grade_level?: string }, idx: number): string => {
    const name = g.display_name || g.grade_level || "";
    if (/เตรียมอนุบาล/i.test(name)) return "ต.อ.";
    
    // Check abbreviation first
    const abbrevMatch = name.match(/(อ\.\d(?:[–-]อ?\.\d)?|ป\.\d(?:[–-]ป?\.\d)?|ม\.\d(?:[–-]ม?\.\d)?)/);
    if (abbrevMatch) return abbrevMatch[0].replace(/–/g, "-");

    // Check full Thai names
    const mThai = name.match(/มัธยมศึกษาปีที่\s*(\d)(?:[–-](\d))?/);
    if (mThai) return mThai[2] ? `ม.${mThai[1]}-${mThai[2]}` : `ม.${mThai[1]}`;

    const pThai = name.match(/ประถมศึกษาปีที่\s*(\d)(?:[–-](\d))?/);
    if (pThai) return pThai[2] ? `ป.${pThai[1]}-${pThai[2]}` : `ป.${pThai[1]}`;

    const aThai = name.match(/อนุบาล\s*(\d)(?:[–-](\d))?/);
    if (aThai) return aThai[2] ? `อ.${aThai[1]}-${aThai[2]}` : `อ.${aThai[1]}`;

    const enMatch = name.match(/(Nursery|FS\d|KG\d|Reception|Year\s*\d+(-\d+)?|Grade\s*\d+(-\d+)?|K\d)/i);
    if (enMatch) {
      return enMatch[0].replace(/Year\s*/i, "Y").replace(/Grade\s*/i, "G");
    }
    return `Y${idx + 1}`;
  };

  // Helper to format full grade title (ONLY full names, no "ม.1-ม.3" abbreviations before full name)
  // Example: "มัธยมศึกษาปีที่ 1–3 (Years 7–9)", "ประถมศึกษาปีที่ 1–2 (Years 1–2)", "อนุบาล 1 (Foundation Stage 1)"
  const formatFullGradeTitle = (g?: { display_name?: string | null; grade_level?: string | null } | null): string => {
    if (!g) return "";
    const raw = (g.display_name || g.grade_level || "").trim();
    if (!raw) return "";
    
    // Extract English curriculum part in parenthesis if exists, or fallback to grade_level
    let enPart = "";
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch) {
      enPart = parenMatch[1].trim();
    } else if (g.grade_level && g.grade_level !== raw) {
      enPart = g.grade_level.trim();
    }

    // Expand abbreviations in English part
    const expandEn = (str: string) => {
      if (!str) return "";
      return str
        .replace(/\bFS1\b/gi, "Foundation Stage 1")
        .replace(/\bFS2\b/gi, "Foundation Stage 2")
        .replace(/\bPre-?K\s*1\b/gi, "Pre-Kindergarten 1")
        .replace(/\bPre-?K\s*2\b/gi, "Pre-Kindergarten 2")
        .replace(/\bPre-?K\b/gi, "Pre-Kindergarten")
        .replace(/\bKG\s*1\b/gi, "Kindergarten 1")
        .replace(/\bKG\s*2\b/gi, "Kindergarten 2")
        .replace(/\bKG\b/gi, "Kindergarten")
        .replace(/\bEY1\b/gi, "Early Years 1")
        .replace(/\bEY2\b/gi, "Early Years 2")
        .replace(/\bRec\b/gi, "Reception");
    };

    enPart = expandEn(enPart);

    // Strip parentheses for Thai part
    let thaiPart = raw.replace(/\s*\([^)]*\)/g, "").trim();

    // Strip leading abbreviations like 'อ.1 ', 'ป.1–ป.2 ', 'ม.1–ม.3 ', 'ม.4 ', 'เตรียมอนุบาล–อ.3 ', 'ป.6–ม.2 '
    thaiPart = thaiPart
      .replace(/^เตรียมอนุบาล–อ\.\d\s*/i, "เตรียมอนุบาล – ")
      .replace(/^อ\.\d(?:[–-]อ?\.\d)?\s*–?\s*ป\.\d\s*/i, "")
      .replace(/^(?:อ\.|ป\.|ม\.)\d(?:[–-](?:อ\.|ป\.|ม\.)?\d)?\s*/i, "")
      .trim();

    if (thaiPart.includes("ประถม ") || thaiPart.includes("มัธยม ")) {
      thaiPart = thaiPart
        .replace(/ประถม\s*(\d)/g, "ประถมศึกษาปีที่ $1")
        .replace(/มัธยม\s*(\d)/g, "มัธยมศึกษาปีที่ $1");
    }

    // If thaiPart is empty or just numbers or doesn't have Thai words, reconstruct from raw
    if (!thaiPart || !/(มัธยมศึกษา|ประถมศึกษา|อนุบาล|เตรียมอนุบาล)/.test(thaiPart)) {
      if (/เตรียมอนุบาล/i.test(raw)) {
        thaiPart = "เตรียมอนุบาล";
      } else if (/อ\.(\d)(?:[–-]อ?\.?(\d))?/.test(raw)) {
        const m = raw.match(/อ\.(\d)(?:[–-]อ?\.?(\d))?/);
        thaiPart = m ? (m[2] ? `อนุบาล ${m[1]}–${m[2]}` : `อนุบาล ${m[1]}`) : "";
      } else if (/ป\.(\d)(?:[–-]ป?\.?(\d))?/.test(raw)) {
        const m = raw.match(/ป\.(\d)(?:[–-]ป?\.?(\d))?/);
        thaiPart = m ? (m[2] ? `ประถมศึกษาปีที่ ${m[1]}–${m[2]}` : `ประถมศึกษาปีที่ ${m[1]}`) : "";
      } else if (/ม\.(\d)(?:[–-]ม?\.?(\d))?/.test(raw)) {
        const m = raw.match(/ม\.(\d)(?:[–-]ม?\.?(\d))?/);
        thaiPart = m ? (m[2] ? `มัธยมศึกษาปีที่ ${m[1]}–${m[2]}` : `มัธยมศึกษาปีที่ ${m[1]}`) : "";
      } else if (/Nursery/i.test(raw)) {
        thaiPart = "เตรียมอนุบาล";
      } else if (/Year\s*(\d+)(?:[–-](\d+))?/i.test(raw)) {
        const ym = raw.match(/Year\s*(\d+)(?:[–-](\d+))?/i);
        if (ym) {
          const yStart = parseInt(ym[1], 10);
          const yEnd = ym[2] ? parseInt(ym[2], 10) : null;
          if (yStart <= 2 && (!yEnd || yEnd <= 2)) {
            thaiPart = yEnd ? "ประถมศึกษาปีที่ 1–2" : `ประถมศึกษาปีที่ ${yStart}`;
          } else if (yStart <= 6) {
            thaiPart = yEnd ? `ประถมศึกษาปีที่ ${yStart}–${yEnd}` : `ประถมศึกษาปีที่ ${yStart}`;
          } else {
            const mStart = yStart - 6;
            const mEnd = yEnd ? yEnd - 6 : null;
            thaiPart = mEnd ? `มัธยมศึกษาปีที่ ${mStart}–${mEnd}` : `มัธยมศึกษาปีที่ ${mStart}`;
          }
        }
      } else if (/Grade\s*(\d+)(?:[–-](\d+))?/i.test(raw)) {
        const gm = raw.match(/Grade\s*(\d+)(?:[–-](\d+))?/i);
        if (gm) {
          const gStart = parseInt(gm[1], 10);
          const gEnd = gm[2] ? parseInt(gm[2], 10) : null;
          if (gStart <= 6) {
            thaiPart = gEnd ? `ประถมศึกษาปีที่ ${gStart}–${gEnd}` : `ประถมศึกษาปีที่ ${gStart}`;
          } else {
            const mStart = gStart - 6;
            const mEnd = gEnd ? gEnd - 6 : null;
            thaiPart = mEnd ? `มัธยมศึกษาปีที่ ${mStart}–${mEnd}` : `มัธยมศึกษาปีที่ ${mStart}`;
          }
        }
      } else {
        thaiPart = raw.replace(/\s*\([^)]*\)/g, "").trim();
      }
    }

    return enPart ? `${thaiPart} (${enPart})` : thaiPart;
  };

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
              <ArrowLeft className="size-3.5" /> ย้อนกลับ
            </button>
            <div className="h-4 w-px bg-warm-accent" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-bronze text-white shadow-xs">
                <Calculator className="size-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-warm-charcoal tracking-tight leading-none">
                  คำนวณค่าใช้จ่าย
                </h1>
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
            {calcState.currency !== "THB" && (
              <span
                className="hidden md:inline text-[10px] leading-tight text-warm-charcoal/50"
                title="อัตราอ้างอิงของธนาคารกลางยุโรป (ECB) ผ่าน Frankfurter"
              >
                {rateInfo.live && rateInfo.date ? `อัตรา ณ ${rateInfo.date}` : "อัตราโดยประมาณ (ออฟไลน์)"}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="hidden sm:inline-flex rounded-full border-warm-accent bg-warm-cream text-warm-charcoal hover:bg-warm-accent/50 text-xs gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5" /> บันทึก PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="rounded-full border-warm-accent bg-warm-cream text-warm-charcoal hover:bg-warm-accent/50 text-xs gap-1.5 cursor-pointer"
            >
              <Share2 className="size-3.5" />
              {copiedNotification ? "คัดลอกลิงก์แล้ว" : "แชร์"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── MAIN 2-COLUMN LAYOUT ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6">
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
                    1. เลือกโรงเรียน
                  </h3>
                </div>
                <span className="text-xs text-warm-charcoal/50 font-medium">
                  {feesLoadState === "loading"
                    ? "กำลังโหลด…"
                    : feesLoadState === "error"
                      ? "โหลดข้อมูลค่าเทอมไม่สำเร็จ"
                      : `มีข้อมูลค่าเทอม ${schoolsData.length} แห่ง`}
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
                    placeholder="ค้นหาชื่อโรงเรียนหรือหลักสูตร"
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
                            <span className="text-sm font-semibold text-warm-charcoal">
                              {sch.school_name}
                            </span>
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
                        ไม่พบโรงเรียนที่ตรงกับ "{searchQuery}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected School Active Card */}
              {currentSchool ? (
                <div className="mt-3.5 p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-warm-bronze text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      {currentSchool.school_name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-warm-charcoal line-clamp-1">
                        {currentSchool.school_name}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-warm-charcoal/70 mt-1">
                        <span className="font-semibold text-warm-bronze">
                          {currentSchool.curriculum ? `หลักสูตร ${currentSchool.curriculum}` : "หลักสูตรนานาชาติ"}
                        </span>
                        <span>·</span>
                        <span className="text-warm-charcoal/60">
                          {grades.length} ชั้นปี
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
                              หน้าค่าเทอมของโรงเรียน ↗
                            </a>
                          </>
                        )}
                      </div>
                      {/* Educational stages tags */}
                      {schoolStages.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] text-warm-charcoal/50 font-medium">ระดับที่เปิดสอน:</span>
                          {schoolStages.map((stage) => (
                            <span
                              key={stage}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-warm-cream border border-warm-accent text-warm-charcoal"
                            >
                              {stage}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="self-end sm:self-center text-xs font-semibold text-warm-bronze hover:underline px-3 py-1.5 rounded-full border border-warm-accent bg-warm-cream cursor-pointer shrink-0"
                  >
                    เปลี่ยนโรงเรียน
                  </button>
                </div>
              ) : null}
            </div>

            {/* 2. Educational Journey (Option 3: Interactive Timeline Only) */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <Clock className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                      2. ช่วงชั้นที่จะเรียน
                    </h3>
                    <span className="text-[11px] text-warm-charcoal/60">
                      กดเลือกช่วงชั้นหรือชั้นปีบนไทม์ไลน์
                    </span>
                  </div>
                </div>

                {/* Starting Grade Selector Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-warm-charcoal/70 shrink-0">
                    เริ่มเข้าเรียนชั้น:
                  </span>
                  <select
                    disabled={!currentSchool}
                    value={calcState.startingGradeIndex}
                    onChange={(e) => handleStartingGradeChange(Number(e.target.value))}
                    className="rounded-xl border border-warm-accent bg-warm-card px-3 py-1.5 text-xs font-bold text-warm-charcoal focus:border-warm-bronze focus:outline-none transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {grades.length > 0 ? (
                      grades.map((g, idx) => (
                        <option key={idx} value={idx}>
                          {formatFullGradeTitle(g)}
                        </option>
                      ))
                    ) : (
                      <option value={0}>— กรุณาเลือกโรงเรียนก่อน —</option>
                    )}
                  </select>
                </div>
              </div>

              {/* ── UNIFIED OPTION 3 TIMELINE CARD ───────────────────────────────── */}
              <div className="p-4 sm:p-5 rounded-2xl bg-warm-card border border-warm-accent shadow-2xs">
                {/* 1. Connected 4 Stage Header Blocks (Early Years / Primary / Lower Sec / Upper Sec) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-warm-cream border border-warm-accent/70 mb-5">
                  {stageMilestones.map((stage) => {
                    const isAvailable = stage.endIdx >= 0;
                    const isBeforeStart = stage.endIdx < calcState.startingGradeIndex;
                    const isCurrentEnd = calcState.startingGradeIndex + calcState.durationYears - 1 === stage.endIdx;
                    const stageStartIdx = stage.startIdx;
                    const currentStart = calcState.startingGradeIndex;
                    const currentEnd = calcState.startingGradeIndex + calcState.durationYears - 1;
                    const isOverlap = isAvailable && currentEnd >= stageStartIdx && currentStart <= stage.endIdx;

                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => {
                          if (isBeforeStart) {
                            handleStartingGradeChange(stageStartIdx);
                            setCalcState((p) => ({ ...p, durationYears: stage.endIdx - stageStartIdx + 1 }));
                          } else {
                            setCalcState((p) => ({ ...p, durationYears: stage.endIdx - p.startingGradeIndex + 1 }));
                          }
                        }}
                        className={`p-2.5 sm:p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between gap-1 relative ${
                          !isAvailable
                            ? "opacity-35 cursor-not-allowed"
                            : isCurrentEnd
                            ? "bg-warm-bronze text-white shadow-xs font-bold"
                            : isOverlap
                            ? "bg-warm-bronze/15 text-warm-charcoal border border-warm-bronze/40 font-semibold"
                            : "hover:bg-warm-card text-warm-charcoal/70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            isCurrentEnd ? "text-white/80" : "text-warm-charcoal/50"
                          }`}>
                            {stage.stageNum}
                          </span>
                          {isCurrentEnd && (
                            <span className="flex size-3.5 rounded-full bg-white text-warm-bronze items-center justify-center shadow-2xs font-bold">
                              <Check className="size-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>
                        <div>
                          <div className={`text-xs font-bold leading-tight ${
                            isCurrentEnd ? "text-white" : "text-warm-charcoal"
                          }`}>
                            {stage.title}
                          </div>
                          <div className={`text-[10px] truncate mt-0.5 ${
                            isCurrentEnd ? "text-white/80" : "text-warm-charcoal/60"
                          }`}>
                            {stage.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 2. Horizontal Timeline Track Line with Circular Grade Nodes */}
                <div className="relative py-4 px-2 sm:px-4">
                  <div className="relative flex items-center justify-between gap-1 sm:gap-2">
                    {/* Background line across full width */}
                    <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1.5 bg-warm-accent rounded-full -z-0" />
                    
                    {/* Active highlighted line portion */}
                    {grades.length > 1 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-warm-bronze rounded-full transition-all duration-200 -z-0"
                        style={{
                          left: `${(calcState.startingGradeIndex / (grades.length - 1)) * 100}%`,
                          width: `${(Math.min(calcState.durationYears - 1, grades.length - 1 - calcState.startingGradeIndex) / (grades.length - 1)) * 100}%`,
                        }}
                      />
                    )}

                    {/* Grade Nodes */}
                    {grades.map((g, idx) => {
                      const isStart = idx === calcState.startingGradeIndex;
                      const isEnd = idx === calcState.startingGradeIndex + calcState.durationYears - 1;
                      const isCovered = idx >= calcState.startingGradeIndex && idx <= calcState.startingGradeIndex + calcState.durationYears - 1;
                      const shortLabel = getGradeShortLabel(g, idx);

                      return (
                        <div
                          key={idx}
                          className="flex flex-col items-center relative z-10 group"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (idx < calcState.startingGradeIndex) {
                                handleStartingGradeChange(idx);
                              } else {
                                setCalcState((p) => ({ ...p, durationYears: idx - p.startingGradeIndex + 1 }));
                              }
                            }}
                            title={`${g.display_name || g.grade_level}\nค่าเทอม: ฿${formatCurrency(g.annual_thb, curr)}/ปี`}
                            className={`size-7 sm:size-8 rounded-full flex items-center justify-center transition-all cursor-pointer text-[10px] font-bold ${
                              isStart || isEnd
                                ? "bg-warm-bronze text-white shadow-md ring-4 ring-warm-bronze/30 scale-110"
                                : isCovered
                                ? "bg-warm-bronze text-white ring-2 ring-warm-card"
                                : "bg-warm-card text-warm-charcoal/60 border-2 border-warm-accent hover:border-warm-bronze hover:scale-105"
                            }`}
                          >
                            {isStart ? (
                              <Check className="size-3.5 stroke-[3]" />
                            ) : isEnd ? (
                              <span className="size-2 bg-white rounded-full" />
                            ) : isCovered ? (
                              <span className="size-1.5 bg-white rounded-full" />
                            ) : (
                              <span className="text-[9px] font-semibold">{idx + 1}</span>
                            )}
                          </button>

                          {/* Node Label Below */}
                          <span
                            onClick={() => {
                              if (idx < calcState.startingGradeIndex) {
                                handleStartingGradeChange(idx);
                              } else {
                                setCalcState((p) => ({ ...p, durationYears: idx - p.startingGradeIndex + 1 }));
                              }
                            }}
                            className={`text-[10px] sm:text-[11px] font-bold mt-2 cursor-pointer transition-colors ${
                              isStart || isEnd
                                ? "text-warm-bronze font-black"
                                : isCovered
                                ? "text-warm-charcoal"
                                : "text-warm-charcoal/40 group-hover:text-warm-charcoal"
                            }`}
                          >
                            {shortLabel}
                          </span>

                          {/* Start / Target Pin Tag */}
                          {isStart && (
                            <span className="absolute -top-6 px-1.5 py-0.5 rounded-full bg-warm-charcoal text-white text-[8px] font-bold tracking-tight whitespace-nowrap shadow-xs">
                              เริ่ม
                            </span>
                          )}
                          {isEnd && (
                            <span className="absolute -top-6 px-1.5 py-0.5 rounded-full bg-warm-bronze text-white text-[8px] font-bold tracking-tight whitespace-nowrap shadow-xs">
                              เป้าหมาย
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Selected Summary Footer Line */}
                <div className="mt-4 pt-3 border-t border-warm-accent/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-warm-charcoal/60 font-medium">ช่วงการศึกษาที่เลือก:</span>
                    <strong className="text-warm-bronze font-bold text-sm">
                      {formatFullGradeTitle(grades[calcState.startingGradeIndex])}
                    </strong>
                    <span className="text-warm-charcoal/40 font-bold">➔</span>
                    <strong className="text-warm-charcoal font-bold text-sm">
                      {formatFullGradeTitle(grades[Math.min(calcState.startingGradeIndex + calcState.durationYears - 1, grades.length - 1)])}
                    </strong>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className="bg-warm-bronze text-white px-3 py-1 rounded-full font-bold text-xs shadow-2xs">
                      {calcState.durationYears} ปี
                    </Badge>
                    <span className="text-[11px] text-warm-charcoal/60 hidden sm:inline">
                      (ค่าเทอมปีแรก {formatCurrency(grades[calcState.startingGradeIndex]?.annual_thb || 0, curr)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Standardized Grade Fee Schedule Toggle */}
              {currentSchool && grades.length > 0 && (
                <div className="mt-5 pt-4 border-t border-warm-accent/50">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowTuitionTiers(!showTuitionTiers)}
                      className="inline-flex items-center gap-2 text-xs font-bold text-warm-bronze hover:underline cursor-pointer"
                    >
                      <GraduationCap className="size-4" />
                      <span>
                        {showTuitionTiers ? "ซ่อนค่าเทอมรายชั้น" : "ดูค่าเทอมทุกชั้น"} ({grades.length} ชั้นปี)
                      </span>
                      {showTuitionTiers ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  </div>

                  {showTuitionTiers && (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-warm-accent bg-warm-bg/60 shadow-inner">
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-warm-card border-b border-warm-accent text-[11px] text-warm-charcoal/70 z-10">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">ชั้น (เทียบระบบไทย)</th>
                              <th className="py-2.5 px-3 font-semibold">ชื่อชั้นของโรงเรียน</th>
                              <th className="py-2.5 px-3 font-semibold text-right">ค่าเทอม/ปี</th>
                              <th className="py-2.5 px-3 font-semibold text-center">เลือกคำนวณ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-warm-accent/40 bg-warm-cream/30">
                            {grades.map((g, idx) => {
                              const isSelected = calcState.startingGradeIndex === idx;
                              return (
                                <tr
                                  key={idx}
                                  className={`transition-colors ${
                                    isSelected
                                      ? "bg-warm-bronze/10 font-bold"
                                      : "hover:bg-warm-card/60"
                                  }`}
                                >
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-warm-charcoal font-semibold">
                                        {formatFullGradeTitle(g)}
                                      </span>
                                      {isSelected && (
                                        <Badge className="bg-warm-bronze text-white text-[9px] px-1.5 py-0 border-0">
                                          เริ่มต้น
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-warm-charcoal/60 text-[11px]">
                                    {g.grade_level}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-warm-charcoal">
                                    {formatCurrency(g.annual_thb, curr)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleStartingGradeChange(idx)}
                                      className={`text-[10px] px-2.5 py-0.5 rounded-full border transition-all cursor-pointer font-medium ${
                                        isSelected
                                          ? "bg-warm-bronze text-white border-warm-bronze"
                                          : "bg-warm-card text-warm-charcoal border-warm-accent hover:border-warm-bronze"
                                      }`}
                                    >
                                      {isSelected ? "เลือกอยู่" : "เริ่มที่ชั้นนี้"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. One-time admission fees */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <ShieldCheck className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    3. ค่าแรกเข้า
                  </h3>
                </div>
              </div>
              <p className="text-xs text-warm-charcoal/70 mb-4">
                จ่ายครั้งเดียวในปีแรก
              </p>

              {/* Cards showing the 3 mandatory fees */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {/* Application Fee Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        ค่าสมัคร
                      </span>
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
                  <span className="text-[11px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryAppFee !== null ? "ไม่คืนเงิน" : "ไม่ระบุในเอกสาร"}
                  </span>
                </div>

                {/* Registration Fee Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        ค่าแรกเข้า
                      </span>
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
                  <span className="text-[11px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryRegFee !== null ? "ไม่คืนเงิน" : "ไม่ระบุในเอกสาร"}
                  </span>
                </div>

                {/* Refundable Deposit Card */}
                <div className="p-4 rounded-2xl border border-warm-bronze/40 bg-warm-card shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-warm-charcoal">
                        เงินประกัน
                      </span>
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
                  <span className="text-[11px] text-warm-charcoal/60 mt-2 block">
                    {mandatoryDeposit !== null ? "คืนเมื่อลาออกหรือจบ" : "ไม่ระบุในเอกสาร"}
                  </span>
                </div>
              </div>

              {/* Deposit conditions from the school's fee document, when it has any */}
              {currentSchool?.hidden_costs?.find((c) => /deposit/i.test(c.name) && !/boarding/i.test(c.name))?.notes && (
                <div className="p-3.5 rounded-2xl border border-warm-accent/70 bg-warm-bg/70 text-xs text-warm-charcoal/80 flex items-start gap-2.5">
                  <Info className="size-4 text-warm-bronze shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-warm-charcoal">เงื่อนไขเงินประกัน</span>
                    <p className="text-[11px] text-warm-charcoal/70 mt-0.5">
                      {currentSchool.hidden_costs.find((c) => /deposit/i.test(c.name) && !/boarding/i.test(c.name))?.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Add-on services listed by the school */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-card text-warm-bronze border border-warm-accent">
                    <Layers className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    4. บริการเสริม
                  </h3>
                </div>
                <span className="text-xs text-warm-charcoal/60">
                  {availableAddons.length} รายการ
                </span>
              </div>
              <p className="text-xs text-warm-charcoal/70 mb-4">
                เลือกเฉพาะรายการที่จะใช้
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
                    ไม่มีรายการบริการเสริมในเอกสารค่าเทอม
                  </span>
                </div>
              )}
            </div>

            {/* 5. Discounts the school publishes */}
            <div className="p-6 rounded-3xl border border-warm-accent bg-warm-cream shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-warm-bronze" />
                  <h3 className="text-sm font-bold text-warm-charcoal uppercase tracking-wider">
                    5. ส่วนลด
                  </h3>
                </div>
              </div>

              {/* Case 1: School has explicit sibling entry in results.json (e.g. Bangkok Patana) */}
              {hasPatanaSiblingDiscount ? (
                <div className="space-y-3">
                  <p className="text-xs text-warm-charcoal/70">
                    ส่วนลดค่าแรกเข้าสำหรับบุตรคนที่สองขึ้นไป
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
                        <span className="text-xs font-bold text-warm-charcoal">บุตรคนแรก</span>
                        {calcState.childTier === "first_child" && <Check className="size-3.5 text-warm-bronze" />}
                      </div>
                      <span className="text-[11px] text-warm-charcoal/60 mt-1">
                        ค่าแรกเข้า ฿250,000
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
                        <span className="text-xs font-bold text-emerald-900">บุตรคนที่สองขึ้นไป</span>
                        <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">ลด ฿50,000</Badge>
                      </div>
                      <span className="text-[11px] text-emerald-800/80 mt-1">
                        ค่าแรกเข้า ฿200,000
                      </span>
                    </button>
                  </div>
                </div>
              ) : hasHarrowAlumniDiscount ? (
                /* Case 2: Harrow alumni discount */
                <div className="space-y-3">
                  <p className="text-xs text-warm-charcoal/70">
                    ส่วนลดค่าแรกเข้าสำหรับบุตรศิษย์เก่า
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
                        <span className="text-xs font-bold text-warm-charcoal">นักเรียนทั่วไป</span>
                        {calcState.childTier !== "alumni" && <Check className="size-3.5 text-warm-bronze" />}
                      </div>
                      <span className="text-[11px] text-warm-charcoal/60 mt-1">
                        ค่าแรกเข้า ฿225,000
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
                        <span className="text-xs font-bold text-emerald-900">บุตรศิษย์เก่า</span>
                        <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">ลด ฿100,000</Badge>
                      </div>
                      <span className="text-[11px] text-emerald-800/80 mt-1">
                        ค่าแรกเข้า ฿125,000
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Case 3: the school publishes no discount */
                <div className="p-6 rounded-2xl border border-warm-accent/70 bg-warm-bg/60 text-center flex flex-col items-center gap-1.5">
                  <Info className="size-5 text-warm-charcoal/40" />
                  <span className="text-xs font-semibold text-warm-charcoal">
                    โรงเรียนไม่ได้ประกาศส่วนลด
                  </span>
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
                    รวม {calcState.durationYears} ปี
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
                    {currentSchool ? `${calcState.durationYears} ปีการศึกษา (${curr})` : "เลือกโรงเรียนเพื่อเริ่มคำนวณ"}
                  </span>
                </div>

                {/* Sub Stats Grid */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      ปีแรก
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.year1CostTHB, curr) : "฿0"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      เฉลี่ยต่อปี
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.averageAnnualCostTHB, curr) : "฿0"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-white/60 block uppercase font-medium">
                      เฉลี่ยต่อเดือน
                    </span>
                    <span className="text-xs font-bold text-white mt-0.5 block">
                      {results ? formatCurrency(results.monthlyEquivalentTHB, curr) : "฿0"}
                    </span>
                  </div>
                </div>

                {/* Visual Distribution Bar */}
                {results && results.totalJourneyCostTHB > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] text-white/70 mb-1.5 font-medium">สัดส่วนค่าใช้จ่าย</div>
                    <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex gap-0.5">
                      <div
                        style={{
                          width: `${Math.round(
                            (results.totalTuitionTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-warm-bronze"
                        title="ค่าเทอม"
                      />
                      <div
                        style={{
                          width: `${Math.round(
                            (results.oneTimeTotalTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-teal-500"
                        title="ค่าแรกเข้า"
                      />
                      <div
                        style={{
                          width: `${Math.round(
                            (results.totalAddonsTHB / results.totalJourneyCostTHB) * 100
                          )}%`,
                        }}
                        className="bg-amber-400"
                        title="บริการเสริม"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/70 mt-2">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-warm-bronze" /> ค่าเทอม (
                        {Math.round(
                          (results.totalTuitionTHB / results.totalJourneyCostTHB) * 100
                        )}
                        %)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-teal-500" /> ค่าแรกเข้า (
                        {Math.round(
                          (results.oneTimeTotalTHB / results.totalJourneyCostTHB) * 100
                        )}
                        %)
                      </span>
                      {results.totalAddonsTHB > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="size-2 rounded-full bg-amber-400" /> บริการเสริม (
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
                  รายการค่าใช้จ่าย
                </h3>
                <span className="text-[11px] font-semibold text-warm-charcoal/60">
                  {results?.lineItems?.length ?? 0} รายการ
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
                          {item.isOneTime ? "ครั้งเดียว" : `${calcState.durationYears} ปี`}
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
                    รายปี
                  </h3>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warm-accent">
                    {calcState.durationYears} ปี
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
                        <th className="pb-2 font-medium">ปีที่</th>
                        <th className="pb-2 font-medium">ชั้น</th>
                        <th className="pb-2 font-medium">ค่าเทอม</th>
                        <th className="pb-2 font-medium">แรกเข้าและบริการเสริม</th>
                        <th className="pb-2 font-medium text-right">ยอดรวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-accent/40">
                      {results && results.yearlySchedule.length > 0 ? (
                        results.yearlySchedule.map((row) => (
                          <tr key={row.yearNumber} className="hover:bg-warm-card/50 transition-colors">
                            <td className="py-2.5 font-bold text-warm-bronze">
                              Y{row.yearNumber}
                            </td>
                            <td className="py-2.5">
                              <div className="flex flex-col">
                                <span className="font-bold text-warm-charcoal text-xs">
                                  {formatFullGradeTitle({ display_name: row.displayName, grade_level: row.gradeLabel })}
                                </span>
                                {row.displayName && row.displayName !== row.gradeLabel && (
                                  <span className="text-[10px] text-warm-charcoal/50">
                                    หลักสูตร: {row.gradeLabel}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-warm-charcoal/80 font-medium">
                              {formatCurrency(row.tuitionTHB, curr)}
                            </td>
                            <td className="py-2.5 text-warm-charcoal/80">
                              {formatCurrency(row.addonsTHB + row.oneTimeTHB, curr)}
                              {row.oneTimeTHB > 0 && (
                                <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded ml-1 border border-emerald-200">
                                  +แรกเข้า
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 font-bold text-warm-charcoal text-right">
                              {formatCurrency(row.totalTHB, curr)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-warm-charcoal/50">
                            ยังไม่มีข้อมูล
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
            รวม {calcState.durationYears} ปี ({curr})
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
