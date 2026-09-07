import { useState, useMemo, useEffect, useDeferredValue } from "react";
import {
  Search,
  School,
  Globe,
  MapPin,
  Edit,
  Sparkles,
  Eye,
  CheckCircle2,
  AlertCircle,
  Link2Off,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

interface OpecSchoolsTableProps {
  schools: OpecSchoolRecord[];
  onSelectSchool: (school: OpecSchoolRecord) => void;
  onEditWebsite: (school: OpecSchoolRecord) => void;
  onResolveSchoolWebsite: (code: string) => Promise<void>;
  onEnrichSchool: (code: string) => Promise<void>;
  onRefresh: () => void;
  actionLoadingCode?: string | null;
}

type StatFilter = "all" | "has_website" | "missing_en" | "missing_gps" | "provinces" | "missing_website";

export function OpecSchoolsTable({
  schools,
  onSelectSchool,
  onEditWebsite,
  onResolveSchoolWebsite,
  onEnrichSchool,
  onRefresh,
  actionLoadingCode,
}: OpecSchoolsTableProps) {
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilter>("all");
  const [search, setSearch] = useState("");
  // Keep typing responsive: re-filter the full dataset off the keystroke's render.
  const deferredSearch = useDeferredValue(search);
  const [selectedProvince, setSelectedProvince] = useState<string>("ALL");
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Provinces list
  const provincesList = useMemo(() => {
    const set = new Set<string>();
    schools.forEach((s) => {
      if (s.province) set.add(s.province.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [schools]);

  // Quick stat counts
  const statCounts = useMemo(() => {
    let hasWeb = 0;
    let missingEn = 0;
    let missingGps = 0;
    let missingWeb = 0;

    schools.forEach((s) => {
      if (s.website && s.website.trim()) hasWeb++;
      else missingWeb++;

      if (!s.school_name_en || !s.school_name_en.trim()) missingEn++;
      if (!s.latitude || !s.longitude || s.gps_precision !== "Exact") missingGps++;
    });

    return {
      all: schools.length,
      hasWebsite: hasWeb,
      missingEn,
      missingGps,
      provinces: provincesList.length,
      missingWebsite: missingWeb,
    };
  }, [schools, provincesList]);

  // Filter and Search logic
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      // 1. Stat Card Filter
      if (activeStatFilter === "has_website" && (!s.website || !s.website.trim())) return false;
      if (activeStatFilter === "missing_website" && s.website && s.website.trim()) return false;
      if (activeStatFilter === "missing_en" && s.school_name_en && s.school_name_en.trim()) return false;
      if (activeStatFilter === "missing_gps" && s.latitude && s.longitude && s.gps_precision === "Exact")
        return false;

      // 2. Province Filter
      if (selectedProvince !== "ALL" && s.province?.trim() !== selectedProvince) return false;

      // 3. Search Query
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const matchTh = s.school_name_th?.toLowerCase().includes(q);
        const matchEn = s.school_name_en?.toLowerCase().includes(q);
        const matchCode = s.school_code?.includes(q);
        const matchProv = s.province?.toLowerCase().includes(q);
        const matchDist = s.district?.toLowerCase().includes(q);
        if (!matchTh && !matchEn && !matchCode && !matchProv && !matchDist) return false;
      }

      return true;
    });
  }, [schools, activeStatFilter, selectedProvince, deferredSearch]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeStatFilter, selectedProvince, deferredSearch, pageSize]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredSchools.length / pageSize));
  const paginatedSchools = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSchools.slice(start, start + pageSize);
  }, [filteredSchools, currentPage, pageSize]);

  const statFilterLabels: Record<StatFilter, string> = {
    all: "โรงเรียนทั้งหมด",
    has_website: "มี Official Website แล้ว",
    missing_en: "ยังไม่มีชื่อภาษาอังกฤษ",
    missing_gps: "ยังไม่มีพิกัด GPS ระดับอาคาร",
    provinces: "จัดเรียงตามจังหวัด",
    missing_website: "ยังไม่มี Official Website",
  };

  return (
    <div className="space-y-6">
      {/* 6 Clickable Stat Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div
          onClick={() => setActiveStatFilter("all")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all shadow-xs ${
            activeStatFilter === "all"
              ? "bg-[#faf5ee] border-[#1c1917] shadow-sm ring-2 ring-[#1c1917]/10"
              : "bg-white border-[#eae0d0] hover:border-[#ab8e72]"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <School className="w-4 h-4 text-[#ab8e72]" />
            <span className="text-[10px] font-bold text-[#ab8e72] bg-[#ab8e72]/15 px-2 py-0.5 rounded-full border border-[#ab8e72]/30">
              กรอง
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.all.toLocaleString()}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            โรงเรียนทั้งหมด
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("has_website")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all shadow-xs ${
            activeStatFilter === "has_website"
              ? "bg-[#faf5ee] border-[#0f9488] shadow-sm ring-2 ring-[#0f9488]/20"
              : "bg-white border-[#eae0d0] hover:border-[#0f9488]"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <Globe className="w-4 h-4 text-[#0f9488]" />
            <span className="text-[10px] font-bold text-[#0f9488] bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              กรอง
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.hasWebsite}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            มี Website แล้ว
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_en")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all shadow-xs ${
            activeStatFilter === "missing_en"
              ? "bg-[#faf5ee] border-[#d97706] shadow-sm ring-2 ring-[#d97706]/20"
              : "bg-white border-[#eae0d0] hover:border-[#d97706]"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <AlertCircle className="w-4 h-4 text-[#d97706]" />
            <span className="text-[10px] font-bold text-[#d97706] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              กรอง
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.missingEn}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            ไม่มีชื่อ EN
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_gps")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all shadow-xs ${
            activeStatFilter === "missing_gps"
              ? "bg-[#faf5ee] border-[#e11d48] shadow-sm ring-2 ring-[#e11d48]/20"
              : "bg-white border-[#eae0d0] hover:border-[#e11d48]"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <MapPin className="w-4 h-4 text-[#e11d48]" />
            <span className="text-[10px] font-bold text-[#e11d48] bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              กรอง
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.missingGps}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            ไม่มี/GPS ประมาณการ
          </div>
        </div>

        <div
          onClick={() => setSelectedProvince("ALL")}
          className="p-4 rounded-3xl bg-white border border-[#eae0d0] hover:border-[#25508a] transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center justify-between mb-1.5">
            <MapPin className="w-4 h-4 text-[#25508a]" />
            <span className="text-[10px] font-bold text-[#25508a] bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
              จังหวัด
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.provinces}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            ครอบคลุมทั่วประเทศ
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_website")}
          className={`p-4 rounded-3xl border cursor-pointer transition-all shadow-xs ${
            activeStatFilter === "missing_website"
              ? "bg-[#faf5ee] border-[#e11d48] shadow-sm ring-2 ring-[#e11d48]/20"
              : "bg-white border-[#eae0d0] hover:border-[#e11d48]"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <Link2Off className="w-4 h-4 text-[#e11d48]" />
            <span className="text-[10px] font-bold text-[#e11d48] bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              กรอง
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.missingWebsite}
          </div>
          <div className="text-xs text-[#78716c] font-medium truncate">
            ยังไม่มี Website
          </div>
        </div>
      </div>

      {/* Active Filter Indicator */}
      {activeStatFilter !== "all" && (
        <div className="p-3.5 bg-[#faf5ee] border border-[#eae0d0] rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 text-xs text-[#1c1917] font-medium">
            <Filter className="w-4 h-4 text-[#ab8e72]" />
            <span>กำลังกรองตามการ์ด: <strong>{statFilterLabels[activeStatFilter]}</strong></span>
            <span className="px-2.5 py-0.5 bg-[#1c1917] text-white rounded-full text-[11px] font-bold">
              {filteredSchools.length} แห่ง
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveStatFilter("all")}
            className="px-3 py-1 bg-white hover:bg-[#faf8f5] border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <X className="w-3.5 h-3.5" /> ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* Controls Bar: Search, Province Dropdown, Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-[#eae0d0] rounded-3xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อโรงเรียน (ไทย/EN), รหัส สช., อำเภอ, จังหวัด..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#eae0d0] bg-[#faf8f5] text-xs text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/40"
            />
          </div>

          {/* Province Dropdown */}
          <div className="w-48">
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#eae0d0] bg-[#faf8f5] text-xs text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/40"
            >
              <option value="ALL">ทุกจังหวัด ({schools.length})</option>
              {provincesList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[#78716c] font-medium">
            แสดง <strong>{filteredSchools.length}</strong> จาก {schools.length} แห่ง
          </span>

          <button
            type="button"
            onClick={onRefresh}
            className="p-2.5 bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#1c1917] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-[#eae0d0] rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eae0d0] bg-[#faf5ee]/80 text-[#78716c] font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3 w-28">รหัส สช.</th>
                <th className="py-3 px-4 min-w-[240px]">ชื่อโรงเรียน (ไทย & อังกฤษ)</th>
                <th className="py-3 px-3">ที่ตั้ง / จังหวัด</th>
                <th className="py-3 px-3">ระดับชั้น</th>
                <th className="py-3 px-3 text-right">นักเรียน</th>
                <th className="py-3 px-3 min-w-[150px]">Official Website</th>
                <th className="py-3 px-3">พิกัด GPS</th>
                <th className="py-3 px-3 text-center min-w-[180px]">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eae0d0]/40">
              {paginatedSchools.length > 0 ? (
                paginatedSchools.map((s, idx) => {
                  const hasWebsite = Boolean(s.website && s.website.trim());
                  const hasExactGps = s.gps_precision === "Exact";
                  const hasAnyGps = Boolean(s.latitude && s.longitude);
                  const isActionLoading = actionLoadingCode === s.school_code;

                  return (
                    <tr
                      key={s.school_code || idx}
                      className="hover:bg-[#faf8f5] transition-colors"
                    >
                      <td className="py-3 px-3 text-center text-[#a8a29e] font-mono">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#78716c]">
                        {s.school_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1c1917]">
                          {s.school_name_th}
                        </div>
                        <div className="text-[11px] text-[#78716c] truncate max-w-sm">
                          {s.school_name_en || (
                            <span className="text-[#ab8e72] italic">ยังไม่มีชื่อภาษาอังกฤษ</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#1c1917]">
                          {s.province}
                        </div>
                        <div className="text-[11px] text-[#78716c]">
                          {s.district || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 bg-[#faf5ee] border border-[#eae0d0] text-[#1c1917] rounded-lg text-[11px] font-medium whitespace-nowrap">
                          {s.levels_offered && s.levels_offered.length > 0
                            ? s.levels_offered[0] + (s.levels_offered.length > 1 ? ` +${s.levels_offered.length - 1}` : "")
                            : s.level_range || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#ab8e72]">
                        {Number(s.student_count) > 0 ? Number(s.student_count).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3">
                        {hasWebsite ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={s.website!.startsWith("http") ? s.website! : `https://${s.website!}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#25508a] hover:underline truncate max-w-[130px] inline-flex items-center gap-1 font-semibold"
                            >
                              <Globe className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{s.website}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => onEditWebsite(s)}
                              className="p-1 hover:bg-[#faf5ee] border border-transparent hover:border-[#eae0d0] rounded-lg text-[#78716c] hover:text-[#1c1917] transition-colors"
                              title="แก้ไขเว็บไซต์"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-[#a8a29e] italic text-[11px]">ไม่มีเว็บ</span>
                            <button
                              type="button"
                              onClick={() => onEditWebsite(s)}
                              className="p-1 hover:bg-[#faf5ee] border border-transparent hover:border-[#eae0d0] rounded-lg text-[#ab8e72] transition-colors"
                              title="เพิ่มเว็บไซต์"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {hasExactGps ? (
                          <span className="inline-flex items-center gap-1 text-teal-800 font-bold text-[11px] bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                            <CheckCircle2 className="w-3 h-3 text-[#0f9488]" /> Exact
                          </span>
                        ) : hasAnyGps ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[11px] bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                            Approx
                          </span>
                        ) : (
                          <span className="text-[#a8a29e] italic text-[11px]">ไม่มี GPS</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectSchool(s)}
                            className="p-1.5 bg-[#faf5ee] hover:bg-[#eae0d0]/60 border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold transition-colors shadow-xs"
                            title="ดูรายละเอียดเชิงลึก สช."
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onResolveSchoolWebsite(s.school_code)}
                            disabled={isActionLoading}
                            className="p-1.5 bg-[#25508a]/10 hover:bg-[#25508a]/20 border border-[#25508a]/20 text-[#25508a] rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
                            title="ค้นหาและยืนยัน Official Website เดี่ยว"
                          >
                            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onEnrichSchool(s.school_code)}
                            disabled={isActionLoading}
                            className="p-1.5 bg-[#0f9488]/10 hover:bg-[#0f9488]/20 border border-[#0f9488]/20 text-[#0f9488] rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
                            title="ปักหมุด GPS และเติมชื่อ EN เดี่ยว"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-[#a8a29e] italic">
                    ไม่พบโรงเรียนที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Page Size */}
        <div className="p-4.5 border-t border-[#eae0d0] flex flex-wrap items-center justify-between gap-3 bg-[#faf5ee]/60">
          <div className="flex items-center gap-2 text-xs text-[#78716c]">
            <span>แสดงหน้าละ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-[#eae0d0] bg-white text-xs text-[#1c1917] font-medium focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/40"
            >
              <option value={25}>25 รายการ</option>
              <option value={50}>50 รายการ</option>
              <option value={100}>100 รายการ (แนะนำ)</option>
              <option value={200}>200 รายการ</option>
              <option value={1000}>แสดงทั้งหมด ({schools.length} โรงเรียน)</option>
            </select>
            <span>
              หน้า <strong>{currentPage}</strong> จาก {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-[#eae0d0] bg-white text-[#1c1917] hover:bg-[#faf5ee] disabled:opacity-40 transition-colors shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-mono text-xs font-bold text-[#1c1917]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl border border-[#eae0d0] bg-white text-[#1c1917] hover:bg-[#faf5ee] disabled:opacity-40 transition-colors shadow-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
