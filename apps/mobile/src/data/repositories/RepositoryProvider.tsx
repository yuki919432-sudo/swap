/**
 * Dependency-injects the repository set into the React tree and selects the data
 * source: the real Supabase-backed repositories when a backend is configured AND
 * the user is authenticated, otherwise the demo Mock repositories. Screens depend
 * only on the interfaces, so this is the ONLY place the data source is chosen.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { asyncStorageKeyValueStore } from "../asyncStorage";
import { useAuth } from "../supabase/AuthProvider";
import { createMockRepositories } from "./mock";
import { createSupabaseRepositories } from "./supabase";
import type { Repositories } from "./types";

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children, value }: { children: ReactNode; value?: Repositories }) {
  const { configured, client, session } = useAuth();
  const repos = useMemo(() => {
    if (value) return value;
    if (configured && client && session) return createSupabaseRepositories(client, asyncStorageKeyValueStore);
    return createMockRepositories(asyncStorageKeyValueStore);
  }, [value, configured, client, session]);
  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

/** True when the app is talking to the real Supabase backend (vs demo mocks). */
export function useIsRealBackend(): boolean {
  const { configured, session } = useAuth();
  return configured && !!session;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) throw new Error("useRepositories must be used within a RepositoryProvider");
  return ctx;
}
