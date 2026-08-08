import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";

describe("MockMembershipRepository — funnel simulation", () => {
  let kv: KeyValueStore;
  beforeEach(() => {
    kv = new InMemoryKeyValueStore();
  });

  it("starts with no membership", async () => {
    expect(await createMockRepositories(kv).membership.myMembership()).toBeNull();
  });

  it("redeems a verified invitation code", async () => {
    const m = await createMockRepositories(kv).membership.redeemInvitation("swap-verified");
    expect(m.status).toBe("verified");
    expect(m.schoolActive).toBe(true);
    expect((await createMockRepositories(kv).membership.myMembership())?.status).toBe("verified");
  });

  it("redeems a pending invitation code", async () => {
    const m = await createMockRepositories(kv).membership.redeemInvitation("SWAP-PENDING");
    expect(m.status).toBe("pending");
  });

  it("surfaces an inactive school", async () => {
    const m = await createMockRepositories(kv).membership.redeemInvitation("SWAP-INACTIVE");
    expect(m.status).toBe("verified");
    expect(m.schoolActive).toBe(false);
  });

  it("rejects an invalid code", async () => {
    await expect(createMockRepositories(kv).membership.redeemInvitation("nope")).rejects.toThrow();
  });

  it("manual request lands in pending", async () => {
    const m = await createMockRepositories(kv).membership.requestManual({ schoolId: "school-uni" });
    expect(m.status).toBe("pending");
  });
});
