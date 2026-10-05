import { useState, useId, useMemo, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  GraduationCap,
  Loader2,
} from "lucide-react";

// ============================================================================
// 💡 URL รูปภาพพื้นหลังฝั่งขวา (สามารถเปลี่ยน URL รูปภาพตรงนี้ได้เลยตามต้องการ)
// ============================================================================
export const DEFAULT_LOGIN_IMAGE_SRC =
  "https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?q=80&w=1600&auto=format&fit=crop";

interface LoginPageProps {
  onNavigateHome: () => void;
  initialMode?: "signin" | "signup";
}

// ─── International Password Standards Checker ──────────────────────────────
interface PasswordCriteria {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

function checkPasswordStrength(password: string): PasswordCriteria {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

export function LoginPage({ onNavigateHome, initialMode = "signin" }: LoginPageProps) {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, resetPasswordForEmail, user } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Anti-Spam: Honeypot hidden input (bots fill this, humans don't)
  const [honeypot, setHoneypot] = useState("");

  // Anti-Spam: Rate limiting / Cooldown protection
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success" | "info";
    text: string;
  } | null>(null);

  // Right Panel: Configurable background image source
  const [bgImageSrc, setBgImageSrc] = useState(DEFAULT_LOGIN_IMAGE_SRC);
  const [showSrcEditor, setShowSrcEditor] = useState(false);
  const [tempSrcInput, setTempSrcInput] = useState(DEFAULT_LOGIN_IMAGE_SRC);

  // Forgot password modal/input toggle
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // If already logged in, show return prompt or redirect home
  useEffect(() => {
    if (user) {
      setStatusMessage({
        type: "success",
        text: `เข้าสู่ระบบแล้วในชื่อ ${user.email} กำลังพาคุณกลับสู่หน้าหลัก...`,
      });
      const timeout = setTimeout(() => {
        onNavigateHome();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [user, onNavigateHome]);

  const passwordCriteria = useMemo(() => checkPasswordStrength(password), [password]);
  const isPasswordValid = Object.values(passwordCriteria).every(Boolean);

  // ─── Email / Password Submit Handler ───────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // 1. Anti-Spam Check: Honeypot trap
    if (honeypot.trim() !== "") {
      console.warn("[Security] Automated submission detected via honeypot.");
      setStatusMessage({
        type: "error",
        text: "การส่งข้อมูลไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บและลองใหม่",
      });
      return;
    }

    // 2. Anti-Spam Check: Cooldown timer
    if (cooldownRemaining > 0) {
      setStatusMessage({
        type: "error",
        text: `กรุณารออีก ${cooldownRemaining} วินาทีก่อนลองใหม่อีกครั้ง`,
      });
      return;
    }

    // 3. Validation
    if (!email || !email.includes("@")) {
      setStatusMessage({ type: "error", text: "กรุณาระบุอีเมลที่ถูกต้อง" });
      return;
    }

    if (mode === "signup") {
      if (!isPasswordValid) {
        setStatusMessage({
          type: "error",
          text: "รหัสผ่านต้องเป็นไปตามมาตรฐานความปลอดภัยสากลทั้งหมด (ดูเช็คลิสต์ด้านล่าง)",
        });
        return;
      }
      if (password !== confirmPassword) {
        setStatusMessage({ type: "error", text: "รหัสผ่านยืนยันไม่ตรงกัน" });
        return;
      }
    } else {
      if (!password) {
        setStatusMessage({ type: "error", text: "กรุณากรอกรหัสผ่าน" });
        return;
      }
    }

    setSubmitting(true);

    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) {
          const nextAttempts = failedAttempts + 1;
          setFailedAttempts(nextAttempts);

          if (nextAttempts >= 5) {
            setCooldownRemaining(30);
            setStatusMessage({
              type: "error",
              text: "พยายามเข้าสู่ระบบไม่สำเร็จหลายครั้ง เพื่อความปลอดภัยกรุณารอ 30 วินาที",
            });
          } else {
            setStatusMessage({
              type: "error",
              text: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (ลองผิดได้อีก ${5 - nextAttempts} ครั้ง)`,
            });
          }
        } else {
          setFailedAttempts(0);
          setStatusMessage({ type: "success", text: "เข้าสู่ระบบสำเร็จ กำลังพาไปยังหน้าหลัก..." });
          setTimeout(() => onNavigateHome(), 800);
        }
      } else {
        // Sign Up
        const { error, needsEmailConfirmation } = await signUpWithPassword(email, password, fullName);
        if (error) {
          setStatusMessage({ type: "error", text: error });
        } else if (needsEmailConfirmation) {
          setStatusMessage({
            type: "info",
            text: "สร้างบัญชีสำเร็จ! เราได้ส่งอีเมลยืนยันไปยังกล่องจดหมายของคุณแล้ว กรุณากดยืนยันก่อนเข้าสู่ระบบ",
          });
        } else {
          setStatusMessage({
            type: "success",
            text: "สร้างบัญชีและเข้าสู่ระบบสำเร็จ กำลังพาไปยังหน้าหลัก...",
          });
          setTimeout(() => onNavigateHome(), 1000);
        }
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Google OAuth Handler ──────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setStatusMessage(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setGoogleLoading(false);
      setStatusMessage({
        type: "error",
        text:
          err?.message ||
          "ไม่สามารถเชื่อมต่อ Google OAuth ได้ กรุณาตรวจสอบการตั้งค่า Provider ใน Supabase",
      });
    }
  };

  // ─── Forgot Password Handler ───────────────────────────────────────────────
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes("@")) {
      alert("กรุณากรอกอีเมลที่ถูกต้อง");
      return;
    }
    setForgotLoading(true);
    const { error } = await resetPasswordForEmail(forgotEmail);
    setForgotLoading(false);
    if (error) {
      alert("ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้: " + error);
    } else {
      alert("ส่งลิงก์รีเซ็ตรหัสผ่านไปยัง " + forgotEmail + " เรียบร้อยแล้ว กรุณาตรวจสอบในกล่องจดหมาย");
      setShowForgotModal(false);
      setForgotEmail("");
    }
  };

  return (
    <div className="min-h-screen bg-[#0c1a33] text-gray-900 flex items-center justify-center p-3 sm:p-6 md:p-8 relative overflow-hidden select-none font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Split Card (Modeled after user's reference image) */}
      <div className="w-full max-w-[1020px] bg-white rounded-[28px] sm:rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border border-white/20 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px] lg:min-h-[620px] z-10 transition-all">

        {/* ─── LEFT PANEL: Clean White Form Card (cols 1..5) ──────────────── */}
        <div className="lg:col-span-5 p-6 sm:p-9 flex flex-col justify-between bg-white relative z-10">

          {/* Top Brand & Back to Home */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex items-center gap-2 group text-left cursor-pointer transition-transform active:scale-95"
              title="กลับหน้าหลัก Skoolly"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#14284b] to-[#0c1a33] flex items-center justify-center text-white shadow-md group-hover:shadow-lg transition-all">
                <GraduationCap className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <span className="font-bold text-lg text-[#14284b] tracking-tight block leading-tight">
                  Skoolly
                </span>
                <span className="text-[10px] text-gray-400 font-medium tracking-wider uppercase block">
                  International Schools
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#14284b] font-medium py-1 px-2.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>หน้าหลัก</span>
            </button>
          </div>

          {/* Avatar Icon Circle (As shown in reference image) */}
          <div className="my-1 text-center">
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-[#14284b]/15 bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center mx-auto text-[#14284b] shadow-sm">
              <User className="w-8 h-8 stroke-[1.6]" />
            </div>

            {/* Mode Switcher Tabs */}
            <div className="inline-flex p-1 bg-gray-100/90 rounded-full mt-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setStatusMessage(null);
                }}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  mode === "signin"
                    ? "bg-[#14284b] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setStatusMessage(null);
                }}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  mode === "signup"
                    ? "bg-[#14284b] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                สร้างบัญชี
              </button>
            </div>
          </div>

          {/* Status / Alert Message */}
          {statusMessage && (
            <div
              className={`text-xs px-3.5 py-2.5 rounded-2xl flex items-start gap-2 my-2 transition-all ${
                statusMessage.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : statusMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-blue-50 text-blue-800 border border-blue-200"
              }`}
            >
              {statusMessage.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{statusMessage.text}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 mt-1">
            {/* Honeypot hidden input for anti-bot spam */}
            <input
              type="text"
              name="company_trap"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            {/* Display Name (Only in Sign Up mode) */}
            {mode === "signup" && (
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="ชื่อ - นามสกุล หรือ ชื่อแสดงผล"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 text-xs sm:text-sm rounded-full border border-gray-300 focus:border-[#14284b] focus:ring-2 focus:ring-[#14284b]/15 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            )}

            {/* Email / Username Input */}
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="อีเมล (USERNAME / EMAIL)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 text-xs sm:text-sm rounded-full border border-gray-300 focus:border-[#14284b] focus:ring-2 focus:ring-[#14284b]/15 outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Password Input */}
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="รหัสผ่าน (PASSWORD)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-11 py-2.5 text-xs sm:text-sm rounded-full border border-gray-300 focus:border-[#14284b] focus:ring-2 focus:ring-[#14284b]/15 outline-none transition-all placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Confirm Password (Only in Sign Up mode) */}
            {mode === "signup" && (
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-11 pr-11 py-2.5 text-xs sm:text-sm rounded-full border outline-none transition-all placeholder:text-gray-400 ${
                    confirmPassword && confirmPassword !== password
                      ? "border-red-300 focus:ring-2 focus:ring-red-200"
                      : "border-gray-300 focus:border-[#14284b] focus:ring-2 focus:ring-[#14284b]/15"
                  }`}
                />
              </div>
            )}

            {/* International Password Standard Validation Checklist (Shown in Sign Up mode) */}
            {mode === "signup" && password.length > 0 && (
              <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-2xl text-[11px] text-gray-600 space-y-1.5 animate-in fade-in duration-200">
                <div className="font-semibold text-gray-700 flex items-center gap-1.5 mb-1 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#14284b]" />
                  <span>มาตรฐานความปลอดภัยสากลของรหัสผ่าน:</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCriteria.length ? "text-emerald-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {passwordCriteria.length ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1" />
                    )}
                    <span>อย่างน้อย 8 ตัวอักษร</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCriteria.uppercase ? "text-emerald-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {passwordCriteria.uppercase ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1" />
                    )}
                    <span>ตัวพิมพ์ใหญ่ (A-Z)</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCriteria.lowercase ? "text-emerald-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {passwordCriteria.lowercase ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1" />
                    )}
                    <span>ตัวพิมพ์เล็ก (a-z)</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCriteria.number ? "text-emerald-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {passwordCriteria.number ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1" />
                    )}
                    <span>ตัวเลข (0-9)</span>
                  </div>

                  <div
                    className={`col-span-2 flex items-center gap-1.5 ${
                      passwordCriteria.special ? "text-emerald-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {passwordCriteria.special ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-1 mr-1" />
                    )}
                    <span>อักขระพิเศษ (!@#$%^&*...)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Remember Me & Forgot Password (As in reference image) */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5 px-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-[#14284b] focus:ring-[#14284b]/20 cursor-pointer"
                />
                <span>Remember me</span>
              </label>

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-gray-500 hover:text-[#14284b] hover:underline cursor-pointer"
                >
                  Forgot your password?
                </button>
              )}
            </div>

            {/* Submit Button (Pill button styled as in reference image) */}
            <button
              type="submit"
              disabled={submitting || cooldownRemaining > 0}
              className="w-full py-2.5 sm:py-3 rounded-full bg-[#14284b] hover:bg-[#0c1a33] text-white font-bold tracking-wider text-xs sm:text-sm uppercase transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังดำเนินการ...</span>
                </>
              ) : cooldownRemaining > 0 ? (
                <span>กรุณารอ {cooldownRemaining} วินาที</span>
              ) : mode === "signin" ? (
                "LOGIN"
              ) : (
                "SIGN UP"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-3 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-white px-3 text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              หรือเข้าสู่ระบบด้วย
            </span>
          </div>

          {/* Google OAuth Provider Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full py-2.5 px-4 rounded-full border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm active:scale-[0.99] cursor-pointer disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#14284b]" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Three Dots Pagination Indicator (As shown in reference image bottom) */}
          <div className="flex items-center justify-center gap-1.5 pt-3">
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                mode === "signin" ? "bg-[#14284b] w-4" : "bg-gray-300"
              }`}
            />
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                mode === "signup" ? "bg-[#14284b] w-4" : "bg-gray-300"
              }`}
            />
            <span className="w-2 h-2 rounded-full bg-gray-200" />
          </div>
        </div>

        {/* ─── RIGHT PANEL: Hero Artwork & Welcome (cols 6..12) ─────────────── */}
        <div
          className="lg:col-span-7 relative min-h-[340px] lg:min-h-full flex flex-col justify-between p-7 sm:p-12 text-white bg-cover bg-center overflow-hidden transition-all duration-700"
          style={{ backgroundImage: `url("${bgImageSrc}")` }}
        >
          {/* Deep Navy Gradient Overlay for high readability & elegant mood */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1a33]/95 via-[#0c1a33]/65 to-[#0c1a33]/40" />

          {/* Top Bar with Configurable Image Source indicator */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-[11px] text-white/90">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Skoolly Platform</span>
            </div>

            {/* Image Source Slot / Config Badge (Requested in ข้อที่ 3) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSrcEditor(!showSrcEditor)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-[11px] text-white transition-all cursor-pointer shadow-sm hover:scale-105"
                title="คลิกเพื่อดูหรือเปลี่ยน URL รูปภาพพื้นหลังฝั่งขวา"
              >
                <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                <span className="font-medium">Image Source</span>
              </button>

              {/* Popover to view and replace Image URL */}
              {showSrcEditor && (
                <div className="absolute right-0 top-9 w-72 sm:w-80 p-3.5 bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl text-xs text-gray-200 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between font-semibold mb-2 text-white">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-300" />
                      ตั้งค่า URL รูปภาพพื้นหลัง
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSrcEditor(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-300 mb-2">
                    วาง URL รูปภาพจากเน็ตที่คุณต้องการได้เลย หรือแก้ที่ตัวแปร{" "}
                    <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">
                      DEFAULT_LOGIN_IMAGE_SRC
                    </code>{" "}
                    ในโค้ด:
                  </p>
                  <input
                    type="url"
                    placeholder="https://example.com/photo.jpg"
                    value={tempSrcInput}
                    onChange={(e) => setTempSrcInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/20 text-white text-xs outline-none focus:border-amber-300 mb-2.5 font-mono"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBgImageSrc(DEFAULT_LOGIN_IMAGE_SRC);
                        setTempSrcInput(DEFAULT_LOGIN_IMAGE_SRC);
                        setShowSrcEditor(false);
                      }}
                      className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                    >
                      รีเซ็ตเป็นรูปเดิม
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (tempSrcInput.trim()) {
                          setBgImageSrc(tempSrcInput.trim());
                          setShowSrcEditor(false);
                        }
                      }}
                      className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-[#0c1a33] font-bold rounded-lg text-xs cursor-pointer shadow"
                    >
                      ใช้งานรูปนี้
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center / Bottom: Welcome Headline & Subtitle */}
          <div className="relative z-10 max-w-lg my-auto pt-8 pb-4">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-3 leading-tight"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              Welcome.
            </h1>

            <p className="text-sm sm:text-base text-gray-200/90 leading-relaxed font-light mb-6 max-w-md">
              ยินดีต้อนรับสู่ <span className="font-semibold text-white">Skoolly</span>{" "}
              แพลตฟอร์มค้นหา เปรียบเทียบ และวิเคราะห์ข้อมูลโรงเรียนนานาชาติในประเทศไทย ที่ครบถ้วนและแม่นยำที่สุด
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white/90">
                ✦ 200+ โรงเรียนนานาชาติ
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white/90">
                ✦ ข้อมูลจริงจาก OPEC & ISAT
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white/90">
                ✦ AI เปรียบเทียบค่าเทอม
              </span>
            </div>
          </div>

          {/* Bottom Bar: Switch Mode & Source Attribution */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 border-t border-white/15 text-xs text-white/80">
            <div>
              {mode === "signin" ? (
                <span>
                  ยังไม่มีบัญชีใช่หรือไม่?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setStatusMessage(null);
                    }}
                    className="font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    สมัครสมาชิกที่นี่
                  </button>
                </span>
              ) : (
                <span>
                  มีบัญชีอยู่แล้ว?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setStatusMessage(null);
                    }}
                    className="font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    เข้าสู่ระบบที่นี่
                  </button>
                </span>
              )}
            </div>

            {/* Current Active Image Source indicator text */}
            <div className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]" title={bgImageSrc}>
              src: {bgImageSrc.slice(0, 32)}...
            </div>
          </div>
        </div>

      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#14284b] mb-1">ลืมรหัสผ่าน</h3>
            <p className="text-xs text-gray-500 mb-4">
              กรอกอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งค่ารหัสผ่านใหม่
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="กรอกอีเมลของคุณ"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 text-sm rounded-full border border-gray-300 focus:border-[#14284b] focus:ring-2 focus:ring-[#14284b]/15 outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-5 py-2 rounded-full text-xs font-semibold bg-[#14284b] hover:bg-[#0c1a33] text-white shadow cursor-pointer disabled:opacity-50"
                >
                  {forgotLoading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
