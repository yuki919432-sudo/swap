/**
 * Dependency-injects the repository set into the React tree and selects the data
 * source. This is the ONLY place the data source is chosen, so the "no silent mock
 * fallback" rule lives here:
 *
 *   - demo builds  → Mock repositories (synthetic data), or the real backend once a
 *     dev is signed in.
 *   - pilot builds → ALWAYS the real Supabase repositories. If the backend is not
 *     configured, the app renders a clear "backend not configured" screen instead of
 *     falling back to demo data — a real build never quietly serves synthetic
 *     listings to students.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { asyncStorageKeyValueStore } from "../asyncStorage";
import { useAuth } from "../supabase/AuthProvider";
import { getAppMode, resolveDataSource } from "../../config/appMode";
import { supabaseEnvStatus } from "../../config/env";
import { MissingBackendScreen } from "../../components/MissingBackendScreen";
import { createMockRepositories } from "./mock";
import { createSupabaseRepositories } from "./supabase";
import type { Repositories } from "./types";

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children, value }: { children: ReactNode; value?: Repositories }) {
  const { configured, client, session } = useAuth();
  const appMode = getAppMode();
  const dataSource = resolveDataSource({ appMode, backendConfigured: configured, hasSession: !!session });

  const repos = useMemo(() => {
    if (value) return value;
    if (dataSource === "supabase" && client) return createSupabaseRepositories(client, asyncStorageKeyValueStore);
    if (dataSource === "mock") return createMockRepositories(asyncStorageKeyValueStore);
    return null; // unconfigured pilot → no repositories (fail loudly below)
  }, [value, dataSource, client]);

  // Pilot build with no valid backend: fail loudly, never fall back to demo data.
  if (!value && repos === null) return <MissingBackendScreen reason={supabaseEnvStatus().error} />;

  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

/** True when the app is talking to the real Supabase backend (vs demo mocks). */
export function useIsRealBackend(): boolean {
  const { configured, session } = useAuth();
  return resolveDataSource({ appMode: getAppMode(), backendConfigured: configured, hasSession: !!session }) === "supabase";
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) throw new Error("useRepositories must be used within a RepositoryProvider");
  return ctx;
}
