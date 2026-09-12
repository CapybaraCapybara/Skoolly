import { useState, useEffect } from "react";
import { X, Save, Plus, Loader2, School as SchoolIcon, MapPin, Globe, BookOpen, Layers } from "lucide-react";
import type { SupabaseSchoolRecord, CreateSupabaseSchoolInput } from "@/types/opec";

interface SupabaseSchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateSupabaseSchoolInput, id?: string) => Promise<boolean>;
  initialSchool?: SupabaseSchoolRecord | null;
}

const COMMON_CURRICULUMS = [
  "British",
  "American",
  "IB (International Baccalaureate)",
  "Cambridge",
  "Singapore",
  "Australian",
  "Canadian",
  "German",
  "French",
  "Japanese",
  "Christian",
  "Montessori",
];

const COMMON_LEVELS = [
  "อนุบาล (Early Years / Kindergarten)",
  "ประถมศึกษา (Primary / Elementary)",
  "มัธยมศึกษาตอนต้น (Middle / Lower Secondary)",
  "มัธยมศึกษาตอนปลาย (High / Upper Secondary)",
];

export function SupabaseSchoolModal({
  isOpen,
  onClose,
  onSave,
  initialSchool,
}: SupabaseSchoolModalProps) {
  const isEditing = Boolean(initialSchool);

  const [formData, setFormData] = useState<CreateSupabaseSchoolInput>({
    opec_school_code: "",
    name_th: "",
    name_en: "",
    province: "กรุงเทพมหานคร",
    district: "",
    subdistrict: "",
    address: "",
    official_website_url: "",
    official_phone: "",
    official_email: "",
    student_count: 0,
    teacher_count: 0,
    curriculums: [],
    levels_offered: [],
    latitude: null,
    longitude: null,
  });

  const [customCurriculum, setCustomCurriculum] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialSchool) {
      setFormData({
        opec_school_code: initialSchool.opec_school_code || "",
        name_th: initialSchool.name_th || "",
        name_en: initialSchool.name_en || "",
        province: initialSchool.province || "กรุงเทพมหานคร",
        district: initialSchool.district || "",
        subdistrict: initialSchool.subdistrict || "",
        address: initialSchool.address || "",
        official_website_url: initialSchool.official_website_url || "",
        official_phone: initialSchool.official_phone || "",
        official_email: initialSchool.official_email || "",
        student_count: initialSchool.student_count ?? 0,
        teacher_count: initialSchool.teacher_count ?? 0,
        curriculums: initialSchool.curriculums || [],
        levels_offered: initialSchool.levels_offered || [],
        latitude: initialSchool.latitude ?? null,
        longitude: initialSchool.longitude ?? null,
      });
    } else {
      setFormData({
        opec_school_code: "",
        name_th: "",
        name_en: "",
        province: "กรุงเทพมหานคร",
        district: "",
        subdistrict: "",
        address: "",
        official_website_url: "",
        official_phone: "",
        official_email: "",
        student_count: 0,
        teacher_count: 0,
        curriculums: [],
        levels_offered: [],
        latitude: null,
        longitude: null,
      });
    }
    setError(null);
  }, [isOpen, initialSchool]);

  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleCurriculumToggle = (curriculum: string) => {
    setFormData((prev) => {
      const exists = prev.curriculums?.includes(curriculum);
      const updated = exists
        ? prev.curriculums?.filter((c) => c !== curriculum)
        : [...(prev.curriculums || []), curriculum];
      return { ...prev, curriculums: updated };
    });
  };

  const handleAddCustomCurriculum = () => {
    const trimmed = customCurriculum.trim();
    if (!trimmed) return;
    if (!formData.curriculums?.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        curriculums: [...(prev.curriculums || []), trimmed],
      }));
    }
    setCustomCurriculum("");
  };

  const handleLevelToggle = (level: string) => {
    setFormData((prev) => {
      const exists = prev.levels_offered?.includes(level);
      const updated = exists
        ? prev.levels_offered?.filter((l) => l !== level)
        : [...(prev.levels_offered || []), level];
      return { ...prev, levels_offered: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name_th.trim()) {
      setError("กรุณาระบุชื่อโรงเรียนภาษาไทย");
      return;
    }
    if (!formData.province?.trim()) {
      setError("กรุณาระบุจังหวัด");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ok = await onSave(formData, initialSchool?.school_id);
      if (ok) {
        onClose();
      } else {
        setError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white border border-[#eae0d0] rounded-3xl p-6 sm:p-8 shadow-2xl transition-all my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#eae0d0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0f9488]/15 border border-[#0f9488]/30 text-[#0f9488] flex items-center justify-center">
              <SchoolIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1c1917]">
                {isEditing ? "แก้ไขข้อมูลโรงเรียนใน Supabase" : "เพิ่มโรงเรียนใหม่ใน Supabase"}
              </h2>
              <p className="text-xs text-[#1c1917]/60">
                {isEditing
                  ? `รหัส ${initialSchool?.opec_school_code || initialSchool?.school_id} (${initialSchool?.name_th})`
                  : "บันทึกลงตาราง school_data.schools ใน PostgreSQL ทันที"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-2 rounded-xl text-[#1c1917]/40 hover:text-[#1c1917] hover:bg-[#faf8f5] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pt-4 space-y-4 pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                รหัสโรงเรียน OPEC
              </label>
              <input
                type="text"
                disabled={isEditing || loading}
                value={formData.opec_school_code || ""}
                onChange={(e) => setFormData({ ...formData, opec_school_code: e.target.value })}
                placeholder="เช่น 10100001"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all disabled:opacity-60"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                ชื่อโรงเรียน (ภาษาไทย) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={formData.name_th}
                onChange={(e) => setFormData({ ...formData, name_th: e.target.value })}
                placeholder="เช่น โรงเรียนนานาชาติฮาร์โรว์"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1c1917] mb-1">
              ชื่อโรงเรียน (English)
            </label>
            <input
              type="text"
              disabled={loading}
              value={formData.name_en || ""}
              onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
              placeholder="e.g. Harrow International School Bangkok"
              className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                จังหวัด <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={formData.province || ""}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="เช่น กรุงเทพมหานคร, เชียงใหม่"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                เขต / อำเภอ
              </label>
              <input
                type="text"
                disabled={loading}
                value={formData.district || ""}
                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                placeholder="เช่น ดอนเมือง"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1c1917] mb-1">
              ที่อยู่เต็ม (Address)
            </label>
            <textarea
              rows={2}
              disabled={loading}
              value={formData.address || ""}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="เลขที่ ซอย ถนน แขวง/ตำบล..."
              className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all resize-none"
            />
          </div>

          {/* Curriculums */}
          <div>
            <label className="block text-xs font-bold text-[#1c1917] mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#0f9488]" />
              <span>หลักสูตร (Curriculums)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_CURRICULUMS.map((curr) => {
                const isSelected = formData.curriculums?.includes(curr);
                return (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => handleCurriculumToggle(curr)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                      isSelected
                        ? "bg-[#0f9488] text-white border-[#0f9488] shadow-xs"
                        : "bg-[#faf8f5] text-[#1c1917]/70 border-[#eae0d0] hover:bg-[#eae0d0]/50"
                    }`}
                  >
                    {curr}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customCurriculum}
                onChange={(e) => setCustomCurriculum(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomCurriculum();
                  }
                }}
                placeholder="ระบุหลักสูตรอื่นๆ แล้วกดเพิ่ม..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden"
              />
              <button
                type="button"
                onClick={handleAddCustomCurriculum}
                className="px-3 py-1.5 rounded-xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0] text-[#1c1917] text-xs font-bold transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่ม</span>
              </button>
            </div>
          </div>

          {/* Levels Offered */}
          <div>
            <label className="block text-xs font-bold text-[#1c1917] mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#ab8e72]" />
              <span>ระดับชั้นที่เปิดสอน (Levels Offered)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMON_LEVELS.map((lvl) => {
                const isSelected = formData.levels_offered?.includes(lvl);
                return (
                  <label
                    key={lvl}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#ab8e72]/15 border-[#ab8e72] font-semibold text-[#1c1917]"
                        : "bg-[#faf8f5] border-[#eae0d0] text-[#1c1917]/70 hover:bg-[#faf5ee]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleLevelToggle(lvl)}
                      className="rounded text-[#ab8e72] focus:ring-[#ab8e72]"
                    />
                    <span>{lvl}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Web & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-[#25508a]" />
                <span>เว็บไซต์ทางการ (Website)</span>
              </label>
              <input
                type="url"
                disabled={loading}
                value={formData.official_website_url || ""}
                onChange={(e) => setFormData({ ...formData, official_website_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="text"
                disabled={loading}
                value={formData.official_phone || ""}
                onChange={(e) => setFormData({ ...formData, official_phone: e.target.value })}
                placeholder="02-xxx-xxxx"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Students / Teachers / GPS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                จำนวนนักเรียน
              </label>
              <input
                type="number"
                min={0}
                disabled={loading}
                value={formData.student_count ?? 0}
                onChange={(e) => setFormData({ ...formData, student_count: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1">
                จำนวนครู
              </label>
              <input
                type="number"
                min={0}
                disabled={loading}
                value={formData.teacher_count ?? 0}
                onChange={(e) => setFormData({ ...formData, teacher_count: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#0f9488]" />
                <span>ละติจูด (Lat)</span>
              </label>
              <input
                type="number"
                step="any"
                disabled={loading}
                value={formData.latitude ?? ""}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="13.7563"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1c1917] mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#0f9488]" />
                <span>ลองจิจูด (Lng)</span>
              </label>
              <input
                type="number"
                step="any"
                disabled={loading}
                value={formData.longitude ?? ""}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="100.5018"
                className="w-full px-3 py-2 rounded-xl bg-[#faf8f5] border border-[#eae0d0] text-xs focus:ring-2 focus:ring-[#0f9488] focus:bg-white outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#eae0d0] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-[#eae0d0] bg-[#faf5ee] hover:bg-[#eae0d0]/50 text-[#1c1917] text-xs font-semibold transition-all disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-[#0f9488] hover:bg-[#0d7d72] text-white text-xs font-bold shadow-md shadow-teal-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isEditing ? "บันทึกการแก้ไข" : "เพิ่มโรงเรียนเข้า Supabase"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
