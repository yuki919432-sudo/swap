// Edge Function: request an email OTP (Verification Method C).
//
// This is the ONLY place the plaintext OTP exists: it is generated here, hashed,
// stored (hash+salt only) via the service-role RPC public.request_otp_challenge,
// and handed to the email provider. It is never logged, never returned, and never
// persisted in plaintext.
//
// Security properties:
//   * Requires an authenticated caller (JWT) with a verified email. The email is
//     read from the caller's own session — never from client input — so a caller
//     can only request a code for their own address.
//   * The service-role RPC enforces: school active + email_otp enabled + resend
//     cooldown + per-email/per-user daily caps + one-active-challenge supersede,
//     all transactionally in the database.
//   * The HTTP response is GENERIC: it never reveals whether the email is on a
//     roster, whether a membership exists, or whether the user is blocked. Only a
//     rate-limit produces a distinct (still generic) 429.
//
// The transport-agnostic logic (code generation, hashing, the provider interface,
// error normalization) is mirrored from the @swap/server package, which is the
// unit-tested source of truth (packages/server/src/otp.ts, email/provider.ts).
// It is re-implemented here with Deno/Web-Crypto because Edge Functions run on
// Deno, not Node.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GENERIC_OK = { status: "ok", message: "If your email is eligible, a verification code has been sent." };
const GENERIC_RATE = { status: "rate_limited", message: "Too many requests. Please wait before trying again." };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** sha256(salt || code) hex — MUST match the database comparison in 0026. */
async function otpCodeHash(salt: string, code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + code));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateOtpCode(): string {
  // Uniform 0..999999 via rejection sampling on a 32-bit draw.
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  const u = new Uint32Array(1);
  do {
    crypto.getRandomValues(u);
  } while (u[0] >= limit);
  return String(u[0] % max).padStart(6, "0");
}

function generateOtpSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "***";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
};

/** Send the OTP through Postmark if configured; otherwise do NOT send (dev). */
async function sendOtp(
  to: string,
  code: string,
  challengeId: string,
  schoolName: string | undefined,
  env: (k: string) => string | undefined,
): Promise<string | null> {
  const token = env("POSTMARK_SERVER_TOKEN");
  if (!token) {
    // Dev / unconfigured: never send, never log the code.
    console.warn(`[otp-request] provider not configured; would send to ${maskEmail(to)} (not sent)`);
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
        "X-PM-Idempotency-Key": challengeId,
      },
      body: JSON.stringify({
        From: env("EMAIL_FROM_ADDRESS") ?? "no-reply@mail.swapapp.example",
        To: to,
        MessageStream: env("POSTMARK_MESSAGE_STREAM") ?? "outbound",
        Subject: `Your ${schoolName ?? "SWAP!"} verification code`,
        TextBody: `Your verification code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`postmark_transient_${res.status}`);
    if (!res.ok) throw new Error(`postmark_rejected_${res.status}`);
    const body = (await res.json()) as { MessageID?: string; ErrorCode?: number };
    if (body.ErrorCode && body.ErrorCode !== 0) throw new Error(`postmark_error_${body.ErrorCode}`);
    return body.MessageID ?? null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = (k: string) => Deno.env.get(k) ?? undefined;
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!url || !anon || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  if (!authHeader) return json({ error: "not_authenticated" }, 401);

  // Resolve the caller from their JWT (never trust a client-supplied user id/email).
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return json({ error: "not_authenticated" }, 401);
  const user = userData.user;
  if (!user.email || !user.email_confirmed_at) return json({ error: "email_not_verified" }, 403);

  let schoolId: string | undefined;
  let schoolName: string | undefined;
  try {
    const parsed = (await req.json()) as { schoolId?: string; schoolName?: string };
    schoolId = parsed.schoolId;
    schoolName = parsed.schoolName;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!schoolId || !/^[0-9a-fA-F-]{36}$/.test(schoolId)) return json({ error: "invalid_input" }, 400);

  const email = user.email.trim().toLowerCase();
  const code = generateOtpCode();
  const salt = generateOtpSalt();

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: challengeId, error: rpcErr } = await service.rpc("request_otp_challenge", {
    p_user: user.id,
    p_school: schoolId,
    p_email_normalized: email,
    p_purpose: "school_membership_verification",
    p_code_hash: await otpCodeHash(salt, code),
    p_code_salt: salt,
  });

  if (rpcErr) {
    // Rate-limit signals get a generic 429; everything else (school missing,
    // method disabled) returns the SAME generic 200 to avoid enumeration.
    const msg = rpcErr.message ?? "";
    if (/otp_cooldown|otp_daily_limit/.test(msg)) return json(GENERIC_RATE, 429);
    return json(GENERIC_OK, 200);
  }

  try {
    // The provider message id is correlated later via the delivery webhook
    // (record_email_event); the private.otp_challenges row is not reachable over
    // PostgREST, so we deliberately do not write it back here.
    await sendOtp(email, code, challengeId as string, schoolName, env);
  } catch (err) {
    // Never reveal provider state to the client. The challenge remains valid; the
    // user can retry after the cooldown.
    console.error(`[otp-request] provider send failed: ${(err as Error).message}`);
  }

  return json(GENERIC_OK, 200);
});
