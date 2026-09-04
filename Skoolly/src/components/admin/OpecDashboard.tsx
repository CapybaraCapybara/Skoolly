import React, { useState, useMemo } from "react";
import {
  School,
  MapPin,
  Users,
  GraduationCap,
  Globe,
  Crosshair,
  Award,
  Shapes,
  Search,
  BookOpen,
  Sparkles,
  ListFilter,
  ArrowUpDown,
  DollarSign,
  Satellite,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import type { OpecSchoolRecord, ProvinceStat, CurriculumStat, TopSchool } from "@/types/opec";
import { normalizeCurriculum } from "@/api/opecApi";

interface OpecDashboardProps {
  schools: OpecSchoolRecord[];
  onOpenDrillDown: (title: string, subtitle: string, list: OpecSchoolRecord[]) => void;
  onGoToSchoolsTable: () => void;
}

export function OpecDashboard({ schools, onOpenDrillDown, onGoToSchoolsTable }: OpecDashboardProps) {
  const [provinceSearch, setProvinceSearch] = useState("");
  const [curriculumSearch, setCurriculumSearch] = useState("");
  const [curriculumMode, setCurriculumMode] = useState<"normalized" | "raw">("normalized");

  // Aggregate KPI metrics
  const kpi = useMemo(() => {
    const total = schools.length;
    if (total === 0) {
      return {
        total: 0,
        provinces: 0,
        students: 0,
        avgStudents: 0,
        teachers: 0,
        ratio: "0",
        websites: 0,
        websitesPct: 0,
        gpsExact: 0,
        gpsExactPct: 0,
      };
    }

    const provSet = new Set<string>();
    let totalStudents = 0;
    let totalTeachers = 0;
    let withWebsites = 0;
    let withGpsExact = 0;

    schools.forEach((s) => {
      if (s.province) provSet.add(s.province.trim());
      const stu = Number(s.student_count) || 0;
      const tch = Number(s.teacher_count) || 0;
      totalStudents += stu;
      totalTeachers += tch;
      if (s.website && s.website.trim()) withWebsites++;
      if (s.gps_precision === "Exact") withGpsExact++;
    });

    const avgStu = Math.round(totalStudents / total);
    const ratio = totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : "0";
    const webPct = Math.round((withWebsites / total) * 100);
    const gpsPct = Math.round((withGpsExact / total) * 100);

    return {
      total,
      provinces: provSet.size,
      students: totalStudents,
      avgStudents: avgStu,
      teachers: totalTeachers,
      ratio,
      websites: withWebsites,
      websitesPct: webPct,
      gpsExact: withGpsExact,
      gpsExactPct: gpsPct,
    };
  }, [schools]);

  // Province Statistics
  const provinceStats: ProvinceStat[] = useMemo(() => {
    const map: Record<string, { count: number; hasWeb: number; hasGps: number }> = {};
    schools.forEach((s) => {
      const p = s.province?.trim() || "ไม่ระบุจังหวัด";
      if (!map[p]) map[p] = { count: 0, hasWeb: 0, hasGps: 0 };
      map[p].count++;
      if (s.website && s.website.trim()) map[p].hasWeb++;
      if (s.latitude && s.longitude) map[p].hasGps++;
    });

    return Object.entries(map)
      .map(([province, v]) => ({
        province,
        count: v.count,
        pct: Math.round((v.count / (schools.length || 1)) * 100),
        hasWebsite: v.hasWeb,
        hasGps: v.hasGps,
      }))
      .sort((a, b) => b.count - a.count);
  }, [schools]);

  const filteredProvinces = useMemo(() => {
    if (!provinceSearch.trim()) return provinceStats;
    const q = provinceSearch.toLowerCase();
    return provinceStats.filter((p) => p.province.toLowerCase().includes(q));
  }, [provinceStats, provinceSearch]);

  // Education Level Stats
  const levelStats = useMemo(() => {
    let preK = 0;
    let k = 0;
    let primary = 0;
    let lowerSec = 0;
    let upperSec = 0;
    let allThrough = 0;
    let earlyYearsOnly = 0;

    const total = schools.length || 1;

    schools.forEach((s) => {
      const text = [
        ...(s.levels_offered || []),
        s.level_range || "",
      ].join(" ").toLowerCase();

      const hasPreK = text.includes("ก่อนอนุบาล") || text.includes("pre-k") || text.includes("nursery");
      const hasK = text.includes("อนุบาล") || text.includes("kindergarten") || text.includes("eyfs");
      const hasPri = text.includes("ประถม") || text.includes("primary") || text.includes("elementary");
      const hasLow = text.includes("มัธยมศึกษาตอนต้น") || text.includes("ม.ต้น") || text.includes("middle");
      const hasUp = text.includes("มัธยมศึกษาตอนปลาย") || text.includes("ม.ปลาย") || text.includes("high school");

      if (hasPreK) preK++;
      if (hasK) k++;
      if (hasPri) primary++;
      if (hasLow) lowerSec++;
      if (hasUp) upperSec++;

      if ((hasPreK || hasK) && hasPri && (hasLow || hasUp)) {
        allThrough++;
      }
      if ((hasPreK || hasK) && !hasPri && !hasLow && !hasUp) {
        earlyYearsOnly++;
      }
    });

    return {
      preK: { count: preK, pct: Math.round((preK / total) * 100) },
      k: { count: k, pct: Math.round((k / total) * 100) },
      primary: { count: primary, pct: Math.round((primary / total) * 100) },
      lowerSec: { count: lowerSec, pct: Math.round((lowerSec / total) * 100) },
      upperSec: { count: upperSec, pct: Math.round((upperSec / total) * 100) },
      allThrough,
      earlyYearsOnly,
    };
  }, [schools]);

  // Curriculum Stats (Standardized vs Raw)
  const curriculumStats = useMemo(() => {
    const map: Record<string, number> = {};
    schools.forEach((s) => {
      const currs = s.curriculums && s.curriculums.length > 0 ? s.curriculums : ["หลักสูตรสากลทั่วไป"];
      currs.forEach((c) => {
        const key = curriculumMode === "normalized" ? normalizeCurriculum(c) : c.trim();
        map[key] = (map[key] || 0) + 1;
      });
    });

    const total = schools.length || 1;
    return Object.entries(map)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [schools, curriculumMode]);

  const filteredCurriculums = useMemo(() => {
    if (!curriculumSearch.trim()) return curriculumStats;
    const q = curriculumSearch.toLowerCase();
    return curriculumStats.filter((c) => c.name.toLowerCase().includes(q));
  }, [curriculumStats, curriculumSearch]);

  // Top 10 Largest Schools
  const top10Schools: TopSchool[] = useMemo(() => {
    return [...schools]
      .filter((s) => Number(s.student_count) > 0)
      .sort((a, b) => (Number(b.student_count) || 0) - (Number(a.student_count) || 0))
      .slice(0, 10)
      .map((s, idx) => {
        const stu = Number(s.student_count) || 0;
        const tch = Number(s.teacher_count) || 0;
        return {
          rank: idx + 1,
          code: s.school_code,
          name_th: s.school_name_th,
          name_en: s.school_name_en,
          province: s.province || "—",
          student_count: stu,
          ratio: tch > 0 ? `~${(stu / tch).toFixed(1)} : 1` : "—",
        };
      });
  }, [schools]);

  // Government subsidy distribution
  const subsidyStats = useMemo(() => {
    let noSubsidy = 0;
    let hasSubsidy = 0;
    schools.forEach((s) => {
      if (s.government_support === "รับเงินอุดหนุน") hasSubsidy++;
      else noSubsidy++;
    });
    const total = schools.length || 1;
    return {
      noSubsidy,
      noPct: Math.round((noSubsidy / total) * 100),
      hasSubsidy,
      hasPct: Math.round((hasSubsidy / total) * 100),
    };
  }, [schools]);

  // Spatial / Completeness
  const spatialStats = useMemo(() => {
    let exact = 0;
    let approx = 0;
    let webLive = 0;
    schools.forEach((s) => {
      if (s.gps_precision === "Exact") exact++;
      else if (s.latitude && s.longitude) approx++;
      if (s.website && s.website.trim()) webLive++;
    });
    return { exact, approx, webLive };
  }, [schools]);

  return (
    <div className="space-y-6">
      {/* Dashboard Subheader */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">
              ภาพรวมสถิติและข้อมูลเชิงลึก (Executive Dashboard)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              สรุปการกระจายตัวของโรงเรียนนานาชาติ หลักสูตร ระดับชั้น และความพร้อมด้านข้อมูลทั่วประเทศ
            </p>
          </div>
        </div>

        <button
          onClick={onGoToSchoolsTable}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
        >
          <School className="w-4 h-4" />
          <span>ไปยังตารางข้อมูลโรงเรียน</span>
        </button>
      </div>

      {/* 6 Interactive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* KPI 1 */}
        <div
          onClick={() => onOpenDrillDown("โรงเรียนนานาชาติทั้งหมด", "รายชื่อโรงเรียนนานาชาติจากฐานข้อมูล สช. 100%", schools)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">โรงเรียนทั้งหมด</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <School className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.total.toLocaleString()}
          </div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
            สช. OPEC Pro 100%
          </div>
        </div>

        {/* KPI 2 */}
        <div
          onClick={() => onOpenDrillDown("จังหวัดที่มีโรงเรียนนานาชาติ", "จังหวัดที่มีโรงเรียนนานาชาติตั้งอยู่", schools)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">จังหวัดที่เปิดสอน</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.provinces}
          </div>
          <div className="text-[11px] text-sky-600 dark:text-sky-400 mt-1 flex items-center gap-1 font-medium">
            ทั่วประเทศไทย
          </div>
        </div>

        {/* KPI 3 */}
        <div
          onClick={() => onOpenDrillDown("นักเรียนรวมทั้งหมด", "การกระจายตัวของจำนวนนักเรียน", schools)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">นักเรียนรวม</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.students > 0 ? kpi.students.toLocaleString() : "—"}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
            เฉลี่ย {kpi.avgStudents.toLocaleString()} คน/รร.
          </div>
        </div>

        {/* KPI 4 */}
        <div
          onClick={() => onOpenDrillDown("ครูและบุคลากร", "สถิติจำนวนครูและบุคลากรทางการศึกษา", schools)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-purple-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">ครูและบุคลากร</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.teachers > 0 ? kpi.teachers.toLocaleString() : "—"}
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-medium">
            อัตราส่วน ~{kpi.ratio} : 1
          </div>
        </div>

        {/* KPI 5 */}
        <div
          onClick={() =>
            onOpenDrillDown(
              "โรงเรียนที่มี Official Website",
              "โรงเรียนที่มีการยืนยัน Official Website แล้ว",
              schools.filter((s) => s.website && s.website.trim())
            )
          }
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Website Live</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.websitesPct}%
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
            {kpi.websites} จาก {kpi.total} แห่ง
          </div>
        </div>

        {/* KPI 6 */}
        <div
          onClick={() =>
            onOpenDrillDown(
              "พิกัด GPS แม่นยำระดับอาคาร",
              "โรงเรียนที่ระบุพิกัด GPS ตรงจุดอาคารจริง",
              schools.filter((s) => s.gps_precision === "Exact")
            )
          }
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500 hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">GPS แม่นยำสูง</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Crosshair className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {kpi.gpsExactPct}%
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
            {kpi.gpsExact} แห่ง (Exact)
          </div>
        </div>
      </div>

      {/* Row 1: Provinces Distribution & Education Levels */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Province Distribution */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                การกระจายตัวตามจังหวัด (กดเพื่อดูรายชื่อ)
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              {provinceStats.length} จังหวัด
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={provinceSearch}
              onChange={(e) => setProvinceSearch(e.target.value)}
              placeholder="ค้นหาจังหวัด เช่น กรุงเทพ, เชียงใหม่, ภูเก็ต..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="space-y-2 overflow-y-auto max-h-80 pr-1 scrollbar-thin">
            {filteredProvinces.map((p) => (
              <div
                key={p.province}
                onClick={() =>
                  onOpenDrillDown(
                    `โรงเรียนในจังหวัด ${p.province}`,
                    `พบทั้งหมด ${p.count} แห่ง`,
                    schools.filter((s) => s.province?.trim() === p.province)
                  )
                }
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-100 dark:border-slate-800/80 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                      {p.province}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({p.hasWebsite} เว็บไซต์ / {p.hasGps} GPS)
                    </span>
                  </div>
                  <div className="w-36 md:w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(p.pct, 4)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                    {p.count} แห่ง
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    ({p.pct}%)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Education Levels Breakdown */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                  ระดับชั้นที่เปิดสอน (5 ระดับชั้น)
                </h3>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                5 ระดับชั้น
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div
                onClick={() =>
                  onOpenDrillDown(
                    "ระดับ ก่อนอนุบาล",
                    "โรงเรียนที่เปิดสอนระดับก่อนอนุบาล / Nursery",
                    schools.filter((s) =>
                      [...(s.levels_offered || []), s.level_range || ""].join(" ").includes("ก่อนอนุบาล")
                    )
                  )
                }
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {levelStats.preK.count}
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  ก่อนอนุบาล
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {levelStats.preK.pct}% ของทั้งหมด
                </div>
              </div>

              <div
                onClick={() =>
                  onOpenDrillDown(
                    "ระดับ อนุบาล",
                    "โรงเรียนที่เปิดสอนระดับอนุบาล / Kindergarten",
                    schools.filter((s) =>
                      [...(s.levels_offered || []), s.level_range || ""].join(" ").includes("อนุบาล")
                    )
                  )
                }
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {levelStats.k.count}
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  อนุบาล (Kindergarten)
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {levelStats.k.pct}% ของทั้งหมด
                </div>
              </div>

              <div
                onClick={() =>
                  onOpenDrillDown(
                    "ระดับ ประถมศึกษา",
                    "โรงเรียนที่เปิดสอนระดับประถม / Primary",
                    schools.filter((s) =>
                      [...(s.levels_offered || []), s.level_range || ""].join(" ").includes("ประถม")
                    )
                  )
                }
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {levelStats.primary.count}
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  ประถม (Primary)
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {levelStats.primary.pct}% ของทั้งหมด
                </div>
              </div>

              <div
                onClick={() =>
                  onOpenDrillDown(
                    "ระดับ มัธยมศึกษาตอนต้น",
                    "โรงเรียนที่เปิดสอนระดับ ม.ต้น",
                    schools.filter((s) =>
                      [...(s.levels_offered || []), s.level_range || ""].join(" ").includes("มัธยมศึกษาตอนต้น")
                    )
                  )
                }
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {levelStats.lowerSec.count}
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  มัธยมศึกษาตอนต้น
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {levelStats.lowerSec.pct}% ของทั้งหมด
                </div>
              </div>

              <div
                onClick={() =>
                  onOpenDrillDown(
                    "ระดับ มัธยมศึกษาตอนปลาย",
                    "โรงเรียนที่เปิดสอนระดับ ม.ปลาย",
                    schools.filter((s) =>
                      [...(s.levels_offered || []), s.level_range || ""].join(" ").includes("มัธยมศึกษาตอนปลาย")
                    )
                  )
                }
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-emerald-500 cursor-pointer transition-all"
              >
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {levelStats.upperSec.count}
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  มัธยมศึกษาตอนปลาย
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {levelStats.upperSec.pct}% ของทั้งหมด
                </div>
              </div>
            </div>
          </div>

          {/* Highlights Banners */}
          <div className="space-y-2 pt-2">
            <div
              onClick={() =>
                onOpenDrillDown(
                  "เปิดสอนครบวงจร (All-Through Schools)",
                  "เปิดตั้งแต่ระดับอนุบาลถึงมัธยมปลาย (ม.6)",
                  schools.filter((s) => {
                    const t = [...(s.levels_offered || []), s.level_range || ""].join(" ").toLowerCase();
                    return (t.includes("อนุบาล") || t.includes("ก่อนอนุบาล")) && t.includes("ประถม") && (t.includes("ม.ต้น") || t.includes("ม.ปลาย"));
                  })
                )
              }
              className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <Award className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                <div>
                  <div className="font-bold text-xs md:text-sm text-slate-900 dark:text-white">
                    เปิดสอนครบวงจร (All-Through Schools)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    เปิดตั้งแต่ก่อนอนุบาล/อนุบาลจนถึงมัธยมปลาย (ม.6)
                  </div>
                </div>
              </div>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                {levelStats.allThrough} แห่ง
              </div>
            </div>

            <div
              onClick={() =>
                onOpenDrillDown(
                  "เฉพาะระดับปฐมวัย / อนุบาล (Early Years Only)",
                  "เน้นพัฒนาการและเตรียมความพร้อมก่อนประถม",
                  schools.filter((s) => {
                    const t = [...(s.levels_offered || []), s.level_range || ""].join(" ").toLowerCase();
                    return (t.includes("อนุบาล") || t.includes("ก่อนอนุบาล")) && !t.includes("ประถม");
                  })
                )
              }
              className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <Shapes className="w-6 h-6 text-blue-500 flex-shrink-0" />
                <div>
                  <div className="font-bold text-xs md:text-sm text-slate-900 dark:text-white">
                    เฉพาะระดับปฐมวัย / อนุบาล (Early Years Only)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    เตรียมความพร้อมเด็กเล็กก่อนเข้าประถม
                  </div>
                </div>
              </div>
              <div className="text-base font-black text-blue-600 dark:text-blue-400">
                {levelStats.earlyYearsOnly} แห่ง
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Curriculums & Top 10 Largest Schools */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Curriculums */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                รูปแบบหลักสูตรการศึกษา (Curriculums)
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
              {curriculumStats.length} รูปแบบ
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setCurriculumMode("normalized")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  curriculumMode === "normalized"
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                จัดกลุ่มมาตรฐาน
              </button>
              <button
                onClick={() => setCurriculumMode("raw")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  curriculumMode === "raw"
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ชื่อตาม สช. (Raw)
              </button>
            </div>

            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={curriculumSearch}
                onChange={(e) => setCurriculumSearch(e.target.value)}
                placeholder="ค้นหาหลักสูตร เช่น British, IB, American..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-80 pr-1 scrollbar-thin">
            {filteredCurriculums.map((c) => (
              <div
                key={c.name}
                onClick={() =>
                  onOpenDrillDown(
                    `หลักสูตร: ${c.name}`,
                    `พบ ${c.count} แห่งที่ใช้หลักสูตรนี้`,
                    schools.filter((s) => {
                      const list = s.curriculums && s.curriculums.length > 0 ? s.curriculums : ["หลักสูตรสากลทั่วไป"];
                      return list.some((item) =>
                        curriculumMode === "normalized"
                          ? normalizeCurriculum(item) === c.name
                          : item.trim() === c.name
                      );
                    })
                  )
                }
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/30 border border-slate-100 dark:border-slate-800/80 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                    {c.name}
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(c.pct, 4)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                    {c.count} แห่ง
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    ({c.pct}%)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 Largest Schools */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                10 อันดับโรงเรียนขนาดใหญ่ที่สุด (จำนวนนักเรียน)
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              Top 10 Rankings
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2 px-2 w-8 text-center">#</th>
                  <th className="py-2 px-2">ชื่อโรงเรียน</th>
                  <th className="py-2 px-2">จังหวัด</th>
                  <th className="py-2 px-2 text-right">นักเรียน</th>
                  <th className="py-2 px-2 text-right">นร./ครู</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {top10Schools.map((s) => (
                  <tr
                    key={s.code}
                    onClick={() => {
                      const match = schools.find((x) => x.school_code === s.code);
                      if (match) onOpenDrillDown(match.school_name_th, `อันดับที่ ${s.rank}`, [match]);
                    }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2 text-center font-bold text-slate-500">
                      {s.rank}
                    </td>
                    <td className="py-2 px-2 font-semibold text-slate-900 dark:text-white max-w-[180px] truncate">
                      {s.name_th}
                    </td>
                    <td className="py-2 px-2 text-slate-500">
                      {s.province}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-blue-600 dark:text-blue-400">
                      {s.student_count.toLocaleString()} คน
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-500">
                      {s.ratio}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Government Support & Digital Data Completeness */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Government Support */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-sky-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
              การรับเงินอุดหนุนจากรัฐบาล (สช. OPEC)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() =>
                onOpenDrillDown(
                  "ไม่รับเงินอุดหนุนจากรัฐบาล",
                  "โรงเรียนเอกชน 100% ที่ไม่ได้รับเงินอุดหนุน",
                  schools.filter((s) => s.government_support !== "รับเงินอุดหนุน")
                )
              }
              className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 cursor-pointer hover:shadow-md transition-all"
            >
              <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
                {subsidyStats.noSubsidy}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                ไม่รับเงินอุดหนุน (100% เอกชน)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {subsidyStats.noPct}% ของโรงเรียนทั้งหมด
              </div>
            </div>

            <div
              onClick={() =>
                onOpenDrillDown(
                  "รับเงินอุดหนุนจากรัฐบาล",
                  "โรงเรียนที่ได้รับเงินอุดหนุนจาก สช.",
                  schools.filter((s) => s.government_support === "รับเงินอุดหนุน")
                )
              }
              className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 cursor-pointer hover:shadow-md transition-all"
            >
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {subsidyStats.hasSubsidy}
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                รับเงินอุดหนุนรัฐบาล
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {subsidyStats.hasPct}% ของโรงเรียนทั้งหมด
              </div>
            </div>
          </div>
        </div>

        {/* Spatial & Digital Quality */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Satellite className="w-5 h-5 text-pink-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
              คุณภาพข้อมูลและพิกัดภูมิศาสตร์ (Data Completeness)
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div
              onClick={() =>
                onOpenDrillDown(
                  "GPS แม่นยำระดับอาคารจริง (Exact)",
                  "พิกัดระบุตำแหน่งอาคารเรียนจริง",
                  schools.filter((s) => s.gps_precision === "Exact")
                )
              }
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-100 dark:border-slate-800 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  หมุด GPS ระดับอาคาร/ถนนจริง (Exact)
                </span>
              </div>
              <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                {spatialStats.exact} แห่ง
              </span>
            </div>

            <div
              onClick={() =>
                onOpenDrillDown(
                  "GPS ประมาณการ (Approximate)",
                  "พิกัดระดับอำเภอ/ตำบล",
                  schools.filter((s) => s.latitude && s.longitude && s.gps_precision !== "Exact")
                )
              }
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-slate-100 dark:border-slate-800 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  หมุด GPS ประมาณการระดับอำเภอ/ตำบล
                </span>
              </div>
              <span className="font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {spatialStats.approx} แห่ง
              </span>
            </div>

            <div
              onClick={() =>
                onOpenDrillDown(
                  "Official Website ได้รับการตรวจสอบ",
                  "มีเว็บไซต์ทางการและสามารถเข้าชมได้",
                  schools.filter((s) => s.website && s.website.trim())
                )
              }
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-100 dark:border-slate-800 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  Official Website ตรวจสอบสถานะแล้ว (Live)
                </span>
              </div>
              <span className="font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {spatialStats.webLive} แห่ง
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
