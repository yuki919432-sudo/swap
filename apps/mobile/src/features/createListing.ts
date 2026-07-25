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
import type { Listing, OwnerPreview } from "../domain/models";
import type { MarketplaceRepository, NewListing } from "../data/repositories/types";
import { simulateModeration, type ModerationContext, type ModerationResult } from "../moderation/simulator";

/** The create-listing form shape is exactly a NewListing. */
export type ListingFormInput = NewListing;

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

export interface PublishResult {
  published: boolean;
  assessment: ListingAssessment;
  listing?: Listing;
}

/**
 * Validate + moderate and, only on success, create the listing through the
 * repository (mock → local demo feed; Supabase → real backend + Storage). Returns
 * the assessment either way so the caller can show feedback. Warned / blocked /
 * escalated content is never created.
 */
export async function publishListing(
  marketplace: MarketplaceRepository,
  input: ListingFormInput,
  owner: OwnerPreview,
  context: ModerationContext,
): Promise<PublishResult> {
  const assessment = assessListing(input, context);
  if (!assessment.canPublish) return { published: false, assessment };
  const listing = await marketplace.createListing(input, owner);
  return { published: true, assessment, listing };
}
