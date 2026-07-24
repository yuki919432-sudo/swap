/**
 * Authentication context extraction. Reads the verified identity from the
 * Supabase session (never from client-supplied fields) and the MFA assurance
 * level. Platform-admin handlers should call requireAal2.
 */
import { forbidden, unauthenticated } from "./errors.js";

export interface AuthContext {
  userId: string;
  email: string | null;
  aal: string; // "aal1" | "aal2"
}

/** Minimal structural view of the Supabase auth client (keeps this testable). */
export interface AuthCapableClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null } | null; error: unknown }>;
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{
        data: { currentLevel: string | null } | null;
        error: unknown;
      }>;
    };
  };
}

export async function getAuthContext(client: AuthCapableClient): Promise<AuthContext | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;

  let aal = "aal1";
  try {
    const level = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level?.data?.currentLevel) aal = level.data.currentLevel;
  } catch {
    // Treat an unavailable AAL as aal1 (least privilege).
  }
  return { userId: data.user.id, email: data.user.email ?? null, aal };
}

export function requireAuth(ctx: AuthContext | null): AuthContext {
  if (!ctx) throw unauthenticated();
  return ctx;
}

export function requireAal2(ctx: AuthContext): AuthContext {
  if (ctx.aal !== "aal2") throw forbidden("mfa_required");
  return ctx;
}
