import { describe, it, expect } from "vitest";
import { demoSchools, demoProfiles, demoListings, demoCommunity, demoInbox, demoWishlist, demoStalls, demoMarkets } from ".";

const everything = JSON.stringify({ demoSchools, demoProfiles, demoListings, demoCommunity, demoInbox, demoWishlist, demoStalls, demoMarkets });

describe("demo fixtures contain no real school or student data", () => {
  it("contains no email addresses", () => {
    // No "@" anywhere in the fixtures (emails are never present, per the privacy rule).
    expect(everything).not.toMatch(/@/);
  });

  it("labels every school as a demo", () => {
    for (const s of demoSchools) expect(s.name).toMatch(/\(Demo\)/);
  });

  it("uses first-name-only synthetic identities (no full names)", () => {
    for (const p of demoProfiles) {
      expect(p.displayName.trim().split(/\s+/).length).toBe(1);
    }
  });

  it("exposes no email/phone fields on profiles", () => {
    for (const p of demoProfiles) {
      expect(Object.keys(p)).not.toContain("email");
      expect(Object.keys(p)).not.toContain("phone");
    }
  });

  it("contains no phone-number-like sequences", () => {
    expect(everything).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });

  it("has non-empty synthetic content to render", () => {
    expect(demoSchools.length).toBeGreaterThanOrEqual(2);
    expect(demoProfiles.length).toBeGreaterThanOrEqual(4);
    expect(demoListings.length).toBeGreaterThan(5);
    expect(demoCommunity.length).toBeGreaterThan(3);
  });
});
