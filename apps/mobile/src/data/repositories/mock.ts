/**
 * Mock repository implementations for demo mode.
 *
 * Each implements a repository interface from ./types using synthetic data +
 * local persistence (JsonStore). Screens depend on the interfaces, so replacing
 * these with Supabase-backed implementations later requires no screen changes.
 */
import type { CommunityItem, DemoSchool, InboxThread, Listing, OwnerPreview, WishlistItem, WishlistMatch } from "../../domain/models";
import type { WishlistStatus } from "@swap/types";
import { demoCommunity, demoInbox, demoListings, demoProfileById, demoProfilesForSchool, demoProfiles, demoSchoolById, demoSchools, demoWishlist } from "../demo";
import { JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { newId } from "../../lib/id";
import { scoreWishlistMatch, WISHLIST_MATCH_THRESHOLD } from "../../recommendations/scoring";
import { applyMarketplaceQuery } from "./marketplaceQuery";
import type {
  CommunityRepository,
  DraftListing,
  DraftListingsRepository,
  InboxRepository,
  MarketplaceQuery,
  MarketplaceRepository,
  NewListing,
  NewWishlistItem,
  Repositories,
  SavedListingsRepository,
  SessionRepository,
  SessionState,
  WishlistRepository,
} from "./types";

/* ----------------------------------------------------------------- session */

export class MockSessionRepository implements SessionRepository {
  constructor(private readonly store: JsonStore) {}

  async listSchools(): Promise<DemoSchool[]> {
    return demoSchools;
  }
  async listProfiles(schoolId: string) {
    return demoProfilesForSchool(schoolId);
  }
  async getCurrent(): Promise<SessionState | null> {
    const profileId = await this.store.read<string | null>(StorageKeys.selectedProfile, null);
    if (!profileId) return null;
    const profile = demoProfileById(profileId);
    if (!profile) return null;
    const school = demoSchoolById(profile.schoolId);
    if (!school) return null;
    return { school, profile };
  }
  async select(profileId: string): Promise<SessionState> {
    const profile = demoProfileById(profileId);
    if (!profile) throw new Error(`unknown demo profile: ${profileId}`);
    const school = demoSchoolById(profile.schoolId);
    if (!school) throw new Error(`unknown demo school: ${profile.schoolId}`);
    await this.store.write(StorageKeys.selectedProfile, profileId);
    return { school, profile };
  }
  async clear(): Promise<void> {
    await this.store.remove(StorageKeys.selectedProfile);
  }
}

/* -------------------------------------------------------------- marketplace */

export class MockMarketplaceRepository implements MarketplaceRepository {
  constructor(private readonly store: JsonStore) {}

  private async allForSchool(schoolId: string): Promise<Listing[]> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    return [...published.filter((l) => l.schoolId === schoolId), ...demoListings.filter((l) => l.schoolId === schoolId)];
  }

  async list(query: MarketplaceQuery): Promise<Listing[]> {
    return applyMarketplaceQuery(await this.allForSchool(query.schoolId), query);
  }
  async getById(id: string): Promise<Listing | null> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    return published.find((l) => l.id === id) ?? demoListings.find((l) => l.id === id) ?? null;
  }
  async categoriesForSchool(schoolId: string): Promise<string[]> {
    const all = await this.allForSchool(schoolId);
    return [...new Set(all.map((l) => l.category))].sort();
  }
  async createListing(input: NewListing, owner: OwnerPreview): Promise<Listing> {
    const listing: Listing = {
      id: newId("listing"),
      schoolId: input.schoolId,
      postType: input.postType,
      status: "active",
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      condition: input.condition,
      desiredItem: input.desiredItem?.trim() || null,
      images: input.images.length ? input.images : [{ kind: "placeholder", value: "📦" }],
      handoffLocation: input.handoffLocation?.trim() || null,
      owner,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      demoLocal: true,
    };
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    await this.store.write(StorageKeys.publishedDemoListings, [listing, ...published.filter((l) => l.id !== listing.id)]);
    return listing;
  }
  async deleteListing(id: string): Promise<void> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    await this.store.write(
      StorageKeys.publishedDemoListings,
      published.filter((l) => l.id !== id),
    );
  }
}

/* ---------------------------------------------------------------- community */

export class MockCommunityRepository implements CommunityRepository {
  async list(schoolId: string): Promise<CommunityItem[]> {
    return demoCommunity.filter((c) => c.schoolId === schoolId);
  }
}

/* -------------------------------------------------------------------- inbox */

export class MockInboxRepository implements InboxRepository {
  async list(schoolId: string): Promise<InboxThread[]> {
    return demoInbox.filter((t) => t.schoolId === schoolId);
  }
}

/* ----------------------------------------------------------- saved listings */

export class MockSavedListingsRepository implements SavedListingsRepository {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<string[]> {
    return this.store.read<string[]>(StorageKeys.savedListings, []);
  }
  async isSaved(listingId: string): Promise<boolean> {
    return (await this.list()).includes(listingId);
  }
  async toggle(listingId: string): Promise<boolean> {
    const current = await this.list();
    const has = current.includes(listingId);
    const next = has ? current.filter((id) => id !== listingId) : [listingId, ...current];
    await this.store.write(StorageKeys.savedListings, next);
    return !has;
  }
}

/* ------------------------------------------------------------------ drafts */

export class MockDraftListingsRepository implements DraftListingsRepository {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<DraftListing[]> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    return [...drafts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  async getById(id: string): Promise<DraftListing | null> {
    return (await this.list()).find((d) => d.id === id) ?? null;
  }
  async save(draft: DraftListing): Promise<DraftListing> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    const next = [draft, ...drafts.filter((d) => d.id !== draft.id)];
    await this.store.write(StorageKeys.drafts, next);
    return draft;
  }
  async remove(id: string): Promise<void> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    await this.store.write(
      StorageKeys.drafts,
      drafts.filter((d) => d.id !== id),
    );
  }
  async markPublished(id: string, listingId: string): Promise<void> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    await this.store.write(
      StorageKeys.drafts,
      drafts.map((d) => (d.id === id ? { ...d, publishedListingId: listingId, status: "active" as const } : d)),
    );
  }
}

/* ---------------------------------------------------------------- wishlist */

export class MockWishlistRepository implements WishlistRepository {
  constructor(private readonly store: JsonStore) {}

  private mine(): Promise<WishlistItem[]> {
    return this.store.read<WishlistItem[]>(StorageKeys.demoWishlist, []);
  }
  private async currentUserId(): Promise<string> {
    return (await this.store.read<string | null>(StorageKeys.selectedProfile, null)) ?? "demo-user";
  }

  async listMine(): Promise<WishlistItem[]> {
    return (await this.mine()).filter((w) => w.status !== "cancelled");
  }
  async listForSchool(schoolId: string): Promise<WishlistItem[]> {
    const uid = await this.currentUserId();
    const others = demoWishlist.filter((w) => w.schoolId === schoolId && w.userId !== uid && w.status === "active");
    const mine = (await this.mine()).filter((w) => w.schoolId === schoolId && w.status === "active");
    return [...mine, ...others];
  }
  async create(input: NewWishlistItem): Promise<WishlistItem> {
    const item: WishlistItem = {
      id: newId("wish"),
      schoolId: input.schoolId,
      userId: await this.currentUserId(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      preferredCategory: input.preferredCategory,
      preferredCondition: input.preferredCondition,
      budgetCents: input.budgetCents,
      swapAcceptable: input.swapAcceptable,
      urgency: input.urgency,
      visibility: input.visibility,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    await this.store.write(StorageKeys.demoWishlist, [item, ...(await this.mine())]);
    return item;
  }
  async updateStatus(id: string, status: WishlistStatus): Promise<void> {
    const items = await this.mine();
    await this.store.write(
      StorageKeys.demoWishlist,
      items.map((w) => (w.id === id ? { ...w, status } : w)),
    );
  }
  async remove(id: string): Promise<void> {
    await this.store.write(StorageKeys.demoWishlist, (await this.mine()).filter((w) => w.id !== id));
  }
  async matchesForMe(): Promise<WishlistMatch[]> {
    const mine = (await this.mine()).filter((w) => w.status === "active");
    if (mine.length === 0) return [];
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    const bySchool = new Set(mine.map((w) => w.schoolId));
    const listings = [...published, ...demoListings].filter((l) => bySchool.has(l.schoolId));
    const matches: WishlistMatch[] = [];
    for (const w of mine) {
      for (const l of listings) {
        const score = scoreWishlistMatch(l, w);
        if (score >= WISHLIST_MATCH_THRESHOLD) {
          matches.push({ wishlistItemId: w.id, listingId: l.id, score, createdAt: l.createdAt, notified: false });
        }
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }
}

/* ------------------------------------------------------------- DI factory */

/** Build the full set of mock repositories over a key/value store. */
export function createMockRepositories(kv: KeyValueStore): Repositories {
  const store = new JsonStore(kv);
  return {
    session: new MockSessionRepository(store),
    marketplace: new MockMarketplaceRepository(store),
    community: new MockCommunityRepository(),
    inbox: new MockInboxRepository(),
    saved: new MockSavedListingsRepository(store),
    drafts: new MockDraftListingsRepository(store),
    wishlist: new MockWishlistRepository(store),
  };
}

/** Re-export so tests/screens can enumerate the synthetic cast. */
export { demoProfiles, demoSchools };
