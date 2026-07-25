/**
 * Create-listing flow logic, kept out of the screen so it is unit-tested directly.
 *
 * A publish must pass BOTH gates:
 *   1. shared validation (@swap/validation `createListingSchema`) — the same rules
 *      the backend will enforce, so the mobile form never drifts, and
 *   2. the local moderation simulator (allow/warn/block/escalate).
 *
 * Only an "allow" outcome on valid input is published to the local demo feed.
 * Warned / blocked / escalated drafts stay UNPUBLISHED and the user may edit and
 * retry. No account action is ever taken.
 */
import { createListingSchema } from "@swap/validation";
import type { ItemCondition, ListingPostType } from "@swap/types";
import type { ImageRef, Listing, OwnerPreview } from "../domain/models";
import type { MarketplaceRepository } from "../data/repositories/types";
import { simulateModeration, type ModerationContext, type ModerationResult } from "../moderation/simulator";
import { newId } from "../lib/id";

export interface ListingFormInput {
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

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateListingForm(input: ListingFormInput): ValidationResult {
  const parsed = createListingSchema.safeParse({
    postType: input.postType,
    title: input.title,
    description: input.description,
    category: input.category,
    condition: input.condition,
    desiredItem: input.desiredItem,
    isDraft: false,
  });
  if (parsed.success) return { ok: true, errors: [] };
  return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
}

export interface ListingAssessment {
  validation: ValidationResult;
  moderation: ModerationResult;
  /** Publishable only when input is valid AND moderation allows it. */
  canPublish: boolean;
}

/** Pure assessment: validate + moderate, without persisting anything. */
export function assessListing(input: ListingFormInput, context: ModerationContext): ListingAssessment {
  const validation = validateListingForm(input);
  const moderation = simulateModeration(
    { title: input.title, description: input.description, category: input.category },
    context,
  );
  return { validation, moderation, canPublish: validation.ok && moderation.publishable };
}

export function buildListingFromForm(input: ListingFormInput, owner: OwnerPreview): Listing {
  return {
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
}

export interface PublishResult {
  published: boolean;
  assessment: ListingAssessment;
  listing?: Listing;
}

/**
 * Validate + moderate and, only on success, publish to the local demo feed.
 * Returns the assessment either way so the caller can show feedback.
 */
export async function publishListing(
  marketplace: MarketplaceRepository,
  input: ListingFormInput,
  owner: OwnerPreview,
  context: ModerationContext,
): Promise<PublishResult> {
  const assessment = assessListing(input, context);
  if (!assessment.canPublish) return { published: false, assessment };
  const listing = buildListingFromForm(input, owner);
  await marketplace.publishDemoListing(listing);
  return { published: true, assessment, listing };
}
