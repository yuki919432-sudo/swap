import { describe, it, expect } from "vitest";
import { InMemoryKeyValueStore } from "../data/storage";
import { createMockRepositories } from "../data/repositories/mock";
import { assessListing, validateListingForm, publishListing, type ListingFormInput } from "./createListing";
import type { OwnerPreview } from "../domain/models";

const uni = { institutionType: "university" as const };
const owner: OwnerPreview = { displayName: "Maya", avatarEmoji: "🌸", verified: true };

const form = (over: Partial<ListingFormInput> = {}): ListingFormInput => ({
  schoolId: "school-uni",
  postType: "give",
  title: "Intro to Psychology textbook",
  description: "8th edition, gently used, all pages intact.",
  category: "textbooks",
  condition: "good",
  desiredItem: null,
  images: [],
  handoffLocation: "Library",
  expiresAt: null,
  ...over,
});

describe("validateListingForm (shared validation)", () => {
  it("accepts a well-formed listing", () => {
    expect(validateListingForm(form()).ok).toBe(true);
  });

  it("rejects an empty title", () => {
    const r = validateListingForm(form({ title: "" }));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rejects a swap without a desired item", () => {
    const r = validateListingForm(form({ postType: "swap", desiredItem: null }));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("swap_requires_desired_item");
  });
});

describe("publish gate (validation + moderation)", () => {
  const publish = async (input: ListingFormInput) => {
    const repos = createMockRepositories(new InMemoryKeyValueStore());
    const before = (await repos.marketplace.list({ schoolId: "school-uni" })).length;
    const result = await publishListing(repos.marketplace, input, owner, uni);
    const after = (await repos.marketplace.list({ schoolId: "school-uni" })).length;
    return { result, before, after };
  };

  it("publishes allowed content to the demo feed", async () => {
    const { result, before, after } = await publish(form());
    expect(result.published).toBe(true);
    expect(after).toBe(before + 1);
    expect(result.listing?.demoLocal).toBe(true);
  });

  it("keeps WARNED content unpublished", async () => {
    const { result, before, after } = await publish(form({ description: "Text me at 555-123-4567" }));
    expect(result.assessment.moderation.outcome).toBe("warn");
    expect(result.published).toBe(false);
    expect(after).toBe(before);
  });

  it("keeps BLOCKED content unpublished", async () => {
    const { result, before, after } = await publish(form({ title: "sale [[PROHIBITED_TEST]]" }));
    expect(result.assessment.moderation.outcome).toBe("block");
    expect(result.published).toBe(false);
    expect(after).toBe(before);
  });

  it("keeps ESCALATED content unpublished", async () => {
    const { result, before, after } = await publish(form({ description: "[[SEVERE_THREAT_TEST]]" }));
    expect(result.assessment.moderation.outcome).toBe("escalate");
    expect(result.published).toBe(false);
    expect(after).toBe(before);
  });

  it("does not publish content that fails validation even if moderation allows", async () => {
    const { result, after, before } = await publish(form({ title: "" }));
    expect(result.assessment.validation.ok).toBe(false);
    expect(result.published).toBe(false);
    expect(after).toBe(before);
  });
});

describe("editing content changes the moderation outcome", () => {
  it("a warned draft becomes allowed once the phone number is removed", () => {
    const warned = assessListing(form({ description: "call me 555-123-4567" }), uni);
    expect(warned.moderation.outcome).toBe("warn");
    expect(warned.canPublish).toBe(false);

    const edited = assessListing(form({ description: "Meet at the library front desk." }), uni);
    expect(edited.moderation.outcome).toBe("allow");
    expect(edited.canPublish).toBe(true);
  });
});
