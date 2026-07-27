import { describe, it, expect } from "vitest";
import { DeterministicRecommendationEngine } from "./engine";
import { NoopWishlistNotifier, pendingWishlistNotifications } from "./notifier";
import type { Listing, WishlistItem, WishlistMatch } from "../domain/models";

const engine = new DeterministicRecommendationEngine();

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const L = (over: Partial<Listing>): Listing => ({
  id: over.id ?? "l",
  schoolId: "s1",
  postType: "give",
  status: "active",
  title: "Item",
  description: "",
  category: "textbooks",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: null,
  owner: { displayName: "A", avatarEmoji: "🙂", verified: true },
  createdAt: days(1),
  expiresAt: null,
  demoLocal: false,
  ...over,
});
const wish = (over: Partial<WishlistItem>): WishlistItem => ({
  id: "w1",
  schoolId: "s1",
  userId: "me",
  title: "Looking for a mini fridge",
  description: null,
  preferredCategory: "dormitory_items",
  preferredCondition: null,
  budgetCents: null,
  swapAcceptable: true,
  urgency: "normal",
  visibility: "school",
  status: "active",
  createdAt: days(1),
  ...over,
});

describe("DeterministicRecommendationEngine.buildShelves", () => {
  const listings = [
    L({ id: "fridge", title: "Mini fridge", category: "dormitory_items", createdAt: days(0) }),
    L({ id: "calc", title: "Graphing calculator", category: "electronics", createdAt: days(1) }),
    L({ id: "book", title: "Chemistry textbook", category: "textbooks", createdAt: days(2) }),
    L({ id: "old", title: "Vintage lamp", category: "furniture", createdAt: days(30) }),
  ];

  it("surfaces a wishlist-match shelf for a matching listing", () => {
    const shelves = engine.buildShelves({
      currentUserId: "me",
      schoolId: "s1",
      listings,
      wishlist: [wish({})],
      savedIds: [],
      browsedCategories: [],
    });
    const wl = shelves.find((s) => s.kind === "wishlist_match");
    expect(wl).toBeTruthy();
    expect(wl!.listings.map((l) => l.id)).toContain("fridge");
  });

  it("builds a 'because you liked' shelf from a saved listing", () => {
    const shelves = engine.buildShelves({
      currentUserId: "me",
      schoolId: "s1",
      listings: [...listings, L({ id: "fridge2", title: "Compact mini fridge", category: "dormitory_items" })],
      wishlist: [],
      savedIds: ["fridge"],
      browsedCategories: [],
    });
    const liked = shelves.find((s) => s.kind === "because_you_liked");
    expect(liked).toBeTruthy();
    expect(liked!.listings.map((l) => l.id)).toContain("fridge2");
    expect(liked!.listings.map((l) => l.id)).not.toContain("fridge"); // excludes the saved seed
  });

  it("builds a 'new in categories you browse' shelf", () => {
    const shelves = engine.buildShelves({
      currentUserId: "me",
      schoolId: "s1",
      listings,
      wishlist: [],
      savedIds: [],
      browsedCategories: ["electronics"],
    });
    const nc = shelves.find((s) => s.kind === "new_in_categories");
    expect(nc?.listings.map((l) => l.id)).toEqual(["calc"]);
  });

  it("always offers popular + trending shelves and a recommended blend", () => {
    const shelves = engine.buildShelves({
      currentUserId: "me",
      schoolId: "s1",
      listings,
      wishlist: [wish({})],
      savedIds: [],
      browsedCategories: ["electronics"],
      popularityById: { calc: 50 },
    });
    const kinds = shelves.map((s) => s.kind);
    expect(kinds).toContain("popular");
    expect(kinds).toContain("trending");
    expect(kinds[0]).toBe("recommended"); // blended shelf is surfaced first
    const popular = shelves.find((s) => s.kind === "popular")!;
    expect(popular.listings[0]?.id).toBe("calc"); // popularity signal wins
  });

  it("is deterministic (same input → same output)", () => {
    const input = { currentUserId: "me", schoolId: "s1", listings, wishlist: [wish({})], savedIds: [], browsedCategories: [] };
    expect(JSON.stringify(engine.buildShelves(input))).toBe(JSON.stringify(engine.buildShelves(input)));
  });
});

describe("similarTo", () => {
  it("returns similar listings, excluding the seed", () => {
    const seed = L({ id: "seed", title: "Mini fridge", category: "dormitory_items" });
    const pool = [seed, L({ id: "near", title: "Mini fridge compact", category: "dormitory_items" }), L({ id: "far", title: "Chemistry textbook", category: "textbooks" })];
    const sim = engine.similarTo(seed, pool);
    expect(sim.map((l) => l.id)).toContain("near");
    expect(sim.map((l) => l.id)).not.toContain("seed");
  });
});

describe("NoopWishlistNotifier", () => {
  it("collects only un-notified matches and never sends", async () => {
    const n = new NoopWishlistNotifier();
    const matches: WishlistMatch[] = [
      { wishlistItemId: "w", listingId: "a", score: 0.5, createdAt: days(0), notified: false },
      { wishlistItemId: "w", listingId: "b", score: 0.4, createdAt: days(0), notified: true },
    ];
    await n.notify(matches);
    expect(n.delivered.map((m) => m.listingId)).toEqual(["a"]);
    expect(pendingWishlistNotifications(matches).map((m) => m.listingId)).toEqual(["a"]);
  });
});
