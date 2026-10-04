import React, { useState, useEffect } from "react";
import { X, Globe, Save, Loader2 } from "lucide-react";
import type { OpecSchoolRecord } from "@/types/opec";

interface OpecEditWebsiteModalProps {
  school: OpecSchoolRecord | null;
  onClose: () => void;
  onSave: (schoolCode: string, newWebsite: string) => Promise<boolean>;
}

export function OpecEditWebsiteModal({ school, onClose, onSave }: OpecEditWebsiteModalProps) {
  const [website, setWebsite] = useState(school?.website || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!school) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const ok = await onSave(school.school_code, website.trim());
      if (ok) {
        onClose();
      } else {
        setError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-warm-cream border border-warm-accent rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="p-5 border-b border-warm-accent bg-warm-cream flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warm-bronze/15 text-warm-bronze flex items-center justify-center shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-warm-charcoal text-base">แก้ไข Official Website</h3>
              <p className="text-xs text-[#78716c] truncate max-w-[220px]">
                {school.school_name_th}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-warm-accent/50 text-[#78716c] hover:text-warm-charcoal transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
          <div>
            <label className="block text-xs font-bold text-warm-charcoal mb-1.5">
              URL เว็บไซต์ทางการ (Official Website):
            </label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.example.ac.th"
              className="w-full px-3.5 py-2.5 rounded-xl border border-warm-accent bg-white/70 text-warm-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/50 placeholder:text-[#a8a29e]"
              autoFocus
            />
            <p className="text-xs text-[#78716c] mt-1.5">
              ระบุ URL ให้ถูกต้อง เช่น https://www.patana.ac.th หรือปล่อยว่างหากต้องการลบ
            </p>
          </div>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#78716c] hover:bg-warm-cream border border-warm-accent rounded-xl transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold bg-warm-charcoal hover:bg-warm-charcoal/85 text-white rounded-full shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-warm-bronze" />}
              <span>{isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
