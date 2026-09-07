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
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,22,40,0.7)" }}
      onClick={onClose}
    >
      <div
        className="modal-content bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-teal-50 mx-auto mb-4">
          <svg className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h3 className="font-display text-2xl text-center text-navy-900 mb-2">Sign in to continue</h3>
        <p className="text-sm text-slate-500 text-center mb-6">{reason}</p>
        <div className="space-y-3">
          <button className="w-full py-3 rounded-xl font-semibold text-white text-sm" style={{ background: "linear-gradient(135deg,#0f9488,#0d7d72)" }}>
            Create a free account
          </button>
          <button className="w-full py-3 rounded-xl font-semibold text-navy-800 text-sm border border-slate-200 hover:bg-slate-50 transition-colors">
            Sign in to existing account
          </button>
        </div>
        <button onClick={onClose} className="mt-5 text-xs text-slate-400 hover:text-slate-600 transition-colors w-full text-center">
          Continue browsing as guest
        </button>
      </div>
    </div>
  );
}
