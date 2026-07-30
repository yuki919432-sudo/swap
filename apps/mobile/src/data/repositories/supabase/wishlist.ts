/**
 * Supabase-backed WishlistRepository. Wishlist items are school-scoped (RLS lets
 * verified members see the school's active wishes, owners see all of their own).
 * Matches come from the server-side outbox (wishlist_matches), which a trigger
 * populates whenever a new listing matches a wishlist — the data model prepared
 * for a future "matching item listed" notification.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition, ListingPostType, ListingStatus, WishlistStatus, WishlistUrgency, WishlistVisibility } from "@swap/types";
import type { MatchedListing, WishlistItem, WishlistMatch, WishlistMatchDetail } from "../../../domain/models";
import type { NewWishlistItem, WishlistPatch, WishlistRepository } from "../types";

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
  show_on_stall: boolean;
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
  showOnStall: r.show_on_stall,
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

  async update(id: string, patch: WishlistPatch): Promise<WishlistItem> {
    // Only the provided fields are sent; RLS restricts UPDATE to the owner.
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title.trim();
    if (patch.description !== undefined) row.description = patch.description?.trim() || null;
    if (patch.preferredCategory !== undefined) row.preferred_category = patch.preferredCategory;
    if (patch.preferredCondition !== undefined) row.preferred_condition = patch.preferredCondition;
    if (patch.swapAcceptable !== undefined) row.swap_acceptable = patch.swapAcceptable;
    if (patch.urgency !== undefined) row.urgency = patch.urgency;
    const { data, error } = await this.client.from("wishlist_items").update(row).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "update_failed");
    return toItem(data as WishlistRow);
  }

  async updateStatus(id: string, status: WishlistStatus): Promise<void> {
    const { error } = await this.client.from("wishlist_items").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async setShowOnStall(id: string, show: boolean): Promise<void> {
    const { error } = await this.client.from("wishlist_items").update({ show_on_stall: show }).eq("id", id);
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

  async matchDetailsForMe(): Promise<WishlistMatchDetail[]> {
    const matches = await this.matchesForMe();
    if (matches.length === 0) return [];

    // Resolve the wishlist titles (mine) and the CURRENT state of each matched
    // listing. A match to a soft-deleted / reserved / completed listing persists in
    // the outbox but is flagged not-available so the UI can show it cleanly.
    const wishIds = [...new Set(matches.map((m) => m.wishlistItemId))];
    const listingIds = [...new Set(matches.map((m) => m.listingId))];
    const [wishRes, listingRes] = await Promise.all([
      this.client.from("wishlist_items").select("id, title").in("id", wishIds),
      this.client.from("listings").select("id, title, owner_id, post_type, status, deleted_at").in("id", listingIds),
    ]);
    if (wishRes.error) throw new Error(wishRes.error.message);
    if (listingRes.error) throw new Error(listingRes.error.message);

    const titleById = new Map<string, string>();
    for (const w of (wishRes.data ?? []) as { id: string; title: string }[]) titleById.set(w.id, w.title);

    interface ListingLite {
      id: string;
      title: string;
      owner_id: string;
      post_type: ListingPostType;
      status: ListingStatus;
      deleted_at: string | null;
    }
    const listingById = new Map<string, ListingLite>();
    for (const l of (listingRes.data ?? []) as ListingLite[]) listingById.set(l.id, l);

    return matches.map((m) => {
      const l = listingById.get(m.listingId);
      const available = l !== undefined && l.deleted_at === null && l.status === "active";
      const listing: MatchedListing | null = l
        ? { id: l.id, title: l.title, ownerId: l.owner_id, postType: l.post_type, status: l.status, image: null }
        : null;
      return { wishlistItemId: m.wishlistItemId, wishlistTitle: titleById.get(m.wishlistItemId) ?? "Your wish", listing, available, score: m.score, notified: m.notified };
    });
  }
}
