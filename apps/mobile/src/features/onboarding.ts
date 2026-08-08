/**
 * Onboarding funnel — the pure decision that routes a pilot user to the right step.
 *
 * Order enforces the safety rules: the 13+ age gate comes FIRST (we never create an
 * account for an under-13 user), then Supabase auth, then school enrollment, then
 * the membership-status screens. Only a verified member of an active school reaches
 * the app. Kept pure so the funnel is unit-tested and independent of any runtime.
 */
import type { MembershipStatus } from "@swap/types";

export interface MembershipSnapshot {
  status: MembershipStatus;
  /** False when the user's school is not active (e.g. paused/closed). */
  schoolActive: boolean;
}

export type OnboardingStep =
  | "age_gate"
  | "auth"
  | "enroll"
  | "pending"
  | "rejected"
  | "suspended"
  | "school_inactive"
  | "ready";

export function resolveOnboardingStep(input: {
  ageConfirmed13Plus: boolean;
  authed: boolean;
  membership: MembershipSnapshot | null;
}): OnboardingStep {
  // 1. Age gate before any account exists.
  if (!input.ageConfirmed13Plus) return "age_gate";
  // 2. Real Supabase session.
  if (!input.authed) return "auth";
  // 3. School enrollment + membership state.
  const m = input.membership;
  if (!m) return "enroll";
  if (!m.schoolActive) return "school_inactive";
  switch (m.status) {
    case "verified":
      return "ready";
    case "pending":
      return "pending";
    case "rejected":
      return "rejected";
    case "suspended":
      return "suspended";
    case "left":
    case "expired":
      return "enroll"; // membership ended → the user may re-enroll
    default:
      return "enroll";
  }
}

/** True only when the funnel is fully complete and the app should render. */
export function isOnboardingComplete(step: OnboardingStep): boolean {
  return step === "ready";
}
