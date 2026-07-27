import { describe, it, expect } from "vitest";
import { assessMarket, validateMarketForm, type MarketFormInput } from "./createMarket";

const base = (over: Partial<MarketFormInput> = {}): MarketFormInput => ({
  schoolId: "11111111-1111-1111-1111-111111111111",
  title: "Dorm Move-Out Sale",
  description: "Everything must go",
  hostLabel: "West Hall RA",
  coverImage: null,
  startsAt: null,
  endsAt: null,
  location: null,
  handoffInstructions: null,
  allowedCategories: ["dormitory_items", "furniture"],
  allowsRegulated: false,
  status: "active",
  ...over,
});

describe("validateMarketForm", () => {
  it("accepts a well-formed market", () => {
    expect(validateMarketForm(base()).ok).toBe(true);
  });

  it("rejects an end before start", () => {
    const r = validateMarketForm(base({ startsAt: "2026-03-02T00:00:00Z", endsAt: "2026-03-01T00:00:00Z" }));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("market_end_must_be_after_start");
  });

  it("rejects a prohibited allowed-category (a market can't be a side door)", () => {
    const r = validateMarketForm(base({ allowedCategories: ["weapons"] }));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("category_prohibited");
  });
});

describe("assessMarket (validation + moderation)", () => {
  it("allows a clean market at a university", () => {
    const a = assessMarket(base(), { institutionType: "university" });
    expect(a.moderation.outcome).toBe("allow");
    expect(a.canCreate).toBe(true);
  });

  it("blocks a market whose text trips a universal prohibition", () => {
    const a = assessMarket(base({ description: "selling a handgun" }), { institutionType: "university" });
    expect(a.moderation.outcome).toBe("block");
    expect(a.canCreate).toBe(false);
  });

  it("keeps the most severe verdict across allowed categories", () => {
    // A high school can NEVER enable regulated categories → a regulated category blocks.
    const a = assessMarket(base({ allowedCategories: ["dormitory_items", "nicotine"] }), { institutionType: "high_school" });
    expect(a.moderation.outcome).toBe("block");
    expect(a.canCreate).toBe(false);
  });

  it("escalation (a safety concern) is never publishable", () => {
    const a = assessMarket(base({ description: "[[severe_threat_test]]" }), { institutionType: "university" });
    expect(a.moderation.outcome).toBe("escalate");
    expect(a.canCreate).toBe(false);
  });
});
