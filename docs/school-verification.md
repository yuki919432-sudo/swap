# School Verification

No school depends on a single verification method. Each school enables one or
more of the six methods in `school_settings.enabled_verification_methods`. All
methods funnel into the same pipeline and end as a `school_memberships` row in
`pending` or `verified`. Only `verified` unlocks tenant content (RLS-enforced).

```
sign-in ─▶ resolve-school-membership (Edge Function, service role)
          ├─ read verified email from the provider/session (never client input)
          ├─ dispatch on the school's enabled method(s)
          └─ upsert school_memberships (pending | verified)
```

## Method A — Google school account

Google OAuth → confirm Google email is verified → compare domain against
`school_domains` → verified or pending per school policy. Some Workspace schools
block external apps, so this is never the only option.

**Config:** Google Cloud OAuth client; scopes `openid email profile`; redirect
URI from the Supabase Auth callback. Secrets in env only.

## Method B — Microsoft school account

Microsoft OAuth → read verified email → compare domain → apply policy. Some
tenants require admin consent; document the app's required delegated permissions
(`openid email profile User.Read`). Never the only option.

## Method C — School email OTP

A short expiring code emailed via Postmark from a dedicated sending subdomain.
Codes are hashed (`private.otp_codes.code_hash`), expiring, attempt-limited,
resend-cooldown and daily-capped, with brute-force lockout. Never send production
OTP from a dev server. See [email-deliverability.md](email-deliverability.md).

Tuning via env: `OTP_LENGTH`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`,
`OTP_RESEND_COOLDOWN_SECONDS`, `OTP_DAILY_CAP_PER_EMAIL`.

## Method D — Pre-approved roster

Admins import approved emails (CSV) into `student_roster_entries` (stored
normalized + hashed; never public). On sign-in the email is matched (by hash);
auto-verify or pending per policy. Roster is readable only by school reviewers/
admins (RLS).

## Method E — Invitation codes (correction #6)

Shared or single-use codes with expiry, max-uses, revocation, and audit history.
Only a non-secret `code_prefix` + `code_hash` (sha256) are stored — never
plaintext. `app.create_invitation` generates the code and returns it once;
`app.redeem_invitation` consumes a use **atomically** (`uses_count < max_uses`
guard under row lock) and can require admin approval afterward (→ pending).

## Method F — Manual approval

A student submits name, school email, grad year, optional explanation →
`membership_requests` → reviewer approves/rejects. Collect the minimum necessary;
do not require phone numbers, student IDs, or home addresses.

## Membership statuses

`pending` · `verified` · `rejected` · `suspended` · `left` · `expired`.
Only `verified` grants access to private school content.
