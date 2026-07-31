/**
 * In-app activity events — PREPARED, not push.
 *
 * The wishlist journey produces moments worth surfacing ("a new item matches your
 * wishlist", "an item you were matched to is no longer available", "you fulfilled a
 * request", "someone listed in response to campus demand"). This module models
 * those events and builds them deterministically from data the app already has. It
 * deliberately does NOT deliver anything — no push, no email. A future in-app
 * activity feed (or a push service) can consume the recorded events. Keeping the
 * event shape + builders here lets the flows emit and be tested today without
 * sending a single notification.
 */
import type { WishlistItem, WishlistMatchDetail } from "../domain/models";

export type ActivityEventType =
  | "wishlist_match"
  | "matched_listing_unavailable"
  | "wishlist_fulfilled"
  | "demand_response";

export interface ActivityEvent {
  /**
   * Deterministic id so re-emitting the same logical event is idempotent (the
   * recorder dedupes on it — the feed never shows the same match twice).
   */
  id: string;
  type: ActivityEventType;
  /** ISO-8601. */
  at: string;
  /** A short, human-readable line for an in-app feed. Never leaks another student's identity. */
  title: string;
  wishlistItemId?: string;
  listingId?: string;
}

const iso = (now?: number): string => new Date(now ?? Date.now()).toISOString();

/**
 * One event per AVAILABLE match. `seenListingKeys` (a set of `${wishlistItemId}:${listingId}`)
 * suppresses matches already surfaced, so only genuinely-new matches produce an event.
 */
export function wishlistMatchEvents(
  details: WishlistMatchDetail[],
  opts?: { now?: number; seenKeys?: ReadonlySet<string> },
): ActivityEvent[] {
  const seen = opts?.seenKeys ?? new Set<string>();
  const out: ActivityEvent[] = [];
  for (const d of details) {
    if (!d.available || d.listing === null) continue;
    const key = `${d.wishlistItemId}:${d.listing.id}`;
    if (seen.has(key)) continue;
    out.push({
      id: `wishlist_match:${key}`,
      type: "wishlist_match",
      at: iso(opts?.now),
      title: `New match for "${d.wishlistTitle}": ${d.listing.title}`,
      wishlistItemId: d.wishlistItemId,
      listingId: d.listing.id,
    });
  }
  return out;
}

/** One event per match whose listing is no longer available (taken down / reserved / completed). */
export function unavailableMatchEvents(details: WishlistMatchDetail[], now?: number): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const d of details) {
    if (d.available) continue;
    const listingId = d.listing?.id;
    const label = d.listing?.title ?? "A matched item";
    out.push({
      id: `matched_listing_unavailable:${d.wishlistItemId}:${listingId ?? "gone"}`,
      type: "matched_listing_unavailable",
      at: iso(now),
      title: `No longer available for "${d.wishlistTitle}": ${label}`,
      wishlistItemId: d.wishlistItemId,
      ...(listingId ? { listingId } : {}),
    });
  }
  return out;
}

/** The wisher marked a request fulfilled. */
export function wishlistFulfilledEvent(item: Pick<WishlistItem, "id" | "title">, now?: number): ActivityEvent {
  return {
    id: `wishlist_fulfilled:${item.id}`,
    type: "wishlist_fulfilled",
    at: iso(now),
    title: `You fulfilled your request: "${item.title}"`,
    wishlistItemId: item.id,
  };
}

/** Someone listed an item in response to visible campus demand. */
export function demandResponseEvent(input: { label: string; listingId?: string }, now?: number): ActivityEvent {
  return {
    id: `demand_response:${input.listingId ?? input.label.toLowerCase()}`,
    type: "demand_response",
    at: iso(now),
    title: `Listed in response to campus demand: ${input.label}`,
    ...(input.listingId ? { listingId: input.listingId } : {}),
  };
}
