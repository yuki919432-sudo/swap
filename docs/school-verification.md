# School Verification

No school depends on a single verification method, and **no method is a hard
dependency** — least of all a student roster. Each school enables one or more of
the six methods in `school_settings.enabled_verification_methods`. All methods
funnel into the same pipeline and end as a `school_memberships` row in `pending`
or `verified`. Only `verified` unlocks tenant content (RLS-enforced).

```
sign-in ─▶ resolve-school-membership (Edge Function, service role)
          ├─ read verified email from the provider/session (never client input)
          ├─ dispatch on the school's enabled method(s)
          └─ upsert school_memberships (pending | verified)
```

## Roster access is optional

**Do not assume a school provides a student roster.** Roster access is optional
and is often unavailable for privacy, institutional-approval, contractual, or
operational reasons. The product is **fully usable with no roster integration at
all.** Roster matching is a configurable optional adapter (Method D) — nothing
else depends on it.

Roster data is **never required** to:

- create a school,
- launch a pilot,
- approve members,
- use the marketplace,
- use the community features, or
- administer the school.

### Verification priority for the initial pilot

1. **Invitation codes** (Method E) — the primary path.
2. **Manual membership requests + admin approval** (Method F).
3. **School email OTP** (Method C) — only where deliverability is confirmed.
4. **Google / Microsoft OAuth** (Methods A/B) — only where the institution
   permits the OAuth application.
5. **Roster matching** (Method D) — only when a school explicitly and lawfully
   provides roster data.

### Default pilot configuration

A new pilot school defaults to **invitation codes + manual approval enabled** and
everything else off (`school_settings.enabled_verification_methods` defaults to
`{invite_code, manual}`, set in migration 0027). Schools opt in to the rest:

| Method | Default | Enable when |
| --- | --- | --- |
| Invitation codes | **on** | — |
| Manual approval | **on** | — |
| Email OTP | off | deliverability is confirmed |
| Google / Microsoft OAuth | off | the institution permits the OAuth app |
| Roster matching | off | the school lawfully provides roster data |

An invitation may resolve to **immediate verification** (tightly controlled
single-use invitations), **pending membership requiring admin approval**, or a
**configurable policy chosen by the school** (`invitations.requires_approval`).

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
Codes are hashed (`private.otp_challenges.code_hash` = `sha256(salt‖code)`),
expiring, attempt-limited, resend-cooldown and daily-capped, with brute-force
lockout. The plaintext code is never stored. Never send production OTP from a dev
server. Full design, state diagram, and security model: **[otp.md](otp.md)**; see
also [email-deliverability.md](email-deliverability.md).

Tuning via env: `OTP_LENGTH`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`,
`OTP_RESEND_COOLDOWN_SECONDS`, `OTP_DAILY_CAP_PER_EMAIL`, `OTP_DAILY_CAP_PER_USER`.

## Method D — Pre-approved roster (OPTIONAL adapter)

**Optional and off by default.** Enable only when a school explicitly and lawfully
provides roster data. When enabled, admins import approved emails into
`student_roster_entries` (stored normalized + hashed; never public). On sign-in
the email is matched (by hash); auto-verify or pending per policy. The DB gate
(`'roster' = any(enabled_verification_methods)`) means `resolve_roster_membership`
returns `method_not_enabled` for any school that has not turned roster on.

### Roster privacy (when the adapter is used)

- Require **explicit school authorization** before importing.
- Store the **minimum required data** — email only. Never require full names,
  addresses, dates of birth, or other student records.
- Prefer **normalized email matching** (`email_normalized` + `email_hash`); the
  plaintext roster email need never leave the private/admin boundary.
- **Never expose the roster to students** — RLS restricts `student_roster_entries`
  reads/writes to `school_owner` / `school_admin` / `membership_reviewer` and
  platform admins.
- **Retention / deletion:** roster entries are retained only while the school
  keeps roster enabled; the school may remove imported roster data at any time
  (delete the rows). See [privacy-data-retention.md](privacy-data-retention.md).
- **Never include real roster data in tests or seed files** — all fixtures are
  synthetic.

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
