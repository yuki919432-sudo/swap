/**
 * Repository interfaces — the seam between screens and data.
 *
 * Screens depend ONLY on these interfaces (never on mock arrays). The demo build
 * wires Mock* implementations backed by synthetic data + local storage; a future
 * build can wire Supabase-backed implementations of the SAME interfaces without
 * touching a single screen.
 */
import type { ItemCondition, ListingPostType, ListingStatus, MarketStatus, MembershipStatus, WishlistStatus, WishlistUrgency, WishlistVisibility } from "@swap/types";
import type { OfferKind } from "@swap/types";
import type {
  CommunityItem,
  Conversation,
  ConversationDetail,
  DemoProfile,
  DemoSchool,
  Handoff,
  ImageRef,
  Listing,
  Market,
  MarketDetail,
  Message,
  Offer,
  OfferDetail,
  OwnerPreview,
  Stall,
  StallDetail,
  WishlistItem,
  WishlistMatch,
  WishlistMatchDetail,
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
  /** The caller's own active listings in a school (for pickers like "add to market"). */
  listMine(schoolId: string): Promise<Listing[]>;
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

/* ---------------------------------------------------------------- messaging */

export type Unsubscribe = () => void;

/** The fields needed to start (or reuse) a conversation. */
export interface StartConversationInput {
  otherUserId: string;
  listingId?: string | null;
  marketId?: string | null;
  stallId?: string | null;
}

export interface MessagingRepository {
  /** The caller's conversations for a school, latest activity first (the Inbox). */
  listConversations(schoolId: string): Promise<Conversation[]>;
  /** A conversation with its messages + viewer send/block state. */
  getConversation(id: string): Promise<ConversationDetail | null>;
  /** Start or reuse a 1:1 conversation; returns the conversation id. */
  startConversation(input: StartConversationInput): Promise<string>;
  /** Send a text message; the returned message is the reconciled server row. */
  sendMessage(conversationId: string, body: string): Promise<Message>;
  /** Mark the conversation read up to the latest message for the caller. */
  markRead(conversationId: string): Promise<void>;
  /** The caller's total unread count across conversations (for the tab badge). */
  unreadTotal(): Promise<number>;
  /** Block a user (prevents new conversations + sends). schoolId scopes the block. */
  block(userId: string, schoolId: string): Promise<void>;
  /** Remove a block the caller created. */
  unblock(userId: string): Promise<void>;
  /**
   * Poll-based change subscription — NOT fake realtime. Calls onChange with a
   * fresh detail on an interval; returns an unsubscribe. (A Supabase Realtime
   * upgrade can replace this behind the same signature later.)
   */
  watchConversation(id: string, onChange: (detail: ConversationDetail) => void): Unsubscribe;
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

/** Editable fields of an existing wishlist request (status/visibility change elsewhere). */
export interface WishlistPatch {
  title?: string;
  description?: string | null;
  preferredCategory?: string | null;
  preferredCondition?: ItemCondition | null;
  swapAcceptable?: boolean;
  urgency?: WishlistUrgency;
}

export interface WishlistRepository {
  /** The caller's own wishlist items (any status). */
  listMine(): Promise<WishlistItem[]>;
  /** Active wishlist items across the school (surface throughout the product). */
  listForSchool(schoolId: string): Promise<WishlistItem[]>;
  create(input: NewWishlistItem): Promise<WishlistItem>;
  /** Edit an existing request the caller owns (title/details/urgency/swap). */
  update(id: string, patch: WishlistPatch): Promise<WishlistItem>;
  updateStatus(id: string, status: WishlistStatus): Promise<void>;
  /** Toggle whether this "looking for" request is shown on the owner's stall. */
  setShowOnStall(id: string, show: boolean): Promise<void>;
  /** Soft-delete (cancel + hide) a wishlist item the caller owns. */
  remove(id: string): Promise<void>;
  /** The caller's match outbox: listings the backend matched to their wishlist. */
  matchesForMe(): Promise<WishlistMatch[]>;
  /**
   * The caller's matches resolved against each listing's CURRENT state — carries
   * the matched listing (for "Message owner") and an availability flag so the UI
   * can cleanly show items that are no longer available.
   */
  matchDetailsForMe(): Promise<WishlistMatchDetail[]>;
}

/* ---------------------------------------------------------------- membership */

/** The caller's school membership, resolved from the real backend. */
export interface Membership {
  schoolId: string;
  schoolName: string;
  status: MembershipStatus;
  /** False when the school itself is not active (paused/closed). */
  schoolActive: boolean;
}

export interface MembershipRepository {
  /** The caller's membership (any status), or null if not enrolled anywhere. */
  myMembership(): Promise<Membership | null>;
  /** Enroll via an invitation code; returns the resulting membership. */
  redeemInvitation(code: string): Promise<Membership>;
  /** Manual-approval fallback: request membership in a school (goes to review). */
  requestManual(input: { schoolId: string; gradYear?: number | null; explanation?: string | null }): Promise<Membership>;
}

/* ------------------------------------------------------------ student stalls */

export interface StallRepository {
  /** Stalls at a school, most-recently-opened first (for "Browse Stalls"). */
  listForSchool(schoolId: string): Promise<Stall[]>;
  /** A stall + its content by stall id (for the stall detail screen). */
  getById(id: string): Promise<StallDetail | null>;
  /** A stall + its content by owner (used for "another student's stall"). */
  getByUser(schoolId: string, userId: string): Promise<StallDetail | null>;
  /** The caller's own stall, or null if they haven't opened one yet. */
  getMine(schoolId: string): Promise<StallDetail | null>;
  /** Open the caller's stall or edit its description (extremely low-friction). */
  open(schoolId: string, description: string | null): Promise<Stall>;
}

/* --------------------------------------------------------- temporary markets */

/** The fields needed to create a temporary market (host + ids resolved by repo). */
export interface NewMarket {
  schoolId: string;
  title: string;
  description: string | null;
  hostLabel: string | null;
  coverImage: ImageRef | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  handoffInstructions: string | null;
  allowedCategories: string[];
  allowsRegulated: boolean;
  status: MarketStatus;
}

export interface MarketRepository {
  /** Temporary markets at a school (directory), most recent first. */
  listForSchool(schoolId: string): Promise<Market[]>;
  /** A market + its participating listings + viewer participation flags. */
  getById(id: string): Promise<MarketDetail | null>;
  /** Create a temporary market (host is the caller). */
  create(input: NewMarket, host: OwnerPreview): Promise<Market>;
  /** Host- or staff-driven status change (e.g. cancel or end a market). */
  setStatus(id: string, status: MarketStatus): Promise<void>;
  /** Join a market as a seller (idempotent). */
  join(marketId: string): Promise<void>;
  /** Leave a market (removes the caller's seller participation). */
  leave(marketId: string): Promise<void>;
  /** Associate a listing the caller owns with a market. */
  addListing(marketId: string, listingId: string): Promise<void>;
  /** Remove a listing↔market association (never deletes the listing). */
  removeListing(marketId: string, listingId: string): Promise<void>;
}

/* ---------------------------------------------------- campus-market discovery */

/** A named discovery shelf. `signal` labels the deterministic basis (no fake stats). */
export interface DiscoveryShelf {
  key: string;
  title: string;
  /** Which deterministic signal produced this shelf (shown as a subtle subtitle). */
  signal: "recency" | "wishlist" | "demand" | "category" | "free" | "ending" | "stalls";
  subtitle: string;
  listings: Listing[];
}

/** Privacy-safe aggregate demand for a normalized "students are looking for" cluster. */
export interface DemandCluster {
  key: string;
  label: string;
  /** How many DISTINCT students have an active wishlist request in this cluster. */
  studentCount: number;
  category: string | null;
}

export interface CampusMarketRepository {
  /** The always-open Campus Market discovery shelves for a school. */
  shelves(schoolId: string): Promise<DiscoveryShelf[]>;
  /** "Students Are Looking For": privacy-safe demand clusters (no student names). */
  demand(schoolId: string): Promise<DemandCluster[]>;
  /** Recently-opened stalls, for the "New Stalls" shelf. */
  recentStalls(schoolId: string, limit?: number): Promise<Stall[]>;
}

/* ------------------------------------------------------------- offers/handoff */

/** Fields to create a conversation-centered exchange offer. */
export interface NewOffer {
  conversationId: string;
  kind: OfferKind;
  listingId: string;
  offeredListingId?: string | null;
  note?: string | null;
  handoffAt?: string | null;
  handoffLocationText?: string | null;
  handoffLocationId?: string | null;
  returnBy?: string | null;
  expiresAt?: string | null;
}

/** Fields to counter the current proposal (preserves the offer chain). */
export interface CounterOffer {
  parentOfferId: string;
  offeredListingId?: string | null;
  note?: string | null;
  handoffAt?: string | null;
  handoffLocationText?: string | null;
  handoffLocationId?: string | null;
  returnBy?: string | null;
}

/** Fields to set/update a handoff plan on an accepted offer's transaction. */
export interface HandoffPlan {
  transactionId: string;
  handoffAt?: string | null;
  handoffLocationText?: string | null;
  handoffLocationId?: string | null;
  ready?: boolean;
}

export interface OfferRepository {
  /** Offers attached to a conversation (rendered as cards in the thread). */
  listForConversation(conversationId: string): Promise<Offer[]>;
  /** An offer + its handoff (if accepted) + its counter/revision chain. */
  getById(offerId: string): Promise<OfferDetail | null>;
  /** Create a new offer (server enforces ownership/school/block/availability). */
  create(input: NewOffer): Promise<Offer>;
  /** Recipient accepts → atomic reservation; returns the handoff. */
  accept(offerId: string): Promise<Handoff>;
  /** Recipient declines the current proposal. */
  decline(offerId: string): Promise<void>;
  /** Sender cancels their pending offer. */
  cancel(offerId: string): Promise<void>;
  /** Recipient counters with modified terms (parent becomes 'countered'). */
  counter(input: CounterOffer): Promise<Offer>;
  /** Set/update the handoff plan (time, location, ready). */
  setHandoffPlan(input: HandoffPlan): Promise<Handoff>;
  /** Give/Swap: confirm completion (bilateral — completes on mutual confirm). */
  confirmCompletion(transactionId: string): Promise<Handoff>;
  /** Borrow/Lend: mark the item handed over (collection). */
  markHandedOver(transactionId: string): Promise<Handoff>;
  /** Borrow/Lend: mark the item returned (completes + restores the listing). */
  markReturned(transactionId: string): Promise<Handoff>;
  /** The caller's non-terminal offers across a school (My Active Offers). */
  myActiveOffers(schoolId: string): Promise<Offer[]>;
  /** The caller's accepted-but-not-finished handoffs (My Handoffs). */
  myHandoffs(schoolId: string): Promise<OfferDetail[]>;
}

/* ------------------------------------------------------------- aggregate DI */

export interface Repositories {
  session: SessionRepository;
  membership: MembershipRepository;
  marketplace: MarketplaceRepository;
  community: CommunityRepository;
  messaging: MessagingRepository;
  saved: SavedListingsRepository;
  drafts: DraftListingsRepository;
  wishlist: WishlistRepository;
  stalls: StallRepository;
  markets: MarketRepository;
  campusMarket: CampusMarketRepository;
  offers: OfferRepository;
}
