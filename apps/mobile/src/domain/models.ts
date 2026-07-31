/**
 * Mobile view-model types. These are the shapes the UI renders. They deliberately
 * mirror the eventual Supabase-backed data but stay UI-facing (camelCase, only the
 * fields screens need) so repositories can be swapped without touching screens.
 *
 * Enums are reused from @swap/types so the mobile layer never drifts from the
 * database's source of truth.
 */
import type {
  CommunityPostType,
  HandoffStage,
  HandoffStatus,
  ItemCondition,
  ListingPostType,
  ListingStatus,
  MarketStatus,
  MembershipStatus,
  MessageType,
  OfferKind,
  OfferStatus,
  VerificationMethod,
  WishlistStatus,
  WishlistUrgency,
  WishlistVisibility,
} from "@swap/types";

export type InstitutionType = "high_school" | "university";

export interface DemoSchool {
  id: string;
  name: string;
  institutionType: InstitutionType;
  description: string;
  memberCount: number;
  /** Methods this (synthetic) school has enabled — display only. */
  verificationMethods: VerificationMethod[];
  accentEmoji: string;
}

export interface DemoProfile {
  id: string;
  schoolId: string;
  displayName: string;
  membershipStatus: MembershipStatus;
  verificationMethod: VerificationMethod | null;
  gradYear: number | null;
  /** A school staff role, if this profile is a moderator/admin. Display only. */
  staffRole: "school_moderator" | null;
  avatarEmoji: string;
  /** Synthetic impact stats for the profile screen. */
  impact: { given: number; swapped: number; saved: number };
}

export interface OwnerPreview {
  displayName: string;
  avatarEmoji: string;
  verified: boolean;
}

export interface Listing {
  id: string;
  schoolId: string;
  /** The owner's user id — who "Message owner" reaches. */
  ownerId: string;
  postType: ListingPostType;
  status: ListingStatus;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  /** For swap posts: what the owner wants in return. */
  desiredItem: string | null;
  images: ImageRef[];
  handoffLocation: string | null;
  owner: OwnerPreview;
  /** ISO-8601 timestamp. */
  createdAt: string;
  expiresAt: string | null;
  /** True when this listing was published in the local demo session. */
  demoLocal: boolean;
}

/** An image reference. Demo images are emoji/gradient placeholders or a picked local URI. */
export interface ImageRef {
  /** "placeholder" (emoji + gradient) or "local" (a device URI from the picker). */
  kind: "placeholder" | "local";
  /** Emoji for placeholder, or file URI for local. */
  value: string;
}

export interface CommunityItem {
  id: string;
  schoolId: string;
  type: CommunityPostType;
  title: string;
  description: string;
  organizer: OwnerPreview;
  /** Optional event date (ISO) for event-like items. */
  when: string | null;
  location: string | null;
  createdAt: string;
}

/** A persistent "I'm looking for…" request (distinct from a saved bookmark). */
export interface WishlistItem {
  id: string;
  schoolId: string;
  userId: string;
  title: string;
  description: string | null;
  preferredCategory: string | null;
  preferredCondition: ItemCondition | null;
  budgetCents: number | null;
  swapAcceptable: boolean;
  urgency: WishlistUrgency;
  visibility: WishlistVisibility;
  status: WishlistStatus;
  /** Owner opted to show this "looking for" request on their public stall. */
  showOnStall: boolean;
  createdAt: string;
}

/** A (wishlist → matching listing) hit from the server-side match outbox. */
export interface WishlistMatch {
  wishlistItemId: string;
  listingId: string;
  score: number;
  createdAt: string;
  notified: boolean;
}

/** The slice of a matched listing the wishlist UI needs (message the owner, show status). */
export interface MatchedListing {
  id: string;
  title: string;
  /** Who "Message owner" reaches. */
  ownerId: string;
  postType: ListingPostType;
  status: ListingStatus;
  image: ImageRef | null;
}

/**
 * A match from the outbox resolved against the listing's CURRENT state. `available`
 * is false when the listing was taken down or is no longer offerable (deleted,
 * reserved, or completed) — the UI shows "no longer available" instead of a dead link.
 */
export interface WishlistMatchDetail {
  wishlistItemId: string;
  wishlistTitle: string;
  /** null only when the listing row is gone entirely (hard-deleted). */
  listing: MatchedListing | null;
  available: boolean;
  score: number;
  notified: boolean;
}

/* --------------------------------------------------------- Campus markets */

/** A lightweight student stall (a casual profile over a student's listings). */
export interface Stall {
  id: string;
  schoolId: string;
  userId: string;
  owner: OwnerPreview;
  description: string | null;
  createdAt: string;
  activeCount: number;
}

/** A stall with its content, for the stall detail / My Stall screens. */
export interface StallDetail {
  stall: Stall;
  listings: Listing[];
  breakdown: Record<ListingPostType, number>;
  visibleWishlist: WishlistItem[];
}

/** A themed temporary market. */
export interface Market {
  id: string;
  schoolId: string;
  hostUserId: string;
  host: OwnerPreview;
  hostLabel: string | null;
  title: string;
  description: string | null;
  coverImage: ImageRef | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  handoffInstructions: string | null;
  allowedCategories: string[];
  allowsRegulated: boolean;
  status: MarketStatus;
  createdAt: string;
  sellerCount: number;
  listingCount: number;
}

/** A market with its participating listings + viewer participation flags. */
export interface MarketDetail {
  market: Market;
  listings: Listing[];
  amHost: boolean;
  amSeller: boolean;
}

/* --------------------------------------------------------------- Messaging */

/** The other person in a 1:1 conversation (owner preview + their user id). */
export interface Counterpart {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  verified: boolean;
}

/** What a conversation is "about" — a listing, market, or stall (or nothing). */
export interface ConversationContext {
  kind: "listing" | "market" | "stall" | "none";
  id: string | null;
  /** A short title, e.g. the listing/market title or the stall owner's name. */
  label: string;
  subtitle: string | null;
  image: ImageRef | null;
  /** True when the referenced item is gone (deleted/traded/ended) — show inactive. */
  unavailable: boolean;
}

/** A conversation summary for the Inbox list. */
export interface Conversation {
  id: string;
  schoolId: string;
  counterpart: Counterpart;
  context: ConversationContext;
  /** Preview of the latest message (may be a system line). */
  lastPreview: string;
  lastMessageAt: string;
  /** This viewer's unread count for the conversation. */
  unread: number;
}

/** A single message in a thread. */
export interface Message {
  id: string;
  conversationId: string;
  /** Null for system messages. */
  senderId: string | null;
  type: MessageType;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** True when the current viewer authored it. */
  mine: boolean;
  /** Optimistic-send lifecycle (client-only; never persisted). */
  pending?: boolean;
  failed?: boolean;
}

/** A conversation with its messages + viewer-scoped send/block state. */
export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  /** False when a block (either direction) or an inactive conversation stops sending. */
  canSend: boolean;
  /** True when the viewer has blocked the counterpart. */
  blockedByMe: boolean;
}

/** Kept as the Inbox list-item alias for backward compatibility with the tab. */
export type InboxThread = Conversation;

/* --------------------------------------------------------- Offers & handoff */

/** A compact reference to a listing inside an offer card. */
export interface OfferListingRef {
  id: string;
  title: string;
  image: ImageRef | null;
  postType: ListingPostType;
  status: ListingStatus;
  ownerId: string;
}

/** The handoff plan + lifecycle for an accepted offer (a transaction). */
export interface Handoff {
  id: string;
  offerId: string;
  kind: OfferKind;
  /** Transaction status (handoff_pending / completed / cancelled / disputed). */
  status: string;
  handoffStatus: HandoffStatus;
  /** Borrow/lend flow: none / handed_over / return_due / returned. */
  stage: HandoffStage;
  scheduledAt: string | null;
  handoffLocationText: string | null;
  returnBy: string | null;
  handedOverAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
  /** Whether the current viewer has confirmed completion (give/swap). */
  iConfirmed: boolean;
  /** Distinct confirmation count from the two participants (0/1/2). */
  confirmations: number;
}

/** A structured exchange offer shown as a card inside a conversation. */
export interface Offer {
  id: string;
  schoolId: string;
  conversationId: string | null;
  kind: OfferKind;
  status: OfferStatus;
  fromUserId: string;
  toUserId: string;
  /** The primary listing the exchange is about. */
  listing: OfferListingRef | null;
  /** For a swap, the item the sender offers in return. */
  offeredListing: OfferListingRef | null;
  note: string | null;
  handoffAt: string | null;
  handoffLocationText: string | null;
  returnBy: string | null;
  expiresAt: string | null;
  parentOfferId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Viewer-scoped flags. */
  amSender: boolean;
  amRecipient: boolean;
}

/** An offer with its handoff (if accepted) and its counter/revision chain. */
export interface OfferDetail {
  offer: Offer;
  handoff: Handoff | null;
  /** The full revision chain oldest-first (counteroffers), for history. */
  chain: Offer[];
}
