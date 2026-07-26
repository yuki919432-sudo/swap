import { z } from "zod";
import {
  LISTING_POST_TYPE,
  LISTING_STATUS,
  ITEM_CONDITION,
  OFFER_ITEM_DIRECTION,
  COMMUNITY_POST_TYPE,
  VERIFICATION_METHOD,
  SCHOOL_ROLE,
  MEMBERSHIP_STATUS,
  REPORT_TARGET_TYPE,
  REPORT_REASON,
  PROHIBITED_CATEGORIES,
  WISHLIST_URGENCY,
  WISHLIST_STATUS,
  WISHLIST_VISIBILITY,
} from "@swap/types";
import { uuid, shortText, mediumText, longText, email, timezone, gradYear, isoDateTime } from "./primitives.js";

export * from "./primitives.js";

const zEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

const prohibited = new Set<string>(PROHIBITED_CATEGORIES);
const category = shortText.refine((c) => !prohibited.has(c.toLowerCase()), {
  message: "category_prohibited",
});

/* ------------------------------------------------------------------ Profile */

export const updateProfileSchema = z.object({
  displayName: shortText,
  gradYear: gradYear.nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* ------------------------------------------------------------- Verification */

export const startVerificationSchema = z.object({
  schoolId: uuid,
  method: zEnum(VERIFICATION_METHOD),
});

export const verifyOtpSchema = z.object({
  schoolId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "otp_must_be_6_digits"),
});

/** Email OTP verification (Method C): 6-digit code + optional challenge purpose. */
export const verifyEmailOtpSchema = z.object({
  schoolId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "otp_must_be_6_digits"),
  purpose: z.string().trim().max(64).optional(),
});
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;

export const redeemInviteSchema = z.object({
  code: z.string().trim().min(6).max(64),
});

export const manualRequestSchema = z.object({
  schoolId: uuid,
  schoolEmail: email,
  gradYear: gradYear.optional(),
  explanation: mediumText.optional(),
});

/** Roster self-resolution: the server reads the verified email; only schoolId in. */
export const resolveRosterSchema = z.object({ schoolId: uuid });

/** Manual membership request (server reads the email from the session). */
export const membershipRequestSchema = z.object({
  schoolId: uuid,
  gradYear: gradYear.optional(),
  explanation: mediumText.optional(),
});

export const reviewMembershipRequestSchema = z.object({
  requestId: uuid,
  approve: z.boolean(),
  reason: mediumText.optional(),
});

export const setMembershipStatusSchema = z.object({
  membershipId: uuid,
  status: zEnum(MEMBERSHIP_STATUS),
  reason: mediumText.optional(),
});

/* --------------------------------------------------------------- Listings */

export const createListingSchema = z
  .object({
    postType: zEnum(LISTING_POST_TYPE),
    title: shortText,
    description: mediumText,
    category,
    condition: zEnum(ITEM_CONDITION).nullable().optional(),
    desiredItem: shortText.nullable().optional(),
    handoffLocationId: uuid.nullable().optional(),
    expiresAt: isoDateTime.nullable().optional(),
    imageUrls: z.array(z.string().url().max(2048)).max(8).optional(),
    isDraft: z.boolean().default(false),
  })
  .refine((v) => v.postType !== "swap" || (v.desiredItem?.length ?? 0) > 0, {
    message: "swap_requires_desired_item",
    path: ["desiredItem"],
  });
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.innerType().partial().extend({
  status: zEnum(LISTING_STATUS).optional(),
});

/* ----------------------------------------------------------------- Offers */

export const offerItemSchema = z.object({
  listingId: uuid,
  direction: zEnum(OFFER_ITEM_DIRECTION),
});

export const createOfferSchema = z
  .object({
    toUserId: uuid,
    listingId: uuid.nullable().optional(),
    message: mediumText.nullable().optional(),
    proposedLocationId: uuid.nullable().optional(),
    proposedAt: isoDateTime.nullable().optional(),
    items: z.array(offerItemSchema).min(1).max(20),
    parentOfferId: uuid.nullable().optional(),
  })
  .refine((v) => v.items.some((i) => i.direction === "offered"), {
    message: "offer_requires_at_least_one_offered_item",
    path: ["items"],
  })
  .refine((v) => v.items.some((i) => i.direction === "requested"), {
    message: "offer_requires_at_least_one_requested_item",
    path: ["items"],
  });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const acceptOfferSchema = z.object({ offerId: uuid });
export const declineOfferSchema = z.object({ offerId: uuid });
export const confirmHandoffSchema = z.object({ transactionId: uuid });

/* -------------------------------------------------------- Events / community */

export const createEventSchema = z
  .object({
    title: shortText,
    description: longText,
    category: shortText.nullable().optional(),
    coverImageUrl: z.string().url().max(2048).nullable().optional(),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullable().optional(),
    timezone,
    location: shortText.nullable().optional(),
    maxParticipants: z.number().int().positive().max(100000).nullable().optional(),
    registrationDeadline: isoDateTime.nullable().optional(),
    isDraft: z.boolean().default(false),
  })
  .refine((v) => !v.endsAt || v.endsAt > v.startsAt, {
    message: "event_end_must_be_after_start",
    path: ["endsAt"],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const createCommunityPostSchema = z.object({
  type: zEnum(COMMUNITY_POST_TYPE),
  title: shortText,
  description: longText,
  imageUrl: z.string().url().max(2048).nullable().optional(),
  eventId: uuid.nullable().optional(),
  expiresAt: isoDateTime.nullable().optional(),
  isDraft: z.boolean().default(false),
});
export type CreateCommunityPostInput = z.infer<typeof createCommunityPostSchema>;

/* ------------------------------------------------------- Messaging / reports */

export const sendMessageSchema = z.object({
  conversationId: uuid,
  body: mediumText,
});

export const reportSchema = z.object({
  targetType: zEnum(REPORT_TARGET_TYPE),
  targetId: uuid,
  reason: zEnum(REPORT_REASON),
  explanation: mediumText.optional(),
  evidenceUrl: z.string().url().max(2048).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const blockUserSchema = z.object({ blockedId: uuid });

/* ---------------------------------------------------------------- Wishlist */

/** Create a persistent "looking for" request (distinct from a saved bookmark). */
export const createWishlistItemSchema = z.object({
  schoolId: uuid,
  title: shortText,
  description: mediumText.nullable().optional(),
  preferredCategory: category.nullable().optional(),
  preferredCondition: zEnum(ITEM_CONDITION).nullable().optional(),
  budgetCents: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  swapAcceptable: z.boolean().default(true),
  urgency: zEnum(WISHLIST_URGENCY).default("normal"),
  visibility: zEnum(WISHLIST_VISIBILITY).default("school"),
});
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>;

export const updateWishlistItemSchema = createWishlistItemSchema.partial().extend({
  status: zEnum(WISHLIST_STATUS).optional(),
});
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemSchema>;

/* --------------------------------------------------------- School admin ops */

export const inviteSchoolAdminSchema = z.object({
  schoolId: uuid,
  userId: uuid,
  role: zEnum(SCHOOL_ROLE),
});

export const rosterImportRowSchema = z.object({ email });
export const rosterImportSchema = z.object({
  schoolId: uuid,
  rows: z.array(rosterImportRowSchema).min(1).max(50000),
});

export const createInvitationSchema = z
  .object({
    schoolId: uuid,
    type: z.enum(["shared", "single_use"]),
    maxUses: z.number().int().positive().max(100000).default(1),
    requiresApproval: z.boolean().default(false),
    expiresAt: isoDateTime.nullable().optional(),
  })
  .refine((v) => v.type !== "single_use" || v.maxUses === 1, {
    message: "single_use_invitation_max_uses_must_be_1",
    path: ["maxUses"],
  });
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
