import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";
import type { NewListing, Repositories } from "./types";

const MAYA = "profile-uni-verified";
const DEVIN = "profile-uni-moderator";
const SCHOOL = "school-uni";
const owner = { displayName: "U", avatarEmoji: "🙂", verified: true };

const listing = (over: Partial<NewListing> = {}): NewListing => ({
  schoolId: SCHOOL,
  postType: "give",
  title: "Item",
  description: "x",
  category: "dormitory_items",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: null,
  expiresAt: null,
  ...over,
});

async function asProfile(kv: KeyValueStore, id: string) {
  await new JsonStore(kv).write(StorageKeys.selectedProfile, id);
}

describe("MockOfferRepository", () => {
  let kv: KeyValueStore;
  // Devin's listings + Maya's swap item + conversations, set up fresh per test.
  let lampD: string, declineD: string, swapTargetD: string, bookD: string, swapOfferedM: string;
  let convGive: string, convDecline: string, convSwap: string, convBorrow: string;

  const repos = (): Repositories => createMockRepositories(kv);

  beforeEach(async () => {
    kv = new InMemoryKeyValueStore();
    // Devin owns the items being requested.
    await asProfile(kv, DEVIN);
    lampD = (await repos().marketplace.createListing(listing({ title: "Lamp" }), owner)).id;
    declineD = (await repos().marketplace.createListing(listing({ title: "Charger" }), owner)).id;
    swapTargetD = (await repos().marketplace.createListing(listing({ title: "Sneakers", postType: "swap", category: "shoes" }), owner)).id;
    bookD = (await repos().marketplace.createListing(listing({ title: "Textbook", postType: "lend", category: "textbooks" }), owner)).id;
    // Maya owns a swap item.
    await asProfile(kv, MAYA);
    swapOfferedM = (await repos().marketplace.createListing(listing({ title: "My kettle" }), owner)).id;
    // Distinct conversations (distinct listing context ⇒ distinct conversations).
    convGive = await repos().messaging.startConversation({ otherUserId: DEVIN, listingId: lampD });
    convDecline = await repos().messaging.startConversation({ otherUserId: DEVIN, listingId: declineD });
    convSwap = await repos().messaging.startConversation({ otherUserId: DEVIN, listingId: swapTargetD });
    convBorrow = await repos().messaging.startConversation({ otherUserId: DEVIN, listingId: bookD });
  });

  it("creates a give offer for the counterpart's listing", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD });
    expect(o.kind).toBe("give");
    expect(o.status).toBe("pending");
    expect(o.amSender).toBe(true);
  });

  it("cannot offer a swap item you do not own, and cannot accept your own offer", async () => {
    await asProfile(kv, MAYA);
    // swap offering lampD (Devin's) → not owner
    await expect(repos().offers.create({ conversationId: convSwap, kind: "swap", listingId: swapTargetD, offeredListingId: lampD })).rejects.toThrow();
    const o = await repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD });
    await expect(repos().offers.accept(o.id)).rejects.toThrow(); // sender can't accept
  });

  it("accepting reserves the listing atomically and blocks a competing offer", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD });
    await asProfile(kv, DEVIN);
    await repos().offers.accept(o.id);
    expect((await repos().offers.getById(o.id))!.offer.listing!.status).toBe("reserved");
    // A new offer for the now-reserved item is rejected ("no longer available").
    await asProfile(kv, MAYA);
    await expect(repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD })).rejects.toThrow();
  });

  it("a declined offer leaves the listing available", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convDecline, kind: "give", listingId: declineD });
    await asProfile(kv, DEVIN);
    await repos().offers.decline(o.id);
    // still offerable afterwards
    await asProfile(kv, MAYA);
    const o2 = await repos().offers.create({ conversationId: convDecline, kind: "give", listingId: declineD });
    expect(o2.status).toBe("pending");
  });

  it("give completion is bilateral and updates the listing lifecycle", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD });
    await asProfile(kv, DEVIN);
    const h = await repos().offers.accept(o.id);
    // one confirm → still reserved
    await repos().offers.confirmCompletion(h.id);
    expect((await repos().offers.getById(o.id))!.offer.listing!.status).toBe("reserved");
    // both confirm → completed
    await asProfile(kv, MAYA);
    await repos().offers.confirmCompletion(h.id);
    const detail = await repos().offers.getById(o.id);
    expect(detail!.offer.status).toBe("completed");
    expect(detail!.offer.listing!.status).toBe("completed");
  });

  it("swap acceptance reserves BOTH listings", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convSwap, kind: "swap", listingId: swapTargetD, offeredListingId: swapOfferedM });
    await asProfile(kv, DEVIN);
    await repos().offers.accept(o.id);
    const detail = await repos().offers.getById(o.id);
    expect(detail!.offer.listing!.status).toBe("reserved");
    expect(detail!.offer.offeredListing!.status).toBe("reserved");
  });

  it("counteroffers preserve the revision chain", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convBorrow, kind: "borrow", listingId: bookD, returnBy: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    await asProfile(kv, DEVIN);
    const counter = await repos().offers.counter({ parentOfferId: o.id, note: "two weeks?" });
    expect(counter.parentOfferId).toBe(o.id);
    const detail = await repos().offers.getById(counter.id);
    expect(detail!.chain.length).toBe(2);
    expect(detail!.chain.find((c) => c.id === o.id)!.status).toBe("countered");
    expect(detail!.chain.filter((c) => c.status === "pending").length).toBe(1);
  });

  it("borrow distinguishes handoff from return and restores the item", async () => {
    await asProfile(kv, MAYA);
    const o = await repos().offers.create({ conversationId: convBorrow, kind: "borrow", listingId: bookD, returnBy: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    await asProfile(kv, DEVIN);
    const h = await repos().offers.accept(o.id);
    const ho = await repos().offers.markHandedOver(h.id);
    expect(ho.stage).toBe("return_due");
    const ret = await repos().offers.markReturned(h.id);
    expect(ret.stage).toBe("returned");
    expect((await repos().offers.getById(o.id))!.offer.listing!.status).toBe("active"); // back in circulation
  });

  it("a blocked user cannot create a new offer", async () => {
    await asProfile(kv, MAYA);
    await repos().offers.create({ conversationId: convGive, kind: "give", listingId: lampD }); // ok before block
    await repos().messaging.block(DEVIN, SCHOOL);
    await expect(repos().offers.create({ conversationId: convDecline, kind: "give", listingId: declineD })).rejects.toThrow();
  });
});
