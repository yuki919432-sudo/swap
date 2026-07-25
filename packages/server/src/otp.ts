/**
 * Email OTP: code generation, hashing (matching the database), the request
 * orchestration used by the otp-request Edge Function, and the client verify
 * wrapper. The plaintext code exists only transiently here and is never logged
 * or returned to the client.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { verifyEmailOtpSchema } from "@swap/validation";
import type { Json } from "./db-types.js";
import { AppError, membershipRejected, membershipSuspended, rateLimited, validationFailed } from "./errors.js";
import type { EmailProvider } from "./email/provider.js";
import { normalizeProviderError } from "./email/provider.js";
import { type MembershipSummary, toMembership } from "./membership.js";
import type { RpcRunner } from "./runner.js";
import { validate } from "./validation.js";

export const OTP_PURPOSE_MEMBERSHIP = "school_membership_verification";

/** Cryptographically random 6-digit code. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateOtpSalt(): string {
  return randomBytes(16).toString("hex");
}

/** sha256(salt || code) hex — MUST match the database comparison in 0026. */
export function otpCodeHash(salt: string, code: string): string {
  return createHash("sha256").update(salt + code, "utf8").digest("hex");
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export interface IssueOtpDeps {
  /** A service-role RPC runner (server-only). */
  service: RpcRunner;
  provider: EmailProvider;
}

export interface IssueOtpInput {
  userId: string;
  schoolId: string;
  email: string;
  purpose?: string;
  schoolName?: string;
  expiresInMinutes?: number;
}

/**
 * Create a challenge (transactional DB enforcement) and send the code via the
 * provider. Returns only the challenge id — never the code. A provider failure
 * surfaces as a ProviderError; the created challenge remains a valid pending
 * challenge (the user can request again after the cooldown), so state stays
 * consistent.
 */
export async function issueOtpChallenge(
  deps: IssueOtpDeps,
  input: IssueOtpInput,
): Promise<{ challengeId: string }> {
  const purpose = input.purpose ?? OTP_PURPOSE_MEMBERSHIP;
  const email = normalizeEmail(input.email);
  const code = generateOtpCode();
  const salt = generateOtpSalt();

  const challengeId = await deps.service.rpc<string>("request_otp_challenge", {
    p_user: input.userId,
    p_school: input.schoolId,
    p_email_normalized: email,
    p_purpose: purpose,
    p_code_hash: otpCodeHash(salt, code),
    p_code_salt: salt,
  });

  try {
    await deps.provider.sendOtp(
      {
        to: email,
        code,
        expiresInMinutes: input.expiresInMinutes ?? 10,
        ...(input.schoolName ? { schoolName: input.schoolName } : {}),
      },
      { idempotencyKey: challengeId },
    );
  } catch (err) {
    throw normalizeProviderError(err);
  }
  return { challengeId };
}

/** Map the DB verify result's error string to a typed AppError. */
function mapOtpError(error: string | undefined): AppError {
  switch (error) {
    case "otp_invalid":
      return validationFailed("otp_invalid");
    case "otp_expired":
      return validationFailed("otp_expired");
    case "otp_locked":
      return rateLimited("otp_locked");
    case "membership_suspended":
      return membershipSuspended();
    case "membership_rejected":
      return membershipRejected();
    default:
      return new AppError("conflict", error ?? "otp_verification_failed");
  }
}

interface VerifyResult {
  ok?: boolean;
  error?: string;
  membership?: Json;
}

/** Client verify: submit the 6-digit code; returns the resulting membership. */
export async function verifyEmailOtp(runner: RpcRunner, input: unknown): Promise<MembershipSummary> {
  const v = validate(verifyEmailOtpSchema, input);
  const res = await runner.rpc<VerifyResult>("verify_email_otp", {
    p_school: v.schoolId,
    p_code: v.code,
    p_purpose: v.purpose ?? OTP_PURPOSE_MEMBERSHIP,
  });
  if (!res?.ok) throw mapOtpError(res?.error);
  return toMembership(res.membership ?? null);
}
