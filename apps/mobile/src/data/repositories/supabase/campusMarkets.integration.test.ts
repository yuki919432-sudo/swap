/**
 * Real-backend integration proof for Campus Markets: student stalls, temporary
 * markets, seller participation, and listing↔market associations. Boots against a
 * disposable Supabase stack and drives the ACTUAL Supabase repositories under RLS
 * with THREE real users — two in the same school, one in another:
 *
 *   - two same-school students each open a stall; the cross-school student sees
 *     neither (RLS school isolation),
 *   - a verified student creates a market (policy = verified_students default),
 *   - a same-school student joins as a seller and adds a listing THEY own,
 *   - the listing lives in two markets at once; removing it from one keeps the
 *     other association AND the listing itself,
 *   - cancelling a market deletes neither its associations nor its listings,
 *   - the cross-school student cannot see the markets, participants, or
 *     associations at all.
 *
 * Skips cleanly when SUPABASE_URL is absent (never runs in the unit suite).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseStallRepository } from "./stall";
import { SupabaseMarketRepository } from "./market";
import type { NewListing, NewMarket } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const owner: OwnerPreview = { displayName: "S", avatarEmoji: "🙂", verified: true };
const noImages = { imageReader: async () => new Uint8Array() };

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

const newMarket = (schoolId: string, title: string): NewMarket => ({
  schoolId,
  title,
  description: "Test market",
  hostLabel: null,
  coverImage: null,
  startsAt: null,
  endsAt: null,
  location: null,
  handoffInstructions: null,
  allowedCategories: ["dormitory_items"],
  allowsRegulated: false,
  status: "active",
});

const bListing = (schoolId: string, tag: string): NewListing => ({
  schoolId,
  postType: "give",
  title: `Desk lamp ${tag}`,
  description: "Works great",
  category: "dormitory_items",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: null,
  expiresAt: null,
});

describe.skipIf(!URL)("Supabase campus markets (three real users, two schools)", () => {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  let a: { id: string; client: SupabaseClient }; // School A host
  let b: { id: string; client: SupabaseClient }; // School A seller
  let c: { id: string; client: SupabaseClient }; // School B outsider
  let market1 = "";
  let market2 = "";
  let listingId = "";

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [
      [schoolA, `cma-${tag}`],
      [schoolB, `cmb-${tag}`],
    ] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "manual"] });
    }
    a = await makeUser(`cma-${tag}@a.test`, schoolA);
    b = await makeUser(`cmb-${tag}@a.test`, schoolA);
    c = await makeUser(`cmc-${tag}@b.test`, schoolB);
  });

  it("two same-school students open stalls; a cross-school student sees neither", async () => {
    await new SupabaseStallRepository(a.client).open(schoolA, "A's stall");
    await new SupabaseStallRepository(b.client).open(schoolA, "B's stall");

    const seenByB = await new SupabaseStallRepository(b.client).listForSchool(schoolA);
    expect(seenByB.length).toBeGreaterThanOrEqual(2);

    const seenByC = await new SupabaseStallRepository(c.client).listForSchool(schoolA);
    expect(seenByC).toHaveLength(0);
  });

  it("a verified student creates two markets (policy = verified_students)", async () => {
    const repo = new SupabaseMarketRepository(a.client);
    const m1 = await repo.create(newMarket(schoolA, `Move-Out ${tag}`), owner);
    const m2 = await repo.create(newMarket(schoolA, `Sneaker Swap ${tag}`), owner);
    market1 = m1.id;
    market2 = m2.id;
    expect(m1.hostUserId).toBe(a.id);
    const listed = await repo.listForSchool(schoolA);
    expect(listed.some((m) => m.id === market1)).toBe(true);
    expect(listed.some((m) => m.id === market2)).toBe(true);
  });

  it("a same-school student joins as a seller and adds a listing they own", async () => {
    // B posts their own listing, then joins market1 and adds it.
    const listing = await new SupabaseMarketplaceRepository(b.client, noImages).createListing(bListing(schoolA, tag), owner);
    listingId = listing.id;
    const repoB = new SupabaseMarketRepository(b.client);
    await repoB.join(market1);
    await repoB.addListing(market1, listingId);

    const detail = await repoB.getById(market1);
    expect(detail!.amSeller).toBe(true);
    expect(detail!.listings.some((l) => l.id === listingId)).toBe(true);
  });

  it("the same listing can belong to two markets; removing from one keeps the other + the listing", async () => {
    const repoB = new SupabaseMarketRepository(b.client);
    await repoB.addListing(market2, listingId);
    expect((await repoB.getById(market1))!.listings.some((l) => l.id === listingId)).toBe(true);
    expect((await repoB.getById(market2))!.listings.some((l) => l.id === listingId)).toBe(true);

    await repoB.removeListing(market1, listingId);
    expect((await repoB.getById(market1))!.listings.some((l) => l.id === listingId)).toBe(false);
    expect((await repoB.getById(market2))!.listings.some((l) => l.id === listingId)).toBe(true);
    // The listing itself still exists.
    expect(await new SupabaseMarketplaceRepository(b.client, noImages).getById(listingId)).not.toBeNull();
  });

  it("cancelling a market deletes neither its listing associations nor its listings", async () => {
    const repoA = new SupabaseMarketRepository(a.client);
    await repoA.setStatus(market2, "cancelled");
    const detail = await repoA.getById(market2);
    expect(detail!.market.status).toBe("cancelled");
    expect(detail!.listings.some((l) => l.id === listingId)).toBe(true);
    expect(await new SupabaseMarketplaceRepository(b.client, noImages).getById(listingId)).not.toBeNull();
  });

  it("a cross-school student cannot see the markets, participants, or associations", async () => {
    const repoC = new SupabaseMarketRepository(c.client);
    const listed = await repoC.listForSchool(schoolA);
    expect(listed).toHaveLength(0);
    // Direct fetch of a School A market returns nothing under C's session.
    expect(await repoC.getById(market1)).toBeNull();
  });
});
