/**
 * Supabase-backed WishlistRepository. Wishlist items are school-scoped (RLS lets
 * verified members see the school's active wishes, owners see all of their own).
 * Matches come from the server-side outbox (wishlist_matches), which a trigger
 * populates whenever a new listing matches a wishlist — the data model prepared
 * for a future "matching item listed" notification.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition, WishlistStatus, WishlistUrgency, WishlistVisibility } from "@swap/types";
import type { WishlistItem, WishlistMatch } from "../../../domain/models";
import type { NewWishlistItem, WishlistRepository } from "../types";

interface WishlistRow {
  id: string;
  school_id: string;
  user_id: string;
  title: string;
  description: string | null;
  preferred_category: string | null;
  preferred_condition: ItemCondition | null;
  budget_cents: number | null;
  swap_acceptable: boolean;
  urgency: WishlistUrgency;
  visibility: WishlistVisibility;
  status: WishlistStatus;
  created_at: string;
}

const toItem = (r: WishlistRow): WishlistItem => ({
  id: r.id,
  schoolId: r.school_id,
  userId: r.user_id,
  title: r.title,
  description: r.description,
  preferredCategory: r.preferred_category,
  preferredCondition: r.preferred_condition,
  budgetCents: r.budget_cents,
  swapAcceptable: r.swap_acceptable,
  urgency: r.urgency,
  visibility: r.visibility,
  status: r.status,
  createdAt: r.created_at,
});

export class SupabaseWishlistRepository implements WishlistRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("not_authenticated");
    return data.user.id;
  }

  async listMine(): Promise<WishlistItem[]> {
    const uid = await this.uid();
    const { data, error } = await this.client
      .from("wishlist_items")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as WishlistRow[]).map(toItem);
  }

  async listForSchool(schoolId: string): Promise<WishlistItem[]> {
    const { data, error } = await this.client
      .from("wishlist_items")
      .select("*")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as WishlistRow[]).map(toItem);
  }

  async create(input: NewWishlistItem): Promise<WishlistItem> {
    const uid = await this.uid();
    const { data, error } = await this.client
      .from("wishlist_items")
      .insert({
        school_id: input.schoolId,
        user_id: uid,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        preferred_category: input.preferredCategory,
        preferred_condition: input.preferredCondition,
        budget_cents: input.budgetCents,
        swap_acceptable: input.swapAcceptable,
        urgency: input.urgency,
        visibility: input.visibility,
        status: "active",
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "create_failed");
    return toItem(data as WishlistRow);
  }

  async updateStatus(id: string, status: WishlistStatus): Promise<void> {
    const { error } = await this.client.from("wishlist_items").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client
      .from("wishlist_items")
      .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async matchesForMe(): Promise<WishlistMatch[]> {
    const { data, error } = await this.client
      .from("wishlist_matches")
      .select("wishlist_item_id, listing_id, score, created_at, notified_at")
      .order("score", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { wishlist_item_id: string; listing_id: string; score: number; created_at: string; notified_at: string | null }[]).map(
      (r) => ({
        wishlistItemId: r.wishlist_item_id,
        listingId: r.listing_id,
        score: Number(r.score),
        createdAt: r.created_at,
        notified: r.notified_at !== null,
      }),
    );
  }
}
