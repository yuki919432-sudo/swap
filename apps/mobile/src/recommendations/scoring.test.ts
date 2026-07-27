import { describe, it, expect } from "vitest";
import { tokenize, tokenOverlap, scoreWishlistMatch, bestWishlistScore, listingSimilarity, WISHLIST_MATCH_THRESHOLD } from "./scoring";
import type { Listing, WishlistItem } from "../domain/models";

const listing = (over: Partial<Listing>): Listing => ({
  id: "l1",
  schoolId: "s1",
  ownerId: "owner1",
  postType: "give",
  status: "active",
  title: "Mini fridge",
  description: "Works great",
  category: "dormitory_items",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: null,
  owner: { displayName: "A", avatarEmoji: "🙂", verified: true },
  createdAt: new Date().toISOString(),
  expiresAt: null,
  demoLocal: false,
  ...over,
});

const wish = (over: Partial<WishlistItem>): WishlistItem => ({
  id: "w1",
  schoolId: "s1",
  userId: "u1",
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
  createdAt: new Date().toISOString(),
  ...over,
});

describe("tokenize / tokenOverlap", () => {
  it("drops stopwords and short tokens", () => {
    expect(tokenize("Looking for a Mini Fridge")).toEqual(["mini", "fridge"]);
  });
  it("scores overlap between related titles above unrelated ones", () => {
    expect(tokenOverlap("mini fridge", "Mini fridge")).toBeGreaterThan(tokenOverlap("mini fridge", "chemistry textbook"));
    expect(tokenOverlap("mini fridge", "chemistry textbook")).toBe(0);
  });
});

describe("scoreWishlistMatch", () => {
  it("matches a give listing to a related wishlist above threshold", () => {
    expect(scoreWishlistMatch(listing({}), wish({}))).toBeGreaterThanOrEqual(WISHLIST_MATCH_THRESHOLD);
  });
  it("does not match a request-type listing (looking_for / borrow)", () => {
    expect(scoreWishlistMatch(listing({ postType: "looking_for" }), wish({}))).toBe(0);
    expect(scoreWishlistMatch(listing({ postType: "borrow" }), wish({}))).toBe(0);
  });
  it("does not match a swap when the wishlist doesn't accept swaps", () => {
    expect(scoreWishlistMatch(listing({ postType: "swap" }), wish({ swapAcceptable: false }))).toBe(0);
    expect(scoreWishlistMatch(listing({ postType: "swap" }), wish({ swapAcceptable: true }))).toBeGreaterThan(0);
  });
  it("does not match an inactive wishlist", () => {
    expect(scoreWishlistMatch(listing({}), wish({ status: "fulfilled" }))).toBe(0);
  });
  it("scores a category match higher than a category mismatch", () => {
    const same = scoreWishlistMatch(listing({ category: "dormitory_items" }), wish({ preferredCategory: "dormitory_items" }));
    const diff = scoreWishlistMatch(listing({ category: "electronics" }), wish({ preferredCategory: "dormitory_items" }));
    expect(same).toBeGreaterThan(diff);
  });
  it("ignores an unrelated listing", () => {
    expect(scoreWishlistMatch(listing({ title: "Chemistry textbook", category: "textbooks" }), wish({}))).toBeLessThan(
      WISHLIST_MATCH_THRESHOLD,
    );
  });
});

describe("bestWishlistScore / listingSimilarity", () => {
  it("returns the best matching wishlist item", () => {
    const r = bestWishlistScore(listing({}), [wish({ id: "wa", title: "road bike" }), wish({ id: "wb", title: "mini fridge" })]);
    expect(r.itemId).toBe("wb");
    expect(r.score).toBeGreaterThan(0);
  });
  it("scores similar listings higher than dissimilar", () => {
    const seed = listing({ title: "Mini fridge", category: "dormitory_items" });
    const near = listing({ id: "l2", title: "Compact mini fridge", category: "dormitory_items" });
    const far = listing({ id: "l3", title: "Chemistry textbook", category: "textbooks" });
    expect(listingSimilarity(seed, near)).toBeGreaterThan(listingSimilarity(seed, far));
  });
});
