/**
 * Mobile view-model types. These are the shapes the UI renders. They deliberately
 * mirror the eventual Supabase-backed data but stay UI-facing (camelCase, only the
 * fields screens need) so repositories can be swapped without touching screens.
 *
 * Enums are reused from @swap/types so the mobile layer never drifts from the
 * database's source of truth.
 */
import type {
  CommunityPostType,
  ItemCondition,
  ListingPostType,
  ListingStatus,
  MembershipStatus,
  VerificationMethod,
} from "@swap/types";

export type InstitutionType = "high_school" | "university";

export interface DemoSchool {
  id: string;
  name: string;
  institutionType: InstitutionType;
  description: string;
  memberCount: number;
  /** Methods this (synthetic) school has enabled — display only. */
  verificationMethods: VerificationMethod[];
  accentEmoji: string;
}

export interface DemoProfile {
  id: string;
  schoolId: string;
  displayName: string;
  membershipStatus: MembershipStatus;
  verificationMethod: VerificationMethod | null;
  gradYear: number | null;
  /** A school staff role, if this profile is a moderator/admin. Display only. */
  staffRole: "school_moderator" | null;
  avatarEmoji: string;
  /** Synthetic impact stats for the profile screen. */
  impact: { given: number; swapped: number; saved: number };
}

export interface OwnerPreview {
  displayName: string;
  avatarEmoji: string;
  verified: boolean;
}

export interface Listing {
  id: string;
  schoolId: string;
  postType: ListingPostType;
  status: ListingStatus;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  /** For swap posts: what the owner wants in return. */
  desiredItem: string | null;
  images: ImageRef[];
  handoffLocation: string | null;
  owner: OwnerPreview;
  /** ISO-8601 timestamp. */
  createdAt: string;
  expiresAt: string | null;
  /** True when this listing was published in the local demo session. */
  demoLocal: boolean;
}

/** An image reference. Demo images are emoji/gradient placeholders or a picked local URI. */
export interface ImageRef {
  /** "placeholder" (emoji + gradient) or "local" (a device URI from the picker). */
  kind: "placeholder" | "local";
  /** Emoji for placeholder, or file URI for local. */
  value: string;
}

export interface CommunityItem {
  id: string;
  schoolId: string;
  type: CommunityPostType;
  title: string;
  description: string;
  organizer: OwnerPreview;
  /** Optional event date (ISO) for event-like items. */
  when: string | null;
  location: string | null;
  createdAt: string;
}

export interface InboxThread {
  id: string;
  schoolId: string;
  counterpart: OwnerPreview;
  /** Context label, e.g. a listing title. */
  contextLabel: string;
  preview: string;
  unread: number;
  lastAt: string;
}
