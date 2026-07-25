import { describe, it, expect, vi } from "vitest";
import {
  DevEmailProvider,
  FakeEmailProvider,
  PostmarkEmailProvider,
  ProviderError,
  maskEmail,
  normalizeProviderError,
} from "./provider.js";

const otp = { to: "student@school.test", code: "123456", expiresInMinutes: 10 };

describe("maskEmail", () => {
  it("keeps the first character and the full domain", () => {
    expect(maskEmail("victor@allen.test")).toBe("v*****@allen.test");
  });
  it("masks a single-character local part", () => {
    expect(maskEmail("v@allen.test")).toBe("v*@allen.test");
  });
  it("returns a safe placeholder for a malformed address", () => {
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("normalizeProviderError", () => {
  it("passes a ProviderError through unchanged", () => {
    const e = new ProviderError("transient", "boom");
    expect(normalizeProviderError(e)).toBe(e);
  });
  it("maps an AbortError to a retryable timeout", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const norm = normalizeProviderError(abort);
    expect(norm.code).toBe("timeout");
    expect(norm.retryable).toBe(true);
  });
  it("maps an unknown throw to a non-retryable unknown error", () => {
    const norm = normalizeProviderError(new Error("weird"));
    expect(norm.code).toBe("unknown");
    expect(norm.retryable).toBe(false);
  });
});

describe("FakeEmailProvider", () => {
  it("records sends and returns an accepted result", async () => {
    const p = new FakeEmailProvider();
    const r = await p.sendOtp(otp);
    expect(r.accepted).toBe(true);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0]!.to).toBe(otp.to);
  });

  it("is idempotent for a repeated idempotency key", async () => {
    const p = new FakeEmailProvider();
    const a = await p.sendOtp(otp, { idempotencyKey: "chal-1" });
    const b = await p.sendOtp(otp, { idempotencyKey: "chal-1" });
    expect(a.providerMessageId).toBe(b.providerMessageId);
    expect(p.sent).toHaveLength(1);
  });

  it("throws a configured ProviderError", async () => {
    const p = new FakeEmailProvider("transient");
    await expect(p.sendOtp(otp)).rejects.toMatchObject({ code: "transient", retryable: true });
  });

  it("never exposes the plaintext code in its recorded sends", async () => {
    const p = new FakeEmailProvider();
    await p.sendOtp(otp);
    expect(JSON.stringify(p.sent)).not.toContain(otp.code);
  });
});

describe("DevEmailProvider", () => {
  it("never sends and never logs the code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = new DevEmailProvider();
    const r = await p.sendOtp(otp);
    expect(r.accepted).toBe(true);
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain(otp.code);
    expect(logged).toContain("s******@school.test");
    warn.mockRestore();
  });
});

describe("PostmarkEmailProvider", () => {
  it("fromEnv returns null when no token is configured (never sends by default)", () => {
    expect(PostmarkEmailProvider.fromEnv({})).toBeNull();
  });

  it("refuses to construct without a token", () => {
    expect(() => new PostmarkEmailProvider({ token: "", fromAddress: "a@b.test" })).toThrow(ProviderError);
  });

  it("sends via the injected fetch and returns the provider message id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ MessageID: "pm-42", ErrorCode: 0 }), { status: 200 }),
    ) as unknown as typeof fetch;
    const p = new PostmarkEmailProvider({ token: "tok", fromAddress: "no-reply@mail.test", fetchImpl });
    const r = await p.sendOtp(otp, { idempotencyKey: "chal-9" });
    expect(r.providerMessageId).toBe("pm-42");
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ "X-PM-Idempotency-Key": "chal-9" });
    // The token must never be logged; it lives only in the request header.
    expect((init as RequestInit).headers).toMatchObject({ "X-Postmark-Server-Token": "tok" });
  });

  it("maps 429 and 5xx to a retryable transient error", async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn(async () => new Response("", { status })) as unknown as typeof fetch;
      const p = new PostmarkEmailProvider({ token: "tok", fromAddress: "a@b.test", fetchImpl });
      await expect(p.sendOtp(otp)).rejects.toMatchObject({ code: "transient", retryable: true });
    }
  });

  it("maps a 4xx rejection to a non-retryable rejected error", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 422 })) as unknown as typeof fetch;
    const p = new PostmarkEmailProvider({ token: "tok", fromAddress: "a@b.test", fetchImpl });
    await expect(p.sendOtp(otp)).rejects.toMatchObject({ code: "rejected", retryable: false });
  });

  it("maps a Postmark ErrorCode payload to a rejected error", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ErrorCode: 406, Message: "inactive recipient" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const p = new PostmarkEmailProvider({ token: "tok", fromAddress: "a@b.test", fetchImpl });
    await expect(p.sendOtp(otp)).rejects.toMatchObject({ code: "rejected" });
  });
});
