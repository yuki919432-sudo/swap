/**
 * Supabase auth state for the app. When a real backend is configured
 * (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY), this holds the authenticated session and
 * exposes sign-in/out. When not configured, it is inert (the app runs in demo
 * mode) — so demo builds never construct a Supabase client.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "../../config/env";
import { getSupabaseClient } from "./client";

interface AuthContextValue {
  configured: boolean;
  client: SupabaseClient | null;
  session: Session | null;
  ready: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const client = useMemo(() => (configured ? getSupabaseClient() : null), [configured]);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!client) {
      setReady(true);
      return;
    }
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      client,
      session,
      ready,
      signInWithPassword: async (email, password) => {
        if (!client) return { error: "backend_not_configured" };
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await client?.auth.signOut();
      },
    }),
    [configured, client, session, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
