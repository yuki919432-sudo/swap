/**
 * Supabase-backed CampusMarketRepository. The Campus Market is derived: it turns the
 * school's real listings + the viewer's real wishlist into deterministic discovery
 * shelves (recency, category, wishlist matches) and privacy-safe demand clusters.
 * All ranking is done by the shared pure builder, so demo and real modes produce the
 * same experience. RLS keeps every read school-scoped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition, ListingPostType, WishlistStatus, WishlistUrgency, WishlistVisibility } from "@swap/types";
import type { Listing, OwnerPreview, Stall, WishlistItem } from "../../../domain/models";
import { buildDemandClusters, buildDiscoveryShelves } from "../campusDiscovery";
import type { CampusMarketRepository, DemandCluster, DiscoveryShelf, StallRepository } from "../types";
import { emojiForKey } from "./map";

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
  urgency: WishlistUrgency;
  visibility: WishlistVisibility;
  status: WishlistStatus;
  show_on_stall: boolean;
  created_at: string;
}

const owner = (id: string, name: string | null): OwnerPreview => ({ displayName: name ?? "Student", avatarEmoji: emojiForKey(id), verified: true });

const toListing = (r: ListingLite, name: string | null): Listing => ({
  id: r.id,
  schoolId: r.school_id,
  ownerId: r.owner_id,
  postType: r.post_type,
  status: r.status as Listing["status"],
  title: r.title,
  description: r.description,
  category: r.category,
  condition: r.condition,
  desiredItem: r.desired_item,
  images: [],
  handoffLocation: null,
  owner: owner(r.owner_id, name),
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

export class SupabaseCampusMarketRepository implements CampusMarketRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly stalls: StallRepository,
  ) {}

  private async schoolListings(schoolId: string): Promise<Listing[]> {
    const { data, error } = await this.client
      .from("listings")
      .select("id, school_id, owner_id, post_type, status, title, description, category, condition, desired_item, created_at, expires_at, owner:users(id,display_name)")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as (ListingLite & { owner: { id: string; display_name: string | null } | null })[]).map((r) =>
      toListing(r, r.owner?.display_name ?? null),
    );
  }

  async shelves(schoolId: string): Promise<DiscoveryShelf[]> {
    const { data: userData } = await this.client.auth.getUser();
    const uid = userData.user?.id ?? null;
    const listings = await this.schoolListings(schoolId);
    let myWishlist: WishlistItem[] = [];
    if (uid !== null) {
      const { data, error } = await this.client
        .from("wishlist_items")
        .select("*")
        .eq("school_id", schoolId)
        .eq("user_id", uid)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      myWishlist = ((data ?? []) as WishlistRowLite[]).map(toWishlist);
    }
    return buildDiscoveryShelves({ schoolId, listings, myWishlist });
  }

  async demand(schoolId: string): Promise<DemandCluster[]> {
    const { data, error } = await this.client
      .from("wishlist_items")
      .select("*")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const wishlist = ((data ?? []) as WishlistRowLite[]).map(toWishlist);
    return buildDemandClusters(wishlist);
  }

  async recentStalls(schoolId: string, limit = 8): Promise<Stall[]> {
    return (await this.stalls.listForSchool(schoolId)).slice(0, limit);
  }
}
