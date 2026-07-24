import { describe, it, expect } from "vitest";
import type { RpcRunner } from "./runner.js";
import {
  redeemInvitation,
  resolveRosterMembership,
  requestMembership,
  reviewMembershipRequest,
  setMembershipStatus,
} from "./membership.js";

interface Call {
  fn: string;
  args: Record<string, unknown> | undefined;
}

function fakeRunner(responses: Record<string, unknown>): { runner: RpcRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: RpcRunner = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      if (!(fn in responses)) throw new Error(`no fixture for ${fn}`);
      return responses[fn] as never;
    },
  };
  return { runner, calls };
}

const membershipRow = {
  id: "11111111-1111-1111-1111-111111111111",
  school_id: "22222222-2222-2222-2222-222222222222",
  user_id: "33333333-3333-3333-3333-333333333333",
  status: "verified",
  verification_method: "invite_code",
};
const requestRow = {
  id: "44444444-4444-4444-4444-444444444444",
  school_id: "22222222-2222-2222-2222-222222222222",
  user_id: "33333333-3333-3333-3333-333333333333",
  method: "manual",
  status: "pending",
};

describe("membership flows", () => {
  it("redeemInvitation validates input and maps the membership", async () => {
    const { runner, calls } = fakeRunner({ redeem_invitation: membershipRow });
    const result = await redeemInvitation(runner, { code: "SWAP-ABCDEF" });
    expect(calls[0]).toEqual({ fn: "redeem_invitation", args: { p_code: "SWAP-ABCDEF" } });
    expect(result).toMatchObject({ status: "verified", verificationMethod: "invite_code" });
  });

  it("redeemInvitation rejects invalid input before calling the DB", async () => {
    const { runner, calls } = fakeRunner({ redeem_invitation: membershipRow });
    await expect(redeemInvitation(runner, { code: "" })).rejects.toMatchObject({ code: "validation_failed" });
    expect(calls).toHaveLength(0);
  });

  it("resolveRosterMembership passes the school id", async () => {
    const { runner, calls } = fakeRunner({ resolve_roster_membership: membershipRow });
    await resolveRosterMembership(runner, { schoolId: "22222222-2222-2222-2222-222222222222" });
    expect(calls[0]).toEqual({
      fn: "resolve_roster_membership",
      args: { p_school: "22222222-2222-2222-2222-222222222222" },
    });
  });

  it("requestMembership maps the request row and forwards optional fields", async () => {
    const { runner, calls } = fakeRunner({ request_membership: requestRow });
    const r = await requestMembership(runner, {
      schoolId: "22222222-2222-2222-2222-222222222222",
      explanation: "New transfer student",
    });
    expect(calls[0]!.args).toEqual({
      p_school: "22222222-2222-2222-2222-222222222222",
      p_grad_year: null,
      p_explanation: "New transfer student",
    });
    expect(r).toMatchObject({ method: "manual", status: "pending" });
  });

  it("reviewMembershipRequest forwards the decision", async () => {
    const { runner, calls } = fakeRunner({
      review_membership_request: { ...requestRow, status: "approved" },
    });
    const r = await reviewMembershipRequest(runner, {
      requestId: "44444444-4444-4444-4444-444444444444",
      approve: true,
    });
    expect(calls[0]!.args).toMatchObject({ p_request: "44444444-4444-4444-4444-444444444444", p_approve: true });
    expect(r.status).toBe("approved");
  });

  it("setMembershipStatus validates the status enum", async () => {
    const { runner } = fakeRunner({ set_membership_status: { ...membershipRow, status: "suspended" } });
    const r = await setMembershipStatus(runner, {
      membershipId: "11111111-1111-1111-1111-111111111111",
      status: "suspended",
    });
    expect(r.status).toBe("suspended");
    await expect(
      setMembershipStatus(runner, { membershipId: "11111111-1111-1111-1111-111111111111", status: "bogus" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("propagates a mapped DB error from the runner", async () => {
    const runner: RpcRunner = {
      async rpc() {
        // Simulate what createRpcRunner would throw after mapping.
        const { invitationInvalid } = await import("./errors.js");
        throw invitationInvalid();
      },
    };
    await expect(redeemInvitation(runner, { code: "SWAP-ZZZZZZ" })).rejects.toMatchObject({
      code: "invitation_invalid",
    });
  });
});
