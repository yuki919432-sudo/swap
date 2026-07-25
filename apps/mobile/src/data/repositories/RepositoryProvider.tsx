/**
 * Dependency-injects the repository set into the React tree. The demo build wires
 * the Mock repositories over AsyncStorage; swapping to Supabase later means
 * changing only this file (and providing Supabase-backed implementations of the
 * same interfaces) — no screen changes.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { asyncStorageKeyValueStore } from "../asyncStorage";
import { createMockRepositories } from "./mock";
import type { Repositories } from "./types";

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children, value }: { children: ReactNode; value?: Repositories }) {
  const repos = useMemo(() => value ?? createMockRepositories(asyncStorageKeyValueStore), [value]);
  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) throw new Error("useRepositories must be used within a RepositoryProvider");
  return ctx;
}
