/**
 * Holds the current demo session (selected school + profile) and exposes actions
 * to select/switch/clear it. Backed by the SessionRepository, so it persists the
 * chosen profile locally and restores it on next launch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRepositories } from "../data/repositories";
import type { SessionState } from "../data/repositories/types";

interface SessionContextValue {
  session: SessionState | null;
  loading: boolean;
  selectProfile: (profileId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const repos = useRepositories();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = await repos.session.getCurrent();
    setSession(current);
  }, [repos]);

  useEffect(() => {
    let active = true;
    (async () => {
      const current = await repos.session.getCurrent();
      if (active) {
        setSession(current);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [repos]);

  const selectProfile = useCallback(
    async (profileId: string) => {
      const next = await repos.session.select(profileId);
      setSession(next);
    },
    [repos],
  );

  const clear = useCallback(async () => {
    await repos.session.clear();
    setSession(null);
  }, [repos]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, loading, selectProfile, clear, refresh }),
    [session, loading, selectProfile, clear, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
