import React from "react";
import { School } from "@/types";
import { MAX_COMPARE } from "@/constants";

interface CompareModalProps {
  compareIds: number[];
  schools: School[];
  onClose: () => void;
  onRemove: (id: number) => void;
  onSchoolClick: (id: number) => void;
  onOpenCalculator: (schoolId: number) => void;
  onSaveComparison?: () => void;
}

export function CompareModal({
  compareIds,
  schools,
  onClose,
  onRemove,
  onSchoolClick,
  onOpenCalculator,
  onSaveComparison,
}: CompareModalProps) {
  const selectedSchools = schools.filter((s) => compareIds.includes(s.id));

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 bg-warm-charcoal/60"
      style={{ backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-warm-cream rounded-[2rem] border border-warm-accent shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-warm-accent/40 bg-white/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-bronze text-white text-xs font-bold">
                ⚖️
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-warm-charcoal">
                เปรียบเทียบโรงเรียนนานาชาติ
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-warm-accent text-warm-charcoal">
                {selectedSchools.length} / {MAX_COMPARE} แห่ง (Guest Mode)
              </span>
            </div>
            <p className="text-xs text-warm-charcoal/60 mt-1">
              เปรียบเทียบข้อมูลหลักแบบเคียงข้างกันเพื่อช่วยให้คุณตัดสินใจได้ง่ายขึ้น
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-warm-charcoal/60 hover:text-warm-charcoal hover:bg-warm-accent/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Comparison Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-6">
          {selectedSchools.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-warm-charcoal/60">ไม่มีโรงเรียนที่เลือกเปรียบเทียบ</p>
            </div>
          ) : (
            <div className="min-w-[640px]">
              <div
                className="grid gap-4 items-start"
                style={{
                  gridTemplateColumns: `180px repeat(${selectedSchools.length}, minmax(200px, 1fr))`,
                }}
              >
                {/* School Cards / Images Header */}
                <div className="pt-2 font-bold text-xs uppercase tracking-wider text-warm-charcoal/50">
                  โรงเรียนที่เลือก
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={s.id}
                    className="relative bg-white rounded-2xl p-3 border border-warm-accent/60 shadow-xs flex flex-col gap-2"
                  >
                    <button
                      onClick={() => onRemove(s.id)}
                      className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 text-white hover:bg-rose-600 flex items-center justify-center text-xs transition-colors"
                      title="นำโรงเรียนนี้ออก"
                    >
                      ✕
                    </button>
                    <div className="relative h-28 rounded-xl overflow-hidden bg-warm-accent/40">
                      <img
                        src={`https://images.unsplash.com/${s.image}?w=400&h=200&fit=crop&auto=format`}
                        alt={s.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3
                        onClick={() => {
                          onClose();
                          onSchoolClick(s.id);
                        }}
                        className="font-bold text-sm text-warm-charcoal hover:text-warm-bronze cursor-pointer line-clamp-2"
                      >
                        {s.name}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-xs text-amber-500 font-semibold">
                        ★ {s.rating} <span className="text-warm-charcoal/50">({s.reviewCount} รีวิว)</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-2">
                      <button
                        onClick={() => {
                          onClose();
                          onSchoolClick(s.id);
                        }}
                        className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold bg-warm-accent/60 text-warm-charcoal hover:bg-warm-accent transition-colors"
                      >
                        ดูรายละเอียด
                      </button>
                      <button
                        onClick={() => {
                          onClose();
                          onOpenCalculator(s.id);
                        }}
                        className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold text-white bg-warm-bronze hover:opacity-90 transition-opacity"
                      >
                        คำนวณค่าเทอม
                      </button>
                    </div>
                  </div>
                ))}

                {/* Row: หลักสูตร (Curriculum) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  หลักสูตร (Curriculum)
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`curriculum-${s.id}`}
                    className="py-3 border-t border-warm-accent/40 text-sm font-medium text-warm-charcoal"
                  >
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warm-accent/50 text-warm-charcoal">
                      {s.curriculum}
                    </span>
                  </div>
                ))}

                {/* Row: ค่าเทอมเริ่มต้น (Tuition) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  ค่าเทอมเริ่มต้น / ปี
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`tuition-${s.id}`}
                    className="py-3 border-t border-warm-accent/40"
                  >
                    <span className="text-base font-bold text-warm-bronze">
                      ฿{s.tuitionStart.toLocaleString()}
                    </span>
                    <span className="text-xs text-warm-charcoal/60 ml-1">/ ปี</span>
                  </div>
                ))}

                {/* Row: ช่วงชั้น (Grades) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  ระดับชั้นที่เปิดสอน
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`grades-${s.id}`}
                    className="py-3 border-t border-warm-accent/40 text-xs text-warm-charcoal/80"
                  >
                    {s.grades || "Nursery – Year 13"}
                  </div>
                ))}

                {/* Row: ทำเลที่ตั้ง (Location) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  ทำเลที่ตั้ง
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`loc-${s.id}`}
                    className="py-3 border-t border-warm-accent/40 text-xs text-warm-charcoal/80 flex items-center gap-1"
                  >
                    <span>📍 {s.location}</span>
                  </div>
                ))}

                {/* Row: ระยะทาง (Distance) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  ระยะทางโดยประมาณ
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`dist-${s.id}`}
                    className="py-3 border-t border-warm-accent/40 text-xs text-warm-charcoal/80"
                  >
                    {s.distance} กม. จากสุขุมวิท
                  </div>
                ))}

                {/* Row: ภาษาที่ใช้สอน (Language) */}
                <div className="py-3 font-semibold text-xs text-warm-charcoal/70 border-t border-warm-accent/40 flex items-center">
                  ภาษาที่ใช้สอน
                </div>
                {selectedSchools.map((s) => (
                  <div
                    key={`lang-${s.id}`}
                    className="py-3 border-t border-warm-accent/40 text-xs text-warm-charcoal/80"
                  >
                    {s.language}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-warm-accent/40 bg-white/60">
          <div className="flex items-center gap-2 text-xs text-warm-charcoal/70">
            <span>💡 ข้อมูลเปรียบเทียบนี้แสดงชั่วคราวสำหรับ Guest</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onSaveComparison && (
              <button
                onClick={onSaveComparison}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold border border-warm-bronze text-warm-bronze hover:bg-warm-bronze/10 transition-colors"
              >
                บันทึกชุดเปรียบเทียบนี้
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-bold bg-warm-charcoal text-white hover:bg-warm-charcoal/90 transition-colors"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
