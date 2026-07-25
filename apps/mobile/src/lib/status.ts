/** Membership + listing status presentation helpers. */
import type { ListingStatus, MembershipStatus } from "@swap/types";
import type { BadgeTone } from "../components/Badge";

export const membershipStatusLabel: Record<MembershipStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
  left: "Left",
  expired: "Expired",
};

export const membershipTone: Record<MembershipStatus, BadgeTone> = {
  pending: "warn",
  verified: "success",
  rejected: "danger",
  suspended: "danger",
  left: "neutral",
  expired: "neutral",
};

export const listingStatusLabel: Record<ListingStatus, string> = {
  draft: "Draft",
  active: "Active",
  reserved: "Reserved",
  in_transaction: "In transaction",
  completed: "Completed",
  expired: "Expired",
  removed: "Removed",
};

export const listingTone: Record<ListingStatus, BadgeTone> = {
  draft: "neutral",
  active: "success",
  reserved: "warn",
  in_transaction: "info",
  completed: "accent",
  expired: "neutral",
  removed: "danger",
};
