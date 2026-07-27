/**
 * Outgoing-message assessment. Every message a user tries to send is evaluated by
 * the SAME local moderation simulator used for listings/markets before it leaves
 * the device. Only an "allow" outcome is sent; warn/block/escalate are surfaced to
 * the sender and the text is NOT transmitted. This is the demo moderation UX — not
 * the production Trust & Safety backend.
 */
import { sendMessageSchema } from "@swap/validation";
import { simulateModeration, type ModerationContext, type ModerationResult } from "../moderation/simulator";

export interface MessageAssessment {
  valid: boolean;
  moderation: ModerationResult;
  /** Sendable only when the body is valid AND moderation allows it. */
  canSend: boolean;
}

/** Pure: validate the body + run local moderation. Never transmits anything. */
export function assessMessage(conversationId: string, body: string, context: ModerationContext): MessageAssessment {
  const parsed = sendMessageSchema.safeParse({ conversationId, body });
  const moderation = simulateModeration({ title: "", description: body, category: "other" }, context);
  return { valid: parsed.success, moderation, canSend: parsed.success && moderation.publishable };
}
