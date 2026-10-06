import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { HomePage } from "@/pages/HomePage";
import { ForumPage } from "@/pages/ForumPage";
import { SchoolDetailPage } from "@/pages/SchoolDetailPage";
import { CostCalculatorPage } from "@/pages/CostCalculatorPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { AuthModal } from "@/components/layout/AuthModal";
import { CompareBar } from "@/components/schools/CompareBar";
import { CompareModal } from "@/components/schools/CompareModal";
import { CompareLimitModal } from "@/components/schools/CompareLimitModal";
import { getSchools } from "@/api/schoolsApi";
import type { School, View } from "@/types";

const AdminPage = lazy(() =>
  import("@/pages/SupabaseAdminPage").then((m) => ({ default: m.SupabaseAdminPage }))
);

function parseHashView(): View {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (
    hash === "admin" ||
    hash === "supabase-admin" ||
    hash === "database" ||
    hash === "supabase" ||
    hash === "db" ||
    hash === "scrape" ||
    hash === "scraper"
  ) {
    return "admin";
  }
  if (hash === "forum") return "forum";
  if (hash === "calculator") return "calculator";
  if (hash.startsWith("calculator/")) {
    const schoolId = parseInt(hash.replace("calculator/", ""), 10);
    if (!isNaN(schoolId)) return { type: "calculator", schoolId };
  }
  if (hash === "favorites" || hash === "saved") return "favorites";
  if (hash.startsWith("school/")) {
    const id = parseInt(hash.replace("school/", ""), 10);
    if (!isNaN(id)) return { type: "school", id };
  }
  return "home";
}

export default function App() {
  const [view, setView] = useState<View>(() => parseHashView());
  const [compareIds, setCompareIds] = useState<number[]>([]);
  // In-memory state for favorites (ready to sync with user_data.favorites in DB once logged in)
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [authModal, setAuthModal] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsState, setSchoolsState] = useState<"loading" | "ready" | "error">("loading");
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [replaceLimitSchool, setReplaceLimitSchool] = useState<School | null>(null);

  // ── Sync with browser URL hash ──────────────────────────────────────────
  useEffect(() => {
    const onHashChange = () => {
      setView(parseHashView());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── Fetch schools once at app level (used by CompareBar & SchoolDetailPage) ─
  useEffect(() => {
    getSchools()
      .then((data) => {
        setSchools(data);
        setSchoolsState("ready");
      })
      .catch(() => setSchoolsState("error"));
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    if (window.location.hash) {
      window.history.pushState(null, "", window.location.pathname);
    }
    window.scrollTo(0, 0);
  }, []);

  const goFavorites = useCallback(() => {
    setView("favorites");
    window.location.hash = "favorites";
    window.scrollTo(0, 0);
  }, []);

  const goForum = useCallback(() => {
    setView("forum");
    window.location.hash = "forum";
    window.scrollTo(0, 0);
  }, []);

  const goCalculator = useCallback((schoolId?: number) => {
    setView(schoolId ? { type: "calculator", schoolId } : "calculator");
    // Keep the school in the hash, otherwise the hashchange listener resets the view and drops it
    window.location.hash = schoolId ? `calculator/${schoolId}` : "calculator";
    window.scrollTo(0, 0);
  }, []);

  const goSchool = useCallback((id: number) => {
    setView({ type: "school", id });
    window.location.hash = `school/${id}`;
    window.scrollTo(0, 0);
  }, []);

  const goAdmin = useCallback(() => {
    setView("admin");
    window.location.hash = "admin";
    window.scrollTo(0, 0);
  }, []);

  const clearAllFavorites = useCallback(() => {
    setFavorites(new Set());
  }, []);

  const showAuth = useCallback((reason: string) => setAuthModal(reason), []);

  function toggleCompare(id: number) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  }

  function toggleFavorite(id: number) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // If in admin view, render Database AdminPage in full screen
  if (view === "admin" || view === "supabase-admin") {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen grid place-items-center bg-[#f8f6f1] text-xs text-[#14284b]/60">
            กำลังโหลดระบบบริหารจัดการฐานข้อมูล (Admin Database)...
          </div>
        }
      >
        <AdminPage onBack={goHome} />
      </Suspense>
    );
  }

  const navBar = (
    <div className="sticky top-0 z-30 bg-warm-bg/95 border-b border-warm-accent/30" style={{ backdropFilter: "blur(12px)" }}>
      <Navbar
        onSignUp={() => showAuth("Create an account to save schools and use the AI advisor.")}
        onLogin={() => showAuth("Sign in to your Skoolly account.")}
        compareCount={compareIds.length}
        favoritesCount={favorites.size}
        onFavorites={goFavorites}
        onCompare={() => setCompareModalOpen(true)}
        onCalculator={() => goCalculator()}
        onForum={goForum}
        onHome={goHome}
        onAdmin={goAdmin}
        onScrape={goAdmin}
      />
    </div>
  );

  let pageContent;
  if (view === "forum") {
    pageContent = <ForumPage onSchoolClick={goSchool} />;
  } else if (view === "calculator" || (typeof view === "object" && view.type === "calculator")) {
    const initialId = typeof view === "object" && "schoolId" in view ? view.schoolId : undefined;
    pageContent = (
      <CostCalculatorPage
        initialSchoolId={initialId}
        onBack={goHome}
        onSelectSchool={goSchool}
      />
    );
  } else if (typeof view === "object" && view.type === "school") {
    const school = schools.find((s) => s.id === view.id);
    pageContent = school ? (
      <SchoolDetailPage
        school={school}
        onBack={goHome}
        onForum={goForum}
        onOpenCalculator={() => goCalculator(school.id)}
      />
    ) : (
      // No fallback to another school: an unknown id or a failed load says so
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-sm text-slate-500">
        {schoolsState === "loading" ? (
          "กำลังโหลดข้อมูลโรงเรียน…"
        ) : (
          <>
            <span>{schoolsState === "error" ? "โหลดข้อมูลโรงเรียนไม่สำเร็จ" : "ไม่พบโรงเรียนนี้"}</span>
            <button onClick={goHome} className="font-semibold text-warm-bronze hover:underline">
              ← กลับไปหน้ารายชื่อ
            </button>
          </>
        )}
      </div>
    );
  } else if (view === "favorites") {
    pageContent = (
      <FavoritesPage
        schools={schools}
        favorites={favorites}
        compareIds={compareIds}
        onToggleFavorite={toggleFavorite}
        onToggleCompare={toggleCompare}
        onSchoolClick={goSchool}
        onOpenCalculator={goCalculator}
        onOpenCompare={(ids) => {
          if (ids && ids.length > 0) {
            setCompareIds(ids.slice(0, 3));
          }
          setCompareModalOpen(true);
        }}
        onExplore={goHome}
        onClearAllFavorites={clearAllFavorites}
      />
    );
  } else {
    pageContent = (
      <HomePage
        compareIds={compareIds}
        favorites={favorites}
        onToggleCompare={toggleCompare}
        onToggleFavorite={toggleFavorite}
        onRestrictedAction={showAuth}
        onSchoolClick={goSchool}
        onOpenCalculator={() => goCalculator()}
        onCompareLimitReached={(school) => setReplaceLimitSchool(school)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {navBar}
      {pageContent}

      {/* ── COMPARE BAR ───────────────────────────────────────────────────── */}
      {(view === "home" || view === "favorites") && compareIds.length > 0 && (
        <CompareBar
          compareIds={compareIds}
          schools={schools}
          onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
          onClear={() => setCompareIds([])}
          onCompareClick={() => setCompareModalOpen(true)}
        />
      )}

      {/* ── SIDE-BY-SIDE COMPARE MODAL (GUEST & USER) ─────────────────────── */}
      {compareModalOpen && (
        <CompareModal
          compareIds={compareIds}
          schools={schools}
          onClose={() => setCompareModalOpen(false)}
          onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
          onSchoolClick={goSchool}
          onOpenCalculator={(schoolId) => {
            setCompareModalOpen(false);
            goCalculator(schoolId);
          }}
          onSaveComparison={() => showAuth("Sign in to save this comparison.")}
        />
      )}

      {/* ── 4TH SCHOOL LIMIT REPLACE MODAL ─────────────────────────────────── */}
      {replaceLimitSchool && (
        <CompareLimitModal
          currentSchools={schools.filter((s) => compareIds.includes(s.id))}
          newSchool={replaceLimitSchool}
          onReplace={(removeId, addId) => {
            setCompareIds((prev) => [...prev.filter((id) => id !== removeId), addId]);
            setReplaceLimitSchool(null);
          }}
          onClose={() => setReplaceLimitSchool(null)}
        />
      )}

      {/* ── AUTH MODAL ────────────────────────────────────────────────────── */}
      {authModal && <AuthModal reason={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  );
}
