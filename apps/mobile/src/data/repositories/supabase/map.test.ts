import { describe, it, expect } from "vitest";
import { emojiForKey, ownerFromUserRow, rowToListing, uriImage } from "./map";
import type { ListingRow } from "../../supabase/database.types";

describe("emojiForKey", () => {
  it("is deterministic and stable for the same key", () => {
    expect(emojiForKey("user-123")).toBe(emojiForKey("user-123"));
  });
  it("returns a non-empty emoji for any key", () => {
    for (const k of ["", "a", "user-abc", "9f8e"]) expect(emojiForKey(k).length).toBeGreaterThan(0);
  });
});

describe("ownerFromUserRow", () => {
  it("maps a user row and carries the verified flag", () => {
    const o = ownerFromUserRow({ id: "u1", display_name: "Maya", avatar_url: null }, true);
    expect(o.displayName).toBe("Maya");
    expect(o.verified).toBe(true);
    expect(o.avatarEmoji).toBe(emojiForKey("u1"));
  });
  it("falls back to a safe name when the row is null", () => {
    const o = ownerFromUserRow(null, false);
    expect(o.displayName).toBe("Student");
    expect(o.verified).toBe(false);
  });
});

describe("rowToListing", () => {
  const row: ListingRow = {
    id: "l1",
    school_id: "s1",
    owner_id: "u1",
    post_type: "swap",
    title: "Lamp",
    description: "A lamp",
    category: "furniture",
    condition: "good",
    desired_item: "Chair",
    handoff_location_id: null,
    status: "active",
    expires_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };

  it("maps DB row + images + owner to a domain Listing", () => {
    const owner = ownerFromUserRow({ id: "u1", display_name: "Maya", avatar_url: null }, true);
    const listing = rowToListing(row, [uriImage("https://x/y.jpg")], owner);
    expect(listing).toMatchObject({
      id: "l1",
      schoolId: "s1",
      postType: "swap",
      title: "Lamp",
      desiredItem: "Chair",
      demoLocal: false,
      handoffLocation: null,
    });
    expect(listing.images[0]).toEqual({ kind: "local", value: "https://x/y.jpg" });
    expect(listing.owner.displayName).toBe("Maya");
  });
});
