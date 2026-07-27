/**
 * Supabase-backed StallRepository. A stall is a casual profile over a student's
 * own listings — RLS scopes stalls to same-school members, so a stall's owner and
 * their active listings are only visible to the school. The owner's "looking for"
 * requests appear only when the owner opted them in (show_on_stall), except for the
 * owner viewing their own stall. No RN imports — the client is injected for tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition, ListingPostType } from "@swap/types";
import { LISTING_POST_TYPE } from "@swap/types";
import type { Listing, OwnerPreview, Stall, StallDetail, WishlistItem } from "../../../domain/models";
import type { NewWishlistItem } from "../types";
import type { StallRepository } from "../types";
import { emojiForKey } from "./map";

interface StallRow {
  id: string;
  school_id: string;
  user_id: string;
  description: string | null;
  created_at: string;
}

interface UserLite {
  id: string;
  display_name: string | null;
}

interface ListingLite {
  id: string;
  school_id: string;
  owner_id: string;
  post_type: ListingPostType;
  status: string;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  desired_item: string | null;
  created_at: string;
  expires_at: string | null;
}

interface WishlistRowLite {
  id: string;
  school_id: string;
  user_id: string;
  title: string;
  description: string | null;
  preferred_category: string | null;
  preferred_condition: ItemCondition | null;
  budget_cents: number | null;
  swap_acceptable: boolean;
  urgency: NewWishlistItem["urgency"];
  visibility: NewWishlistItem["visibility"];
  status: "active" | "fulfilled" | "cancelled" | "expired";
  show_on_stall: boolean;
  created_at: string;
}

const owner = (u: UserLite | null): OwnerPreview => ({
  displayName: u?.display_name ?? "Student",
  avatarEmoji: emojiForKey(u?.id ?? "student"),
  verified: true,
});

const toListing = (r: ListingLite, o: OwnerPreview): Listing => ({
  id: r.id,
  schoolId: r.school_id,
  postType: r.post_type,
  status: r.status as Listing["status"],
  title: r.title,
  description: r.description,
  category: r.category,
  condition: r.condition,
  desiredItem: r.desired_item,
  images: [],
  handoffLocation: null,
  owner: o,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  demoLocal: false,
});

const toWishlist = (r: WishlistRowLite): WishlistItem => ({
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

const emptyBreakdown = (): Record<ListingPostType, number> =>
  Object.fromEntries(LISTING_POST_TYPE.map((t) => [t, 0])) as Record<ListingPostType, number>;

export class SupabaseStallRepository implements StallRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  private async userLite(id: string): Promise<UserLite | null> {
    const { data } = await this.client.from("users").select("id, display_name").eq("id", id).maybeSingle();
    return (data ?? null) as UserLite | null;
  }

  private async listingsForOwner(schoolId: string, userId: string): Promise<Listing[]> {
    const { data, error } = await this.client
      .from("listings")
      .select("id, school_id, owner_id, post_type, status, title, description, category, condition, desired_item, created_at, expires_at")
      .eq("school_id", schoolId)
      .eq("owner_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const o = owner(await this.userLite(userId));
    return ((data ?? []) as ListingLite[]).map((r) => toListing(r, o));
  }

  private async visibleWishlist(schoolId: string, userId: string, viewerIsOwner: boolean): Promise<WishlistItem[]> {
    let q = this.client
      .from("wishlist_items")
      .select("*")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (!viewerIsOwner) q = q.eq("show_on_stall", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as WishlistRowLite[]).map(toWishlist);
  }

  private toStall(r: StallRow, o: OwnerPreview, activeCount: number): Stall {
    return {
      id: r.id,
      schoolId: r.school_id,
      userId: r.user_id,
      owner: o,
      description: r.description,
      createdAt: r.created_at,
      activeCount,
    };
  }

  private async detailFromRow(r: StallRow): Promise<StallDetail> {
    const viewerIsOwner = (await this.uid()) === r.user_id;
    const [o, listings, visibleWishlist] = await Promise.all([
      this.userLite(r.user_id).then(owner),
      this.listingsForOwner(r.school_id, r.user_id),
      this.visibleWishlist(r.school_id, r.user_id, viewerIsOwner),
    ]);
    const breakdown = emptyBreakdown();
    for (const l of listings) breakdown[l.postType] += 1;
    return { stall: this.toStall(r, o, listings.length), listings, breakdown, visibleWishlist };
  }

  async listForSchool(schoolId: string): Promise<Stall[]> {
    const { data, error } = await this.client
      .from("stalls")
      .select("*")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as StallRow[];
    return Promise.all(
      rows.map(async (r) => {
        const [o, listings] = await Promise.all([this.userLite(r.user_id).then(owner), this.listingsForOwner(r.school_id, r.user_id)]);
        return this.toStall(r, o, listings.length);
      }),
    );
  }

  async getById(id: string): Promise<StallDetail | null> {
    const { data, error } = await this.client.from("stalls").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.detailFromRow(data as StallRow);
  }

  async getByUser(schoolId: string, userId: string): Promise<StallDetail | null> {
    const { data, error } = await this.client
      .from("stalls")
      .select("*")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.detailFromRow(data as StallRow);
  }

  async getMine(schoolId: string): Promise<StallDetail | null> {
    const uid = await this.uid();
    if (!uid) return null;
    return this.getByUser(schoolId, uid);
  }

  async open(schoolId: string, description: string | null): Promise<Stall> {
    const uid = await this.uid();
    if (!uid) throw new Error("not_authenticated");
    const { data, error } = await this.client
      .from("stalls")
      .upsert(
        { school_id: schoolId, user_id: uid, description: description?.trim() || null },
        { onConflict: "school_id,user_id" },
      )
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "open_failed");
    const [o, listings] = await Promise.all([this.userLite(uid).then(owner), this.listingsForOwner(schoolId, uid)]);
    return this.toStall(data as StallRow, o, listings.length);
  }
}
