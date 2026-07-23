/**
 * Branded UUID types. These prevent accidentally passing a listing id where a
 * school id is expected. All values are runtime strings (UUID v4 from the DB).
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UUID = string;

export type UserId = Brand<UUID, "UserId">;
export type SchoolId = Brand<UUID, "SchoolId">;
export type MembershipId = Brand<UUID, "MembershipId">;
export type ListingId = Brand<UUID, "ListingId">;
export type OfferId = Brand<UUID, "OfferId">;
export type TransactionId = Brand<UUID, "TransactionId">;
export type ReservationId = Brand<UUID, "ReservationId">;
export type ConversationId = Brand<UUID, "ConversationId">;
export type MessageId = Brand<UUID, "MessageId">;
export type EventId = Brand<UUID, "EventId">;
export type CommunityPostId = Brand<UUID, "CommunityPostId">;
export type ReportId = Brand<UUID, "ReportId">;
export type InvitationId = Brand<UUID, "InvitationId">;
export type NotificationId = Brand<UUID, "NotificationId">;
