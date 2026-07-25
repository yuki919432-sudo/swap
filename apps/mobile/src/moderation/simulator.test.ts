import { describe, it, expect } from "vitest";
import { simulateModeration } from "./simulator";
import { REGULATED_CATEGORIES, UNIVERSAL_PROHIBITIONS, isRegulatedCategory } from "./categories";

const uni = { institutionType: "university" as const };
const hs = { institutionType: "high_school" as const };

describe("moderation simulator", () => {
  it("allows a normal textbook/furniture listing", () => {
    const r = simulateModeration(
      { title: "Intro to Psychology textbook", description: "8th edition, a few highlights.", category: "textbooks" },
      uni,
    );
    expect(r.outcome).toBe("allow");
    expect(r.publishable).toBe(true);
  });

  it("warns on a phone number and keeps it unpublished", () => {
    const r = simulateModeration(
      { title: "Desk lamp", description: "Text me at 555-123-4567", category: "furniture" },
      uni,
    );
    expect(r.outcome).toBe("warn");
    expect(r.publishable).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain("contact_info");
  });

  it("warns on a personal address", () => {
    const r = simulateModeration(
      { title: "Free couch", description: "Pick up at 742 Evergreen Terrace anytime", category: "furniture" },
      uni,
    );
    expect(r.outcome).toBe("warn");
    expect(r.reasons.map((x) => x.code)).toContain("personal_address");
  });

  it("blocks universally prohibited test content", () => {
    const r = simulateModeration({ title: "For sale [[PROHIBITED_TEST]]", description: "x", category: "other" }, uni);
    expect(r.outcome).toBe("block");
    expect(r.publishable).toBe(false);
    expect(r.reasons[0]?.code).toBe("universal_prohibition");
  });

  it("blocks a universally-prohibited category directly", () => {
    const r = simulateModeration({ title: "x", description: "y", category: "weapons" }, uni);
    expect(r.outcome).toBe("block");
    expect(r.reasons[0]?.code).toBe("universal_prohibition");
  });

  it("escalates a severe threat test fixture", () => {
    const r = simulateModeration({ title: "note", description: "[[SEVERE_THREAT_TEST]]", category: "other" }, uni);
    expect(r.outcome).toBe("escalate");
    expect(r.publishable).toBe(false);
    expect(r.canEditAndRetry).toBe(true);
  });

  it("never auto-suspends: every outcome allows edit & retry", () => {
    for (const input of [
      { title: "ok", description: "ok", category: "textbooks" },
      { title: "call 555-123-4567", description: "x", category: "other" },
      { title: "[[PROHIBITED_TEST]]", description: "x", category: "other" },
      { title: "[[SEVERE_THREAT_TEST]]", description: "x", category: "other" },
    ]) {
      expect(simulateModeration(input, uni).canEditAndRetry).toBe(true);
    }
  });

  describe("regulated categories (separate from universal prohibitions)", () => {
    it("keeps regulated goods out of the universal-prohibition set", () => {
      for (const c of REGULATED_CATEGORIES) expect(UNIVERSAL_PROHIBITIONS).not.toContain(c);
      expect(isRegulatedCategory("alcohol")).toBe(true);
      expect(isRegulatedCategory("nicotine")).toBe(true);
    });

    it("blocks regulated content with a distinct reason when not enabled", () => {
      const r = simulateModeration({ title: "Vape pen", description: "barely used", category: "electronics" }, uni);
      expect(r.outcome).toBe("block");
      expect(r.reasons[0]?.code).toBe("regulated_disabled");
    });

    it("can NEVER be enabled for a high school (forced off)", () => {
      const r = simulateModeration(
        { title: "Beer fridge with beer", description: "includes alcohol", category: "other" },
        { ...hs, regulatedCategoriesEnabled: true },
      );
      expect(r.outcome).toBe("block");
      expect(r.reasons[0]?.code).toBe("regulated_disabled");
    });

    it("is a future university capability: allowed only if explicitly enabled", () => {
      const enabled = simulateModeration(
        { title: "Wine glasses", description: "set of six for wine", category: "other" },
        { ...uni, regulatedCategoriesEnabled: true },
      );
      // With the capability on, regulated mention is no longer auto-blocked.
      expect(enabled.outcome).toBe("allow");
    });
  });
});
