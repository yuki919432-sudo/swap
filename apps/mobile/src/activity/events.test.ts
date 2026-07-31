import { describe, it, expect } from "vitest";
import {
  wishlistMatchEvents,
  unavailableMatchEvents,
  wishlistFulfilledEvent,
  demandResponseEvent,
  KvActivityRecorder,
  NoopActivityRecorder,
} from "./index";
import type { WishlistMatchDetail } from "../domain/models";
import { InMemoryKeyValueStore, JsonStore } from "../data/storage";

const detail = (over: Partial<WishlistMatchDetail> & { wishlistItemId: string }): WishlistMatchDetail => ({
  wishlistTitle: "Looking for a mini fridge",
  listing: { id: "l1", title: "Mini fridge", ownerId: "owner1", postType: "give", status: "active", image: null },
  available: true,
  score: 0.8,
  notified: false,
  ...over,
});

describe("activity event builders (prepared, never sent)", () => {
  it("emits one wishlist_match event per available match, deduped by seen keys", () => {
    const details = [detail({ wishlistItemId: "w1" }), detail({ wishlistItemId: "w2", listing: { id: "l2", title: "Fridge 2", ownerId: "o2", postType: "give", status: "active", image: null } })];
    const all = wishlistMatchEvents(details);
    expect(all).toHaveLength(2);
    expect(all.every((e) => e.type === "wishlist_match")).toBe(true);
    // A seen key suppresses that match.
    const filtered = wishlistMatchEvents(details, { seenKeys: new Set(["w1:l1"]) });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.listingId).toBe("l2");
  });

  it("does not emit a match event for an unavailable listing", () => {
    expect(wishlistMatchEvents([detail({ wishlistItemId: "w1", available: false })])).toHaveLength(0);
  });

  it("emits matched_listing_unavailable for taken-down listings", () => {
    const events = unavailableMatchEvents([
      detail({ wishlistItemId: "w1", available: false, listing: { id: "l1", title: "Mini fridge", ownerId: "o", postType: "give", status: "reserved", image: null } }),
      detail({ wishlistItemId: "w2", available: true }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("matched_listing_unavailable");
    expect(events[0]!.wishlistItemId).toBe("w1");
  });

  it("builds fulfilled + demand-response events with deterministic ids", () => {
    expect(wishlistFulfilledEvent({ id: "w9", title: "A textbook" }).id).toBe("wishlist_fulfilled:w9");
    expect(demandResponseEvent({ label: "Mini fridge", listingId: "l7" }).id).toBe("demand_response:l7");
  });
});

describe("KvActivityRecorder", () => {
  it("records idempotently (same id never doubles) and lists newest first", async () => {
    const rec = new KvActivityRecorder(new JsonStore(new InMemoryKeyValueStore()));
    const details = [detail({ wishlistItemId: "w1" })];
    await rec.record(wishlistMatchEvents(details));
    await rec.record(wishlistMatchEvents(details)); // same logical event again
    const listed = await rec.list();
    expect(listed).toHaveLength(1);

    await rec.record([wishlistFulfilledEvent({ id: "w1", title: "x" })]);
    const listed2 = await rec.list();
    expect(listed2).toHaveLength(2);
    expect(listed2[0]!.type).toBe("wishlist_fulfilled"); // newest first
  });

  it("the noop recorder stores and delivers nothing", async () => {
    const rec = new NoopActivityRecorder();
    await rec.record(wishlistMatchEvents([detail({ wishlistItemId: "w1" })]));
    expect(await rec.list()).toEqual([]);
  });
});
