/**
 * Demo mode.
 *
 * SWAP! mobile ships a development-only demo mode driven by
 * `EXPO_PUBLIC_ENABLE_DEMO_MODE=true`. Demo mode uses ONLY synthetic data and a
 * local, clearly-labeled demo session. It never creates a production JWT, never
 * bypasses RLS, and never touches real credentials or real school/student data.
 *
 * It is additionally gated on a development runtime, so it is unavailable in
 * production builds even if the flag is somehow set.
 */

export const DEMO_FLAG = "EXPO_PUBLIC_ENABLE_DEMO_MODE";

/**
 * Pure resolver (unit-tested). Demo mode is on ONLY when the flag is exactly
 * "true" AND the app is running in a development runtime.
 */
export function resolveDemoMode(flagValue: string | undefined, isDevRuntime: boolean): boolean {
  return flagValue === "true" && isDevRuntime === true;
}

/** True in a dev runtime (Metro / Expo Go). False in a production release build. */
function isDevRuntime(): boolean {
  // `__DEV__` is injected by the React Native/Expo bundler.
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

/** Runtime check used by screens/navigation. */
export function isDemoModeEnabled(): boolean {
  // EXPO_PUBLIC_* vars are inlined at build time by the Expo bundler.
  return resolveDemoMode(process.env[DEMO_FLAG], isDevRuntime());
}
