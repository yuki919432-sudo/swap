/**
 * Notification hook for wishlist matches — PREPARED, not active.
 *
 * The database already records "a new listing matched a wishlist" into the
 * wishlist_matches outbox (unnotified rows). A future push-notification service
 * ("A new item matching your wishlist has been listed.") will implement this
 * interface and mark rows notified. For now the no-op implementation just collects
 * them so the surrounding flow can be built and tested without sending anything.
 */
import type { WishlistMatch } from "../domain/models";

export interface WishlistNotifier {
  /** Deliver notifications for freshly-matched wishlist items. */
  notify(matches: WishlistMatch[]): Promise<void>;
}

/** Default no-op notifier. Records what WOULD be sent; sends nothing. */
export class NoopWishlistNotifier implements WishlistNotifier {
  readonly delivered: WishlistMatch[] = [];
  async notify(matches: WishlistMatch[]): Promise<void> {
    // Intentionally does not send push notifications (not implemented in this phase).
    for (const m of matches) if (!m.notified) this.delivered.push(m);
  }
}

/** The pending (un-notified) matches a future notifier would deliver. */
export const pendingWishlistNotifications = (matches: WishlistMatch[]): WishlistMatch[] =>
  matches.filter((m) => !m.notified);
