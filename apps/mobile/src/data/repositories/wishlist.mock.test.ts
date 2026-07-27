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
});
