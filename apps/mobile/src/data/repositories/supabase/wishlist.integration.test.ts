/**
 * Real-backend integration proof for the Wishlist + match outbox. Boots against a
 * disposable Supabase stack and drives the ACTUAL SupabaseWishlistRepository /
 * SupabaseMarketplaceRepository under RLS:
 *
 *   - user A creates a wishlist item (school-scoped),
 *   - a same-school member B posts a matching listing,
 *   - the DB trigger records the match; A reads it from their own outbox,
 *   - a member from another school cannot see A's wishlist,
 *   - A's own listing never matches their own wishlist.
 *
 * Skips cleanly when SUPABASE_URL is absent (never runs in the unit suite).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseWishlistRepository } from "./wishlist";
import { SupabaseMessagingRepository } from "./messaging";
import type { NewListing, NewWishlistItem } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const owner: OwnerPreview = { displayName: "B", avatarEmoji: "🙂", verified: true };

const svc = () => createClient(URL as string, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string, schoolId: string): Promise<{ id: string; client: SupabaseClient }> {
  const admin = svc();
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser ${email}: ${created.error?.message}`);
  const id = created.data.user.id;
  await admin.from("users").insert({ id, display_name: email.split("@")[0] });
  await admin.from("school_memberships").insert({ school_id: schoolId, user_id: id, status: "verified", verification_method: "email_otp" });
  const client = createClient(URL as string, ANON, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`sign-in ${email}: ${signIn.error.message}`);
  return { id, client };
}

describe.skipIf(!URL)("Supabase wishlist + match outbox (two real users)", () => {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  let a: { id: string; client: SupabaseClient };
  let b: { id: string; client: SupabaseClient };
  let c: { id: string; client: SupabaseClient };
  let wishId = "";

  const wish: NewWishlistItem = {
    schoolId: schoolA,
    title: `Looking for a mini fridge ${tag}`,
    description: "For my dorm",
    preferredCategory: "dormitory_items",
    preferredCondition: null,
    budgetCents: null,
    swapAcceptable: true,
    urgency: "high",
    visibility: "school",
  };
  const matchingListing: NewListing = {
    schoolId: schoolA,
    postType: "give",
    title: `Mini fridge ${tag}`,
    description: "Works great, free to a good home.",
    category: "dormitory_items",
    condition: "good",
    desiredItem: null,
    images: [],
    handoffLocation: null,
    expiresAt: null,
  };

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [
      [schoolA, `wla-${tag}`],
      [schoolB, `wlb-${tag}`],
    ] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "manual"] });
    }
    a = await makeUser(`wa-${tag}@a.test`, schoolA);
    b = await makeUser(`wb-${tag}@a.test`, schoolA);
    c = await makeUser(`wc-${tag}@b.test`, schoolB);
  });

  it("user A creates a wishlist item", async () => {
    const repo = new SupabaseWishlistRepository(a.client);
    const item = await repo.create(wish);
    wishId = item.id;
    expect(item.id).toBeTruthy();
    expect(item.title).toContain(tag);
    expect(await repo.listMine()).toHaveLength(1);
  });

  it("a same-school member sees the wishlist; a cross-school member does not", async () => {
    const seenByB = await new SupabaseWishlistRepository(b.client).listForSchool(schoolA);
    expect(seenByB.some((w) => w.id === wishId)).toBe(true);
    const seenByC = await new SupabaseWishlistRepository(c.client).listForSchool(schoolA);
    expect(seenByC.some((w) => w.id === wishId)).toBe(false);
  });

  it("a matching listing populates A's match outbox (trigger), visible only to A", async () => {
    // B posts a listing that matches A's wishlist.
    await new SupabaseMarketplaceRepository(b.client, { imageReader: async () => new Uint8Array() }).createListing(matchingListing, owner);

    const aMatches = await new SupabaseWishlistRepository(a.client).matchesForMe();
    expect(aMatches.some((m) => m.wishlistItemId === wishId)).toBe(true);
    const m = aMatches.find((x) => x.wishlistItemId === wishId)!;
    expect(m.score).toBeGreaterThanOrEqual(0.25);
    expect(m.notified).toBe(false); // outbox: awaiting a future notification

    // B (the lister, not the wishlist owner) cannot read A's match outbox.
    expect(await new SupabaseWishlistRepository(b.client).matchesForMe()).toHaveLength(0);
  });

  it("A's own matching listing does not match A's own wishlist", async () => {
    await new SupabaseMarketplaceRepository(a.client, { imageReader: async () => new Uint8Array() }).createListing(
      { ...matchingListing, title: `Mini fridge mine ${tag}` },
      owner,
    );
    const aMatches = await new SupabaseWishlistRepository(a.client).matchesForMe();
    // Still only the one match from B's listing (A's own listing is excluded).
    expect(aMatches.filter((x) => x.wishlistItemId === wishId)).toHaveLength(1);
  });

  it("A can message the matched listing's owner from the match", async () => {
    const details = await new SupabaseWishlistRepository(a.client).matchDetailsForMe();
    const hit = details.find((d) => d.wishlistItemId === wishId && d.available)!;
    expect(hit.listing).not.toBeNull();
    expect(hit.listing!.ownerId).toBe(b.id); // reach the lister, not A
    const conversationId = await new SupabaseMessagingRepository(a.client).startConversation({
      otherUserId: hit.listing!.ownerId,
      listingId: hit.listing!.id,
    });
    expect(conversationId).toBeTruthy();
  });

  it("a fulfilled wishlist stops accruing new matches", async () => {
    const repo = new SupabaseWishlistRepository(a.client);
    await repo.updateStatus(wishId, "fulfilled");
    // B posts ANOTHER matching listing after the wish was fulfilled.
    const later = await new SupabaseMarketplaceRepository(b.client, { imageReader: async () => new Uint8Array() }).createListing(
      { ...matchingListing, title: `Mini fridge later ${tag}` },
      owner,
    );
    const matches = await repo.matchesForMe();
    expect(matches.some((m) => m.listingId === later.id)).toBe(false); // no new match for a fulfilled wish
    await repo.updateStatus(wishId, "active"); // reopen for the availability check below
  });

  it("a taken-down matched listing is flagged unavailable (not a dead link)", async () => {
    // Find B's original matching listing via A's outbox, then B soft-deletes it.
    const before = await new SupabaseWishlistRepository(a.client).matchDetailsForMe();
    const target = before.find((d) => d.available && d.listing !== null)!;
    await new SupabaseMarketplaceRepository(b.client, { imageReader: async () => new Uint8Array() }).deleteListing(target.listing!.id);

    const after = await new SupabaseWishlistRepository(a.client).matchDetailsForMe();
    const stale = after.find((d) => d.listing?.id === target.listing!.id);
    // The match persists in the outbox but is cleanly flagged not-available.
    expect(stale?.available ?? false).toBe(false);
  });

  it("cancelling a wishlist item removes it from my list", async () => {
    const repo = new SupabaseWishlistRepository(a.client);
    await repo.remove(wishId);
    expect((await repo.listMine()).some((w) => w.id === wishId)).toBe(false);
  });
});
