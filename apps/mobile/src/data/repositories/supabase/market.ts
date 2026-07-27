/**
 * Supabase-backed MarketRepository. Temporary markets, seller participation, and
 * listing↔market associations are all school-scoped by RLS. A listing can belong to
 * many markets; removing an association never deletes the listing, and cancelling a
 * market never deletes its listings (both enforced by the schema + policies). No RN
 * imports — the client is injected so this runs in Node integration tests.
 *
 * Market cover images are not uploaded in real mode this checkpoint (no cover
 * bucket yet); coverImage reads back as null. Everything else is real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCondition, ListingPostType, MarketStatus } from "@swap/types";
import type { Listing, Market, MarketDetail, OwnerPreview } from "../../../domain/models";
import type { MarketRepository, NewMarket } from "../types";
import { emojiForKey } from "./map";

interface MarketRow {
  id: string;
  school_id: string;
  host_user_id: string;
  host_label: string | null;
  title: string;
  description: string | null;
  cover_storage_path: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  handoff_instructions: string | null;
  allowed_categories: string[] | null;
  allows_regulated: boolean;
  status: MarketStatus;
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

const ownerPreview = (u: UserLite | null): OwnerPreview => ({
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

export class SupabaseMarketRepository implements MarketRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  private async userLite(id: string): Promise<UserLite | null> {
    const { data } = await this.client.from("users").select("id, display_name").eq("id", id).maybeSingle();
    return (data ?? null) as UserLite | null;
  }

  private async counts(marketId: string): Promise<{ sellerCount: number; listingCount: number }> {
    const [{ count: sc }, { count: lc }] = await Promise.all([
      this.client.from("market_sellers").select("*", { count: "exact", head: true }).eq("market_id", marketId),
      this.client.from("market_listings").select("*", { count: "exact", head: true }).eq("market_id", marketId),
    ]);
    return { sellerCount: sc ?? 0, listingCount: lc ?? 0 };
  }

  private async toMarket(r: MarketRow): Promise<Market> {
    const [host, { sellerCount, listingCount }] = await Promise.all([this.userLite(r.host_user_id).then(ownerPreview), this.counts(r.id)]);
    return {
      id: r.id,
      schoolId: r.school_id,
      hostUserId: r.host_user_id,
      host,
      hostLabel: r.host_label,
      title: r.title,
      description: r.description,
      coverImage: null,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      location: r.location,
      handoffInstructions: r.handoff_instructions,
      allowedCategories: r.allowed_categories ?? [],
      allowsRegulated: r.allows_regulated,
      status: r.status,
      createdAt: r.created_at,
      sellerCount,
      listingCount,
    };
  }

  async listForSchool(schoolId: string): Promise<Market[]> {
    const { data, error } = await this.client
      .from("markets")
      .select("*")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Promise.all(((data ?? []) as MarketRow[]).map((r) => this.toMarket(r)));
  }

  async getById(id: string): Promise<MarketDetail | null> {
    const { data, error } = await this.client.from("markets").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as MarketRow;
    const market = await this.toMarket(row);

    const { data: assoc, error: aErr } = await this.client.from("market_listings").select("listing_id").eq("market_id", id);
    if (aErr) throw new Error(aErr.message);
    const ids = ((assoc ?? []) as { listing_id: string }[]).map((a) => a.listing_id);

    let listings: Listing[] = [];
    if (ids.length > 0) {
      const { data: lrows, error: lErr } = await this.client
        .from("listings")
        .select("id, school_id, owner_id, post_type, status, title, description, category, condition, desired_item, created_at, expires_at")
        .in("id", ids)
        .is("deleted_at", null);
      if (lErr) throw new Error(lErr.message);
      const rows = (lrows ?? []) as ListingLite[];
      const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
      const owners = new Map<string, OwnerPreview>();
      await Promise.all(ownerIds.map(async (oid) => owners.set(oid, ownerPreview(await this.userLite(oid)))));
      listings = rows.map((r) => toListing(r, owners.get(r.owner_id) ?? ownerPreview(null)));
    }

    const uid = await this.uid();
    const amHost = uid !== null && row.host_user_id === uid;
    let amSeller = false;
    if (uid !== null) {
      const { count } = await this.client
        .from("market_sellers")
        .select("*", { count: "exact", head: true })
        .eq("market_id", id)
        .eq("user_id", uid);
      amSeller = (count ?? 0) > 0;
    }
    return { market, listings, amHost, amSeller };
  }

  async create(input: NewMarket, _host: OwnerPreview): Promise<Market> {
    void _host;
    const uid = await this.uid();
    if (!uid) throw new Error("not_authenticated");
    const { data, error } = await this.client
      .from("markets")
      .insert({
        school_id: input.schoolId,
        host_user_id: uid,
        host_label: input.hostLabel?.trim() || null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        location: input.location?.trim() || null,
        handoff_instructions: input.handoffInstructions?.trim() || null,
        allowed_categories: input.allowedCategories,
        allows_regulated: input.allowsRegulated,
        status: input.status,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "create_failed");
    return this.toMarket(data as MarketRow);
  }

  async setStatus(id: string, status: MarketStatus): Promise<void> {
    const { error } = await this.client.from("markets").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async join(marketId: string): Promise<void> {
    const uid = await this.uid();
    if (!uid) throw new Error("not_authenticated");
    const { data: market, error: mErr } = await this.client.from("markets").select("school_id").eq("id", marketId).maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!market) throw new Error("market_not_found");
    const { error } = await this.client
      .from("market_sellers")
      .upsert({ market_id: marketId, school_id: (market as { school_id: string }).school_id, user_id: uid }, { onConflict: "market_id,user_id" });
    if (error) throw new Error(error.message);
  }

  async leave(marketId: string): Promise<void> {
    const uid = await this.uid();
    if (!uid) throw new Error("not_authenticated");
    const { error } = await this.client.from("market_sellers").delete().eq("market_id", marketId).eq("user_id", uid);
    if (error) throw new Error(error.message);
  }

  async addListing(marketId: string, listingId: string): Promise<void> {
    const uid = await this.uid();
    if (!uid) throw new Error("not_authenticated");
    const { data: market, error: mErr } = await this.client.from("markets").select("school_id").eq("id", marketId).maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!market) throw new Error("market_not_found");
    const { error } = await this.client.from("market_listings").upsert(
      { market_id: marketId, school_id: (market as { school_id: string }).school_id, listing_id: listingId, added_by: uid },
      { onConflict: "market_id,listing_id" },
    );
    if (error) throw new Error(error.message);
  }

  async removeListing(marketId: string, listingId: string): Promise<void> {
    const { error } = await this.client.from("market_listings").delete().eq("market_id", marketId).eq("listing_id", listingId);
    if (error) throw new Error(error.message);
  }
}
