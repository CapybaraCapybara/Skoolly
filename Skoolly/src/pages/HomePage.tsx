import { useState, useEffect } from "react";
import Hero from "@/components/schools/Hero";
import { SchoolCard, formatTuition } from "@/components/schools/SchoolCard";
import { NoResults } from "@/components/schools/NoResults";
import { SchoolMap, EXAMPLE_SAVED_LOCATION } from "@/components/schools/SchoolMap";
import type { School, Filters } from "@/types";
import { CURRICULA, GRADES, LANGUAGES, LOCATIONS, MAX_COMPARE } from "@/constants";
import { getSchools } from "@/api/schoolsApi";

const DEFAULT_FILTERS: Filters = {
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
}

export function HomePage({
  compareIds,
  favorites,
  onToggleCompare,
  onToggleFavorite,
  onRestrictedAction,
  onSchoolClick,
  onOpenCalculator,
}: HomePageProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [schools, setSchools] = useState<School[]>([]);

  // ── Fetch schools from the API layer on mount ──────────────────────────────
  useEffect(() => {
    getSchools().then(setSchools);
  }, []);

  const filteredSchools = schools.filter((s) => {
    if (filters.curriculum !== "All Curricula" && s.curriculum !== filters.curriculum) return false;
    if (filters.language !== "All Languages" && s.language !== filters.language) return false;
    if (s.tuitionStart / 1000 > filters.tuitionMax) return false;
    if (filters.location === "Within 5 km" && s.distance > 5) return false;
    if (filters.location === "Within 10 km" && s.distance > 10) return false;
    if (filters.location === "Within 20 km" && s.distance > 20) return false;
    return true;
  });

  const setFilter = (key: keyof Filters, value: string | number) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      {/* ── HERO (Hero — nav hidden via CSS override) ───────────────────── */}
      <div className="[&_nav]:hidden">
        <Hero
          eyebrow="AI-POWERED SCHOOL MATCHING · THAILAND"
          headingPrefix="Find the Right International"
          headingHighlight="School"
          headingSuffix="For Your Child in Thailand"
          description="Compare 120+ accredited international schools by curriculum, cost, distance, and real parent reviews — with AI-powered personalised recommendations."
          primaryCtaLabel="Search Schools"
          primaryCtaHref="#schools"
          backgroundImage="https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&h=900&fit=crop&auto=format"
        />
      </div>

      {/* ── SEARCH / FILTER PANEL ─────────────────────────────────────────── */}
      <section className="relative z-10 -mt-12 pb-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-warm-cream rounded-[2rem] shadow-xl p-6 md:p-8 border border-warm-accent">
            <div className="flex items-center gap-2 mb-6">
              <svg className="w-4 h-4 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-warm-charcoal">Filter Schools</span>
              <span className="ml-auto text-xs text-warm-bronze font-bold">{filteredSchools.length} matches</span>
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
                  Max Annual Tuition — <span className="text-warm-bronze font-bold">{formatTuition(filters.tuitionMax * 1000)}</span>
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
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="sm:order-first text-sm text-warm-charcoal/60 hover:text-warm-charcoal font-semibold px-4 py-2.5 transition-colors"
              >
                Reset filters
              </button>
              <a
                href="#schools"
                className="flex-1 sm:flex-none sm:ml-auto flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 transition-all shadow-md active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search {filteredSchools.length} Schools
              </a>
            </div>
          </div>
        </div>
      </section>


      {/* ── PREMIUM FEATURES ──────────────────────────────────────────────── */}
      <section className="py-12 border-b border-warm-accent" style={{ background: "linear-gradient(180deg, #faf8f5 0%, #f3ece3 100%)" }}>
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-warm-cream border border-warm-accent rounded-full px-3 py-1 text-xs font-semibold text-warm-bronze mb-3">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Premium Features
            </div>
            <h2 className="font-sans text-3xl font-bold text-warm-charcoal mb-2">Make smarter decisions with AI</h2>
            <p className="text-warm-charcoal/70 text-sm max-w-md mx-auto">Create a free account to unlock personalised recommendations and financial planning tools.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* AI Chatbot */}
            <div
              className="relative group rounded-[2rem] overflow-hidden border border-warm-accent bg-warm-cream cursor-pointer transition-all hover:shadow-lg p-6 flex flex-col"
              onClick={() => onRestrictedAction("Create a free account to access the AI School Advisor — get personalised recommendations based on your child's age, learning style, and your family's priorities.")}
            >
              <div className="absolute top-0 right-0 bg-warm-charcoal text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-xl flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Account Required
              </div>
              <div className="flex-1">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-warm-charcoal text-white">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="font-bold text-warm-charcoal text-lg mb-2">AI School Advisor</h3>
                <p className="text-warm-charcoal/70 text-sm mb-4 leading-relaxed">
                  Chat with our AI to get personalised school shortlists based on your child's learning style, your commute, and your family's priorities.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Personalised ranking", "Chat interface", "Saved conversations"].map((tag) => (
                    <span key={tag} className="text-xs bg-warm-accent/50 text-warm-charcoal/80 border border-warm-accent/30 px-2.5 py-0.5 rounded-full font-medium">{tag}</span>
                  ))}
                </div>
                {/* Mock chat preview */}
                <div className="mt-4 rounded-xl bg-white/70 border border-warm-accent p-3 space-y-2 opacity-60 pointer-events-none select-none">
                  <div className="flex gap-2 items-start">
                    <div className="w-5 h-5 rounded-full bg-warm-bronze shrink-0 mt-0.5 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div className="text-xs text-warm-charcoal bg-white rounded-lg px-2.5 py-1.5 border border-warm-accent max-w-[80%]">
                      Based on your priorities, I recommend Bangkok Patana School...
                    </div>
                  </div>
                </div>
              </div>
              <button className="mt-6 w-full py-3 rounded-full text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 transition-all active:scale-[0.98]">
                Unlock AI Advisor →
              </button>
            </div>

            {/* Cost Calculator */}
            <div
              className="relative group rounded-[2rem] overflow-hidden border border-warm-accent bg-warm-cream cursor-pointer transition-all hover:shadow-lg p-6 flex flex-col"
              onClick={onOpenCalculator}
            >
              <div className="absolute top-0 right-0 bg-warm-bronze text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-xl flex items-center gap-1.5">
                Direct Access
              </div>
              <div className="flex-1">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-warm-bronze text-white">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-warm-charcoal text-lg mb-2">Personalised Cost Calculator</h3>
                <p className="text-warm-charcoal/70 text-sm mb-4 leading-relaxed">
                  Get a complete 12-year cost projection including tuition, registration, uniforms, transport, ECA, and exam fees — in THB or your home currency.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["12-year projection", "Multi-currency", "PDF export"].map((tag) => (
                    <span key={tag} className="text-xs bg-warm-accent/50 text-warm-charcoal/80 border border-warm-accent/30 px-2.5 py-0.5 rounded-full font-medium">{tag}</span>
                  ))}
                </div>
                {/* Mock cost bars */}
                <div className="mt-4 rounded-xl bg-white/70 border border-warm-accent p-3 opacity-60 pointer-events-none select-none">
                  {[["Tuition", 82], ["Transport", 22], ["Activities", 15]].map(([label, pct]) => (
                    <div key={label as string} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-warm-charcoal/50 w-16 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-warm-accent">
                        <div className="h-1.5 rounded-full bg-warm-bronze" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="mt-6 w-full py-3 rounded-full text-sm font-semibold text-warm-charcoal border border-warm-charcoal hover:bg-warm-charcoal/5 transition-all active:scale-[0.98]">
                Open Cost Calculator →
              </button>
            </div>
          </div>
        </div>
      </section>


      {/* ── SCHOOL LISTINGS ───────────────────────────────────────────────────── */}
      <section id="schools" className="py-10 pb-28">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl text-navy-900 font-bold">International Schools in Thailand</h2>
              <p className="text-slate-500 text-sm mt-1">
                {filteredSchools.length} school{filteredSchools.length !== 1 ? "s" : ""} match your criteria
                {compareIds.length > 0 && <span className="ml-2 text-teal-600 font-medium">· {compareIds.length} selected to compare</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5 text-teal-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Guest compare limit: {MAX_COMPARE} schools</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
            {filteredSchools.length > 0
              ? filteredSchools.map((school) => (
                <SchoolCard
                  key={school.id}
                  school={school}
                  compareIds={compareIds}
                  favorites={favorites}
                  onToggleCompare={onToggleCompare}
                  onToggleFavorite={onToggleFavorite}
                  onRestrictedAction={onRestrictedAction}
                  onSchoolClick={onSchoolClick}
                />
              ))
              : <NoResults onReset={() => setFilters(DEFAULT_FILTERS)} />
            }
          </div>

          {filteredSchools.length > 0 && (
            <div className="text-center mt-10">
              <button
                onClick={() => onRestrictedAction("Sign in to load all 120+ schools, apply advanced filters, and save your search preferences.")}
                className="px-6 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:border-teal-300 hover:text-teal-700 transition-all"
              >
                Load more schools →
              </button>
              <p className="text-xs text-slate-400 mt-2">Sign in to see all 120+ schools</p>
            </div>
          )}
        </div>
      </section>

      {/* ── MAP SECTION ───────────────────────────────────────────────────── */}
      <section className="py-12 border-t border-slate-200 bg-white">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <h2 className="font-display text-2xl text-navy-900">Schools Near You</h2>
              <p className="text-slate-500 text-sm mt-0.5">
                Showing schools within 10 km of your saved location
              </p>
            </div>
            {/* Saved location badge */}
            <div className="flex items-center gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-semibold text-teal-800">{EXAMPLE_SAVED_LOCATION.name}</div>
                <div className="text-xs text-teal-600">{EXAMPLE_SAVED_LOCATION.address}</div>
              </div>
              <button
                onClick={() => onRestrictedAction("Sign in to save and update your home location for accurate distance calculations.")}
                className="ml-2 text-xs text-teal-500 hover:text-teal-700 underline transition-colors shrink-0"
              >
                Change
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Map */}
            <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 440 }}>
              <SchoolMap />
            </div>

            {/* Legend / info panel */}
            <div className="flex flex-col gap-4">
              {/* Legend */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-navy-900 mb-3">Map Legend</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-navy-900">Your Location</div>
                      <div className="text-xs text-slate-500">Saved home / search origin</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-white border-2 border-teal-500 rounded-full px-2 py-0.5 text-xs font-bold text-navy-900 shrink-0">⭐ 4.8</div>
                    <div>
                      <div className="text-xs font-semibold text-navy-900">School Marker</div>
                      <div className="text-xs text-slate-500">Click for name, fee & distance</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-px border border-dashed border-teal-400 shrink-0" style={{ borderWidth: "1.5px" }} />
                    <div>
                      <div className="text-xs font-semibold text-navy-900">10 km Radius</div>
                      <div className="text-xs text-slate-500">Search area from your location</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Note card */}
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="text-xs font-semibold text-amber-800 mb-1">Demo Mode</div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This map uses an example location in Sukhumvit. The live version will use Google Maps with your actual saved address.
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => onRestrictedAction("Sign in to set your real home address and see accurate distances to every school.")}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}
              >
                Set My Real Location →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#0a1628" }} className="text-slate-400 py-10">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span className="text-slate-300 text-sm font-medium">Skoolly Thailand</span>
          </div>
          <p className="text-xs text-slate-500">© 2026 Skoolly. Helping families make confident choices.</p>
          <div className="flex items-center gap-4 text-xs">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
