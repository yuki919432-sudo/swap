/**
 * Repository interfaces — the seam between screens and data.
 *
 * Screens depend ONLY on these interfaces (never on mock arrays). The demo build
 * wires Mock* implementations backed by synthetic data + local storage; a future
 * build can wire Supabase-backed implementations of the SAME interfaces without
 * touching a single screen.
 */
import type { ItemCondition, ListingPostType, ListingStatus, WishlistStatus, WishlistUrgency, WishlistVisibility } from "@swap/types";
import type {
  CommunityItem,
  DemoProfile,
  DemoSchool,
  InboxThread,
  ImageRef,
  Listing,
  OwnerPreview,
  WishlistItem,
  WishlistMatch,
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

/** The fields needed to create a listing (owner + ids are resolved by the repo). */
export interface NewListing {
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
}

export interface MarketplaceRepository {
  list(query: MarketplaceQuery): Promise<Listing[]>;
  getById(id: string): Promise<Listing | null>;
  /** The distinct categories present for a school (for the filter UI). */
  categoriesForSchool(schoolId: string): Promise<string[]>;
  /** Create a listing (uploads any images) and return the created record. */
  createListing(input: NewListing, owner: OwnerPreview): Promise<Listing>;
  /** Soft-delete a listing the caller owns. */
  deleteListing(id: string): Promise<void>;
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

/* ---------------------------------------------------------------- wishlist */

/** The fields needed to create a wishlist item (ids/owner resolved by the repo). */
export interface NewWishlistItem {
  schoolId: string;
  title: string;
  description: string | null;
  preferredCategory: string | null;
  preferredCondition: ItemCondition | null;
  budgetCents: number | null;
  swapAcceptable: boolean;
  urgency: WishlistUrgency;
  visibility: WishlistVisibility;
}

export interface WishlistRepository {
  /** The caller's own wishlist items (any status). */
  listMine(): Promise<WishlistItem[]>;
  /** Active wishlist items across the school (surface throughout the product). */
  listForSchool(schoolId: string): Promise<WishlistItem[]>;
  create(input: NewWishlistItem): Promise<WishlistItem>;
  updateStatus(id: string, status: WishlistStatus): Promise<void>;
  /** Soft-delete (cancel + hide) a wishlist item the caller owns. */
  remove(id: string): Promise<void>;
  /** The caller's match outbox: listings the backend matched to their wishlist. */
  matchesForMe(): Promise<WishlistMatch[]>;
}

/* ------------------------------------------------------------- aggregate DI */

export interface Repositories {
  session: SessionRepository;
  marketplace: MarketplaceRepository;
  community: CommunityRepository;
  inbox: InboxRepository;
  saved: SavedListingsRepository;
  drafts: DraftListingsRepository;
  wishlist: WishlistRepository;
}
