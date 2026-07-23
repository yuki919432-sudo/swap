export * from "./enums.js";
export * from "./ids.js";

import type {
  SchoolId,
  UserId,
  ListingId,
  OfferId,
  TransactionId,
  EventId,
  CommunityPostId,
} from "./ids.js";
import type {
  SchoolStatus,
  MembershipStatus,
  SchoolRole,
  PlatformRole,
  ListingPostType,
  ListingStatus,
  ItemCondition,
  OfferStatus,
  TransactionStatus,
  EventStatus,
  CommunityPostType,
  CommunityPostStatus,
  VerificationMethod,
} from "./enums.js";

/** ISO-8601 UTC timestamp string, e.g. "2026-07-23T14:30:00.000Z". */
export type Timestamptz = string;

export interface School {
  id: SchoolId;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: SchoolStatus;
  createdAt: Timestamptz;
}

export interface SchoolMembership {
  id: string;
  schoolId: SchoolId;
  userId: UserId;
  status: MembershipStatus;
  verificationMethod: VerificationMethod | null;
  verifiedAt: Timestamptz | null;
  createdAt: Timestamptz;
}

export interface SchoolAdmin {
  id: string;
  schoolId: SchoolId;
  userId: UserId;
  role: SchoolRole;
  active: boolean;
  createdAt: Timestamptz;
}

export interface PlatformAdmin {
  id: string;
  userId: UserId;
  role: PlatformRole;
  active: boolean;
  createdAt: Timestamptz;
}

/** Public-safe user profile. Never contains email or phone. */
export interface PublicProfile {
  id: UserId;
  displayName: string;
  avatarUrl: string | null;
  gradYear: number | null;
}

export interface Listing {
  id: ListingId;
  schoolId: SchoolId;
  ownerId: UserId;
  postType: ListingPostType;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  desiredItem: string | null;
  handoffLocationId: string | null;
  status: ListingStatus;
  expiresAt: Timestamptz | null;
  createdAt: Timestamptz;
  updatedAt: Timestamptz;
  deletedAt: Timestamptz | null;
}

export interface Offer {
  id: OfferId;
  schoolId: SchoolId;
  listingId: ListingId | null;
  fromUserId: UserId;
  toUserId: UserId;
  message: string | null;
  status: OfferStatus;
  parentOfferId: OfferId | null;
  createdAt: Timestamptz;
  updatedAt: Timestamptz;
}

export interface Transaction {
  id: TransactionId;
  schoolId: SchoolId;
  offerId: OfferId;
  status: TransactionStatus;
  completedAt: Timestamptz | null;
  createdAt: Timestamptz;
}

export interface SwapEvent {
  id: EventId;
  schoolId: SchoolId;
  organizerId: UserId;
  title: string;
  description: string;
  category: string | null;
  coverImageUrl: string | null;
  startsAt: Timestamptz;
  endsAt: Timestamptz | null;
  timezone: string;
  location: string | null;
  maxParticipants: number | null;
  registrationDeadline: Timestamptz | null;
  status: EventStatus;
  createdAt: Timestamptz;
  updatedAt: Timestamptz;
}

export interface CommunityPost {
  id: CommunityPostId;
  schoolId: SchoolId;
  authorId: UserId;
  type: CommunityPostType;
  title: string;
  description: string;
  imageUrl: string | null;
  status: CommunityPostStatus;
  eventId: EventId | null;
  expiresAt: Timestamptz | null;
  createdAt: Timestamptz;
  updatedAt: Timestamptz;
}
