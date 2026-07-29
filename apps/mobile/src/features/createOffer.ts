/**
 * Offer-note / handoff-instruction moderation. Free text a student attaches to an
 * offer or handoff plan runs through the SAME local moderation simulator as
 * listings and messages before it is sent. Only an "allow" outcome proceeds;
 * warn/block/escalate is surfaced and the text is not submitted. Demo UX — not the
 * production Trust & Safety backend.
 */
import { simulateModeration, type ModerationContext, type ModerationResult } from "../moderation/simulator";

export interface OfferTextAssessment {
  moderation: ModerationResult;
  ok: boolean;
}

/** Assess the combined free-text of an offer (note + handoff instructions). */
export function assessOfferText(text: string, context: ModerationContext): OfferTextAssessment {
  const moderation = simulateModeration({ title: "", description: text ?? "", category: "other" }, context);
  return { moderation, ok: moderation.publishable };
}
