/**
 * Supabase-backed MarketplaceRepository. Talks to PostgREST + Storage under the
 * caller's own session, so Row-Level Security is the real authority (a user only
 * sees/writes what their verified school membership allows). No RN imports — the
 * SupabaseClient is injected, so this runs unchanged in the app and in Node
 * integration tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageRef, Listing, OwnerPreview } from "../../../domain/models";
import type { ListingImageRow, ListingRow, UserRow } from "../../supabase/database.types";
import type { MarketplaceQuery, MarketplaceRepository, NewListing } from "../types";
import { ownerFromUserRow, rowToListing, uriImage } from "./map";

const BUCKET = "listing-images";
const SIGNED_URL_TTL = 60 * 60; // 1h

/** Read image bytes from a URI (RN default). Injectable for tests. */
export type ImageReader = (uri: string) => Promise<Uint8Array>;
const defaultImageReader: ImageReader = async (uri) => new Uint8Array(await (await fetch(uri)).arrayBuffer());

type ListingWithRels = ListingRow & {
  listing_images: ListingImageRow[] | null;
  owner: Pick<UserRow, "id" | "display_name" | "avatar_url"> | null;
};

const SELECT = "*, listing_images(*), owner:users(id,display_name,avatar_url)";

// Strip characters that would break a PostgREST `.or(...)` filter expression.
const sanitize = (s: string): string => s.replace(/[,()]/g, " ").trim();

export class SupabaseMarketplaceRepository implements MarketplaceRepository {
  private readonly reader: ImageReader;
  constructor(
    private readonly client: SupabaseClient,
    opts?: { imageReader?: ImageReader },
  ) {
    this.reader = opts?.imageReader ?? defaultImageReader;
  }

  private async signImages(rows: ListingImageRow[] | null): Promise<ImageRef[]> {
    const sorted = (rows ?? []).slice().sort((a, b) => a.position - b.position);
    if (sorted.length === 0) return [];
    const { data } = await this.client.storage.from(BUCKET).createSignedUrls(
      sorted.map((r) => r.storage_path),
      SIGNED_URL_TTL,
    );
    const urls = data ?? [];
    return sorted
      .map((_, i) => urls[i]?.signedUrl)
      .filter((u): u is string => typeof u === "string")
      .map(uriImage);
  }

  private async toListing(row: ListingWithRels): Promise<Listing> {
    const images = await this.signImages(row.listing_images);
    const owner = ownerFromUserRow(row.owner, true);
    return rowToListing(row, images, owner);
  }

  async list(query: MarketplaceQuery): Promise<Listing[]> {
    let q = this.client
      .from("listings")
      .select(SELECT)
      .eq("school_id", query.schoolId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (query.postTypes?.length) q = q.in("post_type", query.postTypes);
    if (query.categories?.length) q = q.in("category", query.categories);
    if (query.conditions?.length) q = q.in("condition", query.conditions);
    if (query.search) {
      const s = sanitize(query.search);
      if (s) q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%,desired_item.ilike.%${s}%`);
    }
    const sort = query.sort ?? "recent";
    q = sort === "title" ? q.order("title", { ascending: true }) : q.order("created_at", { ascending: sort === "oldest" });

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return Promise.all(((data ?? []) as unknown as ListingWithRels[]).map((r) => this.toListing(r)));
  }

  async getById(id: string): Promise<Listing | null> {
    const { data, error } = await this.client.from("listings").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.toListing(data as unknown as ListingWithRels);
  }

  async categoriesForSchool(schoolId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("listings")
      .select("category")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r) => (r as { category: string }).category))].sort();
  }

  async createListing(input: NewListing, owner: OwnerPreview): Promise<Listing> {
    const { data: userData } = await this.client.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error("not_authenticated");

    const { data: inserted, error } = await this.client
      .from("listings")
      .insert({
        school_id: input.schoolId,
        owner_id: uid,
        post_type: input.postType,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        condition: input.postType === "looking_for" ? null : input.condition,
        desired_item: input.postType === "swap" ? input.desiredItem?.trim() || null : null,
        status: "active",
        expires_at: input.expiresAt,
      })
      .select("*")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "create_failed");
    const row = inserted as ListingRow;

    // Upload any locally-picked images to Storage under {school}/{listing}/, then
    // record them. Placeholder (emoji) images are a mock-only concept and skipped.
    const local = input.images.filter((im) => im.kind === "local");
    const displayImages: ImageRef[] = [];
    for (let i = 0; i < local.length; i++) {
      const image = local[i]!;
      const path = `${input.schoolId}/${row.id}/${i}.jpg`;
      const bytes = await this.reader(image.value);
      const up = await this.client.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      await this.client.from("listing_images").insert({ listing_id: row.id, school_id: input.schoolId, storage_path: path, position: i });
      displayImages.push(image); // optimistic: show the local uri immediately
    }

    return rowToListing(row, displayImages, owner);
  }

  async deleteListing(id: string): Promise<void> {
    const { error } = await this.client
      .from("listings")
      .update({ deleted_at: new Date().toISOString(), status: "removed" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}
