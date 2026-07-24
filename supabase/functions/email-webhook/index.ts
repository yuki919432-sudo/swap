// Edge Function: email delivery-event webhook (Postmark).
//
// Receives delivery/bounce/spam-complaint/deferred/rejected events and records a
// minimal, safe row via the service-role RPC public.record_email_event.
//
// Security properties:
//   * A client-supplied event is NEVER trusted. The request is authenticated
//     first — a shared secret (constant-time compared) that Postmark sends via a
//     configured Basic-auth username/token or an `X-Webhook-Secret` header.
//   * Payload size is bounded (reject oversized bodies before parsing).
//   * Only allowlisted event types are accepted; everything else is dropped.
//   * Idempotency is enforced by the DB unique index (a replayed webhook is a
//     no-op), so replay protection does not depend on this function's memory.
//   * Only minimal, non-sensitive fields are stored — never the raw provider
//     payload, never provider secrets.
//
// The parsing/verification logic mirrors the unit-tested @swap/server module
// (packages/server/src/email/webhook.ts); it is re-implemented with Deno/Web
// primitives because Edge Functions run on Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_WEBHOOK_BYTES = 64 * 1024;
const ALLOWED_EVENTS = new Set(["delivered", "bounced", "spam_complaint", "deferred", "rejected"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Extract a provided webhook secret from Basic auth or a header. */
function providedSecret(req: Request): string | null {
  const header = req.headers.get("X-Webhook-Secret");
  if (header) return header;
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(":");
      return idx >= 0 ? decoded.slice(idx + 1) : decoded;
    } catch {
      return null;
    }
  }
  return null;
}

type DeliveryEvent = {
  event: string;
  providerMessageId: string;
  emailNormalized: string | null;
  detail: Record<string, unknown>;
};

/** Parse + allowlist a Postmark webhook body into a minimal event. */
function parsePostmark(rawBody: string): DeliveryEvent {
  if (new TextEncoder().encode(rawBody).length > MAX_WEBHOOK_BYTES) throw new Error("payload_too_large");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
  const recordType = String(body.RecordType ?? "");
  let event: string | undefined;
  if (recordType === "Delivery") event = "delivered";
  else if (recordType === "SpamComplaint") event = "spam_complaint";
  else if (recordType === "Bounce") {
    const t = String(body.Type ?? "");
    if (t === "SoftBounce" || t === "Transient") event = "deferred";
    else if (t === "SpamComplaint") event = "spam_complaint";
    else event = "bounced";
  }
  if (!event || !ALLOWED_EVENTS.has(event)) throw new Error("event_not_allowlisted");

  const providerMessageId = String(body.MessageID ?? "");
  if (!providerMessageId) throw new Error("missing_message_id");
  const recipient = body.Recipient ?? body.Email;
  return {
    event,
    providerMessageId,
    emailNormalized: recipient ? String(recipient).trim().toLowerCase() : null,
    detail: { recordType, type: body.Type ?? null },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = (k: string) => Deno.env.get(k) ?? undefined;
  const expected = env("POSTMARK_WEBHOOK_SECRET");
  const provided = providedSecret(req);
  // Authenticate FIRST — never parse an untrusted body from an unauthenticated caller.
  if (!expected || !provided || !timingSafeEqual(expected, provided)) {
    return json({ error: "unauthorized" }, 401);
  }

  const rawBody = await req.text();
  let ev: DeliveryEvent;
  try {
    ev = parsePostmark(rawBody);
  } catch (err) {
    const msg = (err as Error).message;
    // Oversized / malformed / non-allowlisted: acknowledge without storing.
    return json({ error: msg }, msg === "payload_too_large" ? 413 : 400);
  }

  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: inserted, error } = await service.rpc("record_email_event", {
    p_provider: "postmark",
    p_provider_message_id: ev.providerMessageId,
    p_event: ev.event,
    p_email_normalized: ev.emailNormalized,
    p_school: null,
    p_detail: ev.detail,
    p_signature_verified: true,
  });
  if (error) {
    console.error(`[email-webhook] record failed: ${error.message}`);
    return json({ error: "record_failed" }, 500);
  }
  // `inserted === false` means a replay (idempotent no-op) — still a 200.
  return json({ status: "ok", recorded: inserted === true }, 200);
});
