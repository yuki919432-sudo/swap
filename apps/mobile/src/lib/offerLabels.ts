/** Presentation helpers for offers + handoff. Presentation only. */
import type { HandoffStage, HandoffStatus, OfferKind, OfferStatus } from "@swap/types";
import type { BadgeTone } from "../components/Badge";

export const offerKindLabel: Record<OfferKind, string> = {
  give: "Give",
  swap: "Swap",
  borrow: "Borrow",
  lend: "Lend",
  sale: "Sale",
};

export const offerKindEmoji: Record<OfferKind, string> = {
  give: "🎁",
  swap: "🔄",
  borrow: "🤲",
  lend: "📦",
  sale: "🏷️",
};

export const offerStatusLabel: Partial<Record<OfferStatus, string>> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  countered: "Countered",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Completed",
};

export const offerStatusTone = (s: OfferStatus): BadgeTone => {
  switch (s) {
    case "pending":
      return "info";
    case "accepted":
      return "accent";
    case "completed":
      return "success";
    case "declined":
    case "cancelled":
    case "expired":
      return "neutral";
    case "countered":
      return "warn";
    default:
      return "neutral";
  }
};

export const handoffStatusLabel: Record<HandoffStatus, string> = {
  not_scheduled: "Not scheduled",
  scheduled: "Scheduled",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Needs review",
};

export const handoffStageLabel: Record<HandoffStage, string> = {
  none: "—",
  handed_over: "Handed over",
  return_due: "Return due",
  returned: "Returned",
};
