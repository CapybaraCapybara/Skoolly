import { useState, useEffect, useMemo } from "react";
import { ArrowRight, BookOpen, Calculator, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import Hero, { type HeroStat } from "@/components/schools/Hero";
import { SchoolCard, formatTuition } from "@/components/schools/SchoolCard";
import { NoResults } from "@/components/schools/NoResults";
import { NearbySchools } from "@/components/schools/NearbySchools";
import type { School, Filters } from "@/types";
import { CURRICULA, GRADES, LANGUAGES, LOCATIONS, MAX_COMPARE } from "@/constants";
import { getSchools } from "@/api/schoolsApi";

const ITEMS_PER_PAGE = 9;

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
  searchQuery: "",
  curriculum: "All Curricula",
  gradeLevel: "All Grades",
  tuitionMax: 700,
  location: "Any Distance",
  language: "All Languages",
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
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
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
      { value: schools.length.toLocaleString("en-US"), label: "Schools" },
      { value: withFees.toLocaleString("en-US"), label: "With Fee Data" },
      { value: totalReviews.toLocaleString("en-US"), label: "Parent Reviews" },
    ];
  }, [schools]);

  const averageRating = useMemo(() => {
    const rated = schools.filter((s) => s.reviewCount > 0 && s.rating > 0);
    const weight = rated.reduce((sum, s) => sum + s.reviewCount, 0);
    if (weight === 0) return null;
    return rated.reduce((sum, s) => sum + s.rating * s.reviewCount, 0) / weight;
  }, [schools]);

  // Reset to page 1 whenever applied filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters]);

  // Filter based on applied filters, not instantly on typing
  const filteredSchools = schools.filter((s) => {
    // School name search (matches English name, Thai name, or location)
    if (appliedFilters.searchQuery && appliedFilters.searchQuery.trim() !== "") {
      const q = appliedFilters.searchQuery.toLowerCase().trim();
      const matchEn = s.name.toLowerCase().includes(q);
      const matchTh = s.nameTh ? s.nameTh.toLowerCase().includes(q) : false;
      const matchLoc = s.location ? s.location.toLowerCase().includes(q) : false;
      if (!matchEn && !matchTh && !matchLoc) return false;
    }
    if (appliedFilters.curriculum !== "All Curricula" && s.curriculum !== appliedFilters.curriculum) return false;
    if (appliedFilters.gradeLevel !== "All Grades") {
      const g = (s.grades || "").toLowerCase();
      const gl = appliedFilters.gradeLevel;
      if (gl.includes("Pre-K") && !g.match(/pre-k|kindergarten|อนุบาล|early|ey|nursery|kg/i)) return false;
      if (gl.includes("Primary") && !g.match(/primary|ประถม|gr 1|grade 1|year 1|k - 12|k-12/i)) return false;
      if (gl.includes("Middle") && !g.match(/middle|มัธยมต้น|gr 6|grade 6|year 7|k - 12|k-12/i)) return false;
      if (gl.includes("High") && !g.match(/high|มัธยมปลาย|secondary|gr 9|grade 9|year 10|sixth form|k - 12|k-12/i)) return false;
    }
    if (appliedFilters.language !== "All Languages" && s.language !== appliedFilters.language) return false;
    if (s.tuitionStart / 1000 > appliedFilters.tuitionMax) return false;
    if (appliedFilters.location === "Within 5 km" && s.distance > 5) return false;
    if (appliedFilters.location === "Within 10 km" && s.distance > 10) return false;
    if (appliedFilters.location === "Within 20 km" && s.distance > 20) return false;
    return true;
  });

  const setFilter = (key: keyof Filters, value: string | number) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

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
      {/* ── HERO (Hero — nav hidden via CSS override) ───────────────────── */}
      <div className="[&_nav]:hidden">
        <Hero
          eyebrow="School directory · Thailand"
          headingPrefix="Find the Right International"
          headingHighlight="School"
          headingSuffix="For Your Child"
          description={`Compare fees, curricula and locations across ${schools.length > 0 ? `${schools.length.toLocaleString("en-US")} ` : ""}licensed international schools.`}
          primaryCtaLabel="Search Schools"
          primaryCtaHref="#schools"
          backgroundImage="https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=1600&h=900&fit=crop&auto=format"
          stats={heroStats}
          averageRating={averageRating}
        />
      </div>

      {/* ── SEARCH / FILTER PANEL ─────────────────────────────────────────── */}
      <section className="relative z-10 -mt-12 pb-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-warm-cream rounded-[2rem] shadow-xl p-6 md:p-8 border border-warm-accent">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-warm-charcoal">Filter Schools</span>
              <span className="ml-auto text-xs text-warm-bronze font-bold">{filteredSchools.length} matches</span>
            </div>

            {/* School Name Instant Search Bar (Filter ทันที) */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">
                Search School Name / ค้นหาชื่อโรงเรียน
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={filters.searchQuery || ""}
                  onChange={(e) => setFilter("searchQuery", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAppliedFilters(filters);
                      document.getElementById("schools")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  placeholder="พิมพ์ค้นหาชื่อโรงเรียนภาษาไทย หรือ English (เช่น Bangkok Prep, NIST, ร่วมฤดี)..."
                  className="w-full border border-warm-accent rounded-xl pl-10 pr-10 py-3 text-sm text-warm-charcoal bg-white/90 placeholder:text-warm-charcoal/40 focus:outline-none focus:ring-2 focus:ring-warm-bronze transition shadow-inner"
                />
                <svg className="w-4 h-4 text-warm-charcoal/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {filters.searchQuery && (
                  <button
                    type="button"
                    onClick={() => setFilter("searchQuery", "")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-warm-charcoal/50 hover:text-warm-charcoal bg-warm-accent/50 hover:bg-warm-accent rounded-full w-5 h-5 flex items-center justify-center cursor-pointer transition-colors"
                    title="ล้างข้อความค้นหา"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              {/* Curriculum */}
              <div>
                <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">Curriculum</label>
                <select
                  value={filters.curriculum}
                  onChange={(e) => setFilter("curriculum", e.target.value)}
                  className="w-full border border-warm-accent rounded-xl px-3 py-3 text-sm text-warm-charcoal bg-white/70 focus:outline-none focus:ring-2 focus:ring-warm-bronze transition"
                >
                  {CURRICULA.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Grade Level */}
              <div>
                <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">Grade Level</label>
                <select
                  value={filters.gradeLevel}
                  onChange={(e) => setFilter("gradeLevel", e.target.value)}
                  className="w-full border border-warm-accent rounded-xl px-3 py-3 text-sm text-warm-charcoal bg-white/70 focus:outline-none focus:ring-2 focus:ring-warm-bronze transition"
                >
                  {GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>

              {/* Teaching Language */}
              <div>
                <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">Teaching Language</label>
                <select
                  value={filters.language}
                  onChange={(e) => setFilter("language", e.target.value)}
                  className="w-full border border-warm-accent rounded-xl px-3 py-3 text-sm text-warm-charcoal bg-white/70 focus:outline-none focus:ring-2 focus:ring-warm-bronze transition"
                >
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">Location / Distance</label>
                <select
                  value={filters.location}
                  onChange={(e) => setFilter("location", e.target.value)}
                  className="w-full border border-warm-accent rounded-xl px-3 py-3 text-sm text-warm-charcoal bg-white/70 focus:outline-none focus:ring-2 focus:ring-warm-bronze transition"
                >
                  {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>

              {/* Tuition Range */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-bold text-warm-charcoal/60 mb-1.5 uppercase tracking-wider">
                  Max Annual Tuition: <span className="text-warm-bronze font-bold">{formatTuition(filters.tuitionMax * 1000)}</span>
                </label>
                <div className="flex items-center gap-3 py-2">
                  <span className="text-xs text-warm-charcoal/50 shrink-0">฿100K</span>
                  <input
                    type="range"
                    min={100}
                    max={700}
                    step={10}
                    value={filters.tuitionMax}
                    onChange={(e) => setFilter("tuitionMax", Number(e.target.value))}
                    className="flex-1 h-1.5 rounded-full accent-warm-bronze bg-warm-accent"
                  />
                  <span className="text-xs text-warm-charcoal/50 shrink-0">฿700K+</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-warm-accent/40">
              <button
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setAppliedFilters(DEFAULT_FILTERS);
                }}
                className="sm:order-first text-sm text-warm-charcoal/60 hover:text-warm-charcoal font-semibold px-4 py-2.5 transition-colors cursor-pointer"
              >
                Reset filters
              </button>
              <button
                onClick={() => {
                  setAppliedFilters(filters);
                  document.getElementById("schools")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex-1 sm:flex-none sm:ml-auto flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 transition-all shadow-md active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search Schools
              </button>
            </div>
          </div>
        </div>
      </section>


      {/* ── SCHOOL LISTINGS ───────────────────────────────────────────────────── */}
      <section id="schools" className="py-12 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-charcoal">International Schools in Thailand</h2>
              <p className="text-warm-charcoal/60 text-sm mt-1">
                {filteredSchools.length} school{filteredSchools.length !== 1 ? "s" : ""}
                {filteredSchools.length > ITEMS_PER_PAGE && (
                  <> · showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredSchools.length)}</>
                )}
                {compareIds.length > 0 && <span className="text-warm-bronze font-medium"> · {compareIds.length} selected to compare</span>}
              </p>
            </div>
            <span className="text-xs text-warm-charcoal/60">Compare up to {MAX_COMPARE} schools</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadState === "loading" ? (
              <div className="col-span-full py-20 text-center text-sm text-warm-charcoal/50">Loading schools…</div>
            ) : loadState === "error" ? (
              <div className="col-span-full py-20 text-center">
                <h3 className="font-semibold text-warm-charcoal text-lg mb-1">Couldn't load schools</h3>
                <p className="text-warm-charcoal/60 text-sm">Please try refreshing the page in a moment.</p>
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
                  onRestrictedAction={onRestrictedAction}
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
                <span className="hidden sm:inline">Previous</span>
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
                <span className="hidden sm:inline">Next</span>
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
          <h2 className="text-2xl font-bold tracking-tight text-warm-charcoal mb-6">Planning Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-[2rem] border border-warm-accent bg-warm-cream p-6 flex flex-col">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-warm-bronze text-white mb-4">
                <Calculator className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-warm-charcoal mb-1.5">Cost Calculator</h3>
              <p className="text-sm text-warm-charcoal/70 leading-relaxed mb-6">
                Add up tuition and one-time fees for the years your child will attend.
              </p>
              <button
                onClick={onOpenCalculator}
                className="mt-auto self-start inline-flex items-center gap-2 rounded-full bg-warm-charcoal px-5 py-2.5 text-sm font-semibold text-white hover:bg-warm-charcoal/90 transition-colors cursor-pointer"
              >
                Open calculator
                <ArrowRight className="size-4" />
              </button>
            </div>

            <div className="rounded-[2rem] border border-warm-accent bg-warm-cream p-6 flex flex-col">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-warm-charcoal text-white mb-4">
                <MessageSquare className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-warm-charcoal mb-1.5">AI School Advisor</h3>
              <p className="text-sm text-warm-charcoal/70 leading-relaxed mb-6">
                Describe what you are looking for and get a shortlist of schools to visit.
              </p>
              <div className="mt-auto flex items-center gap-3">
                <button
                  onClick={() => onRestrictedAction("Sign in to use the AI School Advisor.")}
                  className="inline-flex items-center gap-2 rounded-full border border-warm-charcoal px-5 py-2.5 text-sm font-semibold text-warm-charcoal hover:bg-warm-charcoal/5 transition-colors cursor-pointer"
                >
                  Try the advisor
                  <ArrowRight className="size-4" />
                </button>
                <span className="text-xs text-warm-charcoal/50">Sign-in required</span>
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
          <p className="text-xs text-white/50">School data from OPEC and ISAT · © 2026 Skoolly</p>
        </div>
      </footer>
    </div>
  );
}
