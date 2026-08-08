import { describe, it, expect } from "vitest";
import { resolveOnboardingStep, isOnboardingComplete } from "./onboarding";

const active = (status: "pending" | "verified" | "rejected" | "suspended" | "left" | "expired") => ({ status, schoolActive: true });

describe("resolveOnboardingStep — the pilot funnel order", () => {
  it("age gate comes before anything else (no account for under-13)", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: false, authed: false, membership: null })).toBe("age_gate");
    expect(resolveOnboardingStep({ ageConfirmed13Plus: false, authed: true, membership: active("verified") })).toBe("age_gate");
  });
  it("then requires a signed-in session", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: false, membership: null })).toBe("auth");
  });
  it("then requires enrollment when there is no membership", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: null })).toBe("enroll");
  });
  it("maps each membership status to its screen", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("pending") })).toBe("pending");
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("rejected") })).toBe("rejected");
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("suspended") })).toBe("suspended");
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("verified") })).toBe("ready");
  });
  it("an inactive school blocks entry even for a verified member", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: { status: "verified", schoolActive: false } })).toBe("school_inactive");
  });
  it("ended memberships (left/expired) route back to enrollment", () => {
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("left") })).toBe("enroll");
    expect(resolveOnboardingStep({ ageConfirmed13Plus: true, authed: true, membership: active("expired") })).toBe("enroll");
  });
  it("only 'ready' completes onboarding", () => {
    expect(isOnboardingComplete("ready")).toBe(true);
    for (const s of ["age_gate", "auth", "enroll", "pending", "rejected", "suspended", "school_inactive"] as const) {
      expect(isOnboardingComplete(s)).toBe(false);
    }
  });
});
