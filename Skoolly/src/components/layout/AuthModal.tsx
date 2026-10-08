import { useEffect } from "react";

interface AuthModalProps {
  reason: string;
  onClose: () => void;
}

export function AuthModal({ reason, onClose }: AuthModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-warm-charcoal/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="modal-content bg-warm-cream border border-warm-accent rounded-[2rem] p-8 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-warm-card mx-auto mb-4">
          <svg className="w-7 h-7 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-center text-warm-charcoal mb-2">เข้าสู่ระบบก่อนใช้งาน</h3>
        <p className="text-sm text-warm-charcoal/60 text-center mb-6">{reason}</p>
        <div className="space-y-3">
          <button
            onClick={() => {
              onClose();
              window.location.hash = "signup";
            }}
            className="w-full py-3 rounded-full font-semibold text-white text-sm bg-warm-charcoal hover:bg-warm-charcoal/90 transition-colors cursor-pointer"
          >
            สร้างบัญชี
          </button>
          <button
            onClick={() => {
              onClose();
              window.location.hash = "login";
            }}
            className="w-full py-3 rounded-full font-semibold text-warm-charcoal text-sm border border-warm-accent hover:bg-warm-accent/40 transition-colors cursor-pointer"
          >
            เข้าสู่ระบบ
          </button>
        </div>
        <button onClick={onClose} className="mt-5 text-xs text-warm-charcoal/50 hover:text-warm-charcoal transition-colors w-full text-center cursor-pointer">
          ไว้ทีหลัง
        </button>
      </div>
    </div>
  );
}
