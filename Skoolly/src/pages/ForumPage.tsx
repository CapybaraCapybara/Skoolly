// The forum is not open yet: posting is closed in the database (2026-11-04_close_forum_writes.sql),
// so the menu leads here instead of an empty board.
export function ForumPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div
        style={{ background: "linear-gradient(160deg,#0c1a33 0%,#233a5e 60%,#36578b 100%)" }}
        className="pt-10 pb-14 px-4"
      >
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">ชุมชนผู้ปกครอง</h1>
          <p className="text-slate-300 text-sm max-w-lg mx-auto">
            คำถามและประสบการณ์เรื่องโรงเรียนจากผู้ปกครองคนอื่น
          </p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="font-bold text-navy-900 text-base mb-1">ยังไม่เปิดให้ใช้งาน</h2>
        <p className="text-sm text-slate-500">ส่วนนี้จะเปิดในเวอร์ชันถัดไป</p>
      </div>
    </div>
  );
}
