import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { HomePage } from "@/pages/HomePage";
import { ForumPage } from "@/pages/ForumPage";
import { SchoolDetailPage } from "@/pages/SchoolDetailPage";
import { AuthModal } from "@/components/layout/AuthModal";
import { CompareBar } from "@/components/schools/CompareBar";
import { getSchools } from "@/api/schoolsApi";
import type { School, View } from "@/types";

import { OpecAdminPage } from "@/pages/OpecAdminPage";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [authModal, setAuthModal] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);

  // ── Fetch schools once at app level (used by CompareBar & SchoolDetailPage) ─
  useEffect(() => {
    getSchools().then(setSchools);
  }, []);

  const goHome = useCallback(() => { setView("home"); window.scrollTo(0, 0); }, []);
  const goForum = useCallback(() => { setView("forum"); window.scrollTo(0, 0); }, []);
  const goSchool = useCallback((id: number) => { setView({ type: "school", id }); window.scrollTo(0, 0); }, []);
  const goAdmin = useCallback(() => { setView("admin"); window.scrollTo(0, 0); }, []);

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

  // If in admin view, render OpecAdminPage in full screen
  if (view === "admin") {
    return <OpecAdminPage onBack={goHome} />;
  }

  const navBar = (
    <div className="sticky top-0 z-30 bg-warm-bg/95 border-b border-warm-accent/30" style={{ backdropFilter: "blur(12px)" }}>
      <Navbar
        onSignUp={() => showAuth("Create a free account to access personalised AI recommendations, save schools, and compare unlimited options.")}
        onLogin={() => showAuth("Sign in to your Skoolly account.")}
        compareCount={compareIds.length}
        onCompare={() => showAuth("Sign in to save and revisit your school comparisons anytime.")}
        onForum={goForum}
        onHome={goHome}
        onAdmin={goAdmin}
      />
    </div>
  );

  let pageContent;
  if (view === "forum") {
    pageContent = <ForumPage onSchoolClick={goSchool} />;
  } else if (typeof view === "object" && view.type === "school") {
    const school = schools.find((s) => s.id === view.id) ?? schools[0];
    pageContent = school
      ? <SchoolDetailPage school={school} onBack={goHome} onForum={goForum} />
      : null;
  } else {
    pageContent = (
      <HomePage
        compareIds={compareIds}
        favorites={favorites}
        onToggleCompare={toggleCompare}
        onToggleFavorite={toggleFavorite}
        onRestrictedAction={showAuth}
        onSchoolClick={goSchool}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {navBar}
      {pageContent}

      {/* ── COMPARE BAR ───────────────────────────────────────────────────── */}
      {view === "home" && (
        <CompareBar
          compareIds={compareIds}
          schools={schools}
          onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
          onClear={() => setCompareIds([])}
          onCompareClick={() => showAuth("Sign in to view a full side-by-side comparison with detailed curriculum breakdowns, fees, and parent reviews.")}
        />
      )}

      {/* ── AUTH MODAL ────────────────────────────────────────────────────── */}
      {authModal && <AuthModal reason={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  );
}
