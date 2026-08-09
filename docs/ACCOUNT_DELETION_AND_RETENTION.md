# Account deletion & data retention

SWAP! lets a signed-in student **edit their profile**, **download a copy of their
own data**, and **request deletion of their account** — entirely from inside the
app (Settings → Account & privacy → *Account & privacy*). This document describes
exactly what happens to data, so the behavior can be reviewed and disclosed
accurately (App Store Guideline 5.1.1(v); data-minimization commitments).

This is a *description of the existing model*, not a new policy. The retention
rules live in the database (migrations `0020_retention_lifecycle.sql` and
`0033_account_deletion.sql`) and are the single source of truth.

## What the student can do in-app

| Control | Effect |
| --- | --- |
| **Edit profile** | Updates the student's own `display_name` / `grad_year` (RLS restricts writes to their own row). |
| **Download my data** | Returns a JSON document of the student's **own** data via `public.export_my_account()` — profile, preferences, memberships, listings, saved listings, wishlist, offers, reports they filed, and blocks. Never includes another user's data. |
| **Delete my account** | Calls `public.request_account_deletion()`, then signs the student out. |

Both RPCs are self-scoped: every query inside them is filtered by `auth.uid()`,
so a caller can only ever act on their own account.

## Deletion is a two-stage, reversible process

1. **Request (immediate, reversible).** `request_account_deletion()` sets the
   account to `deletion_requested` and stamps `deletion_requested_at`. The student
   is signed out. Nothing is destroyed yet, so an accidental request can be
   reversed by support before it is finalized.
2. **Finalize / anonymize (maintenance).** A privileged maintenance routine
   (`app.anonymize_user`, run under `service_role`, not callable by clients)
   scrubs the personal profile and detaches user-facing content while preserving
   the records the platform is required to keep.

## What is scrubbed vs. retained on anonymization

**Scrubbed / removed (personal, user-facing data):**

- `display_name` → `"Former member"`, `avatar_url` → null, `grad_year` → null;
  `account_status` → `anonymized`.
- The private email record (`private.user_emails`) is deleted.
- The user's still-open listings and community posts are withdrawn from view
  (`status = 'removed'`).
- Memberships are set to `left`.

**Retained (required for integrity, safety, and accountability):**

- Transaction / exchange history (so the other party's record stays intact).
- Reports and moderation actions (safety and abuse history).
- The append-only audit log.

These retained rows no longer point at identifying personal data — they reference
the now-anonymized account.

## Related automatic retention

`0020_retention_lifecycle.sql` also expires stale content and purges ephemeral
data on a schedule (all under `service_role`, never client-callable): expired
listings/offers/requests transition to terminal states; OTP codes, email-event
logs, invalid device tokens, and abandoned drafts are purged after their windows.

## Notes for reviewers

- No client can execute the maintenance/anonymization functions — they are
  revoked from `public` and granted only to `service_role`.
- Deletion never hard-deletes rows that other users or safety processes depend
  on; it anonymizes. This is a deliberate, disclosed choice.
- The in-app "Download my data" export gives students a portable copy before they
  delete.
