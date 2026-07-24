# Email Deliverability

Provider: **Postmark**, chosen for deliverability to restrictive school mail
systems. The provider is accessed through a thin interface so another provider
can be swapped later without touching call sites.

Never send production authentication email from a development server. Never
hard-code provider secrets — see `.env.example`.

## Sending domain

Use a **dedicated sending subdomain**, e.g. `mail.swapapp.example` (placeholder;
do not configure real DNS in the repo). Never send as the school's own domain.

## DNS records (configure in the provider + DNS, not in the repo)

- **SPF** — authorize Postmark's sending hosts for the subdomain.
- **DKIM** — publish the Postmark DKIM key for the subdomain.
- **DMARC** — start at `p=none` (monitor), move to `p=quarantine` then
  `p=reject` once alignment is clean. Send aggregate reports to a monitored
  mailbox.
- **Return-Path / custom bounce domain** — align for full DMARC pass.

## Webhooks

Postmark delivery, bounce, and spam-complaint webhooks post to the
`email-webhook` Edge Function (authenticated via `POSTMARK_WEBHOOK_SECRET`,
constant-time compared; size-limited; event-type allowlisted; idempotent) that
records minimal rows in `private.email_events` via `public.record_email_event`.
This powers deliverability monitoring so admins see "OTP not delivered / bounced"
(masked, via `get_email_delivery_status`) instead of a silent failure.

## OTP specifics

6-digit code, 10-minute expiry, ≤5 verify attempts per code, 60s resend
cooldown, daily cap per email and per user, enforced transactionally in the
database. Codes are stored hashed (`sha256(salt‖code)`) in
`private.otp_challenges` — the plaintext is never stored — and purged after
expiry + grace by `app.purge_expired_otp`. Full design: **[otp.md](otp.md)**.

## Environments

Dev/staging route to a Postmark sandbox / test stream or a caught-mail inbox —
never real student inboxes. Delivery logs and bounce rates are reviewed before
raising DMARC enforcement.
