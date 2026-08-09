/**
 * Build-time environment preflight for the mobile app. A **pilot** build (preview /
 * production EAS profiles) must ship with a correctly configured real backend and a
 * working support contact — otherwise it is a release blocker, not a runtime
 * surprise. This pure function evaluates a set of env values and reports problems
 * (hard failures) and warnings (should-fix). It is exercised both by unit tests and
 * by `scripts/check-mobile-env.mjs` (run before an EAS build / in CI).
 *
 * This module has NO imports on purpose: the preflight CLI runs it directly under
 * `node --experimental-strip-types`, and `config/env.ts` re-exports the service-role
 * guard from here (so there is a single canonical implementation).
 */

/** Minimal, dependency-free base64url decode (works in RN and Node/test runtimes). */
function decodeBase64Url(segment: string): string {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  if (typeof atob === "function") return atob(b64);
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

export type MobileEnvMode = "demo" | "pilot";

export interface MobileEnvInput {
  appMode?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supportUrl?: string;
  pilotSchoolId?: string;
  enableDemoMode?: string;
}

export interface MobileEnvReport {
  mode: MobileEnvMode;
  /** True when there are no hard problems (warnings do not block). */
  ok: boolean;
  problems: string[];
  warnings: string[];
}

const isHttpsUrl = (v: string): boolean => /^https:\/\/.+/i.test(v);
const isSupportUrl = (v: string): boolean => /^(https:\/\/|mailto:).+/i.test(v);

/** Evaluate the mobile build environment for a given mode. Pure — no process.env. */
export function evaluateMobileEnv(input: MobileEnvInput): MobileEnvReport {
  const mode: MobileEnvMode = (input.appMode ?? "").trim().toLowerCase() === "pilot" ? "pilot" : "demo";
  const problems: string[] = [];
  const warnings: string[] = [];

  const url = (input.supabaseUrl ?? "").trim();
  const key = (input.supabaseAnonKey ?? "").trim();
  const support = (input.supportUrl ?? "").trim();
  const pilotSchool = (input.pilotSchoolId ?? "").trim();
  const enableDemo = (input.enableDemoMode ?? "").trim().toLowerCase();

  if (mode === "pilot") {
    if (url.length === 0) problems.push("EXPO_PUBLIC_SUPABASE_URL is required for a pilot build.");
    else if (!isHttpsUrl(url)) problems.push("EXPO_PUBLIC_SUPABASE_URL must be an https:// URL.");

    if (key.length === 0) {
      problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is required for a pilot build.");
    } else if (looksLikeServiceRoleKey(key)) {
      problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is a service-role key — it bypasses RLS and must never ship in a client. Use the anon (public) key.");
    }

    if (support.length === 0) problems.push("EXPO_PUBLIC_SUPPORT_URL is required (App Store apps must offer a working support contact).");
    else if (!isSupportUrl(support)) problems.push("EXPO_PUBLIC_SUPPORT_URL must be an https:// or mailto: URL.");

    if (pilotSchool.length === 0) {
      warnings.push("EXPO_PUBLIC_PILOT_SCHOOL_ID is not set — students without an invitation code will see only a support path, not a manual-approval request.");
    }
    if (enableDemo === "true") {
      warnings.push("EXPO_PUBLIC_ENABLE_DEMO_MODE=true has no effect in a pilot build and should be unset for release.");
    }
  } else {
    // Demo builds are always shippable to a dev client, but a service-role key is
    // never acceptable, even here.
    if (key.length > 0 && looksLikeServiceRoleKey(key)) {
      problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is a service-role key — never use it, even in demo. Use the anon (public) key.");
    }
  }

  return { mode, ok: problems.length === 0, problems, warnings };
}
