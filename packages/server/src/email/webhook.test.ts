import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  MAX_WEBHOOK_BYTES,
  parsePostmarkWebhook,
  verifyHmacSignature,
  verifyWebhookSecret,
} from "./webhook.js";

describe("verifyWebhookSecret", () => {
  it("accepts a matching secret", () => {
    expect(verifyWebhookSecret("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("rejects a mismatch, a missing expected, and a missing provided", () => {
    expect(verifyWebhookSecret("s3cr3t", "nope")).toBe(false);
    expect(verifyWebhookSecret(undefined, "s3cr3t")).toBe(false);
    expect(verifyWebhookSecret("s3cr3t", null)).toBe(false);
  });
  it("rejects a different-length candidate without throwing", () => {
    expect(verifyWebhookSecret("short", "a-much-longer-value")).toBe(false);
  });
});

describe("verifyHmacSignature", () => {
  const secret = "whsec";
  const body = JSON.stringify({ RecordType: "Delivery", MessageID: "m1" });
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts a correct signature", () => {
    expect(verifyHmacSignature(secret, body, sig)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyHmacSignature(secret, body + " ", sig)).toBe(false);
  });
  it("rejects a missing secret or signature", () => {
    expect(verifyHmacSignature(undefined, body, sig)).toBe(false);
    expect(verifyHmacSignature(secret, body, null)).toBe(false);
  });
});

describe("parsePostmarkWebhook", () => {
  it("parses a delivery event and stores only minimal detail", () => {
    const ev = parsePostmarkWebhook(
      JSON.stringify({ RecordType: "Delivery", MessageID: "m1", Recipient: "Student@School.Test" }),
    );
    expect(ev).toMatchObject({
      provider: "postmark",
      providerMessageId: "m1",
      event: "delivered",
      emailNormalized: "student@school.test",
    });
    expect(ev.detail).toEqual({ recordType: "Delivery", type: null });
  });

  it("maps a hard bounce to bounced", () => {
    const ev = parsePostmarkWebhook(
      JSON.stringify({ RecordType: "Bounce", Type: "HardBounce", MessageID: "m2", Email: "a@b.test" }),
    );
    expect(ev.event).toBe("bounced");
  });

  it("maps a soft bounce to deferred", () => {
    const ev = parsePostmarkWebhook(
      JSON.stringify({ RecordType: "Bounce", Type: "SoftBounce", MessageID: "m3", Email: "a@b.test" }),
    );
    expect(ev.event).toBe("deferred");
  });

  it("maps a spam complaint", () => {
    const ev = parsePostmarkWebhook(
      JSON.stringify({ RecordType: "SpamComplaint", MessageID: "m4", Email: "a@b.test" }),
    );
    expect(ev.event).toBe("spam_complaint");
  });

  it("rejects a non-allowlisted record type", () => {
    expect(() =>
      parsePostmarkWebhook(JSON.stringify({ RecordType: "Open", MessageID: "m5" })),
    ).toThrow("event_not_allowlisted");
  });

  it("rejects a payload without a message id", () => {
    expect(() => parsePostmarkWebhook(JSON.stringify({ RecordType: "Delivery" }))).toThrow("missing_message_id");
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePostmarkWebhook("{not json")).toThrow("invalid_json");
  });

  it("rejects an oversize payload before parsing", () => {
    const huge = JSON.stringify({ RecordType: "Delivery", MessageID: "m", pad: "x".repeat(MAX_WEBHOOK_BYTES) });
    expect(() => parsePostmarkWebhook(huge)).toThrow("payload_too_large");
  });

  it("never retains a raw provider payload beyond the minimal detail", () => {
    const ev = parsePostmarkWebhook(
      JSON.stringify({
        RecordType: "Delivery",
        MessageID: "m6",
        Recipient: "a@b.test",
        Metadata: { secret: "should-not-be-stored" },
        Details: "smtp;250 ok",
      }),
    );
    expect(JSON.stringify(ev.detail)).not.toContain("should-not-be-stored");
    expect(JSON.stringify(ev.detail)).not.toContain("250 ok");
  });
});
