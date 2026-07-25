/**
 * Pure marketplace query logic: search + post-type/category/condition filters +
 * sort. Kept separate from the repository so it is unit-tested directly and reused
 * unchanged by a future Supabase-backed repository (which may instead push these
 * down to SQL, but the semantics are defined here).
 */
import type { Listing } from "../../domain/models";
import type { MarketplaceQuery } from "./types";

const normalize = (s: string): string => s.trim().toLowerCase();

export function applyMarketplaceQuery(listings: Listing[], query: MarketplaceQuery): Listing[] {
  const includeDemoLocal = query.includeDemoLocal ?? true;
  const search = query.search ? normalize(query.search) : "";
  const postTypes = query.postTypes && query.postTypes.length > 0 ? new Set(query.postTypes) : null;
  const categories = query.categories && query.categories.length > 0 ? new Set(query.categories) : null;
  const conditions = query.conditions && query.conditions.length > 0 ? new Set(query.conditions) : null;

  const filtered = listings.filter((l) => {
    if (l.schoolId !== query.schoolId) return false;
    if (!includeDemoLocal && l.demoLocal) return false;
    if (postTypes && !postTypes.has(l.postType)) return false;
    if (categories && !categories.has(l.category)) return false;
    if (conditions) {
      if (!l.condition || !conditions.has(l.condition)) return false;
    }
    if (search) {
      const haystack = `${l.title} ${l.description} ${l.category} ${l.desiredItem ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sort = query.sort ?? "recent";
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    return sort === "oldest" ? at - bt : bt - at;
  });

  return sorted;
}
