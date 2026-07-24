/**
 * Delivery-event webhook security + parsing.
 *
 * The webhook HTTP endpoint is a Supabase Edge Function (see
 * supabase/functions/email-webhook). This module holds the transport-agnostic,
 * unit-testable logic: authentication/signature verification (constant-time),
 * payload-size limits, event-type allowlisting, and normalization into the
 * minimal DeliveryEvent that app.record_email_event stores idempotently.
 *
 * A client-supplied event is never trusted: the endpoint MUST verify auth first,
 * and idempotency is enforced by the DB unique index (replay is a no-op).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_WEBHOOK_BYTES = 64 * 1024;

export const ALLOWED_EVENTS = ["delivered", "bounced", "spam_complaint", "deferred", "rejected"] as const;
export type DeliveryEventType = (typeof ALLOWED_EVENTS)[number];

export interface DeliveryEvent {
  provider: string;
  providerMessageId: string;
  event: DeliveryEventType;
  emailNormalized: string | null;
  detail: Record<string, unknown>;
}

const constantTimeEquals = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/** Verify a shared-secret webhook credential (e.g. Postmark Basic-auth token). */
export function verifyWebhookSecret(expected: string | undefined, provided: string | undefined | null): boolean {
  if (!expected || !provided) return false;
  return constantTimeEquals(expected, provided);
}

/** Verify an HMAC-SHA256 hex signature over the raw request body. */
export function verifyHmacSignature(
  secret: string | undefined,
  rawBody: string,
  signatureHex: string | undefined | null,
): boolean {
  if (!secret || !signatureHex) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeEquals(expected, signatureHex);
}

const POSTMARK_RECORD_TYPES: Record<string, DeliveryEventType> = {
  Delivery: "delivered",
  Bounce: "bounced",
  SpamComplaint: "spam_complaint",
  // Deferred/Rejected arrive as Bounce subtypes on Postmark; handled via Type below.
};

/**
 * Parse + allowlist a Postmark webhook body. Throws on oversize payloads or
 * non-allowlisted event types. Stores only the minimal necessary fields — never
 * the full provider payload.
 */
export function parsePostmarkWebhook(rawBody: string): DeliveryEvent {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    throw new Error("payload_too_large");
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
  const recordType = String(body.RecordType ?? "");
  let event = POSTMARK_RECORD_TYPES[recordType];
  if (recordType === "Bounce") {
    const t = String(body.Type ?? "");
    if (t === "SoftBounce" || t === "Transient") event = "deferred";
    else if (t === "SpamComplaint") event = "spam_complaint";
    else event = "bounced";
  }
  if (!event) throw new Error("event_not_allowlisted");

  const providerMessageId = String(body.MessageID ?? "");
  if (!providerMessageId) throw new Error("missing_message_id");

  const recipient = body.Recipient ?? body.Email;
  return {
    provider: "postmark",
    providerMessageId,
    event,
    emailNormalized: recipient ? String(recipient).trim().toLowerCase() : null,
    // Minimal, non-sensitive detail only.
    detail: { recordType, type: body.Type ?? null },
  };
}
