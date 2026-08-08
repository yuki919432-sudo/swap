import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, type KeyValueStore } from "../data/storage";
import { hasConfirmed13Plus, confirm13Plus, clearAgeAttestation } from "./ageGate";

describe("13+ age gate (local, no DOB stored)", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("defaults to not-confirmed", async () => {
    expect(await hasConfirmed13Plus(kv)).toBe(false);
  });
  it("stores a true confirmation and reads it back", async () => {
    await confirm13Plus(kv, true);
    expect(await hasConfirmed13Plus(kv)).toBe(true);
  });
  it("never stores a false/under-13 attestation", async () => {
    await confirm13Plus(kv, false);
    expect(await hasConfirmed13Plus(kv)).toBe(false);
  });
  it("can be cleared (e.g. on account deletion)", async () => {
    await confirm13Plus(kv, true);
    await clearAgeAttestation(kv);
    expect(await hasConfirmed13Plus(kv)).toBe(false);
  });
});
