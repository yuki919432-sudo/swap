/**
 * Application-layer authorization helpers. These are convenience guards for API
 * handlers and are defense-in-depth only — the database (RLS + SECURITY DEFINER
 * functions) remains the real authority. They read the caller's own membership
 * status via the `membership_status` RPC (RLS-safe).
 */
import type { MembershipStatus } from "@swap/types";
import { membershipRequired } from "./errors.js";
import type { RpcRunner } from "./runner.js";

export async function getMembershipStatus(
  runner: RpcRunner,
  schoolId: string,
): Promise<MembershipStatus | null> {
  const status = await runner.rpc<string | null>("get_membership_status", { p_school: schoolId });
  return (status as MembershipStatus | null) ?? null;
}

/** Throw membership_required unless the caller is a verified member of the school. */
export async function assertVerifiedMember(runner: RpcRunner, schoolId: string): Promise<void> {
  const status = await getMembershipStatus(runner, schoolId);
  if (status !== "verified") throw membershipRequired();
}
