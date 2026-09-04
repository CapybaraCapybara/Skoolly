import React, { useState } from "react";
import { X, Globe, MapPin, ExternalLink, School, Users, GraduationCap, Building2, Phone, Mail, FileJson, Copy, Check } from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

interface OpecSchoolDetailModalProps {
  school: OpecSchoolRecord | null;
  onClose: () => void;
  onEditWebsite: (school: OpecSchoolRecord) => void;
}

export function OpecSchoolDetailModal({ school, onClose, onEditWebsite }: OpecSchoolDetailModalProps) {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!school) return null;

  const hasGps = Boolean(school.latitude && school.longitude);
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(school.school_name_th + " " + (school.province || ""))}`;

  const studentCount = Number(school.student_count) || 0;
  const teacherCount = Number(school.teacher_count) || 0;
  const ratio = teacherCount > 0 ? (studentCount / teacherCount).toFixed(1) : "—";

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(school, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-start gap-4">
            {school.school_logo_url ? (
              <img
                src={school.school_logo_url}
                alt="Logo"
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-white p-1"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-800/50">
                <School className="w-8 h-8" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  รหัส สช.: {school.school_code}
                </span>
                {school.gps_precision === "Exact" ? (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    GPS แม่นยำระดับอาคาร
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    GPS ประมาณการ/รอตรวจสอบ
                  </span>
                )}
                {school.government_support && (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    {school.government_support}
                  </span>
                )}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {school.school_name_th}
              </h2>
              {school.school_name_en && (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {school.school_name_en}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin">
          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-slate-800/50 border border-blue-100/80 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-500" /> นักเรียน
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {studentCount > 0 ? studentCount.toLocaleString() : "—"} คน
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-slate-800/50 border border-purple-100/80 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-purple-500" /> ครู/บุคลากร
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {teacherCount > 0 ? teacherCount.toLocaleString() : "—"} คน
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-slate-800/50 border border-amber-100/80 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-500" /> อัตราส่วน นร./ครู
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                ~{ratio} : 1
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-slate-800/50 border border-emerald-100/80 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-500" /> จังหวัด
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                {school.province || "—"}
              </div>
            </div>
          </div>

          {/* Academic & Curriculum */}
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-500" /> ข้อมูลการจัดการศึกษา & หลักสูตร
            </h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">ระดับชั้นที่เปิดสอน:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {school.levels_offered && school.levels_offered.length > 0
                    ? school.levels_offered.join(", ")
                    : school.level_range || "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">หลักสูตรที่ใช้:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {school.curriculums && school.curriculums.length > 0
                    ? school.curriculums.join(", ")
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Location & Digital Channels */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Location */}
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-500" /> ข้อมูลที่ตั้ง & พิกัดแผนที่
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {school.address || "—"}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                {hasGps ? (
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    {school.latitude}, {school.longitude}
                  </span>
                ) : (
                  <span className="text-amber-500 italic">ยังไม่มีพิกัดละติจูด/ลองจิจูด</span>
                )}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold ml-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> เปิด Google Maps
                </a>
              </div>
            </div>

            {/* Digital Channels */}
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-500" /> ช่องทางติดต่อ & เว็บไซต์
              </h3>
              <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">เว็บไซต์ทางการ:</span>
                  {school.website ? (
                    <a
                      href={school.website.startsWith("http") ? school.website : `https://${school.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px] inline-flex items-center gap-1"
                    >
                      {school.website} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">ไม่มีข้อมูล</span>
                  )}
                </div>
                {school.telephone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">โทรศัพท์:</span>
                    <span>{school.telephone}</span>
                  </div>
                )}
                {school.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">อีเมล:</span>
                    <span>{school.email}</span>
                  </div>
                )}
              </div>
              <div className="pt-2">
                <button
                  onClick={() => onEditWebsite(school)}
                  className="w-full py-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" /> แก้ไข Official Website
                </button>
              </div>
            </div>
          </div>

          {/* Management & Governance */}
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 mb-2">
              คณะผู้บริหารและข้อมูลนิติบุคคล
            </h3>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">ผู้รับใบอนุญาต:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{school.licensee_name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">ผู้อำนวยการ:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{school.director_name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">ผู้จัดการ:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{school.manager_name || "—"}</span>
              </div>
            </div>
          </div>

          {/* Raw JSON toggle */}
          <div>
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 py-1"
            >
              <FileJson className="w-4 h-4" />
              {showJson ? "ซ่อน Raw JSON ข้อมูลดิบ" : "ดูข้อมูลดิบ สช. (Raw JSON)"}
            </button>
            {showJson && (
              <div className="mt-2 relative">
                <button
                  onClick={handleCopyJson}
                  className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                </button>
                <pre className="bg-slate-950 text-slate-300 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-60 border border-slate-800">
                  {JSON.stringify(school, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            อัปเดตล่าสุด: {school.last_updated || school.fetched_at || "—"}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
