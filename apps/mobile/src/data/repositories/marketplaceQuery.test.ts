import { describe, it, expect } from "vitest";
import { applyMarketplaceQuery } from "./marketplaceQuery";
import type { Listing } from "../../domain/models";

const base = (over: Partial<Listing>): Listing => ({
  id: "x",
  schoolId: "s1",
  ownerId: "owner1",
  postType: "give",
  status: "active",
  title: "Item",
  description: "desc",
  category: "textbooks",
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

const listings: Listing[] = [
  base({ id: "1", title: "Physics textbook", category: "textbooks", postType: "give", createdAt: "2026-01-01T00:00:00Z" }),
  base({ id: "2", title: "Desk lamp", category: "furniture", postType: "swap", desiredItem: "Chair", condition: "like_new", createdAt: "2026-01-03T00:00:00Z" }),
  base({ id: "3", title: "Mini fridge wanted", category: "dormitory_items", postType: "looking_for", condition: null, createdAt: "2026-01-02T00:00:00Z" }),
  base({ id: "4", title: "Other school item", schoolId: "s2", createdAt: "2026-01-04T00:00:00Z" }),
];

describe("applyMarketplaceQuery (feed / filter / search / sort)", () => {
  it("scopes to the requested school", () => {
    const r = applyMarketplaceQuery(listings, { schoolId: "s1" });
    expect(r.every((l) => l.schoolId === "s1")).toBe(true);
    expect(r.find((l) => l.id === "4")).toBeUndefined();
  });

  it("filters by post type", () => {
    const r = applyMarketplaceQuery(listings, { schoolId: "s1", postTypes: ["swap"] });
    expect(r.map((l) => l.id)).toEqual(["2"]);
  });

  it("filters by category", () => {
    const r = applyMarketplaceQuery(listings, { schoolId: "s1", categories: ["furniture"] });
    expect(r.map((l) => l.id)).toEqual(["2"]);
  });

  it("filters by condition and excludes null-condition listings", () => {
    const r = applyMarketplaceQuery(listings, { schoolId: "s1", conditions: ["like_new"] });
    expect(r.map((l) => l.id)).toEqual(["2"]);
  });

  it("searches title, description, category, and desired item", () => {
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", search: "physics" }).map((l) => l.id)).toEqual(["1"]);
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", search: "chair" }).map((l) => l.id)).toEqual(["2"]);
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", search: "fridge" }).map((l) => l.id)).toEqual(["3"]);
  });

  it("sorts by recent (default), oldest, and title", () => {
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", sort: "recent" }).map((l) => l.id)).toEqual(["2", "3", "1"]);
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", sort: "oldest" }).map((l) => l.id)).toEqual(["1", "3", "2"]);
    expect(applyMarketplaceQuery(listings, { schoolId: "s1", sort: "title" }).map((l) => l.title)[0]).toBe("Desk lamp");
  });

  it("can exclude locally-published demo listings", () => {
    const withLocal = [...listings, base({ id: "5", demoLocal: true, title: "Local post" })];
    const r = applyMarketplaceQuery(withLocal, { schoolId: "s1", includeDemoLocal: false });
    expect(r.find((l) => l.id === "5")).toBeUndefined();
  });
});
