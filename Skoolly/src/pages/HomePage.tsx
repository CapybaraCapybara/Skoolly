import { useState, useEffect, useMemo, type ReactNode } from "react";
import { ArrowRight, BookOpen, Calculator, Check, ChevronLeft, ChevronRight, Loader2, MessageSquare, Search, X } from "lucide-react";
import Hero, { type HeroStat } from "@/components/schools/Hero";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { NoResults } from "@/components/schools/NoResults";
import { NearbySchools, distanceKm } from "@/components/schools/NearbySchools";
import type { School, Filters, SortKey } from "@/types";
import { FEE_SLIDER, LEVEL_OPTIONS, SORT_OPTIONS } from "@/constants";
import { getSchools } from "@/api/schoolsApi";
import { schoolNames } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 9;

const filterLabel = "block text-xs font-bold text-warm-charcoal/60 mb-1.5";
const selectClass =
  "w-full cursor-pointer rounded-xl border border-warm-accent bg-white/70 px-3 py-2.5 text-sm text-warm-charcoal transition focus:border-warm-bronze focus:outline-none focus:ring-2 focus:ring-warm-bronze/30";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer",
        active
          ? "border-warm-charcoal bg-warm-charcoal text-white"
          : "border-warm-accent bg-white/70 text-warm-charcoal/80 hover:border-warm-bronze hover:text-warm-charcoal"
      )}
    >
      {active && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

/** Option list built from the data, most common first, with how many schools have each value */
function countOptions(valuesPerSchool: string[][]) {
  const counts = new Map<string, number>();
  valuesPerSchool.forEach((values) => new Set(values).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"))
    .map(([value, count]) => ({ value, count }));
}

const byThaiName = (a: School, b: School) => schoolNames(a).primary.localeCompare(schoolNames(b).primary, "th");
// Schools without a published fee go last in both fee orders
const feeOrLast = (s: School, last: number) => (s.tuitionStart > 0 ? s.tuitionStart : last);

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

const DEFAULT_FILTERS: Filters = {
  query: "",
  province: "",
  curriculum: "",
  maxFee: null,
  levels: [],
  isatOnly: false,
  boardingOnly: false,
};

interface HomePageProps {
  compareIds: number[];
  favorites: Set<number>;
  onToggleCompare: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onRestrictedAction: (reason: string) => void;
  onSchoolClick: (id: number) => void;
  onOpenCalculator?: () => void;
  onCompareLimitReached?: (school: School) => void;
}

export function HomePage({
  compareIds,
  favorites,
  onToggleCompare,
  onToggleFavorite,
  onRestrictedAction,
  onSchoolClick,
  onOpenCalculator,
  onCompareLimitReached,
}: HomePageProps) {
  // Filters apply as soon as they change; sorting is kept separate from filtering
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>("name-th");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // ── Fetch schools from the API layer on mount ──────────────────────────────
  useEffect(() => {
    getSchools()
      .then((data) => {
        setSchools(data);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  // Hero numbers come from the loaded schools so they always match the database
  const heroStats = useMemo<HeroStat[]>(() => {
    if (schools.length === 0) return [];
    const totalReviews = schools.reduce((sum, s) => sum + (s.reviewCount || 0), 0);
    const withFees = schools.filter((s) => s.tuitionStart > 0).length;
    return [
      { value: schools.length.toLocaleString("en-US"), label: "โรงเรียน" },
      { value: withFees.toLocaleString("en-US"), label: "มีข้อมูลค่าเทอม" },
      { value: totalReviews.toLocaleString("en-US"), label: "รีวิวจากผู้ปกครอง" },
    ];
  }, [schools]);

  const averageRating = useMemo(() => {
    const rated = schools.filter((s) => s.reviewCount > 0 && s.rating > 0);
    const weight = rated.reduce((sum, s) => sum + s.reviewCount, 0);
    if (weight === 0) return null;
    return rated.reduce((sum, s) => sum + s.rating * s.reviewCount, 0) / weight;
  }, [schools]);

  // Province and curriculum choices come from the data, so every value in the database can be picked
  const provinceOptions = useMemo(() => countOptions(schools.map((s) => (s.province ? [s.province] : []))), [schools]);
  const curriculumOptions = useMemo(() => countOptions(schools.map((s) => s.curricula ?? [])), [schools]);
  const isatCount = useMemo(() => schools.filter((s) => s.isIsatMember).length, [schools]);
  const boardingCount = useMemo(() => schools.filter((s) => s.isBoarding).length, [schools]);
  // How many schools teach each level, shown on the level chips
  const levelCounts = useMemo(
    () => new Map(countOptions(schools.map((s) => s.levels ?? [])).map((o) => [o.value, o.count])),
    [schools]
  );
  const feeKnownCount = useMemo(() => schools.filter((s) => s.tuitionStart > 0).length, [schools]);

  const filteredSchools = useMemo(() => {
    const q = filters.query.trim().toLowerCase();

    const list = schools
      .filter((s) => {
        if (q && ![s.name, s.nameTh, s.location].some((t) => t?.toLowerCase().includes(q))) return false;
        if (filters.province && s.province !== filters.province) return false;
        if (filters.curriculum && !(s.curricula ?? []).includes(filters.curriculum)) return false;
        if (filters.levels.length > 0 && !filters.levels.every((lv) => (s.levels ?? []).includes(lv))) return false;
        // A fee filter can only vouch for schools that have published their fees
        if (filters.maxFee != null && !(s.tuitionStart > 0 && s.tuitionStart <= filters.maxFee)) return false;
        if (filters.isatOnly && !s.isIsatMember) return false;
        if (filters.boardingOnly && !s.isBoarding) return false;
        return true;
      })
      .map((s) => (sortBy === "distance" && userPos && s.coords ? { ...s, distance: distanceKm(userPos, s.coords) } : s));

    const NONE = Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => {
      switch (sortBy) {
        case "name-en":
          return a.name.localeCompare(b.name, "en");
        case "opec":
          // OPEC codes are 10-digit strings, so text order is code order; schools without one go last
          return (a.schoolCode ?? "￿").localeCompare(b.schoolCode ?? "￿");
        case "distance":
          return (a.coords ? a.distance : NONE) - (b.coords ? b.distance : NONE) || byThaiName(a, b);
        case "students":
          return (b.studentCount ?? -1) - (a.studentCount ?? -1) || byThaiName(a, b);
        case "fee-asc":
          return feeOrLast(a, NONE) - feeOrLast(b, NONE) || byThaiName(a, b);
        case "fee-desc":
          return feeOrLast(b, -1) - feeOrLast(a, -1) || byThaiName(a, b);
        default:
          return byThaiName(a, b);
      }
    });
  }, [schools, filters, sortBy, userPos]);

  // Back to page 1 whenever the filters or the order change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const toggleLevel = (level: string) =>
    setFilter(
      "levels",
      filters.levels.includes(level) ? filters.levels.filter((l) => l !== level) : [...filters.levels, level]
    );

  const activeFilterCount =
    [filters.query.trim(), filters.province, filters.curriculum].filter(Boolean).length +
    (filters.maxFee != null ? 1 : 0) +
    filters.levels.length +
    (filters.isatOnly ? 1 : 0) +
    (filters.boardingOnly ? 1 : 0);

  // "Nearest first" needs the visitor's location; ask for it the first time that order is picked
  const changeSort = (next: SortKey) => {
    setGeoError(null);
    if (next !== "distance" || userPos) {
      setSortBy(next);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoError("เบราว์เซอร์นี้แชร์ตำแหน่งไม่ได้ จึงเรียงตามระยะทางไม่ได้");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortBy("distance");
        setLocating(false);
      },
      () => {
        setGeoError("หาตำแหน่งไม่ได้ ตรวจสอบว่าเบราว์เซอร์อนุญาตให้ใช้ตำแหน่ง");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const totalPages = Math.max(1, Math.ceil(filteredSchools.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedSchools = filteredSchools.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    const target = document.getElementById("schools");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <Hero
        eyebrow="โรงเรียนนานาชาติในประเทศไทย"
        headingPrefix="ค้นหาโรงเรียน"
        headingHighlight="นานาชาติ"
        headingSuffix="สำหรับลูก"
        description={`เทียบค่าเทอม หลักสูตร และที่ตั้ง ของโรงเรียนนานาชาติ${schools.length > 0 ? ` ${schools.length.toLocaleString("en-US")} แห่ง` : ""}ที่ได้รับอนุญาตจาก สช.`}
        primaryCtaLabel="ค้นหาโรงเรียน"
        primaryCtaHref="#schools"
        backgroundImage="https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=1600&h=900&fit=crop&auto=format"
        stats={heroStats}
        averageRating={averageRating}
      />

      {/* ── SEARCH / FILTER PANEL ─────────────────────────────────────────── */}
      <section className="relative z-10 -mt-12 pb-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-warm-cream rounded-[2rem] shadow-xl p-5 sm:p-6 md:p-8 border border-warm-accent">
            {/* Name search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-charcoal/40" />
              <input
                type="text"
                value={filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
                aria-label="ค้นหาชื่อโรงเรียน"
                placeholder="ค้นหาชื่อโรงเรียน ไทยหรืออังกฤษ"
                className="w-full rounded-full border border-warm-accent bg-white py-3.5 pl-11 pr-11 text-sm text-warm-charcoal placeholder:text-warm-charcoal/40 transition focus:border-warm-bronze focus:outline-none focus:ring-2 focus:ring-warm-bronze/30"
              />
              {filters.query && (
                <button
                  type="button"
                  onClick={() => setFilter("query", "")}
                  className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-warm-charcoal/50 transition-colors hover:bg-warm-accent/60 hover:text-warm-charcoal cursor-pointer"
                  aria-label="ล้างข้อความค้นหา"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Province, curriculum, fee */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label>
                <span className={filterLabel}>จังหวัด</span>
                <select value={filters.province} onChange={(e) => setFilter("province", e.target.value)} className={selectClass}>
                  <option value="">ทุกจังหวัด</option>
                  {provinceOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value} ({o.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={filterLabel}>หลักสูตร</span>
                <select value={filters.curriculum} onChange={(e) => setFilter("curriculum", e.target.value)} className={selectClass}>
                  <option value="">ทุกหลักสูตร</option>
                  {curriculumOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value} ({o.count})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label htmlFor="fee-slider" className="text-xs font-bold text-warm-charcoal/60">
                    ค่าเทอมต่อปี
                  </label>
                  <span className="text-xs font-bold text-warm-bronze">
                    {filters.maxFee == null ? "ไม่จำกัด" : `ไม่เกิน ฿${filters.maxFee.toLocaleString("en-US")}`}
                  </span>
                </div>
                {/* Same height as the selects next to it; the top end of the slider means no limit */}
                <div className="flex h-[42px] items-center">
                  <input
                    id="fee-slider"
                    type="range"
                    min={FEE_SLIDER.min}
                    max={FEE_SLIDER.max}
                    step={FEE_SLIDER.step}
                    value={filters.maxFee ?? FEE_SLIDER.max}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setFilter("maxFee", value >= FEE_SLIDER.max ? null : value);
                    }}
                    aria-valuetext={filters.maxFee == null ? "ไม่จำกัด" : `ไม่เกิน ${filters.maxFee.toLocaleString("en-US")} บาท`}
                    className="h-1.5 w-full cursor-pointer"
                  />
                </div>
                {filters.maxFee != null && (
                  <span className="mt-1 block text-xs text-warm-charcoal/55">
                    นับเฉพาะโรงเรียนที่ประกาศค่าเทอมแล้ว ตอนนี้มี {feeKnownCount} แห่ง
                  </span>
                )}
              </div>
            </div>

            {/* Levels and other options */}
            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:gap-10">
              <div>
                <span className={filterLabel}>ระดับชั้นที่ต้องการ</span>
                <div className="flex flex-wrap gap-2">
                  {LEVEL_OPTIONS.map((lv) => (
                    <Chip key={lv.value} active={filters.levels.includes(lv.value)} onClick={() => toggleLevel(lv.value)}>
                      {lv.label} <span className="opacity-60">{levelCounts.get(lv.value) ?? 0}</span>
                    </Chip>
                  ))}
                </div>
                {filters.levels.length > 1 && (
                  <span className="mt-1.5 block text-xs text-warm-charcoal/55">แสดงเฉพาะโรงเรียนที่เปิดสอนครบทุกระดับที่เลือก</span>
                )}
              </div>
              <div>
                <span className={filterLabel}>อื่น ๆ</span>
                <div className="flex flex-wrap gap-2">
                  <Chip active={filters.isatOnly} onClick={() => setFilter("isatOnly", !filters.isatOnly)}>
                    สมาชิก ISAT <span className="opacity-60">{isatCount}</span>
                  </Chip>
                  <Chip active={filters.boardingOnly} onClick={() => setFilter("boardingOnly", !filters.boardingOnly)}>
                    มีหอพัก <span className="opacity-60">{boardingCount}</span>
                  </Chip>
                </div>
              </div>
            </div>

            {/* Results are live; this just jumps to them */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-warm-accent/50 pt-4">
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-sm font-semibold text-warm-charcoal/60 transition-colors hover:text-warm-charcoal cursor-pointer"
                >
                  ล้างตัวกรอง ({activeFilterCount})
                </button>
              ) : (
                <span className="hidden text-sm text-warm-charcoal/50 sm:inline">ผลลัพธ์อัปเดตทันทีที่เลือก</span>
              )}
              <a
                href="#schools"
                className="ml-auto inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-warm-charcoal px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-warm-charcoal/90"
              >
                ดูรายชื่อ {filteredSchools.length} แห่ง
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>


      {/* ── SCHOOL LISTINGS ───────────────────────────────────────────────────── */}
      <section id="schools" className="py-12 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-charcoal">โรงเรียนนานาชาติในประเทศไทย</h2>
              <p className="text-warm-charcoal/60 text-sm mt-1">
                {filteredSchools.length} แห่ง
                {filteredSchools.length > ITEMS_PER_PAGE && (
                  <> · แสดง {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredSchools.length)}</>
                )}
                {compareIds.length > 0 && <span className="text-warm-bronze font-medium"> · เลือกเปรียบเทียบ {compareIds.length} แห่ง</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {locating && (
                <span className="inline-flex items-center gap-1.5 text-xs text-warm-charcoal/60">
                  <Loader2 className="size-3.5 animate-spin" />
                  กำลังหาตำแหน่ง…
                </span>
              )}
              <label className="flex items-center gap-2 text-sm text-warm-charcoal/60">
                เรียงตาม
                <select
                  value={sortBy}
                  onChange={(e) => changeSort(e.target.value as SortKey)}
                  disabled={locating}
                  className="cursor-pointer rounded-full border border-warm-accent bg-warm-cream px-3.5 py-2 text-sm font-medium text-warm-charcoal transition focus:border-warm-bronze focus:outline-none focus:ring-2 focus:ring-warm-bronze/30 disabled:opacity-60"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {geoError && <p className="-mt-3 mb-5 text-sm text-rose-700">{geoError}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadState === "loading" ? (
              <div className="col-span-full py-20 text-center text-sm text-warm-charcoal/50">กำลังโหลดรายชื่อโรงเรียน…</div>
            ) : loadState === "error" ? (
              <div className="col-span-full py-20 text-center">
                <h3 className="font-semibold text-warm-charcoal text-lg mb-1">โหลดรายชื่อโรงเรียนไม่สำเร็จ</h3>
                <p className="text-warm-charcoal/60 text-sm">ลองรีเฟรชหน้านี้อีกครั้ง</p>
              </div>
            ) : paginatedSchools.length > 0
              ? paginatedSchools.map((school) => (
                <SchoolCard
                  key={school.id}
                  school={school}
                  compareIds={compareIds}
                  favorites={favorites}
                  onToggleCompare={onToggleCompare}
                  onToggleFavorite={onToggleFavorite}
                  onSchoolClick={onSchoolClick}
                  onCompareLimitReached={onCompareLimitReached}
                />
              ))
              : <NoResults onReset={() => setFilters(DEFAULT_FILTERS)} />
            }
          </div>

          {filteredSchools.length > 0 && totalPages > 1 && (
            <div className="mt-12 flex items-center gap-1.5 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3.5 h-9 rounded-full text-xs font-semibold border border-warm-accent bg-warm-cream text-warm-charcoal hover:border-warm-bronze disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">ก่อนหน้า</span>
              </button>

              {getPageNumbers(currentPage, totalPages).map((p, idx) => {
                if (p === "...") {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-warm-charcoal/40 select-none">
                      …
                    </span>
                  );
                }
                const pageNum = Number(p);
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={`page-${pageNum}`}
                    type="button"
                    onClick={() => handlePageChange(pageNum)}
                    className={`min-w-9 h-9 px-2.5 rounded-full text-xs font-bold transition-colors flex items-center justify-center cursor-pointer ${
                      isActive
                        ? "bg-warm-charcoal text-white"
                        : "border border-warm-accent bg-warm-cream text-warm-charcoal hover:border-warm-bronze"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3.5 h-9 rounded-full text-xs font-semibold border border-warm-accent bg-warm-cream text-warm-charcoal hover:border-warm-bronze disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <span className="hidden sm:inline">ถัดไป</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── MAP ───────────────────────────────────────────────────────────── */}
      <section className="py-12 border-t border-warm-accent/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <NearbySchools schools={schools} onOpenSchool={onSchoolClick} />
        </div>
      </section>

      {/* ── TOOLS ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-12 border-t border-warm-accent/60 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-warm-charcoal mb-6">เครื่องมือวางแผน</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-[2rem] border border-warm-accent bg-warm-cream p-6 flex flex-col">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-warm-bronze text-white mb-4">
                <Calculator className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-warm-charcoal mb-1.5">คำนวณค่าใช้จ่าย</h3>
              <p className="text-sm text-warm-charcoal/70 leading-relaxed mb-6">
                รวมค่าเทอมและค่าแรกเข้าตลอดปีที่ลูกจะเรียน
              </p>
              <button
                onClick={onOpenCalculator}
                className="mt-auto self-start inline-flex items-center gap-2 rounded-full bg-warm-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:bg-warm-charcoal/90 transition-colors cursor-pointer"
              >
                เปิดเครื่องคำนวณ
                <ArrowRight className="size-4" />
              </button>
            </div>

            <div className="rounded-[2rem] border border-warm-accent bg-warm-cream p-6 flex flex-col">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-warm-charcoal text-white mb-4">
                <MessageSquare className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-warm-charcoal mb-1.5">ผู้ช่วยเลือกโรงเรียน AI</h3>
              <p className="text-sm text-warm-charcoal/70 leading-relaxed mb-6">
                บอกสิ่งที่ต้องการ แล้วรับรายชื่อโรงเรียนที่น่าไปดู
              </p>
              <div className="mt-auto flex items-center gap-3">
                <button
                  onClick={() => onRestrictedAction("ผู้ช่วยเลือกโรงเรียนใช้ได้เมื่อเข้าสู่ระบบ")}
                  className="inline-flex items-center gap-2 rounded-full border border-warm-charcoal px-5 py-2.5 text-sm font-semibold text-warm-charcoal hover:bg-warm-charcoal/5 transition-colors cursor-pointer"
                >
                  ลองใช้
                  <ArrowRight className="size-4" />
                </button>
                <span className="text-xs text-warm-charcoal/50">ต้องเข้าสู่ระบบ</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="bg-warm-charcoal py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-warm-bronze text-white">
              <BookOpen className="size-3.5" />
            </div>
            <span className="text-sm font-bold text-white">
              Skool<span className="text-warm-bronze">ly</span>
            </span>
          </div>
          <p className="text-xs text-white/50">ข้อมูลโรงเรียนจาก สช. และ ISAT · © 2026 Skoolly</p>
        </div>
      </footer>
    </div>
  );
}
