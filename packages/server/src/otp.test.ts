import { describe, it, expect } from "vitest";
import type { RpcRunner } from "./runner.js";
import { FakeEmailProvider } from "./email/provider.js";
import {
  OTP_PURPOSE_MEMBERSHIP,
  generateOtpCode,
  issueOtpChallenge,
  normalizeEmail,
  otpCodeHash,
  verifyEmailOtp,
} from "./otp.js";

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
  verification_method: "email_otp",
};

describe("otp helpers", () => {
  it("generates a 6-digit numeric code", () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it("hash is deterministic for the same salt+code and differs across salts", () => {
    expect(otpCodeHash("s", "123456")).toBe(otpCodeHash("s", "123456"));
    expect(otpCodeHash("s1", "123456")).not.toBe(otpCodeHash("s2", "123456"));
  });

  it("normalizes email by trimming and lowercasing", () => {
    expect(normalizeEmail("  Student@School.Test ")).toBe("student@school.test");
  });
});

describe("issueOtpChallenge", () => {
  it("stores only a hash+salt in the DB call — never the plaintext code", async () => {
    const { runner, calls } = fakeRunner({ request_otp_challenge: "chal-1" });
    const provider = new FakeEmailProvider();
    const { challengeId } = await issueOtpChallenge(
      { service: runner, provider },
      {
        userId: "33333333-3333-3333-3333-333333333333",
        schoolId: "22222222-2222-2222-2222-222222222222",
        email: "Student@School.Test",
      },
    );
    expect(challengeId).toBe("chal-1");
    const args = calls[0]!.args as Record<string, string>;
    expect(args.p_email_normalized).toBe("student@school.test");
    expect(args.p_purpose).toBe(OTP_PURPOSE_MEMBERSHIP);
    expect(args.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
    // The hash+salt in the DB args must reconstruct only via the (unknown) code.
    expect(JSON.stringify(args)).not.toMatch(/"p_code"\s*:/);
    // The provider received the code but the challenge id is the idempotency key.
    expect(provider.sent).toHaveLength(1);
  });

  it("uses the challenge id as the provider idempotency key", async () => {
    const { runner } = fakeRunner({ request_otp_challenge: "chal-77" });
    const provider = new FakeEmailProvider();
    await issueOtpChallenge(
      { service: runner, provider },
      { userId: "u", schoolId: "s", email: "a@b.test" },
    );
    // Second issue with the same challenge id would dedupe in the provider.
    await provider.sendOtp({ to: "a@b.test", code: "000000", expiresInMinutes: 10 }, { idempotencyKey: "chal-77" });
    expect(provider.sent).toHaveLength(1);
  });

  it("surfaces a provider failure as a ProviderError", async () => {
    const { runner } = fakeRunner({ request_otp_challenge: "chal-2" });
    const provider = new FakeEmailProvider("transient");
    await expect(
      issueOtpChallenge({ service: runner, provider }, { userId: "u", schoolId: "s", email: "a@b.test" }),
    ).rejects.toMatchObject({ code: "transient" });
  });
});

describe("verifyEmailOtp", () => {
  it("validates input and returns the mapped membership on success", async () => {
    const { runner, calls } = fakeRunner({ verify_email_otp: { ok: true, membership: membershipRow } });
    const r = await verifyEmailOtp(runner, {
      schoolId: "22222222-2222-2222-2222-222222222222",
      code: "123456",
    });
    expect(calls[0]!.args).toEqual({
      p_school: "22222222-2222-2222-2222-222222222222",
      p_code: "123456",
      p_purpose: OTP_PURPOSE_MEMBERSHIP,
    });
    expect(r).toMatchObject({ status: "verified", verificationMethod: "email_otp" });
  });

  it("rejects a malformed code before calling the DB", async () => {
    const { runner, calls } = fakeRunner({ verify_email_otp: { ok: true } });
    await expect(
      verifyEmailOtp(runner, { schoolId: "22222222-2222-2222-2222-222222222222", code: "12" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(calls).toHaveLength(0);
  });

  it("maps an invalid-code result to a validation error", async () => {
    const { runner } = fakeRunner({ verify_email_otp: { ok: false, error: "otp_invalid" } });
    await expect(
      verifyEmailOtp(runner, { schoolId: "22222222-2222-2222-2222-222222222222", code: "999999" }),
    ).rejects.toMatchObject({ code: "validation_failed", message: "otp_invalid" });
  });

  it("maps a locked result to a rate-limit error", async () => {
    const { runner } = fakeRunner({ verify_email_otp: { ok: false, error: "otp_locked" } });
    await expect(
      verifyEmailOtp(runner, { schoolId: "22222222-2222-2222-2222-222222222222", code: "999999" }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("maps a suspended membership to a membership_suspended error", async () => {
    const { runner } = fakeRunner({ verify_email_otp: { ok: false, error: "membership_suspended" } });
    await expect(
      verifyEmailOtp(runner, { schoolId: "22222222-2222-2222-2222-222222222222", code: "123456" }),
    ).rejects.toMatchObject({ code: "membership_suspended" });
  });

  it("maps a rejected membership to a membership_rejected error", async () => {
    const { runner } = fakeRunner({ verify_email_otp: { ok: false, error: "membership_rejected" } });
    await expect(
      verifyEmailOtp(runner, { schoolId: "22222222-2222-2222-2222-222222222222", code: "123456" }),
    ).rejects.toMatchObject({ code: "membership_rejected" });
  });
});
