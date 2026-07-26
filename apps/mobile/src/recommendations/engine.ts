/**
 * Modular deterministic recommendation engine.
 *
 * Screens depend on the RecommendationEngine INTERFACE, not this implementation,
 * so it can be replaced later (a smarter ranker, or a server-side engine) without
 * touching the UI. No external AI/ML — deterministic scoring over data the app
 * already has (listings, the user's wishlist, saved ids, browsing history).
 */
import type { Listing, WishlistItem } from "../domain/models";
import { WISHLIST_MATCH_THRESHOLD, bestWishlistScore, listingSimilarity, scoreWishlistMatch } from "./scoring";

export type ShelfKind =
  | "recommended"
  | "because_you_liked"
  | "wishlist_match"
  | "popular"
  | "trending"
  | "new_in_categories";

export interface RecommendationShelf {
  kind: ShelfKind;
  title: string;
  subtitle?: string;
  listings: Listing[];
}

export interface RecommendationInput {
  currentUserId: string;
  schoolId: string;
  /** Candidate pool (the school feed). */
  listings: Listing[];
  /** The current user's active wishlist. */
  wishlist: WishlistItem[];
  /** Ids of listings the user has saved. */
  savedIds: string[];
  /** Categories the user has recently browsed (most-recent first). */
  browsedCategories: string[];
  /** Optional popularity signal (id → count). Falls back to recency when absent. */
  popularityById?: Record<string, number>;
  now?: number;
  /** Max listings per shelf. */
  limit?: number;
}

export interface RecommendationEngine {
  buildShelves(input: RecommendationInput): RecommendationShelf[];
  /** Score a single listing against a wishlist (0..1). */
  wishlistScore(listing: Listing, wishlist: WishlistItem[]): number;
  /** Listings similar to a seed (for "similar" / "students also viewed"). */
  similarTo(seed: Listing, pool: Listing[], limit?: number): Listing[];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export class DeterministicRecommendationEngine implements RecommendationEngine {
  buildShelves(input: RecommendationInput): RecommendationShelf[] {
    const now = input.now ?? Date.now();
    const limit = input.limit ?? 10;
    const savedSet = new Set(input.savedIds);
    // Candidate listings the user could act on (the school feed already excludes
    // drafts and other schools).
    const candidates = input.listings;

    const shelves: RecommendationShelf[] = [];

    // 1. Matches your wishlist — highest intent.
    const wl = candidates
      .map((l) => ({ l, s: bestWishlistScore(l, input.wishlist).score }))
      .filter((x) => x.s >= WISHLIST_MATCH_THRESHOLD)
      .sort((a, b) => b.s - a.s || recency(b.l, a.l))
      .map((x) => x.l)
      .slice(0, limit);
    if (wl.length) shelves.push({ kind: "wishlist_match", title: "Matches your wishlist", subtitle: "New items you're looking for", listings: wl });

    // 2. Because you liked … (similar to your most-recent saved item).
    const lastSaved = input.listings.find((l) => savedSet.has(l.id));
    if (lastSaved) {
      const sim = this.similarTo(lastSaved, candidates.filter((l) => !savedSet.has(l.id)), limit);
      if (sim.length) shelves.push({ kind: "because_you_liked", title: `Because you liked "${truncate(lastSaved.title)}"`, listings: sim });
    }

    // 3. New in categories you browse.
    if (input.browsedCategories.length) {
      const cats = new Set(input.browsedCategories);
      const byCat = candidates
        .filter((l) => cats.has(l.category))
        .sort((a, b) => recency(a, b))
        .slice(0, limit);
      if (byCat.length) shelves.push({ kind: "new_in_categories", title: "New in categories you browse", listings: byCat });
    }

    // 4. Trending this week — recent, weighted by the popularity signal.
    const trending = candidates
      .filter((l) => now - Date.parse(l.createdAt) <= WEEK_MS)
      .sort((a, b) => this.pop(input, b) - this.pop(input, a) || recency(a, b))
      .slice(0, limit);
    if (trending.length) shelves.push({ kind: "trending", title: "Trending this week", listings: trending });

    // 5. Popular in your school.
    const popular = [...candidates].sort((a, b) => this.pop(input, b) - this.pop(input, a) || recency(a, b)).slice(0, limit);
    if (popular.length) shelves.push({ kind: "popular", title: "Popular in your school", listings: popular });

    // 6. Recommended for you — a deterministic blend (wishlist > browsed-category > saved-similarity),
    // deduped, excluding anything already saved.
    const blend = this.recommendedForYou(input, candidates, savedSet, limit);
    if (blend.length) shelves.unshift({ kind: "recommended", title: "Recommended for you", listings: blend });

    return shelves;
  }

  wishlistScore(listing: Listing, wishlist: WishlistItem[]): number {
    return bestWishlistScore(listing, wishlist).score;
  }

  similarTo(seed: Listing, pool: Listing[], limit = 10): Listing[] {
    return pool
      .filter((l) => l.id !== seed.id)
      .map((l) => ({ l, s: listingSimilarity(seed, l) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || recency(a.l, b.l))
      .map((x) => x.l)
      .slice(0, limit);
  }

  private recommendedForYou(input: RecommendationInput, candidates: Listing[], saved: Set<string>, limit: number): Listing[] {
    const scored = candidates
      .filter((l) => !saved.has(l.id))
      .map((l) => ({ l, score: scoreForBlend(l, input) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || recency(a.l, b.l));
    return scored.slice(0, limit).map((x) => x.l);
  }

  private pop(input: RecommendationInput, l: Listing): number {
    return input.popularityById?.[l.id] ?? 0;
  }
}

function scoreForBlend(l: Listing, input: RecommendationInput): number {
  const w = bestWishlistScore(l, input.wishlist).score;
  const catBoost = input.browsedCategories.includes(l.category) ? 0.35 : 0;
  const popBoost = Math.min(0.3, (input.popularityById?.[l.id] ?? 0) / 100);
  return w * 2 + catBoost + popBoost;
}

const recency = (a: Listing, b: Listing): number => Date.parse(b.createdAt) - Date.parse(a.createdAt);
const truncate = (s: string, n = 24): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export { scoreWishlistMatch };
