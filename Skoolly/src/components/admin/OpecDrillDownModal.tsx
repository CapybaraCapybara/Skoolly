import { useState, useMemo, useEffect } from "react";
import { X, Search, Globe, MapPin, Eye } from "lucide-react";
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

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#eae0d0] rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="p-5 border-b border-[#eae0d0] flex items-center justify-between bg-[#faf5ee]">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-[#1c1917]">{title}</h3>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-white text-[#ab8e72] border border-[#eae0d0] shadow-xs">
                {schools.length} แห่ง
              </span>
            </div>
            {subtitle && <p className="text-xs text-[#78716c] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#eae0d0]/50 text-[#78716c] hover:text-[#1c1917] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[#eae0d0] bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาในรายการนี้ เช่น ชื่อโรงเรียน, รหัส, จังหวัด..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#eae0d0] bg-[#faf8f5] text-[#1c1917] text-xs focus:outline-none focus:ring-2 focus:ring-[#ab8e72]/40 placeholder:text-[#a8a29e]"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="p-4 overflow-y-auto divide-y divide-[#eae0d0]/50 space-y-2 scrollbar-thin bg-white">
          {filteredSchools.length > 0 ? (
            filteredSchools.map((school, index) => (
              <div
                key={school.school_code || index}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 hover:bg-[#faf5ee] p-2.5 rounded-2xl transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xs font-mono text-[#a8a29e] w-6 text-right pt-0.5 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs md:text-sm text-[#1c1917] truncate">
                        {school.school_name_th}
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-[#faf8f5] border border-[#eae0d0] text-[#78716c]">
                        {school.school_code}
                      </span>
                    </div>
                    {school.school_name_en && (
                      <p className="text-xs text-[#78716c] truncate">
                        {school.school_name_en}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-[#78716c] mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#e11d48]" />
                        {school.province} {school.district ? `(${school.district})` : ""}
                      </span>
                      {Number(school.student_count) > 0 && (
                        <span className="font-medium text-[#ab8e72]">
                          นร. {Number(school.student_count).toLocaleString()} คน
                        </span>
                      )}
                      {school.website && (
                        <a
                          href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#25508a] hover:underline flex items-center gap-0.5 font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="w-3 h-3" /> เว็บไซต์
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectSchool(school)}
                  className="px-3.5 py-1.5 bg-[#1c1917] hover:bg-[#1c1917]/85 text-white rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0 shadow-xs transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-[#ab8e72]" /> ดูข้อมูล
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-[#a8a29e] text-xs italic">
              ไม่พบโรงเรียนที่ตรงกับคำค้นหา
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#eae0d0] bg-[#faf5ee] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-[#faf8f5] border border-[#eae0d0] text-[#1c1917] rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
