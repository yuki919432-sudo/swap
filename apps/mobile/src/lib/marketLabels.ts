/** Presentation helpers for temporary-market status. Presentation only. */
import type { MarketStatus } from "@swap/types";
import type { BadgeTone } from "../components/Badge";

export const marketStatusLabel: Record<MarketStatus, string> = {
  upcoming: "Upcoming",
  active: "Live now",
  ended: "Ended",
  cancelled: "Cancelled",
};

const TONE: Record<MarketStatus, BadgeTone> = {
  upcoming: "info",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

export const marketStatusBadge = (status: MarketStatus): { label: string; tone: BadgeTone } => ({
  label: marketStatusLabel[status],
  tone: TONE[status],
});
