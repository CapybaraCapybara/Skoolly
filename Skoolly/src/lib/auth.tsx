import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch or create profile from Supabase profiles table
  const fetchProfile = useCallback(async (u: User): Promise<UserProfile | null> => {
    try {
      // Try to fetch existing profile
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, avatar_url, role")
        .eq("id", u.id)
        .single();

      if (data && !error) {
        return data as UserProfile;
      }

      // If profile doesn't exist, create one with default role
      const newProfile: UserProfile = {
        id: u.id,
        email: u.email || "",
        display_name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
        avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
        role: "user",
      };

      const { error: insertError } = await supabase
        .from("profiles")
        .upsert(newProfile, { onConflict: "id" });

      if (insertError) {
        console.warn("[Auth] Failed to upsert profile:", insertError.message);
      }

      return newProfile;
    } catch (err) {
      console.warn("[Auth] Profile fetch error:", err);
      // Return a basic profile from user metadata even if DB fails
      return {
        id: u.id,
        email: u.email || "",
        display_name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
        avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
        role: "user",
      };
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user).then(setProfile);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          const p = await fetchProfile(s.user);
          setProfile(p);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
    setProfile(null);
  }, []);

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAdmin,
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
