/**
 * App mode — the single switch that decides whether this build may use synthetic
 * demo data at all.
 *
 *   demo  : development / showcase builds. May use the Mock repositories (synthetic
 *           data + a local demo session), or the real backend once a dev signs in.
 *   pilot : real pilot / release builds. NEVER uses mock data. If the backend is
 *           not configured, the app fails loudly (a clear missing-environment
 *           screen) instead of silently falling back to demo data.
 *
 * The pilot rule exists so a misconfigured release can never quietly serve fake
 * listings to real students. `resolveDataSource` is a pure function so this rule is
 * unit-tested and independent of any runtime.
 */

export type AppMode = "demo" | "pilot";
export const APP_MODE_FLAG = "EXPO_PUBLIC_APP_MODE";

/** Pure resolver. Anything other than the exact string "pilot" is treated as demo. */
export function resolveAppMode(flagValue: string | undefined): AppMode {
  return flagValue === "pilot" ? "pilot" : "demo";
}

/** The build's app mode (EXPO_PUBLIC_* vars are inlined at build time). */
export function getAppMode(): AppMode {
  return resolveAppMode(process.env[APP_MODE_FLAG]);
}

export function isPilotMode(): boolean {
  return getAppMode() === "pilot";
}

export type DataSource = "supabase" | "mock" | "unconfigured-pilot";

/**
 * Decide the data source. Safety-critical invariant: a **pilot** build never
 * resolves to "mock" — if the backend is not configured it resolves to
 * "unconfigured-pilot" (a hard, visible failure), never a silent demo fallback.
 *
 * In demo mode the real backend is used only when it is configured AND the user is
 * signed in; otherwise the synthetic Mock repositories are used.
 */
export function resolveDataSource(input: {
  appMode: AppMode;
  backendConfigured: boolean;
  hasSession: boolean;
}): DataSource {
  if (input.appMode === "pilot") {
    return input.backendConfigured ? "supabase" : "unconfigured-pilot";
  }
  return input.backendConfigured && input.hasSession ? "supabase" : "mock";
}
