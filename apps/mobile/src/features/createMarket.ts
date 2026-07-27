/**
 * Create-market flow logic, kept out of the screen so it is unit-tested directly.
 *
 * A market create passes BOTH gates, exactly like a listing:
 *   1. shared validation (@swap/validation `createMarketSchema`) — the same rules
 *      the backend enforces (RLS + the prohibited-category trigger), and
 *   2. the local moderation simulator over the market's own text AND each of its
 *      allowed categories, so a market can never become a side door for prohibited
 *      or (institution-disabled) regulated categories.
 *
 * Only an "allow" outcome on valid input creates the market. Warned / blocked /
 * escalated drafts are never created and the host may edit and retry. No account
 * action is ever taken. This is the demo moderation UX — NOT the production T&S
 * backend — but the market fields are structured to enter production moderation.
 */
import { createMarketSchema } from "@swap/validation";
import type { Market, OwnerPreview } from "../domain/models";
import type { MarketRepository, NewMarket } from "../data/repositories/types";
import { simulateModeration, type ModerationContext, type ModerationResult } from "../moderation/simulator";

export type MarketFormInput = NewMarket;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateMarketForm(input: MarketFormInput): ValidationResult {
  const parsed = createMarketSchema.safeParse({
    schoolId: input.schoolId,
    title: input.title,
    description: input.description,
    hostLabel: input.hostLabel,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location,
    handoffInstructions: input.handoffInstructions,
    allowedCategories: input.allowedCategories,
    allowsRegulated: input.allowsRegulated,
    status: input.status,
  });
  if (parsed.success) return { ok: true, errors: [] };
  return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
}

export interface MarketAssessment {
  validation: ValidationResult;
  /** The most-severe moderation result across the market text + its categories. */
  moderation: ModerationResult;
  canCreate: boolean;
}

const SEVERITY: Record<ModerationResult["outcome"], number> = { allow: 0, warn: 1, block: 2, escalate: 3 };

/** Pure assessment: validate + moderate the market and every allowed category. */
export function assessMarket(input: MarketFormInput, context: ModerationContext): MarketAssessment {
  const validation = validateMarketForm(input);
  // Moderate the market's own text once, then each allowed category on its own, and
  // keep the most severe outcome — a market inherits the strictest category verdict.
  const results = [
    simulateModeration({ title: input.title, description: input.description ?? "", category: "other" }, context),
    ...input.allowedCategories.map((c) => simulateModeration({ title: input.title, description: "", category: c }, context)),
  ];
  const moderation = results.reduce((worst, r) => (SEVERITY[r.outcome] > SEVERITY[worst.outcome] ? r : worst), results[0]!);
  return { validation, moderation, canCreate: validation.ok && moderation.publishable };
}

export interface CreateMarketResult {
  created: boolean;
  assessment: MarketAssessment;
  market?: Market;
}

/** Validate + moderate and, only on success, create the market through the repo. */
export async function submitMarket(
  markets: MarketRepository,
  input: MarketFormInput,
  host: OwnerPreview,
  context: ModerationContext,
): Promise<CreateMarketResult> {
  const assessment = assessMarket(input, context);
  if (!assessment.canCreate) return { created: false, assessment };
  const market = await markets.create(input, host);
  return { created: true, assessment, market };
}
