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
          className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-[0_1px_3px_rgba(28,25,23,0.03)] ${
            activeStatFilter === "all"
              ? "bg-[#faf7f2] border-[#ab8e72] ring-2 ring-[#ab8e72]/30 shadow-sm"
              : "bg-white border-[#e2d8c7] hover:border-[#ab8e72] hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <School className="w-4 h-4 text-[#ab8e72]" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeStatFilter === "all"
                ? "text-stone-900 bg-[#ab8e72]/20 border-[#ab8e72]/40"
                : "text-[#ab8e72] bg-[#ab8e72]/10 border-[#ab8e72]/20"
            }`}>
              {activeStatFilter === "all" ? "เลือกอยู่" : "กรอง"}
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.all.toLocaleString()}
          </div>
          <div className="text-xs font-medium text-[#78716c] truncate">
            โรงเรียนทั้งหมด
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("has_website")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-[0_1px_3px_rgba(28,25,23,0.03)] ${
            activeStatFilter === "has_website"
              ? "bg-teal-50/70 border-teal-600 ring-2 ring-teal-600/30 shadow-sm"
              : "bg-white border-[#e2d8c7] hover:border-teal-600 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <Globe className="w-4 h-4 text-teal-600" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeStatFilter === "has_website"
                ? "text-teal-900 bg-teal-100 border-teal-300"
                : "text-teal-700 bg-teal-50 border-teal-200"
            }`}>
              {activeStatFilter === "has_website" ? "เลือกอยู่" : "กรอง"}
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.hasWebsite}
          </div>
          <div className="text-xs font-medium text-[#78716c] truncate">
            มี Website แล้ว
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_en")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-[0_1px_3px_rgba(28,25,23,0.03)] ${
            activeStatFilter === "missing_en"
              ? "bg-amber-50/70 border-amber-600 ring-2 ring-amber-600/30 shadow-sm"
              : "bg-white border-[#e2d8c7] hover:border-amber-600 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeStatFilter === "missing_en"
                ? "text-amber-900 bg-amber-100 border-amber-300"
                : "text-amber-700 bg-amber-50 border-amber-200"
            }`}>
              {activeStatFilter === "missing_en" ? "เลือกอยู่" : "กรอง"}
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.missingEn}
          </div>
          <div className="text-xs font-medium text-[#78716c] truncate">
            ไม่มีชื่อ EN
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_gps")}
          className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-[0_1px_3px_rgba(28,25,23,0.03)] ${
            activeStatFilter === "missing_gps"
              ? "bg-rose-50/70 border-rose-600 ring-2 ring-rose-600/30 shadow-sm"
              : "bg-white border-[#e2d8c7] hover:border-rose-600 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <MapPin className="w-4 h-4 text-rose-600" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeStatFilter === "missing_gps"
                ? "text-rose-900 bg-rose-100 border-rose-300"
                : "text-rose-700 bg-rose-50 border-rose-200"
            }`}>
              {activeStatFilter === "missing_gps" ? "เลือกอยู่" : "กรอง"}
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-[#1c1917]">
            {statCounts.missingGps}
          </div>
          <div className="text-xs font-medium text-[#78716c] truncate">
            ไม่มี/GPS ประมาณการ
          </div>
        </div>

        <div
          onClick={() => setSelectedProvince("ALL")}
          className="p-4 rounded-2xl bg-white border border-[#e2d8c7] hover:border-[#25508a] hover:shadow-xs transition-all cursor-pointer shadow-[0_1px_3px_rgba(28,25,23,0.03)]"
        >
          <div className="flex items-center justify-between mb-2">
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
          className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-[0_1px_3px_rgba(28,25,23,0.03)] ${
            activeStatFilter === "missing_website"
              ? "bg-rose-50/70 border-rose-600 ring-2 ring-rose-600/30 shadow-sm"
              : "bg-white border-[#e2d8c7] hover:border-rose-600 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <Link2Off className="w-4 h-4 text-rose-600" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              activeStatFilter === "missing_website"
                ? "text-rose-900 bg-rose-100 border-rose-300"
                : "text-rose-700 bg-rose-50 border-rose-200"
            }`}>
              {activeStatFilter === "missing_website" ? "เลือกอยู่" : "กรอง"}
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
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-[#e2d8c7] rounded-2xl shadow-[0_1px_3px_rgba(28,25,23,0.03)]">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อโรงเรียน (ไทย/EN), รหัส สช., อำเภอ, จังหวัด..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#dcd1bf] bg-white text-xs text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/30 focus:border-[#ab8e72]"
            />
          </div>

          {/* Province Dropdown */}
          <div className="w-48">
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#dcd1bf] bg-white text-xs text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/30 focus:border-[#ab8e72]"
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
            className="p-2.5 bg-[#f5ede0] border border-[#e2d8c7] hover:bg-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className="w-4 h-4 text-[#78716c]" />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-[#e2d8c7] rounded-2xl shadow-[0_1px_4px_rgba(28,25,23,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#e2d8c7] bg-[#f8f4ed] text-[#57534e] font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 w-28">รหัส สช.</th>
                <th className="py-3 px-4 min-w-[280px]">ชื่อโรงเรียน (ไทย & อังกฤษ)</th>
                <th className="py-3 px-3 min-w-[150px]">ที่ตั้ง / จังหวัด</th>
                <th className="py-3 px-4 min-w-[260px]">สถานะความสมบูรณ์ของข้อมูล</th>
                <th className="py-3 px-3 text-center w-28">ดูข้อมูล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ece4d8]">
              {paginatedSchools.length > 0 ? (
                paginatedSchools.map((s, idx) => {
                  const hasEnName = Boolean(s.school_name_en && s.school_name_en.trim());
                  const hasWebsite = Boolean(s.website && s.website.trim());
                  const hasGps = Boolean(s.latitude && s.longitude);
                  const isComplete = hasEnName && hasWebsite && hasGps;

                  return (
                    <tr
                      key={s.school_code || idx}
                      onClick={() => onSelectSchool(s)}
                      className="hover:bg-[#f7f2ea]/80 transition-colors odd:bg-white even:bg-[#faf7f2]/40 cursor-pointer group"
                    >
                      <td className="py-3.5 px-3 text-center text-[#a8a29e] font-mono">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-[#78716c]">
                        {s.school_code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#1c1917] group-hover:text-[#ab8e72] transition-colors">
                          {s.school_name_th}
                        </div>
                        <div className="text-[11px] text-[#78716c] truncate max-w-md">
                          {hasEnName ? (
                            s.school_name_en
                          ) : (
                            <span className="text-amber-700 italic">ยังไม่มีชื่อภาษาอังกฤษ</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-[#1c1917]">
                          {s.province}
                        </div>
                        <div className="text-[11px] text-[#78716c]">
                          {s.district ? `${s.district}` : "—"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isComplete ? (
                          <span className="inline-flex items-center gap-1.5 text-teal-800 font-bold text-[11px] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                            <span>ข้อมูลครบถ้วน</span>
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!hasEnName && (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[10px] bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                ⚠️ ขาดชื่อ EN
                              </span>
                            )}
                            {!hasWebsite && (
                              <span className="inline-flex items-center gap-1 text-rose-800 font-bold text-[10px] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                ⚠️ ขาดเว็บ
                              </span>
                            )}
                            {!hasGps && (
                              <span className="inline-flex items-center gap-1 text-orange-800 font-bold text-[10px] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                                ⚠️ ขาด GPS
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onSelectSchool(s)}
                          className="px-3 py-1.5 bg-[#faf5ee] hover:bg-[#1c1917] hover:text-white border border-[#e2d8c7] text-[#1c1917] rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                          title="ดูรายละเอียดเชิงลึกและจัดการข้อมูล"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#ab8e72]" />
                          <span>ดูข้อมูล</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-[#a8a29e] italic">
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
