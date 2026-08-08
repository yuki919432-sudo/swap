import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";
import { demoProfiles } from "../demo";

const MODERATOR = demoProfiles.find((p) => p.staffRole !== null);
const NON_MOD = demoProfiles.find((p) => p.staffRole === null)!;

async function selectProfile(kv: KeyValueStore, id: string) {
  await new JsonStore(kv).write(StorageKeys.selectedProfile, id);
}

describe("MockModerationRepository", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("gates the queue by moderator role", async () => {
    await selectProfile(kv, NON_MOD.id);
    expect(await createMockRepositories(kv).moderation.isModerator("s")).toBe(false);
    if (MODERATOR) {
      await selectProfile(kv, MODERATOR.id);
      expect(await createMockRepositories(kv).moderation.isModerator("s")).toBe(true);
    }
  });

  it("surfaces open reports and resolving removes them from the queue", async () => {
    const repos = createMockRepositories(kv);
    await repos.reports.submitReport({ targetType: "listing", targetId: "listing-9", reason: "spam" });
    const open = await repos.moderation.openReports("s");
    expect(open).toHaveLength(1);
    await repos.moderation.resolveReport(open[0]!.id, "resolved");
    expect(await createMockRepositories(kv).moderation.openReports("s")).toHaveLength(0);
  });

  it("removing a listing writes a status override", async () => {
    const repos = createMockRepositories(kv);
    await repos.moderation.setListingStatus("listing-9", "remove_content");
    const overrides = await new JsonStore(kv).read<Record<string, string>>(StorageKeys.demoListingStatus, {});
    expect(overrides["listing-9"]).toBe("removed");
  });
});
