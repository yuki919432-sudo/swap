import { describe, it, expect } from "vitest";
import { assessOfferText } from "./createOffer";

const uni = { institutionType: "university" as const };

describe("assessOfferText (offer/handoff free-text moderation)", () => {
  it("allows an ordinary note", () => {
    expect(assessOfferText("Meet at the library at 3pm?", uni).ok).toBe(true);
  });
  it("blocks a note that trips a universal prohibition and is not submittable", () => {
    const a = assessOfferText("throw in a handgun and we have a deal", uni);
    expect(a.moderation.outcome).toBe("block");
    expect(a.ok).toBe(false);
  });
  it("withholds a note leaking contact info", () => {
    const a = assessOfferText("call me at 415 555 2671", uni);
    expect(a.moderation.outcome).toBe("warn");
    expect(a.ok).toBe(false);
  });
});
