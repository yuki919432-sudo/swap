/**
 * Supabase client factories.
 *
 * SECURITY: the service-role client bypasses RLS and MUST run only in trusted
 * server contexts (Edge Functions, backend jobs). NEVER import or construct it in
 * browser or mobile code, and never expose the service-role key to a client.
 * User-facing requests use the anon key plus the caller's JWT so RLS applies as
 * that user.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db-types.js";

export type Db = Database;
export type DbClient = SupabaseClient<Database>;

const baseAuth = { persistSession: false, autoRefreshToken: false } as const;

/** Unauthenticated (anon) client. RLS sees no verified membership. */
export function createAnonClient(url: string, anonKey: string): DbClient {
  return createClient<Database>(url, anonKey, { auth: baseAuth });
}

/**
 * A client that acts AS the given user: the anon key plus the user's access
 * token, so every query/RPC runs under that user's RLS context.
 */
export function createUserClient(url: string, anonKey: string, accessToken: string): DbClient {
  return createClient<Database>(url, anonKey, {
    auth: baseAuth,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Service-role client — bypasses RLS. SERVER-ONLY. Use only for privileged,
 * carefully-authorized operations (e.g. admin user provisioning, system audit
 * writes). Guarded against accidental browser usage.
 */
export function createServiceClient(url: string, serviceRoleKey: string): DbClient {
  const g = globalThis as { window?: unknown; document?: unknown };
  if (typeof g.window !== "undefined" || typeof g.document !== "undefined") {
    throw new Error("createServiceClient must never be called in a browser/client context");
  }
  return createClient<Database>(url, serviceRoleKey, { auth: baseAuth });
}
