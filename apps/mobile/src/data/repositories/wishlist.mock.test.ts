import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";
import { demoSchools, demoProfiles } from "../demo";
import type { NewWishlistItem } from "./types";

const uni = demoSchools.find((s) => s.institutionType === "university")!;
const profile = demoProfiles.find((p) => p.schoolId === uni.id)!;

const newWish = (over: Partial<NewWishlistItem> = {}): NewWishlistItem => ({
  schoolId: uni.id,
  title: "Looking for a mini fridge",
  description: null,
  preferredCategory: "dormitory_items",
  preferredCondition: null,
  budgetCents: null,
  swapAcceptable: true,
  urgency: "high",
  visibility: "school",
  ...over,
});

async function selectProfile(kv: KeyValueStore) {
  // Mock wishlist resolves the owner from the selected demo profile.
  await new JsonStore(kv).write(StorageKeys.selectedProfile, profile.id);
}

describe("MockWishlistRepository", () => {
  let kv: KeyValueStore;
  beforeEach(async () => {
    kv = new InMemoryKeyValueStore();
    await selectProfile(kv);
  });

  it("creates, lists, and persists my wishlist", async () => {
    const repos = createMockRepositories(kv);
    const created = await repos.wishlist.create(newWish());
    expect(created.userId).toBe(profile.id);
    expect(created.status).toBe("active");
    const mine = await createMockRepositories(kv).wishlist.listMine();
    expect(mine.map((w) => w.id)).toContain(created.id);
  });

  it("lists school wishes (mine + synthetic others) for the school", async () => {
    const repos = createMockRepositories(kv);
    await repos.wishlist.create(newWish({ title: "Looking for a desk lamp", preferredCategory: "furniture" }));
    const all = await repos.wishlist.listForSchool(uni.id);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((w) => w.schoolId === uni.id)).toBe(true);
  });

  it("updates status and soft-removes", async () => {
    const repos = createMockRepositories(kv);
    const created = await repos.wishlist.create(newWish());
    await repos.wishlist.updateStatus(created.id, "fulfilled");
    expect((await repos.wishlist.listMine()).find((w) => w.id === created.id)?.status).toBe("fulfilled");
    await repos.wishlist.remove(created.id);
    expect((await repos.wishlist.listMine()).find((w) => w.id === created.id)).toBeUndefined();
  });

  it("matches my wishlist to a published demo listing", async () => {
    const repos = createMockRepositories(kv);
    await repos.wishlist.create(newWish({ title: "Looking for a mini fridge", preferredCategory: "dormitory_items" }));
    // Publish a matching listing into the demo feed.
    await repos.marketplace.createListing(
      {
        schoolId: uni.id,
        postType: "give",
        title: "Mini fridge",
        description: "Works great",
        category: "dormitory_items",
        condition: "good",
        desiredItem: null,
        images: [],
        handoffLocation: null,
        expiresAt: null,
      },
      { displayName: "Other", avatarEmoji: "🙂", verified: true },
    );
    const matches = await repos.wishlist.matchesForMe();
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(0.25);
    expect(matches[0]?.notified).toBe(false);
  });

  it("edits an existing request", async () => {
    const repos = createMockRepositories(kv);
    const created = await repos.wishlist.create(newWish({ title: "Looking for a lamp", urgency: "low" }));
    const updated = await repos.wishlist.update(created.id, { title: "Looking for a desk lamp", urgency: "high", swapAcceptable: false });
    expect(updated.title).toBe("Looking for a desk lamp");
    expect(updated.urgency).toBe("high");
    expect(updated.swapAcceptable).toBe(false);
    // persisted
    const reread = (await createMockRepositories(kv).wishlist.listMine()).find((w) => w.id === created.id);
    expect(reread?.title).toBe("Looking for a desk lamp");
  });

  it("reopens a fulfilled request", async () => {
    const repos = createMockRepositories(kv);
    const created = await repos.wishlist.create(newWish());
    await repos.wishlist.updateStatus(created.id, "fulfilled");
    await repos.wishlist.updateStatus(created.id, "active"); // reopen
    expect((await repos.wishlist.listMine()).find((w) => w.id === created.id)?.status).toBe("active");
  });

  it("cancelled requests stay listable and can be reopened", async () => {
    const repos = createMockRepositories(kv);
    const created = await repos.wishlist.create(newWish());
    await repos.wishlist.updateStatus(created.id, "cancelled");
    expect((await repos.wishlist.listMine()).some((w) => w.id === created.id)).toBe(true);
    await repos.wishlist.updateStatus(created.id, "active");
    expect((await repos.wishlist.listMine()).find((w) => w.id === created.id)?.status).toBe("active");
  });

  it("matchDetails carry the listing owner (to message) and flag unavailable listings cleanly", async () => {
    // DEVIN lists the matching item; MAYA (the wisher) is a different user.
    await new JsonStore(kv).write(StorageKeys.selectedProfile, "profile-uni-moderator");
    const listing = await createMockRepositories(kv).marketplace.createListing(
      {
        schoolId: uni.id,
        postType: "give",
        title: "Mini fridge",
        description: "Cold and quiet",
        category: "dormitory_items",
        condition: "good",
        desiredItem: null,
        images: [],
        handoffLocation: null,
        expiresAt: null,
      },
      { displayName: "Devin", avatarEmoji: "🧊", verified: true },
    );
    await new JsonStore(kv).write(StorageKeys.selectedProfile, "profile-uni-verified");
    const repos = createMockRepositories(kv);
    await repos.wishlist.create(newWish({ title: "Looking for a mini fridge", preferredCategory: "dormitory_items" }));

    const details = await repos.wishlist.matchDetailsForMe();
    const hit = details.find((d) => d.listing?.id === listing.id)!;
    expect(hit.available).toBe(true);
    expect(hit.listing?.ownerId).toBe("profile-uni-moderator");

    // Messaging the owner from the match yields a conversation.
    const conversationId = await repos.messaging.startConversation({ otherUserId: hit.listing!.ownerId, listingId: hit.listing!.id });
    expect(conversationId).toBeTruthy();

    // If the listing becomes unavailable (e.g. reserved via an accepted offer), the
    // match is still surfaced but flagged not-available — no dead link.
    await new JsonStore(kv).write(StorageKeys.demoListingStatus, { [listing.id]: "reserved" });
    const after = await createMockRepositories(kv).wishlist.matchDetailsForMe();
    const stale = after.find((d) => d.listing?.id === listing.id)!;
    expect(stale.available).toBe(false);
  });

  it("keeps Saved and Wishlist as separate concepts", async () => {
    // DEVIN lists an item; MAYA saves it (a bookmark) AND has a wishlist (a request).
    await new JsonStore(kv).write(StorageKeys.selectedProfile, "profile-uni-moderator");
    const listing = await createMockRepositories(kv).marketplace.createListing(
      {
        schoolId: uni.id,
        postType: "give",
        title: "Desk lamp",
        description: "Bright",
        category: "furniture",
        condition: "good",
        desiredItem: null,
        images: [],
        handoffLocation: null,
        expiresAt: null,
      },
      { displayName: "Devin", avatarEmoji: "💡", verified: true },
    );
    await new JsonStore(kv).write(StorageKeys.selectedProfile, "profile-uni-verified");
    const repos = createMockRepositories(kv);

    const wish = await repos.wishlist.create(newWish({ title: "Looking for a mini fridge" }));
    await repos.saved.toggle(listing.id);

    // Saved is a set of listing ids; wishlist is a set of persistent requests.
    expect(await repos.saved.isSaved(listing.id)).toBe(true);
    expect((await repos.saved.list())).toContain(listing.id);
    expect((await repos.wishlist.listMine()).some((w) => w.id === wish.id)).toBe(true);
    // Bookmarking a listing never creates a wishlist request…
    expect((await repos.wishlist.listMine()).some((w) => w.id === listing.id)).toBe(false);
    // …and a wishlist request is not a saved bookmark.
    expect(await repos.saved.isSaved(wish.id)).toBe(false);
  });
});
