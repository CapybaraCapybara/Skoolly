import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string, fullName?: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      console.error("[Auth] Google sign-in error:", error.message);
      throw error;
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to sign in. Please try again." };
    }
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string, fullName?: string) => {
    try {
      const trimmedEmail = email.trim();
      const displayName = fullName?.trim() || trimmedEmail.split("@")[0] || "User";
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: displayName,
          },
        },
      });
      if (error) {
        return { error: error.message };
      }
      const needsEmailConfirmation = !data.session && !!data.user;
      return { error: null, needsEmailConfirmation };
    } catch (err: any) {
      return { error: err?.message || "Failed to create account. Please try again." };
    }
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname + "#login",
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to send password reset email." };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        resetPasswordForEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
