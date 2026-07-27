import { describe, it, expect } from "vitest";
import { buildDiscoveryShelves, buildDemandClusters } from "./campusDiscovery";
import type { Listing, WishlistItem } from "../../domain/models";

const now = Date.parse("2026-02-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

const listing = (over: Partial<Listing> & { id: string }): Listing => ({
  schoolId: "s1",
  ownerId: "owner1",
  postType: "give",
  status: "active",
  title: "Item",
  description: "",
  category: "other",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: null,
  owner: { displayName: "A", avatarEmoji: "🙂", verified: true },
  createdAt: hoursAgo(2),
  expiresAt: null,
  demoLocal: false,
  ...over,
});

const wish = (over: Partial<WishlistItem> & { id: string; userId: string }): WishlistItem => ({
  schoolId: "s1",
  title: "Looking for a mini fridge",
  description: null,
  preferredCategory: "dormitory_items",
  preferredCondition: null,
  budgetCents: null,
  swapAcceptable: true,
  urgency: "normal",
  visibility: "school",
  status: "active",
  showOnStall: false,
  createdAt: hoursAgo(4),
  ...over,
});

describe("buildDiscoveryShelves", () => {
  const listings = [
    listing({ id: "a", category: "textbooks", createdAt: hoursAgo(1) }),
    listing({ id: "b", category: "dormitory_items", postType: "give", createdAt: hoursAgo(3) }),
    listing({ id: "c", category: "shoes", postType: "swap", createdAt: hoursAgo(40) }),
    listing({ id: "d", category: "clothing", expiresAt: new Date(now + 3600_000).toISOString(), createdAt: hoursAgo(50) }),
  ];

  it("produces the expected shelves labelled by deterministic signal (no popularity)", () => {
    const shelves = buildDiscoveryShelves({ schoolId: "s1", listings, myWishlist: [], now });
    const keys = shelves.map((s) => s.key);
    expect(keys).toContain("new_today");
    expect(keys).toContain("free");
    expect(keys).toContain("trending");
    expect(keys).toContain("textbooks");
    expect(keys).toContain("dorm");
    expect(keys).toContain("fashion");
    expect(keys).toContain("ending_soon");
    // Every shelf carries a supported signal, never an invented count.
    for (const s of shelves) expect(["recency", "wishlist", "demand", "category", "free", "ending", "stalls"]).toContain(s.signal);
    // "Trending" is honest recency (newest first), not a view/popularity metric.
    const trending = shelves.find((s) => s.key === "trending")!;
    expect(trending.signal).toBe("recency");
    expect(trending.listings[0]!.id).toBe("a");
  });

  it("New Today only includes listings from the last 24h", () => {
    const shelf = buildDiscoveryShelves({ schoolId: "s1", listings, myWishlist: [], now }).find((s) => s.key === "new_today")!;
    expect(shelf.listings.map((l) => l.id).sort()).toEqual(["a", "b"]);
  });

  it("Matches Your Wishlist appears only with an active wishlist and only matching items", () => {
    const withWish = buildDiscoveryShelves({
      schoolId: "s1",
      listings,
      myWishlist: [wish({ id: "w1", userId: "u1", title: "dorm fridge", preferredCategory: "dormitory_items" })],
      now,
    });
    const shelf = withWish.find((s) => s.key === "wishlist");
    expect(shelf).toBeDefined();
    expect(shelf!.signal).toBe("wishlist");
    expect(shelf!.listings.some((l) => l.id === "b")).toBe(true);

    const noWish = buildDiscoveryShelves({ schoolId: "s1", listings, myWishlist: [], now });
    expect(noWish.find((s) => s.key === "wishlist")).toBeUndefined();
  });

  it("drops empty shelves", () => {
    const shelves = buildDiscoveryShelves({ schoolId: "s1", listings: [], myWishlist: [], now });
    expect(shelves).toEqual([]);
  });
});

describe("buildDemandClusters (privacy-safe)", () => {
  it("clusters by category/normalized title and counts DISTINCT students only", () => {
    const wishlist = [
      wish({ id: "1", userId: "u1", preferredCategory: "dormitory_items" }),
      wish({ id: "2", userId: "u2", preferredCategory: "dormitory_items" }),
      // Same student twice in the same cluster counts once.
      wish({ id: "3", userId: "u2", preferredCategory: "dormitory_items" }),
      wish({ id: "4", userId: "u3", preferredCategory: "textbooks", title: "calc book" }),
    ];
    const clusters = buildDemandClusters(wishlist);
    const dorm = clusters.find((c) => c.category === "dormitory_items")!;
    expect(dorm.studentCount).toBe(2); // u1 + u2, not 3
    const books = clusters.find((c) => c.category === "textbooks")!;
    expect(books.studentCount).toBe(1);
    // Sorted by demand desc.
    expect(clusters[0]!.studentCount).toBeGreaterThanOrEqual(clusters[clusters.length - 1]!.studentCount);
  });

  it("exposes no user ids or titles that reveal who wants what", () => {
    const clusters = buildDemandClusters([wish({ id: "1", userId: "secret-user", preferredCategory: "shoes" })]);
    const json = JSON.stringify(clusters);
    expect(json).not.toContain("secret-user");
    // A category cluster is labelled by the category, not the raw request text.
    expect(clusters[0]!.label).toBe("Shoes");
  });

  it("ignores non-active wishlist items", () => {
    const clusters = buildDemandClusters([wish({ id: "1", userId: "u1", status: "fulfilled", preferredCategory: "shoes" })]);
    expect(clusters).toEqual([]);
  });
});
