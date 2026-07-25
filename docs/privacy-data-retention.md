# Privacy & Data Retention

SWAP! is used by students, some of whom may be minors. Collect the minimum
personal information necessary and never expose it publicly.

> **Legal note:** this document and the in-app Privacy Policy / Terms / Community
> Guidelines are **placeholders**. Professional legal review is required before a
> public launch. Initial design targets **United States high schools and
> international schools**; no automatic claim of legal compliance is made.

## Data minimization

- Public profiles (`public.users`) contain **no** email or phone number.
- Verified email lives only in `private.user_emails` (no client grants). Admin
  access is via the role-restricted, audit-logged `app.get_member_email`
  (correction #9).
- Do not require or publicly display phone numbers, student IDs, personal
  emails, exact home addresses, or full legal names unless truly necessary.
- Event participant lists are hidden by default
  (`school_settings.participant_names_visible = false`).

## User controls

- **Reporting & blocking** for content and users.
- **Account deletion:** `app.request_account_deletion` sets
  `account_status = 'deletion_requested'`. `app.anonymize_user` (platform)
  scrubs the profile, deletes the private email, withdraws open content, and sets
  memberships to `left` — while preserving transaction/report/moderation/audit
  history for safety.
- **Data export:** planned (Phase 4 admin tooling).

## Retention windows (defaults; tunable)

| Data | Retention | Mechanism |
| --- | --- | --- |
| OTP challenges (consumed / superseded / expired) | expiry + 1 day grace | `app.purge_expired_otp` (also run by `app.purge_expired_ephemeral`) |
| Failed OTP attempts | held on the challenge row; deleted with it | `app.purge_expired_otp` |
| Email delivery / bounce events | 180 days | `app.purge_expired_ephemeral` |
| Invalid device tokens | pruned each run | `app.purge_expired_ephemeral` |
| Abandoned drafts | 90 days | `app.purge_expired_ephemeral` |
| Stale offers | 30 days → `expired` | `app.expire_stale_content` |
| Unanswered membership requests | 60 days → `rejected` | `app.expire_stale_content` |
| Expired invitations | rejected at redeem; row kept for audit | validated in `app.redeem_invitation` |
| Roster entries (**optional** adapter; email only) | kept only while the school keeps roster enabled | school-deletable at any time (`student_roster_entries`); never real data in tests/seeds |
| Transactions / reports / moderation / audit | **preserved** | never client-deletable |

Roster matching is an optional adapter and is **off by default** (see
[school-verification.md](school-verification.md)). Roster data is minimal (email
only), never exposed to students, and a school may remove all imported roster
data at any time.

## What is never hard-deleted via the client

Transaction records, report history, moderation actions, and audit logs. These
support dispute resolution and safety investigations. `audit_logs` is append-only
(trigger-enforced).
