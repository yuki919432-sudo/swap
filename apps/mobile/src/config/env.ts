/**
 * Public (EXPO_PUBLIC_*) runtime configuration. These are inlined into the client
 * bundle at build time — the anon key is a public key by design (RLS is the real
 * authority). NEVER put a service-role key here.
 */

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when a real Supabase backend is configured for this build. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
