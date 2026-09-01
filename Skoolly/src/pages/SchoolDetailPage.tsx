import { useState, useEffect } from "react";
import type { School, SchoolDetail } from "@/types";
import { getSchoolDetail } from "@/api/schoolsApi";

// ─── StarRating ─────────────────────────────────────────────────────────────
function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className={sz} viewBox="0 0 20 20" fill={s <= Math.round(rating) ? "#f59e0b" : "#d1d5db"}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

// ─── Tab list ────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Fees", "Gallery", "Reviews", "Forum"];

// ─── Props ───────────────────────────────────────────────────────────────────
interface SchoolDetailPageProps {
  school: School;
  onBack: () => void;
  onForum: () => void;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export function SchoolDetailPage({ school, onBack, onForum }: SchoolDetailPageProps) {
  const [tab, setTab] = useState("Overview");
  const [detail, setDetail] = useState<SchoolDetail | null>(null);

  // ── Fetch extended school detail from the API layer on mount ───────────────
  useEffect(() => {
    getSchoolDetail(school.id).then((d) => setDetail(d ?? null));
  }, [school.id]);

  if (!detail) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading school details…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="relative h-72 md:h-88 bg-navy-900 overflow-hidden">
        <img
          src={`https://images.unsplash.com/${school.image}?w=1400&h=600&fit=crop&auto=format`}
          alt={school.name}
          className="w-full h-full object-cover opacity-60"
        />
        {/* Draft watermark */}
        <div className="absolute top-4 right-4 bg-amber-400 text-amber-900 text-xs font-black px-3 py-1 rounded-full rotate-2 shadow-lg">
          PROTOTYPE DRAFT
        </div>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(10,22,40,0.85) 0%, transparent 60%)" }}
        />

        {/* Back button */}
        <button
          onClick={onBack}
          className="absolute top-5 left-5 flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white text-sm font-medium px-4 py-2 rounded-full transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* School name overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <div className="max-w-5xl mx-auto">
            {school.badge && (
              <span
                className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full text-white mb-2"
                style={{ background: "rgba(15,148,136,0.85)" }}
              >
                {school.badge}
              </span>
            )}
            <h1 className="font-display text-3xl md:text-4xl text-white mb-1">{school.name}</h1>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <StarRating rating={school.rating} size="lg" />
                <span className="text-white font-semibold">{school.rating}</span>
                <span className="text-slate-300 text-sm">({school.reviewCount} reviews)</span>
              </div>
              <span className="text-slate-300 text-sm">·</span>
              <span className="text-slate-300 text-sm">{school.location}</span>
              <span className="text-slate-300 text-sm">·</span>
              <span className="text-slate-300 text-sm">{school.curriculum} Curriculum</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => (t === "Forum" ? onForum() : setTab(t))}
              className={`px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t && t !== "Forum"
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-navy-900"
                }`}
            >
              {t === "Forum" ? "💬 " + t : t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="font-semibold text-navy-900 text-lg mb-3">About the School</h2>
                <p className="text-slate-600 text-sm leading-relaxed">{detail.about}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="font-semibold text-navy-900 text-lg mb-3">Facilities</h2>
                <div className="grid grid-cols-2 gap-2">
                  {detail.facilities.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-slate-700">
                      <svg className="w-4 h-4 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Campus Safety & Safeguarding Highlight Card */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="font-semibold text-navy-900 text-lg leading-tight">Campus Safety & Safeguarding</h2>
                      <span className="text-xs text-teal-700 font-medium">Scraped & Verified Policy Standards</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("Safety & Security")}
                    className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    View details →
                  </button>
                </div>

                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  {detail.safety?.summary || "Comprehensive campus safety protocols, 24/7 security guard patrol, and child safeguarding standards."}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">🛡️</span>
                    <span className="font-medium text-slate-700">24/7 Gated Security</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">🩺</span>
                    <span className="font-medium text-slate-700">Full-time Nurse</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">📜</span>
                    <span className="font-medium text-slate-700">Child Safeguarding</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">📹</span>
                    <span className="font-medium text-slate-700">CCTV Coverage</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">💨</span>
                    <span className="font-medium text-slate-700">PM2.5 Filtration</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <span className="text-base">🚨</span>
                    <span className="font-medium text-slate-700">Emergency Drills</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-navy-900 mb-3 text-sm">Quick Facts</h3>
                <div className="space-y-2.5">
                  {[
                    ["Founded", detail.founded],
                    ["Students", detail.students],
                    ["Curriculum", school.curriculum],
                    ["Language", school.language],
                    ["Grades", school.grades],
                    ["Distance", `${school.distance} km from saved location`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-medium text-navy-900 text-right max-w-[55%]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-navy-900 mb-2 text-sm">Accreditation</h3>
                <div className="flex flex-wrap gap-2">
                  {detail.accreditation.map((a) => (
                    <span key={a} className="bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-navy-900 mb-3 text-sm">Starting Tuition</h3>
                <div className="text-2xl font-bold text-navy-900">฿{(school.tuitionStart / 1000).toFixed(0)}K</div>
                <div className="text-xs text-slate-500 mt-0.5">per year · see Fees tab for full breakdown</div>
                <button
                  onClick={() => setTab("Fees")}
                  className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                >
                  View full fee schedule →
                </button>
              </div>

              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                <div className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Prototype Note
                </div>
                <p className="text-xs text-amber-700">
                  This is a draft school profile. In the live version, you'll see verified data, direct school contact, virtual tours, and an enquiry form.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── FEES ─────────────────────────────────────────────────────────── */}
        {tab === "Fees" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <h2 className="font-semibold text-navy-900 text-lg mb-1">{school.name} — Fee Schedule</h2>
              <p className="text-xs text-slate-500 mb-5">Academic Year 2025–26 · All amounts in Thai Baht. Fees subject to annual increases.</p>
              <div className="space-y-2">
                {detail.fees.map((f, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-3 px-4 rounded-xl text-sm ${i % 2 === 0 ? "bg-slate-50" : "bg-white border border-slate-100"
                      }`}
                  >
                    <span className="text-slate-700">{f.label}</span>
                    <span className="font-bold text-navy-900">{f.amount}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 bg-teal-50 border border-teal-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-teal-800 mb-1">12-Year Cost Estimate</div>
                <div className="text-xs text-teal-700">
                  Sign in to access the Personalised Cost Calculator — see total 12-year projections including registration, uniforms, transport, and activity fees, with PDF export.
                </div>
                <button className="mt-2 text-xs font-semibold text-teal-700 underline">Unlock calculator →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SAFETY & SECURITY ───────────────────────────────────────────── */}
        {tab === "Safety & Security" && (
          <div className="max-w-4xl space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-teal-900 to-navy-900 rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold px-3 py-1 rounded-full">
                    <span>🛡️ Verified School Safeguarding & Security Profile</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold">{school.name} Campus Safety</h2>
                  <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
                    {detail.safety?.summary ||
                      "Our scraper continually verifies safety measures, child safeguarding compliance, health clinic readiness, and campus security policies."}
                  </p>
                </div>
                {detail.safety?.policyUrl && (
                  <a
                    href={detail.safety.policyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 flex items-center gap-2 bg-white text-navy-900 hover:bg-teal-50 text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all"
                  >
                    <span>Read Official Policy PDF</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* 4 Core Safety Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pillar 1: Campus Security */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 text-lg">
                    🛡️
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 text-base">Campus Security & Access Control</h3>
                    <span className="text-xs text-slate-500">Perimeter & Gate Security</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Security Guards:</strong> {detail.safety?.securityGuards || "24/7 Gate & Campus Guard Station"}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>CCTV Surveillance:</strong> {detail.safety?.cctv || "24-hour perimeter & common area CCTV recording"}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Visitor Control:</strong> {detail.safety?.visitorControl || "Mandatory ID registration & guest lanyard badge"}</span>
                  </div>
                </div>
              </div>

              {/* Pillar 2: Healthcare & Nurse Clinic */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-lg">
                    🩺
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 text-base">Health, Medical & Clinic</h3>
                    <span className="text-xs text-slate-500">Emergency & On-site Healthcare</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Medical Personnel:</strong> {detail.safety?.medicalNurse || "Full-time certified registered nurse on campus"}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>First-Aid & Emergency:</strong> Dedicated medical room with AED defibrillator and ambulance emergency lane protocol.</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Safeguarding & Child Protection Policy */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 text-lg">
                    📜
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 text-base">Child Protection & Safeguarding</h3>
                    <span className="text-xs text-slate-500">Staff Screening & Student Well-being</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Safeguarding Policy:</strong> {detail.safety?.safeguardingPolicy || "Strict child protection policy aligned with international accreditation bodies."}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Staff Background Checks:</strong> 100% of teachers and non-academic staff undergo criminal background screening prior to appointment.</span>
                  </div>
                </div>
              </div>

              {/* Pillar 4: Air Quality & Emergency Drills */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-lg">
                    💨
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 text-base">Air Quality & Emergency Response</h3>
                    <span className="text-xs text-slate-500">PM2.5 Clean Air & Safety Drills</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Air Quality (PM2.5):</strong> {detail.safety?.airQualityPM25 || "Positive-pressure or HEPA filtration system across learning spaces."}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">✓</span>
                    <span><strong>Drills & Protocols:</strong> {detail.safety?.emergencyDrill || "Scheduled fire evacuation, weather alert, and lockdown drills each term."}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Safety Highlights Checklist */}
            {detail.safety?.highlights && detail.safety.highlights.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h3 className="font-bold text-navy-900 text-base mb-3 flex items-center gap-2">
                  <span>📋 Key Safety & Policy Highlights</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detail.safety.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-teal-600 font-bold mt-0.5">✦</span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GALLERY ──────────────────────────────────────────────────────── */}
        {tab === "Gallery" && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {detail.gallery.map((img, i) => (
                <div
                  key={i}
                  className={`overflow-hidden rounded-2xl bg-slate-100 ${i === 0 ? "col-span-2 row-span-2" : ""}`}
                  style={{ height: i === 0 ? 320 : 148 }}
                >
                  <img
                    src={`https://images.unsplash.com/${img}?w=600&h=400&fit=crop&auto=format`}
                    alt={`${school.name} campus photo ${i + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center mt-4">
              Representative campus photos. The live version will include school-verified photos and virtual tours.
            </p>
          </div>
        )}

        {/* ── REVIEWS ──────────────────────────────────────────────────────── */}
        {tab === "Reviews" && (
          <div className="max-w-2xl space-y-4">
            {/* Rating summary */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 flex items-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-bold text-navy-900">{school.rating}</div>
                <StarRating rating={school.rating} size="lg" />
                <div className="text-xs text-slate-500 mt-1">{school.reviewCount} reviews</div>
              </div>
              <div className="flex-1">
                {[5, 4, 3, 2, 1].map((s) => {
                  const pct = s === 5 ? 68 : s === 4 ? 22 : s === 3 ? 7 : s === 2 ? 2 : 1;
                  return (
                    <div key={s} className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-500 w-2">{s}</span>
                      <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <div className="flex-1 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {detail.reviews.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ background: "#0f9488" }}
                  >
                    {r.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-navy-900">{r.author}</span>
                      <span className="text-xs text-slate-400">{r.time}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StarRating rating={r.rating} />
                      <span className="text-xs text-slate-500">Child in {r.childYear}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{r.text}</p>
              </div>
            ))}

            <button className="w-full py-3 rounded-xl text-sm font-semibold border border-dashed border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
              + Write a review (sign in required)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
