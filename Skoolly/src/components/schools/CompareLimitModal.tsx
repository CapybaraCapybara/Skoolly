import React from "react";
import { School } from "@/types";
import { MAX_COMPARE } from "@/constants";

interface CompareLimitModalProps {
  currentSchools: School[];
  newSchool: School;
  onReplace: (removeSchoolId: number, addSchoolId: number) => void;
  onClose: () => void;
}

export function CompareLimitModal({
  currentSchools,
  newSchool,
  onReplace,
  onClose,
}: CompareLimitModalProps) {
  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-warm-charcoal/60"
      style={{ backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-warm-cream rounded-[2rem] border border-warm-accent shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-warm-charcoal">
              เปรียบเทียบได้ครั้งละ {MAX_COMPARE} โรงเรียน
            </h3>
            <p className="text-sm text-warm-charcoal/60 mt-1">
              เลือกโรงเรียนที่จะเอาออก เพื่อใส่ {newSchool.name} แทน
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-warm-charcoal/50 hover:text-warm-charcoal hover:bg-warm-accent/50 transition-colors cursor-pointer"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        {/* List of currently compared schools */}
        <div className="flex flex-col gap-2.5">
          {currentSchools.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-warm-accent/60 hover:border-warm-bronze transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-lg bg-slate-50 border border-warm-accent/40 flex items-center justify-center shrink-0 p-1">
                  {s.logoUrl || (s.image?.startsWith("http") ? s.image : null) ? (
                    <img
                      src={s.logoUrl || s.image}
                      alt={s.name}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-warm-bronze">
                      {s.name.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-xs text-warm-charcoal truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-warm-charcoal/60">
                    {s.curriculum} · {s.tuitionStart > 0 ? `฿${s.tuitionStart.toLocaleString()}/ปี` : "ไม่มีข้อมูลค่าเทอม"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onReplace(s.id, newSchool.id)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-warm-accent text-warm-charcoal hover:border-warm-bronze hover:text-warm-bronze transition-colors cursor-pointer"
              >
                เอาออก
              </button>
            </div>
          ))}
        </div>

        {/* Cancel button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-warm-charcoal/70 hover:bg-warm-accent/50 transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
