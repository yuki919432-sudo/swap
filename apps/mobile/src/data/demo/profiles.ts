/**
 * Synthetic demo profiles. Fictional first-name-only identities — never any real
 * student data, and no email addresses are exposed anywhere in the UI.
 *
 * Covers the required cast: a verified university student, a verified high-school
 * student, a pending student, and a school moderator.
 */
import type { DemoProfile } from "../../domain/models";

export const demoProfiles: DemoProfile[] = [
  {
    id: "profile-uni-verified",
    schoolId: "school-uni",
    displayName: "Maya",
    membershipStatus: "verified",
    verificationMethod: "email_otp",
    gradYear: 2027,
    staffRole: null,
    avatarEmoji: "🌸",
    impact: { given: 12, swapped: 5, saved: 18 },
  },
  {
    id: "profile-uni-moderator",
    schoolId: "school-uni",
    displayName: "Devin",
    membershipStatus: "verified",
    verificationMethod: "invite_code",
    gradYear: 2025,
    staffRole: "school_moderator",
    avatarEmoji: "🛡️",
    impact: { given: 7, swapped: 9, saved: 4 },
  },
  {
    id: "profile-hs-verified",
    schoolId: "school-hs",
    displayName: "Alex",
    membershipStatus: "verified",
    verificationMethod: "invite_code",
    gradYear: 2028,
    staffRole: null,
    avatarEmoji: "⚡",
    impact: { given: 3, swapped: 2, saved: 9 },
  },
  {
    id: "profile-hs-pending",
    schoolId: "school-hs",
    displayName: "Rowan",
    membershipStatus: "pending",
    verificationMethod: "manual",
    gradYear: 2029,
    staffRole: null,
    avatarEmoji: "🌱",
    impact: { given: 0, swapped: 0, saved: 2 },
  },
];

export const demoProfileById = (id: string): DemoProfile | undefined =>
  demoProfiles.find((p) => p.id === id);

export const demoProfilesForSchool = (schoolId: string): DemoProfile[] =>
  demoProfiles.filter((p) => p.schoolId === schoolId);
