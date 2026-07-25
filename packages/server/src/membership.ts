/**
 * School membership resolution flows. Each validates its input with a shared Zod
 * schema, calls the corresponding SECURITY DEFINER RPC (which performs the real
 * authorization in the database), and returns a typed summary. Errors surface as
 * typed AppErrors via the RpcRunner boundary.
 */
import {
  redeemInviteSchema,
  resolveRosterSchema,
  membershipRequestSchema,
  reviewMembershipRequestSchema,
  setMembershipStatusSchema,
} from "@swap/validation";
import type { MembershipStatus, MembershipRequestStatus, VerificationMethod } from "@swap/types";
import type { Json } from "./db-types.js";
import { internal } from "./errors.js";
import type { RpcRunner } from "./runner.js";
import { validate } from "./validation.js";

export interface MembershipSummary {
  id: string;
  schoolId: string;
  userId: string;
  status: MembershipStatus;
  verificationMethod: VerificationMethod | null;
}

export interface MembershipRequestSummary {
  id: string;
  schoolId: string;
  userId: string;
  method: VerificationMethod;
  status: MembershipRequestStatus;
}

function asRecord(json: Json): Record<string, unknown> {
  if (json && typeof json === "object" && !Array.isArray(json)) return json as Record<string, unknown>;
  throw internal("unexpected_rpc_response");
}

export function toMembership(json: Json): MembershipSummary {
  const r = asRecord(json);
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    userId: String(r.user_id),
    status: r.status as MembershipStatus,
    verificationMethod: (r.verification_method as VerificationMethod | null) ?? null,
  };
}

function toRequest(json: Json): MembershipRequestSummary {
  const r = asRecord(json);
  return {
    id: String(r.id),
    schoolId: String(r.school_id),
    userId: String(r.user_id),
    method: r.method as VerificationMethod,
    status: r.status as MembershipRequestStatus,
  };
}

/** Verification Method E — redeem an invitation code. */
export async function redeemInvitation(runner: RpcRunner, input: unknown): Promise<MembershipSummary> {
  const { code } = validate(redeemInviteSchema, input);
  return toMembership(await runner.rpc("redeem_invitation", { p_code: code }));
}

/** Verification Method D — match the caller's verified email against the roster. */
export async function resolveRosterMembership(runner: RpcRunner, input: unknown): Promise<MembershipSummary> {
  const { schoolId } = validate(resolveRosterSchema, input);
  return toMembership(await runner.rpc("resolve_roster_membership", { p_school: schoolId }));
}

/** Verification Method F — submit a manual membership request for admin review. */
export async function requestMembership(runner: RpcRunner, input: unknown): Promise<MembershipRequestSummary> {
  const v = validate(membershipRequestSchema, input);
  return toRequest(
    await runner.rpc("request_membership", {
      p_school: v.schoolId,
      p_grad_year: v.gradYear ?? null,
      p_explanation: v.explanation ?? null,
    }),
  );
}

/** Reviewer decision on a manual request (approve or reject). */
export async function reviewMembershipRequest(
  runner: RpcRunner,
  input: unknown,
): Promise<MembershipRequestSummary> {
  const v = validate(reviewMembershipRequestSchema, input);
  return toRequest(
    await runner.rpc("review_membership_request", {
      p_request: v.requestId,
      p_approve: v.approve,
      p_reason: v.reason ?? null,
    }),
  );
}

/** Reviewer status change (suspend / reinstate / remove) or self-leave. */
export async function setMembershipStatus(runner: RpcRunner, input: unknown): Promise<MembershipSummary> {
  const v = validate(setMembershipStatusSchema, input);
  return toMembership(
    await runner.rpc("set_membership_status", {
      p_membership: v.membershipId,
      p_status: v.status,
      p_reason: v.reason ?? null,
    }),
  );
}

export { getMembershipStatus, assertVerifiedMember } from "./authz.js";
