/**
 * Email provider abstraction for OTP delivery.
 *
 * The OTP request path talks to a provider ONLY through this interface. A
 * deterministic fake is used in tests; a dev provider never sends; the Postmark
 * adapter stays inactive unless an explicit token is configured. The plaintext
 * OTP passes through here transiently and is never logged.
 */

export interface OtpEmail {
  to: string;
  code: string;
  schoolName?: string;
  expiresInMinutes: number;
}

export interface SendResult {
  providerMessageId: string;
  accepted: boolean;
}

export type ProviderErrorCode = "timeout" | "rejected" | "transient" | "config" | "unknown";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
  /** Transient failures are safe for the caller to retry. */
  get retryable(): boolean {
    return this.code === "timeout" || this.code === "transient";
  }
}

export interface EmailProvider {
  readonly name: string;
  sendOtp(email: OtpEmail, opts?: { idempotencyKey?: string }): Promise<SendResult>;
}

/** Normalize an unknown thrown value into a ProviderError. */
export function normalizeProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const name = (err as { name?: string })?.name;
  if (name === "AbortError") return new ProviderError("timeout", "provider_timeout", err);
  return new ProviderError("unknown", "provider_error", err);
}

/* --------------------------------------------------------------- fake ------ */

/** Deterministic provider for tests: records sends, can be told to fail. */
export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: Array<{ to: string; providerMessageId: string; idempotencyKey?: string }> = [];
  constructor(private readonly failWith?: ProviderErrorCode) {}

  async sendOtp(email: OtpEmail, opts?: { idempotencyKey?: string }): Promise<SendResult> {
    if (this.failWith) throw new ProviderError(this.failWith, `fake_${this.failWith}`);
    // Idempotency: a repeated key returns the same message id.
    const existing = opts?.idempotencyKey
      ? this.sent.find((s) => s.idempotencyKey === opts.idempotencyKey)
      : undefined;
    if (existing) return { providerMessageId: existing.providerMessageId, accepted: true };
    const providerMessageId = `fake-${this.sent.length + 1}`;
    this.sent.push({ to: email.to, providerMessageId, ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}) });
    return { providerMessageId, accepted: true };
  }
}

/* ---------------------------------------------------------------- dev ------ */

/** Development provider: NEVER sends real email; logs a non-secret notice. */
export class DevEmailProvider implements EmailProvider {
  readonly name = "dev";
  async sendOtp(email: OtpEmail): Promise<SendResult> {
    // Deliberately does not log the code.
    console.warn(`[dev-email] would send an OTP to ${maskEmail(email.to)} (not sent)`);
    return { providerMessageId: `dev-${Date.now()}`, accepted: true };
  }
}

/* ------------------------------------------------------------- postmark ---- */

export interface PostmarkConfig {
  token: string;
  fromAddress: string;
  fromName?: string;
  messageStream?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Postmark adapter. Inactive unless constructed with an explicit token —
 * `fromEnv` returns null when POSTMARK_SERVER_TOKEN is unset, so nothing sends
 * real email by default.
 */
export class PostmarkEmailProvider implements EmailProvider {
  readonly name = "postmark";
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: PostmarkConfig) {
    if (!config.token) throw new ProviderError("config", "postmark_token_missing");
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  static fromEnv(env: Record<string, string | undefined>): PostmarkEmailProvider | null {
    if (!env.POSTMARK_SERVER_TOKEN) return null;
    return new PostmarkEmailProvider({
      token: env.POSTMARK_SERVER_TOKEN,
      fromAddress: env.EMAIL_FROM_ADDRESS ?? "no-reply@mail.swapapp.example",
      fromName: env.EMAIL_FROM_NAME ?? "SWAP!",
      messageStream: env.POSTMARK_MESSAGE_STREAM ?? "outbound",
    });
  }

  async sendOtp(email: OtpEmail, opts?: { idempotencyKey?: string }): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": this.config.token,
          ...(opts?.idempotencyKey ? { "X-PM-Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          From: this.config.fromName ? `${this.config.fromName} <${this.config.fromAddress}>` : this.config.fromAddress,
          To: email.to,
          MessageStream: this.config.messageStream,
          Subject: "Your SWAP! verification code",
          TextBody: `Your verification code is ${email.code}. It expires in ${email.expiresInMinutes} minutes.`,
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderError("transient", `postmark_transient_${res.status}`);
      }
      if (!res.ok) throw new ProviderError("rejected", `postmark_rejected_${res.status}`);
      const json = (await res.json()) as { MessageID?: string; ErrorCode?: number };
      if (json.ErrorCode && json.ErrorCode !== 0) throw new ProviderError("rejected", `postmark_error_${json.ErrorCode}`);
      return { providerMessageId: json.MessageID ?? "", accepted: true };
    } catch (err) {
      throw normalizeProviderError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Mask an email for logs/admin display: keep first char + domain. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}
