import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";

const MAYA = "profile-uni-verified"; // verified uni student, hosts a demo market
const ALEX = "profile-hs-verified"; // verified hs student (different school)
const SCHOOL_UNI = "school-uni";
const SCHOOL_HS = "school-hs";

async function asProfile(kv: KeyValueStore, profileId: string) {
  await new JsonStore(kv).write(StorageKeys.selectedProfile, profileId);
}

describe("MockStallRepository", () => {
  let kv: KeyValueStore;
  beforeEach(async () => {
    kv = new InMemoryKeyValueStore();
    await asProfile(kv, MAYA);
  });

  it("My Stall shows only the owner's own content", async () => {
    const repos = createMockRepositories(kv);
    const mine = await repos.stalls.getMine(SCHOOL_UNI);
    expect(mine).not.toBeNull();
    // Every listing on the stall belongs to Maya.
    expect(mine!.listings.every((l) => l.owner.displayName === "Maya")).toBe(true);
    expect(mine!.stall.activeCount).toBe(mine!.listings.length);
  });

  it("opens a stall with no friction and persists it", async () => {
    await asProfile(kv, ALEX);
    const repos = createMockRepositories(kv);
    const stall = await repos.stalls.open(SCHOOL_HS, "Fresh stall");
    expect(stall.userId).toBe(ALEX);
    expect(stall.description).toBe("Fresh stall");
    const reloaded = await createMockRepositories(kv).stalls.getMine(SCHOOL_HS);
    expect(reloaded?.stall.description).toBe("Fresh stall");
  });

  it("hides wishlist requests from others unless opted in, but shows all to the owner", async () => {
    const repos = createMockRepositories(kv);
    // Maya viewing her own stall sees her active wishlist (w-uni-3 is showOnStall).
    const mine = await repos.stalls.getByUser(SCHOOL_UNI, MAYA);
    expect(mine!.visibleWishlist.length).toBeGreaterThan(0);

    // Another student viewing Maya's stall only sees opted-in requests.
    await asProfile(kv, "profile-uni-moderator");
    const asOther = await createMockRepositories(kv).stalls.getByUser(SCHOOL_UNI, MAYA);
    expect(asOther!.visibleWishlist.every((w) => w.showOnStall)).toBe(true);
  });
});

describe("MockMarketRepository lifecycle", () => {
  let kv: KeyValueStore;
  beforeEach(async () => {
    kv = new InMemoryKeyValueStore();
    await asProfile(kv, MAYA);
  });

  it("a listing can belong to multiple markets, and removing from one keeps the others + the listing", async () => {
    const repos = createMockRepositories(kv);
    const markets = await repos.markets.listForSchool(SCHOOL_UNI);
    const [m1, m2] = markets;
    // Maya adds her own listing (l-uni-1) to two markets.
    await repos.markets.addListing(m1!.id, "l-uni-1");
    await repos.markets.addListing(m2!.id, "l-uni-1");
    expect((await repos.markets.getById(m1!.id))!.listings.some((l) => l.id === "l-uni-1")).toBe(true);
    expect((await repos.markets.getById(m2!.id))!.listings.some((l) => l.id === "l-uni-1")).toBe(true);

    // Removing from m1 leaves m2's association AND the listing intact.
    await repos.markets.removeListing(m1!.id, "l-uni-1");
    expect((await repos.markets.getById(m1!.id))!.listings.some((l) => l.id === "l-uni-1")).toBe(false);
    expect((await repos.markets.getById(m2!.id))!.listings.some((l) => l.id === "l-uni-1")).toBe(true);
    expect(await repos.marketplace.getById("l-uni-1")).not.toBeNull();
  });

  it("cancelling or ending a market never deletes its listings or associations", async () => {
    const repos = createMockRepositories(kv);
    const host = await repos.markets.create(
      {
        schoolId: SCHOOL_UNI,
        title: "Temp Sale",
        description: null,
        hostLabel: null,
        coverImage: null,
        startsAt: null,
        endsAt: null,
        location: null,
        handoffInstructions: null,
        allowedCategories: [],
        allowsRegulated: false,
        status: "active",
      },
      { displayName: "Maya", avatarEmoji: "🌸", verified: true },
    );
    await repos.markets.addListing(host.id, "l-uni-1");
    await repos.markets.setStatus(host.id, "cancelled");

    const detail = await repos.markets.getById(host.id);
    expect(detail!.market.status).toBe("cancelled");
    expect(detail!.listings.some((l) => l.id === "l-uni-1")).toBe(true); // association survives
    expect(await repos.marketplace.getById("l-uni-1")).not.toBeNull(); // listing survives
  });

  it("join then leave toggles seller participation", async () => {
    const repos = createMockRepositories(kv);
    const m = (await repos.markets.listForSchool(SCHOOL_UNI)).find((x) => x.hostUserId !== MAYA) ?? (await repos.markets.listForSchool(SCHOOL_UNI))[0]!;
    await repos.markets.join(m.id);
    expect((await repos.markets.getById(m.id))!.amSeller).toBe(true);
    await repos.markets.leave(m.id);
    expect((await repos.markets.getById(m.id))!.amSeller).toBe(false);
  });
});

describe("MockCampusMarketRepository", () => {
  it("scopes shelves + demand to the selected school", async () => {
    const kv = new InMemoryKeyValueStore();
    await asProfile(kv, MAYA);
    const repos = createMockRepositories(kv);
    const shelves = await repos.campusMarket.shelves(SCHOOL_UNI);
    for (const s of shelves) for (const l of s.listings) expect(l.schoolId).toBe(SCHOOL_UNI);
    const demand = await repos.campusMarket.demand(SCHOOL_UNI);
    expect(demand.length).toBeGreaterThan(0);
    const stalls = await repos.campusMarket.recentStalls(SCHOOL_UNI);
    expect(stalls.every((s) => s.schoolId === SCHOOL_UNI)).toBe(true);
  });
});
