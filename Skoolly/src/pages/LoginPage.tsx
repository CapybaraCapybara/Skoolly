import { useState, useMemo, useEffect, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Eye, EyeOff, Loader2, X } from "lucide-react";

// Same classroom photo as the home page hero
const LOGIN_IMAGE_SRC =
  "https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?q=80&w=1200&auto=format&fit=crop";

type Mode = "signin" | "signup";
type Status = { type: "error" | "success" | "info"; text: string } | null;

interface LoginPageProps {
  onNavigateHome: () => void;
  initialMode?: Mode;
}

const PASSWORD_RULES = [
  { key: "length", label: "8 ตัวขึ้นไป", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "ตัวพิมพ์ใหญ่", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "ตัวพิมพ์เล็ก", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "ตัวเลข", test: (p: string) => /[0-9]/.test(p) },
  { key: "special", label: "อักขระพิเศษ", test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

const inputClass =
  "w-full rounded-xl border border-warm-accent bg-white/70 px-4 py-2.5 text-sm text-warm-charcoal placeholder:text-warm-charcoal/35 outline-none transition focus:border-warm-bronze focus:ring-2 focus:ring-warm-bronze/25";

function Field({ label, htmlFor, aside, children }: { label: string; htmlFor: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-warm-charcoal">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function StatusBox({ status }: { status: NonNullable<Status> }) {
  return (
    <div
      role={status.type === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm",
        status.type === "error" && "border-rose-200 bg-rose-50 text-rose-800",
        status.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        status.type === "info" && "border-warm-accent bg-warm-card text-warm-charcoal"
      )}
    >
      {status.type === "error" ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="leading-relaxed">{status.text}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

export function LoginPage({ onNavigateHome, initialMode = "signin" }: LoginPageProps) {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, resetPasswordForEmail, user } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Anti-spam: bots fill this hidden field, people never see it
  const [honeypot, setHoneypot] = useState("");
  // Anti-spam: cool-down after repeated failed sign-ins
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<Status>(null);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash === "signup") setMode("signup");
      else if (hash === "login" || hash === "signin") setMode("signin");
      setStatus(null);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => setCooldownRemaining((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Already signed in: say so and go back home
  useEffect(() => {
    if (!user) return;
    setStatus({ type: "success", text: `เข้าสู่ระบบแล้วในชื่อ ${user.email} กำลังกลับหน้าหลัก…` });
    const timeout = setTimeout(onNavigateHome, 1500);
    return () => clearTimeout(timeout);
  }, [user, onNavigateHome]);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(password) })),
    [password]
  );
  const isPasswordValid = passwordChecks.every((c) => c.ok);
  const passedCount = passwordChecks.filter((c) => c.ok).length;
  const missingRules = passwordChecks.filter((c) => !c.ok).map((c) => c.label);

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus(null);
    // Keep the address bar in step without triggering the app's hash navigation
    window.history.replaceState(null, "", next === "signup" ? "#signup" : "#login");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (honeypot.trim() !== "") {
      setStatus({ type: "error", text: "ส่งข้อมูลไม่สำเร็จ รีเฟรชหน้าแล้วลองใหม่" });
      return;
    }
    if (cooldownRemaining > 0) {
      setStatus({ type: "error", text: `รออีก ${cooldownRemaining} วินาทีแล้วลองใหม่` });
      return;
    }
    if (!email || !email.includes("@")) {
      setStatus({ type: "error", text: "กรอกอีเมลให้ถูกต้อง" });
      return;
    }
    if (mode === "signup") {
      if (!isPasswordValid) {
        setStatus({ type: "error", text: "รหัสผ่านยังไม่ครบตามเงื่อนไข" });
        return;
      }
      if (password !== confirmPassword) {
        setStatus({ type: "error", text: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" });
        return;
      }
    } else if (!password) {
      setStatus({ type: "error", text: "กรอกรหัสผ่าน" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) {
          const attempts = failedAttempts + 1;
          setFailedAttempts(attempts);
          if (attempts >= 5) {
            setCooldownRemaining(30);
            setStatus({ type: "error", text: "ลองผิดหลายครั้งเกินไป รอ 30 วินาทีแล้วลองใหม่" });
          } else {
            setStatus({ type: "error", text: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (ลองได้อีก ${5 - attempts} ครั้ง)` });
          }
        } else {
          setFailedAttempts(0);
          setStatus({ type: "success", text: "เข้าสู่ระบบแล้ว กำลังกลับหน้าหลัก…" });
          setTimeout(onNavigateHome, 800);
        }
      } else {
        const { error, needsEmailConfirmation } = await signUpWithPassword(email, password, fullName);
        if (error) {
          setStatus({ type: "error", text: error });
        } else if (needsEmailConfirmation) {
          setStatus({ type: "info", text: "สร้างบัญชีแล้ว เปิดอีเมลแล้วกดลิงก์ยืนยันก่อนเข้าสู่ระบบ" });
        } else {
          setStatus({ type: "success", text: "สร้างบัญชีแล้ว กำลังกลับหน้าหลัก…" });
          setTimeout(onNavigateHome, 1000);
        }
      }
    } catch (err: any) {
      setStatus({ type: "error", text: err?.message || "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setStatus(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setGoogleLoading(false);
      setStatus({ type: "error", text: err?.message || "เชื่อมต่อ Google ไม่สำเร็จ" });
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes("@")) {
      setForgotStatus({ type: "error", text: "กรอกอีเมลให้ถูกต้อง" });
      return;
    }
    setForgotLoading(true);
    setForgotStatus(null);
    const { error } = await resetPasswordForEmail(forgotEmail);
    setForgotLoading(false);
    if (error) {
      setForgotStatus({ type: "error", text: `ส่งลิงก์ไม่สำเร็จ: ${error}` });
      return;
    }
    setForgotStatus({ type: "success", text: `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${forgotEmail} แล้ว` });
    setTimeout(() => {
      setForgotOpen(false);
      setForgotEmail("");
      setForgotStatus(null);
    }, 2000);
  };

  const isSignup = mode === "signup";

  return (
    <div className="min-h-[calc(100dvh-6rem)] bg-warm-bg px-4 py-8 text-warm-charcoal sm:px-6 sm:py-10">
      {/* Same card height in both modes (fits the sign-up form). The form is top-aligned and the
          switch link is pinned to the bottom, so nothing moves when switching modes */}
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-warm-accent bg-warm-cream shadow-sm lg:min-h-[728px] lg:grid-cols-2">
        {/* Form */}
        <section className="flex flex-col p-6 sm:p-10">
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
            <h1 className="text-3xl font-bold tracking-tight">{isSignup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</h1>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-warm-accent bg-white py-3 text-sm font-medium text-warm-charcoal transition-colors hover:border-warm-bronze disabled:opacity-60 cursor-pointer"
            >
              {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              ดำเนินการต่อด้วย Google
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-warm-charcoal/45">
              <span className="h-px flex-1 bg-warm-accent" />
              หรือใช้อีเมล
              <span className="h-px flex-1 bg-warm-accent" />
            </div>

            <form onSubmit={handleSubmit} className="mb-6 space-y-4">
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

              {isSignup && (
                <Field label="ชื่อที่แสดง" htmlFor="auth-name">
                  <input
                    id="auth-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}

              <Field label="อีเมล" htmlFor="auth-email">
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field
                label="รหัสผ่าน"
                htmlFor="auth-password"
                aside={
                  !isSignup && (
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotStatus(null);
                        setForgotOpen(true);
                      }}
                      className="text-xs font-medium text-warm-bronze hover:underline cursor-pointer"
                    >
                      ลืมรหัสผ่าน?
                    </button>
                  )
                }
              >
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(inputClass, "pr-11")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-warm-charcoal/40 hover:text-warm-charcoal cursor-pointer"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {isSignup && (
                  <div className="mt-2.5" aria-live="polite">
                    <div className="flex gap-1" aria-hidden="true">
                      {passwordChecks.map((c, i) => (
                        <span
                          key={c.key}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            i < passedCount ? "bg-warm-bronze" : "bg-warm-accent"
                          )}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-warm-charcoal/55">
                      {isPasswordValid ? (
                        <>
                          <Check className="size-3.5 text-warm-bronze" />
                          ครบตามเงื่อนไขแล้ว
                        </>
                      ) : (
                        `ต้องมี ${missingRules.join(" · ")}`
                      )}
                    </p>
                  </div>
                )}
              </Field>

              {isSignup && (
                <>
                  <Field label="ยืนยันรหัสผ่าน" htmlFor="auth-confirm">
                    <input
                      id="auth-confirm"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={cn(
                        inputClass,
                        confirmPassword && confirmPassword !== password && "border-rose-300 focus:border-rose-400 focus:ring-rose-200"
                      )}
                    />
                  </Field>
                </>
              )}

              {status && <StatusBox status={status} />}

              <button
                type="submit"
                disabled={submitting || cooldownRemaining > 0}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-warm-charcoal py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-warm-charcoal/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    กำลังดำเนินการ…
                  </>
                ) : cooldownRemaining > 0 ? (
                  `รอ ${cooldownRemaining} วินาที`
                ) : isSignup ? (
                  "สร้างบัญชี"
                ) : (
                  "เข้าสู่ระบบ"
                )}
              </button>
            </form>

            <p className="mt-auto border-t border-warm-accent pt-5 text-center text-sm text-warm-charcoal/60">
              {isSignup ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"}{" "}
              <button
                type="button"
                onClick={() => switchMode(isSignup ? "signin" : "signup")}
                className="font-semibold text-warm-bronze hover:underline cursor-pointer"
              >
                {isSignup ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
              </button>
            </p>
          </div>
        </section>

        {/* Framed photo, same treatment as the home page hero */}
        <div className="relative m-3 hidden overflow-hidden rounded-[1.5rem] lg:block">
          <img src={LOGIN_IMAGE_SRC} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-warm-charcoal/90 via-warm-charcoal/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-8 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-warm-bronze">Skoolly</p>
            <p className="mt-2 text-2xl font-bold leading-snug">
              ค่าเทอม หลักสูตร และที่ตั้ง
              <br />
              ของโรงเรียนนานาชาติในไทย
            </p>
            <p className="mt-2 text-sm text-white/70">ข้อมูลโรงเรียนจาก สช. และ ISAT</p>
          </div>
        </div>
      </div>

      {/* Forgot password */}
      {forgotOpen && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-warm-charcoal/60 p-4 backdrop-blur-sm"
          onClick={() => setForgotOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            className="modal-content w-full max-w-md rounded-[2rem] border border-warm-accent bg-warm-cream p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="forgot-title" className="text-lg font-bold">
                  ลืมรหัสผ่าน
                </h2>
                <p className="mt-1 text-sm text-warm-charcoal/60">เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลนี้</p>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-warm-charcoal/50 hover:bg-warm-accent/50 hover:text-warm-charcoal cursor-pointer"
                aria-label="ปิด"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleForgot} className="mt-5 space-y-4">
              <Field label="อีเมล" htmlFor="forgot-email">
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>
              {forgotStatus && <StatusBox status={forgotStatus} />}
              <button
                type="submit"
                disabled={forgotLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-warm-charcoal py-3 text-sm font-semibold text-white transition-colors hover:bg-warm-charcoal/90 disabled:opacity-50 cursor-pointer"
              >
                {forgotLoading && <Loader2 className="size-4 animate-spin" />}
                ส่งลิงก์
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
