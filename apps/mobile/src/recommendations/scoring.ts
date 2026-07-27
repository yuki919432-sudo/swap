/**
 * Deterministic scoring primitives for the recommendation layer. No AI/ML — pure,
 * stable functions over the data we already have. These mirror the *concept* of
 * the server-side SQL matcher (title similarity + category + condition + swap
 * compatibility); the authoritative wishlist match outbox is computed in the
 * database, while these power the broader client recommendation shelves.
 */
import type { Listing, WishlistItem } from "../domain/models";

const STOP = new Set(["the", "a", "an", "for", "my", "to", "of", "and", "in", "with", "looking", "want", "wanted", "need"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Jaccard overlap of two token sets (0..1). */
export function tokenOverlap(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Only listings that OFFER an item can satisfy a wishlist. */
const OFFER_TYPES = new Set(["give", "swap", "lend"]);

/**
 * Deterministic score (0..1) that a listing satisfies a wishlist item. Returns 0
 * when the listing can't possibly match (wrong post type, incompatible swap, or
 * the wisher's own listing). Mirrors the SQL matcher's weighting.
 */
export function scoreWishlistMatch(listing: Listing, item: WishlistItem): number {
  if (item.status !== "active") return 0;
  if (!OFFER_TYPES.has(listing.postType)) return 0;
  if (listing.postType === "swap" && !item.swapAcceptable) return 0;
  // (Excluding the wisher's own listings is the caller's responsibility.)

  let score = tokenOverlap(item.title, `${listing.title} ${listing.description}`);
  if (item.preferredCategory && item.preferredCategory === listing.category) score += 0.3;
  if (item.preferredCondition === null || item.preferredCondition === listing.condition) score += 0.1;
  return Math.min(1, score);
}

export const WISHLIST_MATCH_THRESHOLD = 0.25;

/** Best wishlist score for a listing across a set of wishlist items. */
export function bestWishlistScore(listing: Listing, items: WishlistItem[]): { score: number; itemId: string | null } {
  let best = 0;
  let itemId: string | null = null;
  for (const it of items) {
    const s = scoreWishlistMatch(listing, it);
    if (s > best) {
      best = s;
      itemId = it.id;
    }
  }
  return { score: best, itemId };
}

/** Similarity between two listings for "similar" / "students also viewed" shelves. */
export function listingSimilarity(a: Listing, b: Listing): number {
  let score = tokenOverlap(`${a.title} ${a.description}`, `${b.title} ${b.description}`);
  if (a.category === b.category) score += 0.25;
  return Math.min(1, score);
}
