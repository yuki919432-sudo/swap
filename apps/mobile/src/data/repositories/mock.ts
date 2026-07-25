/**
 * Mock repository implementations for demo mode.
 *
 * Each implements a repository interface from ./types using synthetic data +
 * local persistence (JsonStore). Screens depend on the interfaces, so replacing
 * these with Supabase-backed implementations later requires no screen changes.
 */
import type { CommunityItem, DemoSchool, InboxThread, Listing, OwnerPreview } from "../../domain/models";
import { demoCommunity, demoInbox, demoListings, demoProfileById, demoProfilesForSchool, demoProfiles, demoSchoolById, demoSchools } from "../demo";
import { JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { newId } from "../../lib/id";
import { applyMarketplaceQuery } from "./marketplaceQuery";
import type {
  CommunityRepository,
  DraftListing,
  DraftListingsRepository,
  InboxRepository,
  MarketplaceQuery,
  MarketplaceRepository,
  NewListing,
  Repositories,
  SavedListingsRepository,
  SessionRepository,
  SessionState,
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
  };
}

/** Re-export so tests/screens can enumerate the synthetic cast. */
export { demoProfiles, demoSchools };
