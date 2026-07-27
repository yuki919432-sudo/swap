/**
 * Campus Market discovery — pure, deterministic shelf + demand builders.
 *
 * The Campus Market is a DERIVED experience: there is no "campus market" row, it
 * IS the school's always-open scope. These builders turn the data the app already
 * has (school listings, the viewer's wishlist, the school's active demand) into
 * browsable shelves. Everything here is deterministic — recency, category
 * relevance, wishlist matches, and demand counts. We NEVER invent popularity or
 * view counts, so every shelf is labelled by the real signal that produced it.
 *
 * Kept free of storage/network so it runs identically in the mock repo, the
 * Supabase repo, and unit tests.
 */
import type { Listing, WishlistItem } from "../../domain/models";
import { bestWishlistScore, WISHLIST_MATCH_THRESHOLD } from "../../recommendations/scoring";
import type { DemandCluster, DiscoveryShelf } from "./types";

export interface DiscoveryInput {
  schoolId: string;
  /** The school's active listings (already RLS/school-scoped). */
  listings: Listing[];
  /** The viewer's own active wishlist (for "Matches Your Wishlist"). */
  myWishlist: WishlistItem[];
  now?: number;
  /** Max listings per shelf. */
  limit?: number;
}

const DAY_MS = 24 * 3600 * 1000;
const recency = (a: Listing, b: Listing): number => Date.parse(b.createdAt) - Date.parse(a.createdAt);
const byRecency = (ls: Listing[]): Listing[] => [...ls].sort(recency);

/** Build the ordered discovery shelves for a school. Empty shelves are dropped. */
export function buildDiscoveryShelves(input: DiscoveryInput): DiscoveryShelf[] {
  const now = input.now ?? Date.now();
  const limit = input.limit ?? 12;
  const all = input.listings;
  const shelves: DiscoveryShelf[] = [];

  const push = (
    key: string,
    title: string,
    signal: DiscoveryShelf["signal"],
    subtitle: string,
    listings: Listing[],
  ): void => {
    if (listings.length > 0) shelves.push({ key, title, signal, subtitle, listings: listings.slice(0, limit) });
  };

  // New Today — posted in the last 24h (pure recency).
  push(
    "new_today",
    "New Today",
    "recency",
    "Posted in the last 24 hours",
    byRecency(all.filter((l) => now - Date.parse(l.createdAt) <= DAY_MS)),
  );

  // Matches Your Wishlist — the viewer's own "looking for" requests.
  if (input.myWishlist.length > 0) {
    const matched = all
      .map((l) => ({ l, s: bestWishlistScore(l, input.myWishlist).score }))
      .filter((x) => x.s >= WISHLIST_MATCH_THRESHOLD)
      .sort((a, b) => b.s - a.s || recency(a.l, b.l))
      .map((x) => x.l);
    push("wishlist", "Matches Your Wishlist", "wishlist", "Items you're looking for", matched);
  }

  // Free Stuff — give-away listings.
  push("free", "Free Stuff", "free", "Give-aways from fellow students", byRecency(all.filter((l) => l.postType === "give")));

  // Trending on Campus — most recently posted (honest recency, not view counts).
  push("trending", "Trending on Campus", "recency", "Freshly posted across campus", byRecency(all));

  // Ending Soon — listings with an expiry, soonest first.
  push(
    "ending_soon",
    "Ending Soon",
    "ending",
    "Listings about to expire",
    all
      .filter((l) => l.expiresAt !== null && Date.parse(l.expiresAt) > now)
      .sort((a, b) => Date.parse(a.expiresAt as string) - Date.parse(b.expiresAt as string)),
  );

  // Textbooks.
  push("textbooks", "Textbooks", "category", "For your classes", byRecency(all.filter((l) => l.category === "textbooks")));

  // Dorm Essentials.
  push(
    "dorm",
    "Dorm Essentials",
    "category",
    "Kit out your room",
    byRecency(all.filter((l) => l.category === "dormitory_items" || l.category === "furniture")),
  );

  // Fashion and Sneakers.
  push(
    "fashion",
    "Fashion and Sneakers",
    "category",
    "Clothing, shoes, and fits",
    byRecency(all.filter((l) => l.category === "clothing" || l.category === "shoes")),
  );

  // Unexpected Finds — deterministic "surprise": rarest categories first, then recency.
  const freq = new Map<string, number>();
  for (const l of all) freq.set(l.category, (freq.get(l.category) ?? 0) + 1);
  const surprise = [...all].sort(
    (a, b) => (freq.get(a.category) ?? 0) - (freq.get(b.category) ?? 0) || recency(a, b),
  );
  push("unexpected", "Unexpected Finds", "category", "A little bit of everything", surprise);

  return shelves;
}

/**
 * Privacy-safe demand: cluster the school's active wishlist into normalized groups
 * and report only DISTINCT-student counts — never who wants what. A cluster keys on
 * its preferred category when present, else a normalized title token, so "mini
 * fridge" requests collapse together without exposing any individual request.
 */
export function buildDemandClusters(wishlist: WishlistItem[], now?: number): DemandCluster[] {
  void now;
  const clusters = new Map<string, { label: string; category: string | null; users: Set<string> }>();
  for (const w of wishlist) {
    if (w.status !== "active") continue;
    const key = w.preferredCategory ?? normalizeTitle(w.title);
    const label = w.preferredCategory ? categoryLabel(w.preferredCategory) : titleLabel(w.title);
    const c = clusters.get(key) ?? { label, category: w.preferredCategory, users: new Set<string>() };
    c.users.add(w.userId);
    clusters.set(key, c);
  }
  return [...clusters.entries()]
    .map(([key, c]) => ({ key, label: c.label, category: c.category, studentCount: c.users.size }))
    .sort((a, b) => b.studentCount - a.studentCount || a.label.localeCompare(b.label));
}

const STOP = new Set(["looking", "for", "a", "an", "the", "some", "any", "to", "my", "need", "want", "wanted"]);
const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .sort()
    .join(" ") || title.toLowerCase().trim();

const titleLabel = (title: string): string => {
  const cleaned = title.replace(/^\s*looking for\s+(a\s+|an\s+|the\s+)?/i, "").trim();
  return cleaned.length > 0 ? cleaned : title.trim();
};

const categoryLabel = (category: string): string =>
  category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
