import { useState, useMemo } from "react";
import {
  Heart,
  Search,
  Filter,
  ArrowUpDown,
  Trash2,
  GitCompare,
  Calculator,
  ChevronRight,
  ExternalLink,
  MapPin,
  GraduationCap,
  BookOpen,
  StickyNote,
  Check,
  X,
} from "lucide-react";
import { School } from "@/types";
import { StarRating, formatTuition, getSchoolInitials } from "@/components/schools/SchoolCard";
import { badgeLabel, curriculumLabel, languageLabel, schoolNames } from "@/lib/labels";

interface FavoritesPageProps {
  schools: School[];
  favorites: Set<number>;
  compareIds: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onSchoolClick: (id: number) => void;
  onOpenCalculator: (schoolId?: number) => void;
  onOpenCompare: (selectedIds?: number[]) => void;
  onExplore: () => void;
  onClearAllFavorites?: () => void;
}

export function FavoritesPage({
  schools,
  favorites,
  compareIds,
  onToggleFavorite,
  onToggleCompare,
  onSchoolClick,
  onOpenCalculator,
  onOpenCompare,
  onExplore,
  onClearAllFavorites,
}: FavoritesPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCurriculum, setSelectedCurriculum] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "tuitionAsc" | "tuitionDesc" | "rating">("name");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // In-memory notes state (ready to sync with user_data in DB once auth is active)
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [activeNoteEditId, setActiveNoteEditId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const saveNote = (schoolId: number, text: string) => {
    const updated = { ...notes, [schoolId]: text.trim() };
    if (!text.trim()) {
      delete updated[schoolId];
    }
    setNotes(updated);
    setActiveNoteEditId(null);
  };

  // Filter list of favorited schools, strictly unique by id
  const favSchools = useMemo(() => {
    const seen = new Set<number>();
    const result: School[] = [];
    for (const s of schools) {
      if (favorites.has(s.id) && !seen.has(s.id)) {
        seen.add(s.id);
        result.push(s);
      }
    }
    return result;
  }, [schools, favorites]);

  // Available curriculums in user's favorites
  const curriculums = useMemo(() => {
    const list = Array.from(new Set(favSchools.map((s) => s.curriculum).filter(Boolean)));
    return list;
  }, [favSchools]);

  // Filtered & Sorted schools
  const displayedSchools = useMemo(() => {
    const result = favSchools.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.nameTh ? s.nameTh.toLowerCase().includes(q) : false) ||
        (s.location && s.location.toLowerCase().includes(q)) ||
        (s.curriculum && s.curriculum.toLowerCase().includes(q));

      const matchesCurriculum =
        selectedCurriculum === "all" ||
        s.curriculum.toLowerCase() === selectedCurriculum.toLowerCase();

      return matchesSearch && matchesCurriculum;
    });

    result.sort((a, b) => {
      if (sortBy === "tuitionAsc") {
        return (a.tuitionStart || 0) - (b.tuitionStart || 0);
      }
      if (sortBy === "tuitionDesc") {
        return (b.tuitionStart || 0) - (a.tuitionStart || 0);
      }
      if (sortBy === "rating") {
        return (b.rating || 0) - (a.rating || 0);
      }
      return schoolNames(a).primary.localeCompare(schoolNames(b).primary, "th");
    });

    return result;
  }, [favSchools, searchQuery, selectedCurriculum, sortBy]);

  // Statistics calculation for KPI cards
  const stats = useMemo(() => {
    const count = favSchools.length;
    if (count === 0) return null;

    const validTuition = favSchools
      .map((s) => s.tuitionStart)
      .filter((t): t is number => typeof t === "number" && t > 0);

    const minTuition = validTuition.length > 0 ? Math.min(...validTuition) : null;
    const maxTuition = validTuition.length > 0 ? Math.max(...validTuition) : null;
    const avgTuition =
      validTuition.length > 0
        ? Math.round(validTuition.reduce((a, b) => a + b, 0) / validTuition.length)
        : null;

    // Distinct locations
    const locations = Array.from(new Set(favSchools.map((s) => s.location.split("/")[0].trim())));

    return {
      count,
      minTuition,
      maxTuition,
      avgTuition,
      locationCount: locations.length,
    };
  }, [favSchools]);

  // Curated recommendation schools when empty
  const recommendedSchools = useMemo(() => {
    return schools.slice(0, 3);
  }, [schools]);

  return (
    <div className="min-h-screen bg-warm-bg text-warm-charcoal pb-24 font-sans">
      {/* ── Breadcrumb & Top Bar ────────────────────────────────────────────── */}
      <div className="border-b border-warm-accent/50 bg-warm-cream/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-warm-charcoal/60">
            <button
              onClick={onExplore}
              className="hover:text-warm-bronze transition-colors cursor-pointer"
            >
              หน้าแรก
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-warm-charcoal font-semibold">โรงเรียนที่ถูกใจ</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
        {/* ── Hero Title Section ───────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-warm-accent">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-warm-charcoal tracking-tight">
              โรงเรียนที่ถูกใจ
            </h1>
          </div>

          {favSchools.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onOpenCompare(favSchools.map((s) => s.id))}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-warm-charcoal text-white hover:bg-warm-charcoal/90 transition-all shadow-sm text-xs sm:text-sm font-semibold cursor-pointer"
              >
                <GitCompare className="w-4 h-4 text-warm-bronze" />
                <span>เปรียบเทียบ ({favSchools.length})</span>
              </button>

              <button
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full border border-warm-accent hover:border-rose-300 text-warm-charcoal/70 hover:text-rose-600 bg-white/70 transition-all text-xs font-semibold cursor-pointer"
                title="ล้างรายการโปรดทั้งหมด"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ล้างทั้งหมด</span>
              </button>
            </div>
          )}
        </div>

        {/* ── KPI Summary Cards (When items exist) ─────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4 mt-6">
            <div className="p-4 rounded-2xl bg-warm-cream border border-warm-accent shadow-2xs">
              <span className="text-xs font-medium text-warm-charcoal/60">บันทึกไว้</span>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-warm-charcoal flex items-baseline gap-1">
                {stats.count}
                <span className="text-xs font-normal text-warm-charcoal/60">แห่ง</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-warm-cream border border-warm-accent shadow-2xs">
              <span className="text-xs font-medium text-warm-charcoal/60">ค่าเทอมเริ่มต้นเฉลี่ย</span>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-warm-bronze">
                {stats.avgTuition ? (
                  <>
                    {formatTuition(stats.avgTuition)}
                    <span className="text-xs font-normal text-warm-charcoal/60 ml-1">/ปี</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-warm-charcoal/60">ไม่มีข้อมูล</span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-warm-cream border border-warm-accent shadow-2xs">
              <span className="text-xs font-medium text-warm-charcoal/60">ช่วงค่าเทอม</span>
              <div className="mt-1 text-sm sm:text-base font-semibold text-warm-charcoal">
                {stats.minTuition && stats.maxTuition
                  ? `${formatTuition(stats.minTuition)} - ${formatTuition(stats.maxTuition)}`
                  : "ไม่มีข้อมูล"}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-warm-cream border border-warm-accent shadow-2xs">
              <span className="text-xs font-medium text-warm-charcoal/60">ทำเล</span>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-warm-charcoal flex items-baseline gap-1">
                {stats.locationCount}
                <span className="text-xs font-normal text-warm-charcoal/60">พื้นที่</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Content Area ────────────────────────────────────────────── */}
        {favSchools.length === 0 ? (
          /* ── Empty State ── */
          <div className="mt-12 py-16 px-6 rounded-3xl bg-warm-cream border border-warm-accent/80 text-center max-w-3xl mx-auto shadow-sm">
            <div className="w-16 h-16 rounded-full bg-rose-100/70 border border-rose-200 text-rose-500 mx-auto flex items-center justify-center mb-5 shadow-inner">
              <Heart className="w-8 h-8 fill-rose-500" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-warm-charcoal">
              ยังไม่มีโรงเรียนในรายการโปรด
            </h2>
            <p className="mt-2.5 text-sm sm:text-base text-warm-charcoal/70 max-w-md mx-auto leading-relaxed">
              กดหัวใจบนการ์ดโรงเรียนเพื่อเก็บไว้ที่นี่
            </p>

            <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
              <button
                onClick={onExplore}
                className="px-6 py-3 rounded-full bg-warm-charcoal hover:bg-warm-charcoal/90 text-white text-sm font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-warm-bronze" />
                <span>ดูรายชื่อโรงเรียน</span>
              </button>
            </div>

            {/* Quick recommendation cards to start */}
            {recommendedSchools.length > 0 && (
              <div className="mt-14 pt-10 border-t border-warm-accent/60 text-left">
                <div className="text-xs font-bold text-warm-charcoal/60 mb-4">
                  ลองดูโรงเรียนเหล่านี้
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {recommendedSchools.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-2xl bg-white border border-warm-accent/80 flex flex-col justify-between hover:shadow-md transition-shadow"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warm-accent text-warm-charcoal">
                          {curriculumLabel(rec.curriculum)}
                        </span>
                        <h4 className="mt-2 text-sm font-bold text-warm-charcoal line-clamp-1">
                          {schoolNames(rec).primary}
                        </h4>
                        <p className="text-xs text-warm-charcoal/60 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-warm-bronze shrink-0" />
                          <span className="truncate">{rec.location}</span>
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-warm-accent/40 flex items-center justify-between">
                        <span className="text-xs font-bold text-warm-bronze">
                          {rec.tuitionStart > 0 ? `${formatTuition(rec.tuitionStart)}/ปี` : ""}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(rec.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer border border-rose-200"
                        >
                          <Heart className="w-3 h-3" />
                          <span>ถูกใจ</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Filter & Search Toolbar ── */
          <div className="mt-8 space-y-6">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-warm-cream p-3 rounded-2xl border border-warm-accent shadow-2xs">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-charcoal/40" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ ทำเล หรือหลักสูตร"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white rounded-xl border border-warm-accent focus:outline-none focus:border-warm-bronze text-warm-charcoal placeholder:text-warm-charcoal/40 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-charcoal/40 hover:text-warm-charcoal"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter & Sort controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Curriculum Dropdown / Filter */}
                <div className="flex items-center gap-1.5 bg-white border border-warm-accent rounded-xl px-2.5 py-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-warm-bronze" />
                  <select
                    value={selectedCurriculum}
                    onChange={(e) => setSelectedCurriculum(e.target.value)}
                    className="bg-transparent font-medium text-warm-charcoal focus:outline-none cursor-pointer"
                  >
                    <option value="all">ทุกหลักสูตร</option>
                    {curriculums.map((c) => (
                      <option key={c} value={c}>
                        {curriculumLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5 bg-white border border-warm-accent rounded-xl px-2.5 py-1.5 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-warm-bronze" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent font-medium text-warm-charcoal focus:outline-none cursor-pointer"
                  >
                    <option value="name">เรียงตาม: ชื่อ (A-Z)</option>
                    <option value="tuitionAsc">ค่าเทอม: ต่ำไปสูง</option>
                    <option value="tuitionDesc">ค่าเทอม: สูงไปต่ำ</option>
                    <option value="rating">คะแนนรีวิว: สูงสุด</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Results count & active query pill */}
            <div className="flex items-center justify-between text-xs text-warm-charcoal/60 px-1">
              <span>
                แสดง {displayedSchools.length} จาก {favSchools.length} แห่ง
              </span>
              {(searchQuery || selectedCurriculum !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCurriculum("all");
                  }}
                  className="text-warm-bronze hover:underline font-medium"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {/* ── Cards Grid ── */}
            {displayedSchools.length === 0 ? (
              <div className="py-12 text-center rounded-2xl bg-warm-cream/50 border border-warm-accent text-warm-charcoal/60 text-sm">
                ไม่พบโรงเรียนที่ตรงกับตัวกรอง
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedSchools.map((school) => {
                  const isCompared = compareIds.includes(school.id);
                  const note = notes[school.id] || "";
                  const isEditingNote = activeNoteEditId === school.id;

                  return (
                    <div
                      key={school.id}
                      className="group bg-white rounded-3xl border border-warm-accent shadow-sm hover:shadow-md hover:border-warm-bronze/40 transition-all flex flex-col overflow-hidden"
                    >
                      {/* Logo header */}
                      <div
                        className="relative h-44 bg-gradient-to-b from-white via-warm-cream/40 to-warm-accent/20 border-b border-warm-accent/40 flex items-center justify-center p-4 cursor-pointer group"
                        onClick={() => onSchoolClick(school.id)}
                      >
                        {school.logoUrl || (school.image?.startsWith("http") ? school.image : null) ? (
                          <img
                            src={school.logoUrl || school.image}
                            alt={`ตราโรงเรียน ${schoolNames(school).primary}`}
                            referrerPolicy="no-referrer"
                            className="max-h-24 max-w-[80%] object-contain drop-shadow-xs group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-white border border-warm-accent shadow-xs flex items-center justify-center text-warm-bronze font-bold text-lg select-none">
                            {getSchoolInitials(school.name)}
                          </div>
                        )}

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warm-charcoal/90 text-white backdrop-blur-xs">
                            {curriculumLabel(school.curriculum)}
                          </span>
                          {school.badge && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-xs">
                              {badgeLabel(school.badge)}
                            </span>
                          )}
                        </div>

                        {/* Favorite button (Active Heart) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(school.id);
                          }}
                          title="นำออกจากรายการถูกใจ"
                          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        >
                          <Heart className="w-4 h-4 fill-current" />
                        </button>
                      </div>

                      {/* Content Body */}
                      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3
                            onClick={() => onSchoolClick(school.id)}
                            className="font-bold text-base sm:text-lg text-warm-charcoal hover:text-warm-bronze transition-colors cursor-pointer line-clamp-1"
                            title={schoolNames(school).primary}
                          >
                            {schoolNames(school).primary}
                          </h3>

                          <div className="mt-1.5 flex items-center gap-1 text-xs text-warm-charcoal/60">
                            <MapPin className="w-3.5 h-3.5 text-warm-bronze shrink-0" />
                            <span className="truncate">{school.location}</span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-warm-charcoal/70">
                            <span className="inline-flex items-center gap-1 bg-warm-cream px-2 py-0.5 rounded-md border border-warm-accent/50">
                              <GraduationCap className="w-3 h-3 text-warm-bronze" />
                              {school.grades || "ไม่มีข้อมูลระดับชั้น"}
                            </span>
                            {school.language && (
                              <span className="bg-warm-cream px-2 py-0.5 rounded-md border border-warm-accent/50">
                                {languageLabel(school.language)}
                              </span>
                            )}
                          </div>

                          <div className="mt-3 pt-2.5 pb-1 flex items-end justify-between border-t border-warm-accent/40">
                            <div>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-warm-charcoal/50">
                                ค่าเทอมเริ่มต้น
                              </span>
                              <div className="text-base font-bold text-warm-charcoal leading-tight">
                                {school.tuitionStart > 0 ? (
                                  <>
                                    {formatTuition(school.tuitionStart)}
                                    <span className="text-xs font-normal text-warm-charcoal/50"> /ปี</span>
                                  </>
                                ) : (
                                  <span className="text-xs font-semibold text-warm-charcoal/60">ไม่มีข้อมูล</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {school.reviewCount > 0 && school.rating > 0 ? (
                                <StarRating rating={school.rating} />
                              ) : (
                                <span className="text-[11px] text-warm-charcoal/50 italic">ยังไม่มีรีวิว</span>
                              )}
                            </div>
                          </div>

                          {/* ── Parent Memo Note Box ── */}
                          <div className="mt-4 pt-3 border-t border-warm-accent/60">
                            {isEditingNote ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-warm-charcoal/70">
                                  <StickyNote className="w-3 h-3 text-warm-bronze" />
                                  โน้ต
                                </div>
                                <textarea
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  placeholder="เช่น วัน Open House, เบอร์ฝ่ายรับสมัคร"
                                  rows={2}
                                  className="w-full p-2 text-xs rounded-xl border border-warm-accent bg-warm-cream/50 focus:outline-none focus:border-warm-bronze text-warm-charcoal"
                                  autoFocus
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setActiveNoteEditId(null)}
                                    className="px-2.5 py-1 text-[11px] rounded-lg border border-warm-accent hover:bg-warm-accent/30 text-warm-charcoal/70"
                                  >
                                    ยกเลิก
                                  </button>
                                  <button
                                    onClick={() => saveNote(school.id, noteDraft)}
                                    className="px-3 py-1 text-[11px] font-bold rounded-lg bg-warm-bronze text-white hover:bg-warm-bronze/90 flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    บันทึก
                                  </button>
                                </div>
                              </div>
                            ) : note ? (
                              <div
                                onClick={() => {
                                  setNoteDraft(note);
                                  setActiveNoteEditId(school.id);
                                }}
                                className="group/note p-2 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 cursor-pointer hover:bg-amber-100/70 transition-colors flex items-start gap-1.5"
                                title="คลิกเพื่อแก้ไขโน้ต"
                              >
                                <StickyNote className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span className="flex-1 line-clamp-2 italic">"{note}"</span>
                                <span className="text-[10px] text-amber-700/60 group-hover/note:underline font-semibold ml-1 shrink-0">
                                  แก้ไข
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setNoteDraft("");
                                  setActiveNoteEditId(school.id);
                                }}
                                className="w-full text-left py-1 text-[11px] text-warm-charcoal/50 hover:text-warm-bronze flex items-center gap-1 font-medium transition-colors"
                              >
                                <StickyNote className="w-3 h-3 text-warm-charcoal/40" />
                                <span>+ เพิ่มโน้ต</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* ── Action Buttons Footer ── */}
                        <div className="mt-4 pt-3 border-t border-warm-accent flex flex-col gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => onOpenCalculator(school.id)}
                              className="w-full py-2 px-2.5 rounded-xl border border-warm-accent bg-warm-cream/60 hover:bg-warm-cream hover:border-warm-bronze text-warm-charcoal font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Calculator className="w-3.5 h-3.5 text-warm-bronze" />
                              <span>คำนวณค่าใช้จ่าย</span>
                            </button>

                            <button
                              onClick={() => onToggleCompare(school.id)}
                              className={`w-full py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isCompared
                                  ? "bg-warm-charcoal text-white border-warm-charcoal"
                                  : "border-warm-accent bg-white hover:border-warm-charcoal text-warm-charcoal"
                                }`}
                            >
                              <GitCompare className="w-3.5 h-3.5" />
                              <span>{isCompared ? "อยู่ในเปรียบเทียบ" : "เปรียบเทียบ"}</span>
                            </button>
                          </div>

                          <button
                            onClick={() => onSchoolClick(school.id)}
                            className="w-full py-2.5 rounded-xl bg-warm-cream hover:bg-warm-accent/70 text-warm-charcoal text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>ดูรายละเอียด</span>
                            <ExternalLink className="w-3.5 h-3.5 text-warm-bronze" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm Clear All Modal ────────────────────────────────────────── */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-warm-charcoal/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-warm-accent shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-warm-charcoal">ล้างรายการโปรดทั้งหมด?</h3>
              <p className="mt-1 text-xs text-warm-charcoal/70">
                โรงเรียน {favSchools.length} แห่งจะถูกนำออกจากรายการโปรด
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-warm-accent hover:bg-warm-accent/30 text-xs font-semibold text-warm-charcoal transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  onClearAllFavorites?.();
                  setConfirmClearOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
              >
                ล้างทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
