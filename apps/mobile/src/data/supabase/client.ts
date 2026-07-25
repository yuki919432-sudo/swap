/**
 * The app's Supabase client (React Native). Isolated here so the RN-only pieces
 * (URL polyfill + AsyncStorage-backed auth session) never leak into unit or
 * integration tests, which construct their own clients.
 *
 * The anon key is public; RLS is the real authority. autoRefresh keeps the session
 * alive; detectSessionInUrl is off (no web redirect flow on native).
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../config/env";
import type { Database } from "./database.types";

let cached: SupabaseClient<Database> | null = null;

/** Lazily create (and memoize) the app Supabase client. */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}
