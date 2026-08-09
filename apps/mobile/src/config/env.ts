/**
 * Public (EXPO_PUBLIC_*) runtime configuration. These are inlined into the client
 * bundle at build time — the anon key is a public key by design (RLS is the real
 * authority). NEVER put a service-role key here.
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Optional: the pilot school's id, enabling a manual-approval request when the
 *  student has no invitation code. Empty = manual fallback shows a support path. */
export const PILOT_SCHOOL_ID = process.env.EXPO_PUBLIC_PILOT_SCHOOL_ID ?? "";

/** Support / contact URL (https:// or mailto:). Shown in Settings; required for the
 *  App Store support path. Empty = a generic "contact your school" note is shown. */
export const SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL ?? "";

// The service-role guard lives in ./preflight (the single canonical implementation,
// import-free so the preflight CLI can run it under node --experimental-strip-types).
// Re-exported here so existing `import { looksLikeServiceRoleKey } from "./env"` holds.
export { looksLikeServiceRoleKey } from "./preflight";
import { looksLikeServiceRoleKey } from "./preflight";

export interface SupabaseEnvStatus {
  /** True only when a usable, non-service-role backend is configured. */
  configured: boolean;
  /** A stable error code when the env is present but INVALID (e.g. a service-role key). */
  error: "service_role_key_in_client" | null;
}

/** Validate the public Supabase env. A service-role key is treated as NOT configured + an error. */
export function supabaseEnvStatus(): SupabaseEnvStatus {
  if (SUPABASE_URL.length === 0 || SUPABASE_ANON_KEY.length === 0) return { configured: false, error: null };
  if (looksLikeServiceRoleKey(SUPABASE_ANON_KEY)) return { configured: false, error: "service_role_key_in_client" };
  return { configured: true, error: null };
}

/** True when a real Supabase backend is configured for this build. */
export function isSupabaseConfigured(): boolean {
  return supabaseEnvStatus().configured;
}
