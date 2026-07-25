# Email OTP (Verification Method C)

Email OTP lets a student prove control of a school email address by receiving a
6-digit code and submitting it back. A successful verification creates (or
re-verifies) a `verified` `school_membership` with `verification_method =
'email_otp'`. It is one of the six verification methods; it is only usable when
the school has `email_otp` in `school_settings.enabled_verification_methods`.

Migration: `supabase/migrations/0026_email_otp.sql`.
Server logic: `packages/server/src/otp.ts`, `packages/server/src/email/*`.
Edge Functions: `supabase/functions/otp-request`, `supabase/functions/email-webhook`.

## Core security invariant

**The plaintext OTP is never stored anywhere** — not in the database, not in
audit logs, not in exception messages, analytics, or webhook copies. The database
stores only `sha256(salt || code)` plus the per-challenge salt. The plaintext code
exists transiently in exactly two places: the process that generates it (the
`otp-request` Edge Function / `issueOtpChallenge`) and the email body sent to the
student. Verification re-hashes the submitted code and compares against the stored
hash.

## Challenge model

`private.otp_challenges` (no client grants; `private` schema is not exposed via
PostgREST) binds each challenge to `(user_id, school_id, email_hash, purpose)`:

| Field | Purpose |
| --- | --- |
| `code_hash`, `code_salt` | `sha256(salt‖code)` + salt; never the plaintext |
| `email_normalized` | restricted (private schema); needed to (re)send |
| `email_hash` | `sha256(normalized email)` for safe lookup |
| `attempts`, `max_attempts` | wrong-code counter + limit (default 5) |
| `resend_count` | carried forward across supersede |
| `created_at`, `expires_at` | issue + expiry (default TTL 10 min) |
| `consumed_at`, `superseded_at`, `locked_until` | lifecycle timestamps |
| `provider_message_id`, `metadata` | audit-safe correlation only |

**At most one active challenge per key** is guaranteed by a partial unique index
(`otp_one_active_per_key … where consumed_at is null and superseded_at is null`).
Issuing a new challenge atomically supersedes the previous active one.

## State diagram

```
                        request_otp_challenge (service role)
                                     │
                                     ▼
   (supersede any prior active) ─► ACTIVE ──────────────────────────────┐
                                     │                                   │
             wrong code (attempts++) │                                   │
                 ┌───────────────────┤                                   │
                 │                   │ attempts >= max_attempts          │
                 ▼                   ▼                                   │
             still ACTIVE       LOCKED (locked_until = now + 15m)        │
                 │                   │                                   │
                 │ correct code      │ (verify → otp_locked)             │
                 ▼                   │                                   │
   membership guard (FOR UPDATE):    │                                   │
     suspended → otp fails, NOT consumed ─────────────► ACTIVE ◄─────────┤
     rejected  → otp fails, NOT consumed ─────────────► ACTIVE           │
     ok/pending/left/expired/none:                                       │
        consume (consumed_at = now) ─► CONSUMED (verified membership)    │
                                                                         │
   expires_at <= now ─► EXPIRED (verify → otp_expired) ◄─────────────────┘
   new request for same key ─► SUPERSEDED (verify → otp_invalid)
   app.purge_expired_otp(grace) deletes CONSUMED/SUPERSEDED/EXPIRED after the grace window
```

`verify_email_otp` returns a **result object** `{ ok, error?, membership? }`
rather than raising for verification failures, so the `attempts++` / lockout side
effect persists (a `RAISE` would roll it back inside the function's implicit
subtransaction). It raises only for auth preconditions (`not_authenticated`,
`email_not_verified` → `42501`).

## API / RPC surface

| Function | Caller | Purpose |
| --- | --- | --- |
| `public.request_otp_challenge(p_user, p_school, p_email_normalized, p_purpose, p_code_hash, p_code_salt, p_ttl?, p_resend_cooldown?, p_daily_cap_email?, p_daily_cap_user?)` → `uuid` | **service role only** | Rate-limit + supersede + insert; returns challenge id |
| `public.verify_email_otp(p_school, p_code, p_purpose?)` → `jsonb` | `authenticated` | Verify + consume + apply membership transition |
| `public.record_email_event(p_provider, p_provider_message_id, p_event, p_email_normalized, p_school?, p_detail?, p_signature_verified?)` → `boolean` | **service role only** | Idempotent delivery-event insert |
| `public.get_email_delivery_status(p_school, p_limit?)` → `jsonb` | `authenticated`, role-gated | Masked delivery status for admins |
| `app.purge_expired_otp(grace)` | **service role only** | Retention purge |

The request path runs as the service role inside the `otp-request` Edge Function;
the code is generated and hashed there and only the hash+salt reach the database.
The verify path is a normal client RPC — the email is read from the caller's own
verified session (`auth.users`), never from client input, so a caller can only
verify their own address.

## Rate-limit & abuse controls (DB-enforced)

`request_otp_challenge` enforces these transactionally (default values; tunable
via the function arguments / `.env` `OTP_*`):

| Control | Default | Enforcement |
| --- | --- | --- |
| Resend cooldown (per key) | 60 s | reject `otp_cooldown` if last challenge newer than cooldown |
| Daily cap per email | 10 / 24 h | count challenges by `email_hash`; reject `otp_daily_limit` |
| Daily cap per user | 20 / 24 h | count challenges by `user_id`; reject `otp_daily_limit` |
| Max verify attempts | 5 / challenge | `attempts` counter; at the limit set `locked_until = now + 15 min` |
| One active challenge / key | — | partial unique index + atomic supersede |
| School active + method enabled | — | checked before any challenge is created |

**Production requirement (documented, not app-owned):** IP / network-level abuse
controls (per-IP request caps, provider-abuse throttling) belong at the Edge
Function gateway or a shared store (e.g. Upstash/Redis) — the DB controls above
are per-identity, not per-network. Raw client IPs must **not** be retained beyond
what a short-lived rate-limit key requires. See "Known limitations".

## Provider architecture

`packages/server/src/email/provider.ts` defines the `EmailProvider` interface and
three implementations:

- `FakeEmailProvider` — deterministic, records sends, supports idempotency and
  forced failures (tests only).
- `DevEmailProvider` — **never sends**; logs a masked, code-free notice.
- `PostmarkEmailProvider` — inactive unless a token is configured
  (`fromEnv` returns `null` when `POSTMARK_SERVER_TOKEN` is unset). Timeout via
  `AbortController`; `429`/`5xx` → retryable `transient`; other non-2xx →
  `rejected`; sends an idempotency key. **No real email is sent in tests or CI and
  no real Postmark token is required.**

Errors normalize to `ProviderError { code, retryable }`. A provider failure does
not leave inconsistent state — the challenge remains a valid pending challenge and
the client receives the generic response.

## Delivery events & webhook security

`email-webhook` (Edge Function) + `parsePostmarkWebhook`
(`packages/server/src/email/webhook.ts`):

1. **Authenticate first** — a shared secret (`POSTMARK_WEBHOOK_SECRET`) compared
   in constant time (`timingSafeEqual`), from Basic-auth or `X-Webhook-Secret`.
   An unauthenticated request is `401` and its body is never parsed.
2. **Payload-size limit** — bodies over 64 KiB are rejected (`413`) before parse.
3. **Event-type allowlist** — only `delivered`, `bounced`, `spam_complaint`,
   `deferred`, `rejected`; anything else is dropped.
4. **Replay / idempotency** — the DB unique index
   `email_events_idem (provider, provider_message_id, event)` makes a replayed
   webhook a no-op; `record_email_event` returns `false` for a duplicate.
5. **Minimal storage** — only `{ recordType, type }` detail is stored; never the
   raw provider payload, never provider secrets. A client-supplied event is never
   trusted.

## Privacy & retention

- School emails are private. Students cannot query others' emails: the roster and
  OTP tables live in schemas with no client grants, and `private.otp_challenges`
  is not exposed via PostgREST.
- Admin displays **mask** emails (`app.mask_email` → `v****@school.test`).
  `get_email_delivery_status` is role-gated (`school_owner` / `school_admin` /
  `membership_reviewer` / platform admin) and returns only masked address + event
  + timestamp.
- The response of `otp-request` is **generic** — it never reveals whether an email
  is on a roster, whether a membership exists, or whether the user is blocked.
  Only rate-limits produce a distinct (still generic) `429`.

**Retention** (`app.purge_expired_otp`, run on a schedule as the service role):

| Data | Retention |
| --- | --- |
| OTP challenges (consumed / superseded / expired) | deleted after a short grace window (default 1 day) |
| Failed attempts | held on the challenge row only; deleted with the challenge |
| Delivery / bounce events | minimal fields; retained for operational deliverability review, then aged out by an operational policy (documented, schedule TBD in production) |
| Rate-limit records | the challenge rows themselves; network-level keys (production) must be short-TTL and IP-free where possible |

## Tests

- `supabase/tests/29_email_otp.sql` (pgTAP) — plaintext-never-stored, wrong→attempt,
  correct verifies, replay rejected, expiry, supersede, attempt-limit + lockout,
  resend cooldown, per-email daily cap, cross-user, cross-school, suspended/rejected
  blocked, no partial membership, method disabled, OTP hashes private, webhook
  idempotency, masked delivery status, non-admin denied.
- `packages/server/src/otp.test.ts`, `email/provider.test.ts`, `email/webhook.test.ts`
  (vitest) — code/hash/normalize, issue path (hash+salt only, idempotency key),
  provider failure surfacing, verify error mapping, provider adapters, webhook
  auth + size + allowlist + minimal detail.
- `supabase/tests/integration/otp.integration.mjs` — real PostgREST request→verify,
  cross-school, cross-user, suspended blocked, private tables unreadable, webhook
  RPC service-role-only + idempotent, masked + role-gated delivery status.
- `supabase/tests/concurrency/run.mjs` scenario 6 — two simultaneous final
  verifications: exactly one succeeds, the challenge is consumed once, one
  membership created.

## Known limitations

- Network/IP-level rate limiting is specified but not implemented in this phase
  (per-identity DB limits only). It must be added at the Edge gateway / a shared
  store before production, without retaining raw IPs.
- Delivery-event retention has a defined shape but the production purge schedule
  is an operational decision (not yet automated here).
- The Edge Functions are not exercised by CI (the integration stack excludes
  `edge-runtime`); their transport-agnostic logic is covered by the mirrored,
  unit-tested `@swap/server` modules and the PostgREST integration suite.
