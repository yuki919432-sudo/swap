/**
 * Real-backend integration proof for messaging. Boots against a disposable
 * Supabase stack and drives the ACTUAL SupabaseMessagingRepository under RLS with
 * multiple real users — two in the same school, one in another, plus a pending
 * member:
 *
 *   - two verified same-school users start a conversation (via start_conversation),
 *   - starting again for the same pair + context is de-duplicated,
 *   - a same-school NON-participant and a cross-school user cannot read/infer it,
 *   - a pending member cannot start a conversation,
 *   - the conversation survives a listing soft-delete (context marked unavailable),
 *   - unread state is per-user and clears on read,
 *   - a block prevents further sends.
 *
 * Skips cleanly when SUPABASE_URL is absent (never runs in the unit suite).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseMessagingRepository } from "./messaging";
import type { NewListing } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const owner: OwnerPreview = { displayName: "S", avatarEmoji: "🙂", verified: true };
const noImages = { imageReader: async () => new Uint8Array() };

const svc = () => createClient(URL as string, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string, schoolId: string, status: "verified" | "pending" = "verified"): Promise<{ id: string; client: SupabaseClient }> {
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

describe.skipIf(!URL)("Supabase messaging (real users, two schools + a pending member)", () => {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  let a: { id: string; client: SupabaseClient }; // A verified (initiator)
  let b: { id: string; client: SupabaseClient }; // A verified (recipient, listing owner)
  let d: { id: string; client: SupabaseClient }; // A verified non-participant
  let pend: { id: string; client: SupabaseClient }; // A pending
  let c: { id: string; client: SupabaseClient }; // B verified (outsider)
  let convId = "";
  let listingId = "";

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [
      [schoolA, `msga-${tag}`],
      [schoolB, `msgb-${tag}`],
    ] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "manual"] });
    }
    a = await makeUser(`ma-${tag}@a.test`, schoolA);
    b = await makeUser(`mb-${tag}@a.test`, schoolA);
    d = await makeUser(`md-${tag}@a.test`, schoolA);
    pend = await makeUser(`mp-${tag}@a.test`, schoolA, "pending");
    c = await makeUser(`mc-${tag}@b.test`, schoolB);
    // B owns a listing that A will message about.
    const listing = await new SupabaseMarketplaceRepository(b.client, noImages).createListing(bListing(schoolA, tag), owner);
    listingId = listing.id;
  });

  it("two same-school users start a conversation about a listing; a repeat is de-duplicated", async () => {
    const repoA = new SupabaseMessagingRepository(a.client);
    convId = await repoA.startConversation({ otherUserId: b.id, listingId });
    expect(convId).toBeTruthy();
    const again = await repoA.startConversation({ otherUserId: b.id, listingId });
    expect(again).toBe(convId);
  });

  it("the participants can read it; a non-participant and a cross-school user cannot", async () => {
    await new SupabaseMessagingRepository(a.client).sendMessage(convId, `Hi, is the lamp free? ${tag}`);
    expect(await new SupabaseMessagingRepository(b.client).getConversation(convId)).not.toBeNull();
    // Same-school non-participant: RLS hides it entirely.
    expect(await new SupabaseMessagingRepository(d.client).getConversation(convId)).toBeNull();
    // Cross-school user: cannot read or infer.
    expect(await new SupabaseMessagingRepository(c.client).getConversation(convId)).toBeNull();
    expect(await new SupabaseMessagingRepository(c.client).listConversations(schoolA)).toHaveLength(0);
  });

  it("a pending member cannot start a conversation", async () => {
    await expect(new SupabaseMessagingRepository(pend.client).startConversation({ otherUserId: a.id })).rejects.toThrow();
  });

  it("the conversation survives a listing soft-delete and marks the context unavailable", async () => {
    await new SupabaseMarketplaceRepository(b.client, noImages).deleteListing(listingId);
    const detail = await new SupabaseMessagingRepository(a.client).getConversation(convId);
    expect(detail).not.toBeNull();
    expect(detail!.conversation.context.unavailable).toBe(true);
    expect(detail!.messages.length).toBeGreaterThan(0);
  });

  it("unread state is per-user and clears on read", async () => {
    // B has A's message unread.
    const repoB = new SupabaseMessagingRepository(b.client);
    expect(await repoB.unreadTotal()).toBeGreaterThan(0);
    // B replies, then reads → B has nothing unread ...
    await repoB.sendMessage(convId, `It's free ${tag}`);
    await repoB.markRead(convId);
    expect(await repoB.unreadTotal()).toBe(0);
    // ... but A now has B's reply unread (per-user state).
    expect(await new SupabaseMessagingRepository(a.client).unreadTotal()).toBeGreaterThan(0);
  });

  it("a block prevents further sends", async () => {
    await new SupabaseMessagingRepository(a.client).block(b.id, schoolA);
    await expect(new SupabaseMessagingRepository(b.client).sendMessage(convId, "still there?")).rejects.toThrow();
  });
});
