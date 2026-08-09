# App Review guideline audit

Where each release-relevant App Store Review Guideline is satisfied, with pointers
into the codebase. Use this as the pre-submission self-check. ✅ = implemented; 🟨 =
implemented in code, needs an owner/human action (hosting, account, sign-off).

## 1.2 — User-Generated Content (the critical one for this app)

Apple requires UGC apps to have **all** of: a method to filter objectionable
content, a mechanism to report content, the ability to block abusive users, a
published way to contact you, and a commitment to act on reports (remove content /
eject users).

| Requirement | Status | Where |
|-------------|--------|-------|
| Filter objectionable content on submit | ✅ | moderation simulator + prohibited categories (`0021_reference_data.sql`, `reject_prohibited_category` trigger) |
| Report content (listing/image/user/message) | ✅ | `ReportSheet`, `SupabaseReportRepository`, `reports` table + RLS |
| Block abusive users | ✅ | block list in Settings; `blocks` table + RLS; blocked users can't message/offer |
| Human moderation acts on reports | ✅ | moderator queue (`/moderation`), role-gated RPCs (`0032_moderation.sql`): remove content, suspend member |
| EULA with zero-tolerance for objectionable content/abusive users | ✅ | `docs/legal/TERMS_OF_USE.md` §Objectionable content (EULA) |
| Published contact method | 🟨 | in-app **Contact support** (`EXPO_PUBLIC_SUPPORT_URL`) — owner sets the URL |

Real-backend proof of the report → moderation → resolve/suspend path:
`trustSafetyAccount.integration.test.ts`.

## 5.1.1(v) — Account deletion

| Requirement | Status | Where |
|-------------|--------|-------|
| Initiate account deletion **in-app** | ✅ | Settings → Account & privacy → Delete my account (`app/account.tsx`) |
| Backend deletion + retention documented | ✅ | `public.request_account_deletion()` (`0033`), `ACCOUNT_DELETION_AND_RETENTION.md` |
| Data export / portability | ✅ | Download my data → `public.export_my_account()` |

## 5.1.1 / 5.1.2 — Data collection & privacy

| Requirement | Status | Where |
|-------------|--------|-------|
| Privacy Policy (link in-app + App Store) | 🟨 | `docs/legal/PRIVACY_POLICY.md` drafted; needs counsel sign-off + hosting |
| Accurate purpose strings for permissions | ✅ | `app.json` photo permission (accurate for pilot) |
| Data minimization | ✅ | no DOB, no precise location, email stored hashed/private |
| Privacy nutrition labels | ✅ (to enter) | `PRIVACY_NUTRITION_LABELS.md` |

## 5.1.4 — Kids / minors

| Requirement | Status | Where |
|-------------|--------|-------|
| Age assurance for a 13+ minimum | ✅ | 13+ age gate (`config/ageGate.ts`), enforced before auth |
| No behavioral advertising to minors | ✅ | no ads, no tracking SDKs |
| Not submitted to Kids Category | ✅ | intended 13+ general audience, moderated |

## 1.4 — Physical safety

| Requirement | Status | Where |
|-------------|--------|-------|
| Safe in-person handoffs | ✅ | handoffs restricted to school-approved `safe_handoff_locations` |
| Report unsafe behavior | ✅ | report flow; "contact authorities" guidance in Settings |

## 3.1.1 — Payments

No payments, no digital goods → **no In-App Purchase required**. The app facilitates
free give/swap/borrow/lend only and is never a party to a transaction.

## 2.1 / 2.3 — Completeness & accurate metadata

| Requirement | Status | Where |
|-------------|--------|-------|
| No demo/placeholder data in the shipped build | ✅ | pilot mode never uses mock (`resolveDataSource`, `MissingBackendScreen`) |
| Reviewer can actually get in | 🟨 | requires a provisioned test account + invitation code — `APP_REVIEW_NOTES.md` |
| Accurate description/screenshots | 🟨 | `APP_STORE_METADATA.md` + device screenshots (owner) |

## 4.0 / 4.2 — Design & minimum functionality

Full native journey (enroll → discover → offer → handoff → complete) with finite,
non-attention-maximizing discovery (no infinite scroll / autoplay / public vanity
metrics), consistent with the product brief.

## Remaining human-only items before submit

- [ ] Host the finalized Privacy Policy (+ ToS/EULA) and set the URLs
- [ ] Legal/counsel sign-off on Privacy Policy, ToS/EULA, Community Guidelines
- [ ] Set `EXPO_PUBLIC_SUPPORT_URL` to a monitored support channel
- [ ] Provision the reviewer test account(s) + invitation code
- [ ] Real bundle identifier in `app.json`; final app icon + screenshots
- [ ] Run `/security-review` once more before public rollout
