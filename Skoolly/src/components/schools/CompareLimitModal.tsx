import React from "react";
import { School } from "@/types";

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
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 text-lg">
              ⚠️
            </div>
            <div>
              <h3 className="font-bold text-base text-warm-charcoal">
                เปรียบเทียบครบโควตา 3 โรงเรียนแล้ว
              </h3>
              <p className="text-xs text-warm-charcoal/60 mt-0.5">
                จำกัดการเปรียบเทียบพร้อมกันสูงสุด 3 โรงเรียน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-warm-charcoal/50 hover:text-warm-charcoal hover:bg-warm-accent/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <div className="bg-white/80 rounded-xl p-3.5 border border-warm-accent/40 text-xs text-warm-charcoal/80 leading-relaxed">
          หากต้องการเพิ่ม <strong className="text-warm-bronze">"{newSchool.name}"</strong> เข้าไปเปรียบเทียบ กรุณาเลือกลบ 1 โรงเรียนที่คุณเลือกไว้ก่อนหน้านี้ออกครับ:
        </div>

        {/* List of currently compared schools */}
        <div className="flex flex-col gap-2.5">
          {currentSchools.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-warm-accent/60 hover:border-warm-bronze transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={`https://images.unsplash.com/${s.image}?w=100&h=100&fit=crop&auto=format`}
                  alt={s.name}
                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-bold text-xs text-warm-charcoal truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-warm-charcoal/60">
                    {s.curriculum} · ฿{s.tuitionStart.toLocaleString()}/ปี
                  </div>
                </div>
              </div>
              <button
                onClick={() => onReplace(s.id, newSchool.id)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                ลบอันนี้แล้วแทนที่
              </button>
            </div>
          ))}
        </div>

        {/* Cancel button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-warm-charcoal/70 hover:bg-warm-accent/50 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
