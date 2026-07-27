/**
 * SWAP! enum single source of truth.
 *
 * Every array below MUST stay byte-for-byte identical to the corresponding
 * `CREATE TYPE ... AS ENUM (...)` in `supabase/migrations/0002_enums.sql`.
 * A drift test (`supabase/tests/00_enum_parity` — see docs/testing.md) and code
 * review keep these aligned. Never reorder or rename a value without a migration.
 */

export const SCHOOL_STATUS = ["active", "disabled", "pending"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUS)[number];

export const MEMBERSHIP_STATUS = [
  "pending",
  "verified",
  "rejected",
  "suspended",
  "left",
  "expired",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const MEMBERSHIP_REQUEST_STATUS = ["pending", "approved", "rejected"] as const;
export type MembershipRequestStatus = (typeof MEMBERSHIP_REQUEST_STATUS)[number];

export const VERIFICATION_METHOD = [
  "google",
  "microsoft",
  "email_otp",
  "roster",
  "invite_code",
  "manual",
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHOD)[number];

/** School-scoped predefined roles. Explicit and testable — not arbitrary JSON. */
export const SCHOOL_ROLE = [
  "school_owner",
  "school_admin",
  "school_moderator",
  "membership_reviewer",
  "event_reviewer",
] as const;
export type SchoolRole = (typeof SCHOOL_ROLE)[number];

export const PLATFORM_ROLE = ["platform_owner", "platform_admin", "platform_support"] as const;
export type PlatformRole = (typeof PLATFORM_ROLE)[number];

export const LISTING_POST_TYPE = ["give", "swap", "looking_for", "borrow", "lend"] as const;
export type ListingPostType = (typeof LISTING_POST_TYPE)[number];

export const LISTING_STATUS = [
  "draft",
  "active",
  "reserved",
  "in_transaction",
  "completed",
  "expired",
  "removed",
] as const;
export type ListingStatus = (typeof LISTING_STATUS)[number];

export const ITEM_CONDITION = ["new", "like_new", "good", "fair", "poor"] as const;
export type ItemCondition = (typeof ITEM_CONDITION)[number];

export const RESERVATION_STATUS = ["active", "released", "completed", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUS)[number];

export const OFFER_STATUS = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "countered",
  "cancelled",
  "expired",
  "handoff_pending",
  "completed",
  "disputed",
] as const;
export type OfferStatus = (typeof OFFER_STATUS)[number];

export const OFFER_ITEM_DIRECTION = ["offered", "requested"] as const;
export type OfferItemDirection = (typeof OFFER_ITEM_DIRECTION)[number];

export const TRANSACTION_STATUS = [
  "pending",
  "handoff_pending",
  "completed",
  "disputed",
  "cancelled",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUS)[number];

export const CONVERSATION_CONTEXT = [
  "listing",
  "event",
  "community_post",
  "direct",
] as const;
export type ConversationContext = (typeof CONVERSATION_CONTEXT)[number];

export const COMMUNITY_POST_TYPE = [
  "volunteer",
  "club_recruitment",
  "project_recruitment",
  "study_group",
  "sports_activity",
  "looking_for_members",
  "general",
] as const;
export type CommunityPostType = (typeof COMMUNITY_POST_TYPE)[number];

export const COMMUNITY_POST_STATUS = [
  "draft",
  "pending_approval",
  "published",
  "closed",
  "removed",
] as const;
export type CommunityPostStatus = (typeof COMMUNITY_POST_STATUS)[number];

export const EVENT_STATUS = [
  "draft",
  "pending_approval",
  "published",
  "full",
  "cancelled",
  "completed",
  "removed",
] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const EVENT_APPROVAL_POLICY = [
  "immediate",
  "all_require_approval",
  "category_based",
  "approved_organizers_only",
] as const;
export type EventApprovalPolicy = (typeof EVENT_APPROVAL_POLICY)[number];

export const REPORT_TARGET_TYPE = [
  "listing",
  "event",
  "community_post",
  "user",
  "message",
  "conversation",
  "transaction",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPE)[number];

export const REPORT_REASON = [
  "inappropriate_content",
  "harassment",
  "spam",
  "fraud",
  "misleading",
  "unsafe_behavior",
  "prohibited_item",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASON)[number];

export const REPORT_STATUS = ["open", "reviewing", "resolved", "dismissed", "escalated"] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

export const MODERATION_ACTION_TYPE = [
  "hide_content",
  "remove_content",
  "warn_user",
  "suspend_user",
  "remove_membership",
  "dismiss",
  "restore_content",
] as const;
export type ModerationActionType = (typeof MODERATION_ACTION_TYPE)[number];

export const NOTIFICATION_TYPE = [
  "new_message",
  "new_offer",
  "offer_accepted",
  "offer_declined",
  "counteroffer",
  "handoff_reminder",
  "handoff_confirmation",
  "transaction_completed",
  "transaction_disputed",
  "looking_for_match",
  "event_joined",
  "event_reminder",
  "event_update",
  "event_cancelled",
  "membership_approved",
  "membership_rejected",
  "announcement",
  "moderation_result",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

export const DEVICE_PLATFORM = ["ios", "android", "web"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORM)[number];

export const INVITATION_TYPE = ["shared", "single_use"] as const;
export type InvitationType = (typeof INVITATION_TYPE)[number];

export const ACCOUNT_STATUS = [
  "active",
  "deletion_requested",
  "deactivated",
  "anonymized",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUS)[number];

/* ------------------------------------------------------------------ Wishlist */

/** Persistent "I'm looking for…" requests (distinct from bookmarked listings). */
export const WISHLIST_URGENCY = ["low", "normal", "high"] as const;
export type WishlistUrgency = (typeof WISHLIST_URGENCY)[number];

export const WISHLIST_STATUS = ["active", "fulfilled", "cancelled", "expired"] as const;
export type WishlistStatus = (typeof WISHLIST_STATUS)[number];

/** Visibility scope. Only school-scoped for now; kept an enum for forward growth. */
export const WISHLIST_VISIBILITY = ["school"] as const;
export type WishlistVisibility = (typeof WISHLIST_VISIBILITY)[number];

/** Marketplace categories seeded at bootstrap; schools may enable/disable per-school. */
export const DEFAULT_CATEGORIES = [
  "textbooks",
  "school_supplies",
  "clothing",
  "shoes",
  "sports_equipment",
  "electronics",
  "dormitory_items",
  "furniture",
  "transportation",
  "art_and_music",
  "other",
] as const;
export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number];

/** Categories that must never be listed. Enforced by validation + moderation. */
export const PROHIBITED_CATEGORIES = [
  "weapons",
  "drugs",
  "alcohol",
  "nicotine",
  "stolen_goods",
  "counterfeit",
  "prescription_medication",
  "sexually_explicit",
  "dangerous_materials",
  "illegal_services",
] as const;
export type ProhibitedCategory = (typeof PROHIBITED_CATEGORIES)[number];
