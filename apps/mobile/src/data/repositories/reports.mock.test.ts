import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";
import { demoProfiles } from "../demo";

describe("MockReportRepository", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("submits a report (stored locally in demo mode)", async () => {
    await createMockRepositories(kv).reports.submitReport({ targetType: "listing", targetId: "listing-1", reason: "spam" });
    const stored = await new JsonStore(kv).read<unknown[]>(StorageKeys.demoReports, []);
    expect(stored.length).toBe(1);
  });

  it("lists and unblocks blocked users", async () => {
    const someone = demoProfiles[0]!;
    await new JsonStore(kv).write(StorageKeys.demoBlocks, [someone.id]);
    const repos = createMockRepositories(kv);
    const blocked = await repos.reports.listBlockedUsers();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.userId).toBe(someone.id);
    expect(blocked[0]!.displayName).toBe(someone.displayName);

    await repos.reports.unblock(someone.id);
    expect(await createMockRepositories(kv).reports.listBlockedUsers()).toHaveLength(0);
  });
});
