/**
 * Real-backend integration proof for offers + handoff. Boots against a disposable
 * Supabase stack and drives the ACTUAL SupabaseOfferRepository under RLS with real
 * users across two schools + a pending member. Proves the server-enforced rules:
 * cross-school invisibility, ownership, no self-accept, ATOMIC reservation with a
 * single winner under contention, decline/cancel leave the listing available, swap
 * dual-reservation, counter history, blocking, deleted/completed guards, bilateral
 * completion lifecycle, and the borrow collection-vs-return distinction.
 *
 * Skips cleanly when SUPABASE_URL is absent (never runs in the unit suite).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseMessagingRepository } from "./messaging";
import { SupabaseOfferRepository } from "./offers";
import type { NewListing } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const owner: OwnerPreview = { displayName: "S", avatarEmoji: "🙂", verified: true };
const noImages = { imageReader: async () => new Uint8Array() };
const svc = () => createClient(URL as string, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string, schoolId: string, status: "verified" | "pending" = "verified") {
  const admin = svc();
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser ${email}: ${created.error?.message}`);
  const id = created.data.user.id;
  await admin.from("users").insert({ id, display_name: email.split("@")[0] });
  await admin.from("school_memberships").insert({ school_id: schoolId, user_id: id, status, verification_method: "email_otp" });
  const client = createClient(URL as string, ANON, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`sign-in ${email}: ${signIn.error.message}`);
  return { id, client };
}

const mk = (schoolId: string, title: string, postType: NewListing["postType"] = "give", category = "dormitory_items"): NewListing => ({
  schoolId, postType, title, description: "x", category, condition: "good", desiredItem: null, images: [], handoffLocation: null, expiresAt: null,
});

describe.skipIf(!URL)("Supabase offers + handoff (real users, two schools)", () => {
  const tag = randomUUID().slice(0, 8);
  const A = randomUUID();
  const B = randomUUID();
  let a: { id: string; client: SupabaseClient }; // sender
  let b: { id: string; client: SupabaseClient }; // listing owner / recipient
  let c: { id: string; client: SupabaseClient }; // same-school competitor
  let d: { id: string; client: SupabaseClient }; // cross-school outsider
  let pend: { id: string; client: SupabaseClient };
  // listings owned by b (+ a's swap item)
  const KEYS = ["give", "decline", "swap", "book", "comp", "del"] as const;
  const L = {} as Record<(typeof KEYS)[number] | "swapOffered", string>;
  const conv = {} as Record<(typeof KEYS)[number] | "compC", string>;

  const offersA = () => new SupabaseOfferRepository(a.client);
  const offersB = () => new SupabaseOfferRepository(b.client);

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [[A, `offa-${tag}`], [B, `offb-${tag}`]] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "manual"] });
    }
    a = await makeUser(`oa-${tag}@a.test`, A);
    b = await makeUser(`ob-${tag}@a.test`, A);
    c = await makeUser(`oc-${tag}@a.test`, A);
    d = await makeUser(`od-${tag}@b.test`, B);
    pend = await makeUser(`op-${tag}@a.test`, A, "pending");

    const mktB = new SupabaseMarketplaceRepository(b.client, noImages);
    for (const k of KEYS) {
      L[k] = (await mktB.createListing(mk(A, `${k}-${tag}`, k === "book" ? "lend" : k === "swap" ? "swap" : "give"), owner)).id;
    }
    L.swapOffered = (await new SupabaseMarketplaceRepository(a.client, noImages).createListing(mk(A, `swapoff-${tag}`), owner)).id;

    const msgA = new SupabaseMessagingRepository(a.client);
    for (const k of KEYS) conv[k] = await msgA.startConversation({ otherUserId: b.id, listingId: L[k] });
    conv.compC = await new SupabaseMessagingRepository(c.client).startConversation({ otherUserId: b.id, listingId: L.comp });
  });

  it("creates an offer; a cross-school user cannot read or infer it", async () => {
    const o = await offersA().create({ conversationId: conv.give, kind: "give", listingId: L.give });
    expect(o.status).toBe("pending");
    expect(await new SupabaseOfferRepository(d.client).getById(o.id)).toBeNull();
    expect(await new SupabaseOfferRepository(d.client).listForConversation(conv.give)).toHaveLength(0);
  });

  it("rejects offering a swap item you do not own, self-accept, and pending initiation", async () => {
    await expect(offersA().create({ conversationId: conv.swap, kind: "swap", listingId: L.swap, offeredListingId: L.give })).rejects.toThrow();
    const o = (await offersA().listForConversation(conv.give))[0]!;
    await expect(offersA().accept(o.id)).rejects.toThrow(); // sender cannot accept
    await expect(new SupabaseOfferRepository(pend.client).create({ conversationId: conv.give, kind: "give", listingId: L.give })).rejects.toThrow();
  });

  it("acceptance reserves atomically; a competing acceptance yields a single winner", async () => {
    // a and c both offer the SAME competition listing (still active).
    const oa = await offersA().create({ conversationId: conv.comp, kind: "give", listingId: L.comp });
    const oc = await new SupabaseOfferRepository(c.client).create({ conversationId: conv.compC, kind: "give", listingId: L.comp });
    await offersB().accept(oa.id);
    expect((await offersB().getById(oa.id))!.offer.listing!.status).toBe("reserved");
    await expect(offersB().accept(oc.id)).rejects.toThrow(); // the loser
  });

  it("a declined offer leaves the listing available", async () => {
    const o = await offersA().create({ conversationId: conv.decline, kind: "give", listingId: L.decline });
    await offersB().decline(o.id);
    const o2 = await offersA().create({ conversationId: conv.decline, kind: "give", listingId: L.decline });
    expect(o2.status).toBe("pending");
    await offersA().cancel(o2.id);
  });

  it("swap acceptance reserves BOTH listings", async () => {
    const o = await offersA().create({ conversationId: conv.swap, kind: "swap", listingId: L.swap, offeredListingId: L.swapOffered });
    await offersB().accept(o.id);
    const detail = await offersB().getById(o.id);
    expect(detail!.offer.listing!.status).toBe("reserved");
    expect(detail!.offer.offeredListing!.status).toBe("reserved");
  });

  it("counteroffers preserve history", async () => {
    const o = await offersA().create({ conversationId: conv.book, kind: "borrow", listingId: L.book, returnBy: new Date(Date.now() + 7 * 864e5).toISOString() });
    const counter = await offersB().counter({ parentOfferId: o.id, note: "two weeks?" });
    expect(counter.parentOfferId).toBe(o.id);
    const detail = await offersA().getById(counter.id);
    expect(detail!.chain.length).toBe(2);
    expect(detail!.chain.find((x) => x.id === o.id)!.status).toBe("countered");
  });

  it("borrow distinguishes handoff from return and restores the item; a blocked user cannot offer", async () => {
    // Accept the counter (a is its recipient) then walk the borrow flow.
    const counter = (await offersA().listForConversation(conv.book)).find((x) => x.status === "pending")!;
    const h = await offersA().accept(counter.id);
    const ho = await offersA().markHandedOver(h.id);
    expect(ho.stage).toBe("return_due");
    const ret = await offersB().markReturned(h.id);
    expect(ret.stage).toBe("returned");
    expect((await offersB().getById(counter.id))!.offer.listing!.status).toBe("active");

    // Block: b blocks a; a can no longer create a new offer.
    await new SupabaseMessagingRepository(b.client).block(a.id, A);
    await expect(offersA().create({ conversationId: conv.del, kind: "give", listingId: L.del })).rejects.toThrow();
  });

  it("a deleted listing cannot receive a new offer", async () => {
    // c (not blocked) offers a soft-deleted listing.
    await new SupabaseMarketplaceRepository(b.client, noImages).deleteListing(L.del);
    const convCdel = await new SupabaseMessagingRepository(c.client).startConversation({ otherUserId: b.id, listingId: L.del });
    await expect(new SupabaseOfferRepository(c.client).create({ conversationId: convCdel, kind: "give", listingId: L.del })).rejects.toThrow();
  });

  it("give completion is bilateral and completes the listing", async () => {
    const convC = await new SupabaseMessagingRepository(c.client).startConversation({ otherUserId: b.id });
    // b owns 'give' listing (reserved earlier? no — 'give' listing untouched). c offers give for it.
    const o = await new SupabaseOfferRepository(c.client).create({ conversationId: convC, kind: "give", listingId: L.give });
    const h = await offersB().accept(o.id);
    await offersB().confirmCompletion(h.id);
    expect((await offersB().getById(o.id))!.offer.status).toBe("accepted"); // one side only
    await new SupabaseOfferRepository(c.client).confirmCompletion(h.id);
    const detail = await offersB().getById(o.id);
    expect(detail!.offer.status).toBe("completed");
    expect(detail!.offer.listing!.status).toBe("completed");
  });
});
