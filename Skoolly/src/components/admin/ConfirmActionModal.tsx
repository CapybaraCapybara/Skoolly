import { useEffect } from "react";
import { AlertTriangle, Trash2, Database, HelpCircle, X, Loader2 } from "lucide-react";

interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  iconType?: "trash" | "warning" | "database" | "help";
  isLoading?: boolean;
}

export function ConfirmActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "danger",
  iconType = "warning",
  isLoading = false,
}: ConfirmActionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    if (variant === "danger" || iconType === "trash") {
      return (
        <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
          <Trash2 className="w-6 h-6" />
        </div>
      );
    }
    if (variant === "warning" || iconType === "warning") {
      return (
        <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
      );
    }
    if (iconType === "database") {
      return (
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
          <Database className="w-6 h-6" />
        </div>
      );
    }
    return (
      <div className="w-12 h-12 rounded-2xl bg-[#faf5ee] border border-[#eae0d0] text-[#ab8e72] flex items-center justify-center shrink-0">
        <HelpCircle className="w-6 h-6" />
      </div>
    );
  };

  const getConfirmButtonClasses = () => {
    if (variant === "danger") {
      return "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200/50 shadow-md focus:ring-rose-500";
    }
    if (variant === "warning") {
      return "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200/50 shadow-md focus:ring-amber-500";
    }
    return "bg-[#0f9488] hover:bg-[#0d7d72] text-white shadow-teal-200/50 shadow-md focus:ring-teal-500";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-white border border-[#eae0d0] rounded-3xl p-6 shadow-2xl transition-all scale-100">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-xl text-[#1c1917]/40 hover:text-[#1c1917] hover:bg-[#faf8f5] transition-colors disabled:opacity-40"
          title="ปิด (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          {renderIcon()}

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#1c1917] leading-snug">
              {title}
            </h3>
            <p className="text-xs text-[#1c1917]/70 mt-1.5 leading-relaxed whitespace-pre-line">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-[#eae0d0] bg-[#faf5ee] hover:bg-[#eae0d0]/50 text-[#1c1917] text-xs font-semibold transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 ${getConfirmButtonClasses()}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
