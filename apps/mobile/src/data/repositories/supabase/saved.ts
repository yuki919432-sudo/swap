/**
 * Supabase-backed SavedListingsRepository. Rows are user-scoped by RLS
 * (`user_id = auth.uid()`), and inserting requires the caller be a verified member
 * of the listing's school.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedListingsRepository } from "../types";

export class SupabaseSavedListingsRepository implements SavedListingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("not_authenticated");
    return data.user.id;
  }

  async list(): Promise<string[]> {
    const { data, error } = await this.client.from("saved_listings").select("listing_id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => (r as { listing_id: string }).listing_id);
  }

  async isSaved(listingId: string): Promise<boolean> {
    const { data, error } = await this.client.from("saved_listings").select("id").eq("listing_id", listingId).maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
  }

  async toggle(listingId: string): Promise<boolean> {
    const uid = await this.uid();
    if (await this.isSaved(listingId)) {
      const { error } = await this.client.from("saved_listings").delete().eq("listing_id", listingId).eq("user_id", uid);
      if (error) throw new Error(error.message);
      return false;
    }
    // Insert needs the listing's school (RLS `with check` verifies membership there).
    const { data: listing, error: lookupErr } = await this.client.from("listings").select("school_id").eq("id", listingId).single();
    if (lookupErr || !listing) throw new Error(lookupErr?.message ?? "listing_not_found");
    const { error } = await this.client
      .from("saved_listings")
      .insert({ user_id: uid, listing_id: listingId, school_id: (listing as { school_id: string }).school_id });
    if (error) throw new Error(error.message);
    return true;
  }
}
