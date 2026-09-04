import React, { useState, useMemo } from "react";
import {
  Search,
  School,
  Globe,
  MapPin,
  ExternalLink,
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
  const [selectedProvince, setSelectedProvince] = useState<string>("ALL");
  const [pageSize, setPageSize] = useState<number>(25);
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
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTh = s.school_name_th?.toLowerCase().includes(q);
        const matchEn = s.school_name_en?.toLowerCase().includes(q);
        const matchCode = s.school_code?.includes(q);
        const matchProv = s.province?.toLowerCase().includes(q);
        const matchDist = s.district?.toLowerCase().includes(q);
        if (!matchTh && !matchEn && !matchCode && !matchProv && !matchDist) return false;
      }

      return true;
    });
  }, [schools, activeStatFilter, selectedProvince, search]);

  // Reset to page 1 when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeStatFilter, selectedProvince, search, pageSize]);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setActiveStatFilter("all")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeStatFilter === "all"
              ? "bg-blue-500/10 border-blue-500 shadow-md ring-2 ring-blue-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <School className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
              กรอง
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.all.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            โรงเรียนทั้งหมด
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("has_website")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeStatFilter === "has_website"
              ? "bg-emerald-500/10 border-emerald-500 shadow-md ring-2 ring-emerald-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <Globe className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
              กรอง
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.hasWebsite}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            มี Website แล้ว
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_en")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeStatFilter === "missing_en"
              ? "bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
              กรอง
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.missingEn}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            ไม่มีชื่อ EN
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_gps")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeStatFilter === "missing_gps"
              ? "bg-rose-500/10 border-rose-500 shadow-md ring-2 ring-rose-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <MapPin className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-full">
              กรอง
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.missingGps}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            ไม่มี/GPS ประมาณการ
          </div>
        </div>

        <div
          onClick={() => setSelectedProvince("ALL")}
          className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <MapPin className="w-4 h-4 text-purple-500" />
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
              จังหวัด
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.provinces}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            ครอบคลุมทั่วประเทศ
          </div>
        </div>

        <div
          onClick={() => setActiveStatFilter("missing_website")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeStatFilter === "missing_website"
              ? "bg-rose-500/10 border-rose-500 shadow-md ring-2 ring-rose-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <Link2Off className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-full">
              กรอง
            </span>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white">
            {statCounts.missingWebsite}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            ยังไม่มี Website
          </div>
        </div>
      </div>

      {/* Active Filter Indicator */}
      {activeStatFilter !== "all" && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-blue-900 dark:text-blue-300 font-medium">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>กำลังกรองตามการ์ด: <strong>{statFilterLabels[activeStatFilter]}</strong></span>
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[11px] font-bold">
              {filteredSchools.length} แห่ง
            </span>
          </div>
          <button
            onClick={() => setActiveStatFilter("all")}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-100 flex items-center gap-1 shadow-sm transition-colors"
          >
            <X className="w-3.5 h-3.5" /> ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* Controls Bar: Search, Province Dropdown, Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อโรงเรียน (ไทย/EN), รหัส สช., อำเภอ, จังหวัด..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* Province Dropdown */}
          <div className="w-44">
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
          <span className="text-xs text-slate-500 font-medium">
            แสดง <strong>{filteredSchools.length}</strong> จาก {schools.length} แห่ง
          </span>

          <button
            onClick={onRefresh}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 font-semibold">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedSchools.length > 0 ? (
                paginatedSchools.map((s, idx) => {
                  const hasWebsite = Boolean(s.website && s.website.trim());
                  const hasExactGps = s.gps_precision === "Exact";
                  const hasAnyGps = Boolean(s.latitude && s.longitude);
                  const isActionLoading = actionLoadingCode === s.school_code;

                  return (
                    <tr
                      key={s.school_code || idx}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-mono">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {s.school_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {s.school_name_th}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-sm">
                          {s.school_name_en || (
                            <span className="text-amber-500 italic">ยังไม่มีชื่อภาษาอังกฤษ</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {s.province}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {s.district || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium whitespace-nowrap">
                          {s.levels_offered && s.levels_offered.length > 0
                            ? s.levels_offered[0] + (s.levels_offered.length > 1 ? ` +${s.levels_offered.length - 1}` : "")
                            : s.level_range || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                        {Number(s.student_count) > 0 ? Number(s.student_count).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-3">
                        {hasWebsite ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={s.website!.startsWith("http") ? s.website! : `https://${s.website!}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[130px] inline-flex items-center gap-1 font-medium"
                            >
                              <Globe className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{s.website}</span>
                            </a>
                            <button
                              onClick={() => onEditWebsite(s)}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-600"
                              title="แก้ไขเว็บไซต์"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 italic text-[11px]">ไม่มีเว็บ</span>
                            <button
                              onClick={() => onEditWebsite(s)}
                              className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-blue-500"
                              title="เพิ่มเว็บไซต์"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {hasExactGps ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Exact
                          </span>
                        ) : hasAnyGps ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-[11px] bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                            Approx
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">ไม่มี GPS</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onSelectSchool(s)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-slate-300 hover:text-blue-600 rounded-lg text-xs font-semibold transition-colors"
                            title="ดูรายละเอียดเชิงลึก สช."
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onResolveSchoolWebsite(s.school_code)}
                            disabled={isActionLoading}
                            className="p-1.5 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            title="ค้นหาและยืนยัน Official Website เดี่ยว"
                          >
                            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => onEnrichSchool(s.school_code)}
                            disabled={isActionLoading}
                            className="p-1.5 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
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
                  <td colSpan={9} className="text-center py-16 text-slate-400 italic">
                    ไม่พบโรงเรียนที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Page Size */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>แสดงหน้าละ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value={10}>10 รายการ</option>
              <option value={25}>25 รายการ</option>
              <option value={50}>50 รายการ</option>
              <option value={100}>100 รายการ</option>
            </select>
            <span>
              หน้า <strong>{currentPage}</strong> จาก {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
