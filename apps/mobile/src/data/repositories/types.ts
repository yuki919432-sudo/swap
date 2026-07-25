/**
 * Repository interfaces — the seam between screens and data.
 *
 * Screens depend ONLY on these interfaces (never on mock arrays). The demo build
 * wires Mock* implementations backed by synthetic data + local storage; a future
 * build can wire Supabase-backed implementations of the SAME interfaces without
 * touching a single screen.
 */
import type { ItemCondition, ListingPostType, ListingStatus } from "@swap/types";
import type {
  CommunityItem,
  DemoProfile,
  DemoSchool,
  InboxThread,
  ImageRef,
  Listing,
} from "../../domain/models";

/* ------------------------------------------------------------------ session */

export interface SessionState {
  school: DemoSchool;
  profile: DemoProfile;
}

export interface SessionRepository {
  /** All synthetic schools available in the demo selector. */
  listSchools(): Promise<DemoSchool[]>;
  /** Synthetic profiles for a given school. */
  listProfiles(schoolId: string): Promise<DemoProfile[]>;
  /** The currently selected demo session, or null if none chosen yet. */
  getCurrent(): Promise<SessionState | null>;
  /** Persist the selected demo profile (and its school). */
  select(profileId: string): Promise<SessionState>;
  /** Clear the selected demo profile (exit the demo session). */
  clear(): Promise<void>;
}

/* -------------------------------------------------------------- marketplace */

export type MarketplaceSort = "recent" | "oldest" | "title";

export interface MarketplaceQuery {
  schoolId: string;
  search?: string;
  postTypes?: ListingPostType[];
  categories?: string[];
  conditions?: ItemCondition[];
  sort?: MarketplaceSort;
  /** Include locally-published demo listings (default true). */
  includeDemoLocal?: boolean;
}

export interface MarketplaceRepository {
  list(query: MarketplaceQuery): Promise<Listing[]>;
  getById(id: string): Promise<Listing | null>;
  /** The distinct categories present for a school (for the filter UI). */
  categoriesForSchool(schoolId: string): Promise<string[]>;
  /** Append a locally-published demo listing to the feed (persisted). */
  publishDemoListing(listing: Listing): Promise<Listing>;
}

/* ---------------------------------------------------------------- community */

export interface CommunityRepository {
  list(schoolId: string): Promise<CommunityItem[]>;
}

/* -------------------------------------------------------------------- inbox */

export interface InboxRepository {
  list(schoolId: string): Promise<InboxThread[]>;
}

/* ----------------------------------------------------------- saved listings */

export interface SavedListingsRepository {
  list(): Promise<string[]>;
  isSaved(listingId: string): Promise<boolean>;
  toggle(listingId: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ drafts */

export interface DraftListing {
  id: string;
  schoolId: string;
  postType: ListingPostType;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  desiredItem: string | null;
  images: ImageRef[];
  handoffLocation: string | null;
  expiresAt: string | null;
  updatedAt: string;
  /** Set once a draft has been published to the local demo feed. */
  publishedListingId: string | null;
  /** Terminal status shown in My Listings (draft until published). */
  status: Extract<ListingStatus, "draft" | "active">;
}

export interface DraftListingsRepository {
  list(): Promise<DraftListing[]>;
  getById(id: string): Promise<DraftListing | null>;
  save(draft: DraftListing): Promise<DraftListing>;
  remove(id: string): Promise<void>;
  markPublished(id: string, listingId: string): Promise<void>;
}

/* ------------------------------------------------------------- aggregate DI */

export interface Repositories {
  session: SessionRepository;
  marketplace: MarketplaceRepository;
  community: CommunityRepository;
  inbox: InboxRepository;
  saved: SavedListingsRepository;
  drafts: DraftListingsRepository;
}
