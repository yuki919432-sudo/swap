/**
 * Two-user, real-backend integration test — the acceptance proof for this
 * checkpoint. It boots against a DISPOSABLE local Supabase stack (`supabase
 * start`) and exercises the ACTUAL Supabase-backed repository classes over the
 * real PostgREST + Auth + Storage services under Row-Level Security.
 *
 * Success criterion: two real users who belong to the same school can create
 * listings, upload images, browse listings, search, save listings, and view each
 * other's items using the real backend — while a user from another school is
 * isolated by RLS.
 *
 * Env (from `supabase status`): SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips cleanly when SUPABASE_URL is absent, so it
 * never runs in the plain unit suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseSavedListingsRepository } from "./saved";
import { SupabaseSessionRepository } from "./session";
import type { NewListing } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";

// A tiny stand-in JPEG payload (Storage checks the content-type header, not deep
// structure). Injected so the repo's image upload runs without a device.
const imageReader = async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

const svc = () => createClient(URL as string, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string, schoolId: string): Promise<{ id: string; client: SupabaseClient }> {
  const admin = svc();
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser ${email}: ${created.error?.message}`);
  const id = created.data.user.id;
  const p = await admin.from("users").insert({ id, display_name: email.split("@")[0] });
  if (p.error) throw new Error(`profile ${email}: ${p.error.message}`);
  const m = await admin.from("school_memberships").insert({ school_id: schoolId, user_id: id, status: "verified", verification_method: "email_otp" });
  if (m.error) throw new Error(`membership ${email}: ${m.error.message}`);
  const userClient = createClient(URL as string, ANON, { auth: { persistSession: false } });
  const signIn = await userClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`sign-in ${email}: ${signIn.error.message}`);
  return { id, client: userClient };
}

const owner = (name: string): OwnerPreview => ({ displayName: name, avatarEmoji: "🌸", verified: true });

describe.skipIf(!URL)("Supabase marketplace — two real users, same school", () => {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  let a1: { id: string; client: SupabaseClient };
  let a2: { id: string; client: SupabaseClient };
  let b1: { id: string; client: SupabaseClient };
  let createdId = "";

  const give: NewListing = {
    schoolId: schoolA,
    postType: "give",
    title: `Vintage desk lamp ${tag}`,
    description: "A warm little desk lamp, works great. Free to a good home.",
    category: "furniture",
    condition: "good",
    desiredItem: null,
    images: [{ kind: "local", value: "test://lamp.jpg" }],
    handoffLocation: "Library",
    expiresAt: null,
  };

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [
      [schoolA, `a-${tag}`],
      [schoolB, `b-${tag}`],
    ] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "invite_code", "manual"] });
    }
    a1 = await makeUser(`a1-${tag}@a.test`, schoolA);
    a2 = await makeUser(`a2-${tag}@a.test`, schoolA);
    b1 = await makeUser(`b1-${tag}@b.test`, schoolB);
  });

  it("user A1 creates a listing and uploads an image (real backend + Storage)", async () => {
    const repo = new SupabaseMarketplaceRepository(a1.client, { imageReader });
    const listing = await repo.createListing(give, owner("A1"));
    createdId = listing.id;
    expect(listing.id).toBeTruthy();
    expect(listing.title).toContain(tag);
    // The uploaded object exists in Storage under {school}/{listing}/0.jpg.
    const objects = await svc().storage.from("listing-images").list(`${schoolA}/${listing.id}`);
    expect((objects.data ?? []).some((o) => o.name === "0.jpg")).toBe(true);
  });

  it("user A1 sees their own listing with a signed image URL", async () => {
    const repo = new SupabaseMarketplaceRepository(a1.client, { imageReader });
    const got = await repo.getById(createdId);
    expect(got?.id).toBe(createdId);
    expect(got?.images.length).toBeGreaterThanOrEqual(1);
    expect(got?.images[0]?.value).toMatch(/^https?:\/\//);
  });

  it("user A2 (same school) can browse, search, and filter A1's listing", async () => {
    const repo = new SupabaseMarketplaceRepository(a2.client, { imageReader });
    const feed = await repo.list({ schoolId: schoolA });
    expect(feed.some((l) => l.id === createdId)).toBe(true);

    const searched = await repo.list({ schoolId: schoolA, search: tag });
    expect(searched.some((l) => l.id === createdId)).toBe(true);

    const give = await repo.list({ schoolId: schoolA, postTypes: ["give"], categories: ["furniture"] });
    expect(give.some((l) => l.id === createdId)).toBe(true);
    const swaps = await repo.list({ schoolId: schoolA, postTypes: ["swap"] });
    expect(swaps.some((l) => l.id === createdId)).toBe(false);
  });

  it("user A2 can save and unsave A1's listing (persisted, user-scoped)", async () => {
    const saved = new SupabaseSavedListingsRepository(a2.client);
    expect(await saved.toggle(createdId)).toBe(true);
    expect(await saved.isSaved(createdId)).toBe(true);
    expect(await saved.list()).toContain(createdId);
    expect(await saved.toggle(createdId)).toBe(false);
    expect(await saved.isSaved(createdId)).toBe(false);
  });

  it("a user from another school is isolated by RLS", async () => {
    const repo = new SupabaseMarketplaceRepository(b1.client, { imageReader });
    const feed = await repo.list({ schoolId: schoolB });
    expect(feed.some((l) => l.id === createdId)).toBe(false);
    // Cannot even fetch the School A listing by id.
    expect(await repo.getById(createdId)).toBeNull();
  });

  it("the session repository resolves the real user's school + verified membership", async () => {
    const session = await new SupabaseSessionRepository(a1.client).getCurrent();
    expect(session?.school.id).toBe(schoolA);
    expect(session?.profile.membershipStatus).toBe("verified");
    expect(session?.profile.id).toBe(a1.id);
  });

  it("soft-deleting a listing removes it from the feed", async () => {
    await new SupabaseMarketplaceRepository(a1.client, { imageReader }).deleteListing(createdId);
    const repo = new SupabaseMarketplaceRepository(a2.client, { imageReader });
    expect(await repo.getById(createdId)).toBeNull();
    const feed = await repo.list({ schoolId: schoolA });
    expect(feed.some((l) => l.id === createdId)).toBe(false);
  });
});
