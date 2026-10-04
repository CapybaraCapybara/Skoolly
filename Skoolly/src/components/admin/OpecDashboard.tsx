import { useState, useMemo } from "react";
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
  DollarSign,
  Satellite,
  ChevronRight,
  ShieldCheck,
  Bed,
  Sparkles,
} from "lucide-react";
import type { OpecSchoolRecord, ProvinceStat, TopSchool } from "@/types/opec";
import { normalizeCurriculum } from "@/api/opecApi";

interface OpecDashboardProps {
  schools: OpecSchoolRecord[];
  onOpenDrillDown: (title: string, subtitle: string, list: OpecSchoolRecord[]) => void;
}

export function OpecDashboard({ schools, onOpenDrillDown }: OpecDashboardProps) {
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

  // ISAT Membership & Global Accreditations Stats
  const isatStats = useMemo(() => {
    const total = schools.length || 1;
    let isatCount = 0;
    let boardingCount = 0;
    const accredMap: Record<string, number> = {};

    schools.forEach((s) => {
      if (s.is_isat_member) isatCount++;
      if (s.is_boarding) boardingCount++;
      (s.accreditations || []).forEach((acc) => {
        const key = acc.trim();
        if (key) accredMap[key] = (accredMap[key] || 0) + 1;
      });
    });

    const topAccreditations = Object.entries(accredMap)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      isatCount,
      isatPct: Math.round((isatCount / total) * 100),
      boardingCount,
      boardingPct: Math.round((boardingCount / total) * 100),
      topAccreditations,
    };
  }, [schools]);

  return (
    <div className="space-y-6">
      {/* 6 Interactive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* KPI 1 */}
        <div
          onClick={() => onOpenDrillDown("โรงเรียนนานาชาติทั้งหมด", "รายชื่อโรงเรียนนานาชาติจากฐานข้อมูล สช. 100%", schools)}
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-warm-bronze hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">โรงเรียนทั้งหมด</span>
            <div className="w-8 h-8 rounded-xl bg-warm-bronze/15 text-warm-bronze flex items-center justify-center group-hover:scale-110 transition-transform">
              <School className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.total.toLocaleString()}
          </div>
          <div className="text-xs text-warm-bronze mt-1 flex items-center gap-1 font-bold">
            สช. OPEC Pro 100%
          </div>
        </div>

        {/* KPI 2 */}
        <div
          onClick={() => onOpenDrillDown("จังหวัดที่มีโรงเรียนนานาชาติ", "จังหวัดที่มีโรงเรียนนานาชาติตั้งอยู่", schools)}
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-[#456ca6] hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">จังหวัดที่เปิดสอน</span>
            <div className="w-8 h-8 rounded-xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center group-hover:scale-110 transition-transform">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.provinces}
          </div>
          <div className="text-xs text-[#456ca6] mt-1 flex items-center gap-1 font-bold">
            ทั่วประเทศไทย
          </div>
        </div>

        {/* KPI 3 */}
        <div
          onClick={() => onOpenDrillDown("นักเรียนรวมทั้งหมด", "การกระจายตัวของจำนวนนักเรียน", schools)}
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-[#456ca6] hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">นักเรียนรวม</span>
            <div className="w-8 h-8 rounded-xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.students > 0 ? kpi.students.toLocaleString() : "—"}
          </div>
          <div className="text-xs text-[#456ca6] mt-1 font-bold">
            เฉลี่ย {kpi.avgStudents.toLocaleString()} คน/รร.
          </div>
        </div>

        {/* KPI 4 */}
        <div
          onClick={() => onOpenDrillDown("ครูและบุคลากร", "สถิติจำนวนครูและบุคลากรทางการศึกษา", schools)}
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-warm-bronze hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">ครูและบุคลากร</span>
            <div className="w-8 h-8 rounded-xl bg-warm-bronze/15 text-warm-bronze flex items-center justify-center group-hover:scale-110 transition-transform">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.teachers > 0 ? kpi.teachers.toLocaleString() : "—"}
          </div>
          <div className="text-xs text-warm-bronze mt-1 font-bold">
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
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-warm-bronze hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">Website Live</span>
            <div className="w-8 h-8 rounded-xl bg-warm-bronze/15 text-warm-bronze flex items-center justify-center group-hover:scale-110 transition-transform">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.websitesPct}%
          </div>
          <div className="text-xs text-warm-bronze mt-1 font-bold">
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
          className="p-4 rounded-[2rem] bg-warm-cream border border-warm-accent hover:border-[#456ca6] hover:shadow-md transition-all cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#78716c]">GPS แม่นยำสูง</span>
            <div className="w-8 h-8 rounded-xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Crosshair className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-warm-charcoal tracking-tight tabular-nums">
            {kpi.gpsExactPct}%
          </div>
          <div className="text-xs text-[#456ca6] mt-1 font-bold">
            {kpi.gpsExact} แห่ง (Exact)
          </div>
        </div>
      </div>

      {/* Row 1: Provinces Distribution & Education Levels */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Province Distribution */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <MapPin className="w-5 h-5 text-warm-bronze" />
              <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                การกระจายตัวตามจังหวัด (กดเพื่อดูรายชื่อ)
              </h3>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-warm-cream text-warm-bronze border border-warm-accent">
              {provinceStats.length} จังหวัด
            </span>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={provinceSearch}
              onChange={(e) => setProvinceSearch(e.target.value)}
              placeholder="ค้นหาจังหวัด เช่น กรุงเทพ, เชียงใหม่, ภูเก็ต..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-warm-accent bg-white/70 text-warm-charcoal placeholder:text-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
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
                className="p-3 rounded-2xl bg-white/70 hover:bg-warm-cream border border-warm-accent/60 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-warm-charcoal truncate">
                      {p.province}
                    </span>
                    <span className="text-[11px] text-[#78716c]">
                      ({p.hasWebsite} เว็บไซต์ / {p.hasGps} GPS)
                    </span>
                  </div>
                  <div className="w-36 md:w-48 h-1.5 bg-warm-accent/70 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-warm-bronze rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(p.pct, 4)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-warm-charcoal">
                    {p.count} แห่ง
                  </span>
                  <span className="text-xs tabular-nums text-[#78716c]">
                    ({p.pct}%)
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#a8a29e] group-hover:text-warm-bronze transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Education Levels Breakdown */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <GraduationCap className="w-5 h-5 text-[#456ca6]" />
                <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                  ระดับชั้นที่เปิดสอน (5 ระดับชั้น)
                </h3>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-warm-cream text-[#456ca6] border border-warm-accent">
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
                className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/70 hover:border-[#456ca6] cursor-pointer transition-all"
              >
                <div className="text-xl font-bold text-warm-charcoal">
                  {levelStats.preK.count}
                </div>
                <div className="text-xs font-bold text-warm-charcoal/80">
                  ก่อนอนุบาล
                </div>
                <div className="text-xs text-[#456ca6] font-semibold mt-0.5">
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
                className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/70 hover:border-[#456ca6] cursor-pointer transition-all"
              >
                <div className="text-xl font-bold text-warm-charcoal">
                  {levelStats.k.count}
                </div>
                <div className="text-xs font-bold text-warm-charcoal/80">
                  อนุบาล (Kindergarten)
                </div>
                <div className="text-xs text-[#456ca6] font-semibold mt-0.5">
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
                className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/70 hover:border-[#456ca6] cursor-pointer transition-all"
              >
                <div className="text-xl font-bold text-warm-charcoal">
                  {levelStats.primary.count}
                </div>
                <div className="text-xs font-bold text-warm-charcoal/80">
                  ประถม (Primary)
                </div>
                <div className="text-xs text-[#456ca6] font-semibold mt-0.5">
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
                className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/70 hover:border-[#456ca6] cursor-pointer transition-all"
              >
                <div className="text-xl font-bold text-warm-charcoal">
                  {levelStats.lowerSec.count}
                </div>
                <div className="text-xs font-bold text-warm-charcoal/80">
                  มัธยมศึกษาตอนต้น
                </div>
                <div className="text-xs text-[#456ca6] font-semibold mt-0.5">
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
                className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/70 hover:border-[#456ca6] cursor-pointer transition-all"
              >
                <div className="text-xl font-bold text-warm-charcoal">
                  {levelStats.upperSec.count}
                </div>
                <div className="text-xs font-bold text-warm-charcoal/80">
                  มัธยมศึกษาตอนปลาย
                </div>
                <div className="text-xs text-[#456ca6] font-semibold mt-0.5">
                  {levelStats.upperSec.pct}% ของทั้งหมด
                </div>
              </div>
            </div>
          </div>

          {/* Highlights Banners */}
          <div className="space-y-2.5 pt-2">
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
              className="p-3.5 rounded-2xl bg-warm-cream border border-warm-accent flex items-center justify-between cursor-pointer hover:border-[#456ca6] hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs md:text-sm text-warm-charcoal">
                    เปิดสอนครบวงจร (All-Through Schools)
                  </div>
                  <div className="text-xs text-[#78716c]">
                    เปิดตั้งแต่ก่อนอนุบาล/อนุบาลจนถึงมัธยมปลาย (ม.6)
                  </div>
                </div>
              </div>
              <div className="text-base font-bold text-[#456ca6]">
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
              className="p-3.5 rounded-2xl bg-warm-cream border border-warm-accent flex items-center justify-between cursor-pointer hover:border-[#456ca6] hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#456ca6]/15 text-[#456ca6] flex items-center justify-center flex-shrink-0">
                  <Shapes className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs md:text-sm text-warm-charcoal">
                    เฉพาะระดับปฐมวัย / อนุบาล (Early Years Only)
                  </div>
                  <div className="text-xs text-[#78716c]">
                    เตรียมความพร้อมเด็กเล็กก่อนเข้าประถม
                  </div>
                </div>
              </div>
              <div className="text-base font-bold text-[#456ca6]">
                {levelStats.earlyYearsOnly} แห่ง
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Curriculums & Top 10 Largest Schools */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Curriculums */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-warm-bronze" />
              <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                รูปแบบหลักสูตรการศึกษา (Curriculums)
              </h3>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-warm-cream text-warm-bronze border border-warm-accent">
              {curriculumStats.length} รูปแบบ
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex bg-warm-cream border border-warm-accent p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setCurriculumMode("normalized")}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  curriculumMode === "normalized"
                    ? "bg-warm-charcoal text-white shadow-xs"
                    : "text-[#78716c] hover:text-warm-charcoal"
                }`}
              >
                จัดกลุ่มมาตรฐาน
              </button>
              <button
                type="button"
                onClick={() => setCurriculumMode("raw")}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  curriculumMode === "raw"
                    ? "bg-warm-charcoal text-white shadow-xs"
                    : "text-[#78716c] hover:text-warm-charcoal"
                }`}
              >
                ชื่อตาม สช. (Raw)
              </button>
            </div>

            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 text-[#a8a29e] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={curriculumSearch}
                onChange={(e) => setCurriculumSearch(e.target.value)}
                placeholder="ค้นหาหลักสูตร เช่น British, IB, American..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-warm-accent bg-white/70 text-warm-charcoal placeholder:text-[#a8a29e] text-xs focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
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
                className="p-3 rounded-2xl bg-white/70 hover:bg-warm-cream border border-warm-accent/60 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="font-bold text-xs text-warm-charcoal truncate">
                    {c.name}
                  </div>
                  <div className="w-full h-1.5 bg-warm-accent/70 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-warm-bronze rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(c.pct, 4)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-bold text-xs text-warm-charcoal">
                    {c.count} แห่ง
                  </span>
                  <span className="text-xs tabular-nums text-[#78716c]">
                    ({c.pct}%)
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#a8a29e] group-hover:text-warm-bronze transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 Largest Schools */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-warm-bronze" />
              <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                10 อันดับโรงเรียนขนาดใหญ่ที่สุด (จำนวนนักเรียน)
              </h3>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-warm-cream text-warm-bronze border border-warm-accent">
              Top 10 Rankings
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-warm-accent text-[#78716c] font-bold text-xs uppercase tracking-wider">
                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-2">ชื่อโรงเรียน</th>
                  <th className="py-2.5 px-2">จังหวัด</th>
                  <th className="py-2.5 px-2 text-right">นักเรียน</th>
                  <th className="py-2.5 px-2 text-right">นร./ครู</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-accent/40">
                {top10Schools.map((s) => (
                  <tr
                    key={s.code}
                    onClick={() => {
                      const match = schools.find((x) => x.school_code === s.code);
                      if (match) onOpenDrillDown(match.school_name_th, `อันดับที่ ${s.rank}`, [match]);
                    }}
                    className="hover:bg-white cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-2 text-center font-bold text-[#78716c]">
                      {s.rank}
                    </td>
                    <td className="py-2.5 px-2 font-bold text-warm-charcoal max-w-[180px] truncate">
                      {s.name_th}
                    </td>
                    <td className="py-2.5 px-2 text-[#78716c]">
                      {s.province}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-warm-bronze">
                      {s.student_count.toLocaleString()} คน
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-[#78716c]">
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
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs">
          <div className="flex items-center gap-2.5 mb-4">
            <DollarSign className="w-5 h-5 text-[#456ca6]" />
            <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
              การรับเงินอุดหนุนจากรัฐบาล (สช. OPEC)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div
              onClick={() =>
                onOpenDrillDown(
                  "ไม่รับเงินอุดหนุนจากรัฐบาล",
                  "โรงเรียนเอกชน 100% ที่ไม่ได้รับเงินอุดหนุน",
                  schools.filter((s) => s.government_support !== "รับเงินอุดหนุน")
                )
              }
              className="p-4.5 rounded-2xl bg-white/70 border border-warm-accent hover:border-[#456ca6] cursor-pointer hover:shadow-xs transition-all"
            >
              <div className="text-2xl lg:text-3xl font-bold text-[#456ca6]">
                {subsidyStats.noSubsidy}
              </div>
              <div className="text-xs font-bold text-warm-charcoal mt-1.5">
                ไม่รับเงินอุดหนุน (100% เอกชน)
              </div>
              <div className="text-xs text-[#78716c] mt-0.5 font-medium">
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
              className="p-4.5 rounded-2xl bg-white/70 border border-warm-accent hover:border-warm-bronze cursor-pointer hover:shadow-xs transition-all"
            >
              <div className="text-2xl lg:text-3xl font-bold text-warm-bronze">
                {subsidyStats.hasSubsidy}
              </div>
              <div className="text-xs font-bold text-warm-charcoal mt-1.5">
                รับเงินอุดหนุนรัฐบาล
              </div>
              <div className="text-xs text-[#78716c] mt-0.5 font-medium">
                {subsidyStats.hasPct}% ของโรงเรียนทั้งหมด
              </div>
            </div>
          </div>
        </div>

        {/* Spatial & Digital Quality */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs">
          <div className="flex items-center gap-2.5 mb-4">
            <Satellite className="w-5 h-5 text-[#456ca6]" />
            <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
              คุณภาพข้อมูลและพิกัดภูมิศาสตร์ (Data Completeness)
            </h3>
          </div>

          <div className="space-y-2.5 text-xs">
            <div
              onClick={() =>
                onOpenDrillDown(
                  "GPS แม่นยำระดับอาคารจริง (Exact)",
                  "พิกัดระบุตำแหน่งอาคารเรียนจริง",
                  schools.filter((s) => s.gps_precision === "Exact")
                )
              }
              className="p-3.5 rounded-2xl bg-white/70 hover:bg-warm-cream border border-warm-accent/60 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-4 h-4 text-[#456ca6]" />
                <span className="font-bold text-warm-charcoal">
                  หมุด GPS ระดับอาคาร/ถนนจริง (Exact)
                </span>
              </div>
              <span className="font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
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
              className="p-3.5 rounded-2xl bg-white/70 hover:bg-warm-cream border border-warm-accent/60 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-warm-bronze" />
                <span className="font-bold text-warm-charcoal">
                  หมุด GPS ประมาณการระดับอำเภอ/ตำบล
                </span>
              </div>
              <span className="font-bold px-2.5 py-1 rounded-full bg-warm-card text-warm-bronze border border-warm-accent">
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
              className="p-3.5 rounded-2xl bg-white/70 hover:bg-warm-cream border border-warm-accent/60 cursor-pointer transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-[#456ca6]" />
                <span className="font-bold text-warm-charcoal">
                  Official Website ตรวจสอบสถานะแล้ว (Live)
                </span>
              </div>
              <span className="font-bold px-2.5 py-1 rounded-full bg-warm-card text-warm-charcoal border border-warm-accent">
                {spatialStats.webLive} แห่ง
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: ISAT Membership, Boarding Schools & Global Accreditations (CIS / WASC / ONESQA) */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* ISAT Membership & Boarding Schools Highlight */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#456ca6]" />
                <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                  สถานะสมาคม ISAT และโรงเรียนประจำ (ISAT & Boarding)
                </h3>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#456ca6]/10 text-[#456ca6] border border-[#456ca6]/20">
                สมาคม ISAT
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 mb-4">
              {/* ISAT Member Card */}
              <div
                onClick={() =>
                  onOpenDrillDown(
                    "สมาชิกสมาคมโรงเรียนนานาชาติ (ISAT Members)",
                    "โรงเรียนที่เป็นสมาชิกสมาคม ISAT แห่งประเทศไทย",
                    schools.filter((s) => s.is_isat_member)
                  )
                }
                className="p-4 rounded-2xl bg-white/70 border border-warm-accent hover:border-[#456ca6] cursor-pointer hover:shadow-xs transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-2xl lg:text-3xl font-bold text-[#456ca6]">
                    {isatStats.isatCount}
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-[#456ca6]/10 text-[#456ca6] flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs font-bold text-warm-charcoal">
                  สมาชิกสมาคม ISAT
                </div>
                <div className="text-xs text-[#456ca6] mt-0.5 font-bold">
                  {isatStats.isatPct}% ของโรงเรียนทั้งหมด
                </div>
              </div>

              {/* Boarding School Card */}
              <div
                onClick={() =>
                  onOpenDrillDown(
                    "โรงเรียนประจำ (Boarding Schools)",
                    "โรงเรียนนานาชาติที่มีหอพักประจำสำหรับนักเรียน",
                    schools.filter((s) => s.is_boarding)
                  )
                }
                className="p-4 rounded-2xl bg-white/70 border border-warm-accent hover:border-warm-bronze cursor-pointer hover:shadow-xs transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-2xl lg:text-3xl font-bold text-warm-bronze">
                    {isatStats.boardingCount}
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-warm-bronze/15 text-warm-bronze flex items-center justify-center">
                    <Bed className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs font-bold text-warm-charcoal">
                  โรงเรียนประจำ (Boarding)
                </div>
                <div className="text-xs text-warm-bronze mt-0.5 font-bold">
                  {isatStats.boardingPct}% มีหอพักนักเรียน
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/70 border border-warm-accent/80 text-xs text-[#78716c] flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-warm-bronze shrink-0" />
            <span>
              ข้อมูลสมาชิก ISAT และสิ่งอำนวยความสะดวกหอพักเชื่อมโยงสดจากฐานข้อมูลสมาคมโรงเรียนนานาชาติแห่งประเทศไทย (ISAT Directory)
            </span>
          </div>
        </div>

        {/* Global Accreditations Breakdown */}
        <div className="p-6 rounded-[2rem] bg-warm-cream border border-warm-accent shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-teal-700" />
              <h3 className="font-bold text-warm-charcoal text-sm md:text-base">
                มาตรฐานสากลและการรับรอง (Accreditations)
              </h3>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              {isatStats.topAccreditations.length} องค์กร
            </span>
          </div>

          <p className="text-xs text-[#78716c] mb-3">
            สถิติการรับรองมาตรฐานคุณภาพการศึกษาจากองค์กรสากลระดับโลก เช่น ONESQA (สมศ.), WASC, CIS, EDT, NEASC
          </p>

          <div className="space-y-2 overflow-y-auto max-h-72 pr-1 scrollbar-thin">
            {isatStats.topAccreditations.map((acc) => (
              <div
                key={acc.name}
                onClick={() =>
                  onOpenDrillDown(
                    `มาตรฐาน: ${acc.name}`,
                    `โรงเรียนที่ได้รับการรับรองจาก ${acc.name}`,
                    schools.filter((s) => (s.accreditations || []).includes(acc.name))
                  )
                }
                className="p-3 rounded-2xl bg-white/70 hover:bg-teal-50/40 border border-warm-accent/60 hover:border-teal-300 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-warm-charcoal truncate">
                      {acc.name}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-warm-accent/70 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(acc.pct, 4)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-teal-900">
                    {acc.count} แห่ง
                  </span>
                  <span className="text-xs tabular-nums text-[#78716c]">
                    ({acc.pct}%)
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#a8a29e] group-hover:text-teal-700 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
