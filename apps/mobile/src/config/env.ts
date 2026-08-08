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

/** Minimal, dependency-free base64url decode (works in RN and Node/test runtimes). */
function decodeBase64Url(segment: string): string {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  if (typeof atob === "function") return atob(b64);
  // Node fallback (vitest).
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(b64, "base64").toString("binary");
  throw new Error("no base64 decoder");
}

/**
 * True when a key is a Supabase **service-role** JWT (which must never reach the
 * client — it bypasses RLS). Supabase keys are JWTs whose payload carries a `role`
 * claim of "anon" or "service_role"; a service-role key is a hard misconfiguration.
 */
export function looksLikeServiceRoleKey(key: string): boolean {
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || !parts[1]) return false;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

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
