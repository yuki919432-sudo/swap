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

Postmark delivery, bounce, and spam-complaint webhooks post to an Edge Function
(verified via `POSTMARK_WEBHOOK_SECRET`) that records rows in
`private.email_events`. This powers deliverability monitoring so admins see
"OTP not delivered / bounced" instead of a silent failure.

## OTP specifics

6-digit code, 10-minute expiry, ≤5 verify attempts per code, 60s resend
cooldown, daily cap per email, all rate-limited at the Edge Function. Codes are
stored hashed in `private.otp_codes` and purged after expiry + grace by
`app.purge_expired_ephemeral`.

## Environments

Dev/staging route to a Postmark sandbox / test stream or a caught-mail inbox —
never real student inboxes. Delivery logs and bounce rates are reviewed before
raising DMARC enforcement.
