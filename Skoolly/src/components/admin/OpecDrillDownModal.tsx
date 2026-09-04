import React, { useState, useMemo } from "react";
import { X, Search, School, Globe, MapPin, Eye, ExternalLink } from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

interface OpecDrillDownModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  schools: OpecSchoolRecord[];
  onClose: () => void;
  onSelectSchool: (school: OpecSchoolRecord) => void;
}

export function OpecDrillDownModal({
  isOpen,
  title,
  subtitle,
  schools,
  onClose,
  onSelectSchool,
}: OpecDrillDownModalProps) {
  const [search, setSearch] = useState("");

  const filteredSchools = useMemo(() => {
    if (!search.trim()) return schools;
    const q = search.toLowerCase();
    return schools.filter(
      (s) =>
        s.school_name_th?.toLowerCase().includes(q) ||
        s.school_name_en?.toLowerCase().includes(q) ||
        s.school_code?.includes(q) ||
        s.province?.toLowerCase().includes(q)
    );
  }, [schools, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {schools.length} แห่ง
              </span>
            </div>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาในรายการนี้ เช่น ชื่อโรงเรียน, รหัส, จังหวัด..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="p-4 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 space-y-2 scrollbar-thin">
          {filteredSchools.length > 0 ? (
            filteredSchools.map((school, index) => (
              <div
                key={school.school_code || index}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xs font-mono text-slate-400 w-6 text-right pt-0.5 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs md:text-sm text-slate-900 dark:text-white truncate">
                        {school.school_name_th}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {school.school_code}
                      </span>
                    </div>
                    {school.school_name_en && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {school.school_name_en}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        {school.province} {school.district ? `(${school.district})` : ""}
                      </span>
                      {Number(school.student_count) > 0 && (
                        <span>นร. {Number(school.student_count).toLocaleString()} คน</span>
                      )}
                      {school.website && (
                        <a
                          href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="w-3 h-3" /> เว็บไซต์
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onSelectSchool(school)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> ดูข้อมูล
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs italic">
              ไม่พบโรงเรียนที่ตรงกับคำค้นหา
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
