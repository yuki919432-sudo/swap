import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";
import type { DraftListing } from "./types";
import { demoSchools, demoProfiles } from "../demo";

const uniSchool = demoSchools.find((s) => s.institutionType === "university")!;
const uniProfile = demoProfiles.find((p) => p.schoolId === uniSchool.id)!;

describe("MockSessionRepository", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("has no current session until a profile is selected", async () => {
    const repos = createMockRepositories(kv);
    expect(await repos.session.getCurrent()).toBeNull();
  });

  it("selects a profile and persists it across a new repository instance", async () => {
    const repos = createMockRepositories(kv);
    const state = await repos.session.select(uniProfile.id);
    expect(state.profile.id).toBe(uniProfile.id);
    expect(state.school.id).toBe(uniSchool.id);

    // A fresh repository over the SAME store restores the selection (persistence).
    const restored = await createMockRepositories(kv).session.getCurrent();
    expect(restored?.profile.id).toBe(uniProfile.id);
  });

  it("clears the selected profile", async () => {
    const repos = createMockRepositories(kv);
    await repos.session.select(uniProfile.id);
    await repos.session.clear();
    expect(await repos.session.getCurrent()).toBeNull();
  });
});

describe("MockSavedListingsRepository", () => {
  it("toggles saved state and persists it", async () => {
    const kv = new InMemoryKeyValueStore();
    const repos = createMockRepositories(kv);
    expect(await repos.saved.isSaved("l-uni-1")).toBe(false);
    expect(await repos.saved.toggle("l-uni-1")).toBe(true);
    expect(await repos.saved.isSaved("l-uni-1")).toBe(true);
    expect(await repos.saved.list()).toContain("l-uni-1");

    // Persisted across instances.
    expect(await createMockRepositories(kv).saved.isSaved("l-uni-1")).toBe(true);

    expect(await repos.saved.toggle("l-uni-1")).toBe(false);
    expect(await repos.saved.isSaved("l-uni-1")).toBe(false);
  });
});

describe("MockMarketplaceRepository", () => {
  it("lists synthetic listings for a school and finds one by id", async () => {
    const repos = createMockRepositories(new InMemoryKeyValueStore());
    const list = await repos.marketplace.list({ schoolId: uniSchool.id });
    expect(list.length).toBeGreaterThan(0);
    const one = await repos.marketplace.getById(list[0]!.id);
    expect(one?.id).toBe(list[0]!.id);
  });

  it("creates a listing at the top of the feed and persists it", async () => {
    const kv = new InMemoryKeyValueStore();
    const repos = createMockRepositories(kv);
    const owner = { displayName: "Maya", avatarEmoji: "🌸", verified: true };
    const created = await repos.marketplace.createListing(
      {
        schoolId: uniSchool.id,
        postType: "give",
        title: "My local demo item",
        description: "A freshly created listing.",
        category: "textbooks",
        condition: "good",
        desiredItem: null,
        images: [],
        handoffLocation: null,
        expiresAt: null,
      },
      owner,
    );
    const feed = await createMockRepositories(kv).marketplace.list({ schoolId: uniSchool.id });
    expect(feed[0]?.id).toBe(created.id);
    expect(feed[0]?.demoLocal).toBe(true);

    await repos.marketplace.deleteListing(created.id);
    const after = await createMockRepositories(kv).marketplace.list({ schoolId: uniSchool.id });
    expect(after.find((l) => l.id === created.id)).toBeUndefined();
  });
});

describe("MockDraftListingsRepository", () => {
  const draft: DraftListing = {
    id: "d1",
    schoolId: uniSchool.id,
    postType: "give",
    title: "Draft item",
    description: "desc",
    category: "textbooks",
    condition: "good",
    desiredItem: null,
    images: [],
    handoffLocation: null,
    expiresAt: null,
    updatedAt: new Date().toISOString(),
    publishedListingId: null,
    status: "draft",
  };

  it("saves, lists, updates, marks published, and removes drafts (persisted)", async () => {
    const kv = new InMemoryKeyValueStore();
    const repos = createMockRepositories(kv);
    await repos.drafts.save(draft);
    expect((await repos.drafts.list()).map((d) => d.id)).toEqual(["d1"]);

    // Persisted across instances.
    expect((await createMockRepositories(kv).drafts.getById("d1"))?.title).toBe("Draft item");

    await repos.drafts.markPublished("d1", "listing-99");
    const published = await repos.drafts.getById("d1");
    expect(published?.publishedListingId).toBe("listing-99");
    expect(published?.status).toBe("active");

    await repos.drafts.remove("d1");
    expect(await repos.drafts.list()).toHaveLength(0);
  });
});
