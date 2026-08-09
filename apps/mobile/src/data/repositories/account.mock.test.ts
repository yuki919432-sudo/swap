import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, StorageKeys, JsonStore, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";

describe("MockAccountRepository — self-service account controls", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("updates the caller's profile fields", async () => {
    const repos = createMockRepositories(kv);
    await repos.account.updateProfile({ displayName: "  New Name  ", gradYear: 2027 });
    const stored = await new JsonStore(kv).read<{ displayName?: string; gradYear?: number | null }>(StorageKeys.demoProfile, {});
    expect(stored.displayName).toBe("New Name");
    expect(stored.gradYear).toBe(2027);
  });

  it("requesting deletion sets a reversible flag", async () => {
    const repos = createMockRepositories(kv);
    await repos.account.requestDeletion();
    expect(await new JsonStore(kv).read<boolean>(StorageKeys.demoDeletionRequested, false)).toBe(true);
  });

  it("exports a self-scoped document", async () => {
    const repos = createMockRepositories(kv);
    await repos.account.updateProfile({ displayName: "Alice" });
    const data = (await repos.account.exportMyData()) as { profile: { displayName?: string }; schema_version: number };
    expect(data.schema_version).toBe(1);
    expect(data.profile.displayName).toBe("Alice");
  });
});
