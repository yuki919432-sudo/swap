# SWAP! — go-live submission checklist

The single ordered list of what's left to get SWAP! into App Review. **All
engineering is done** (Steps 1–7); everything below is **owner/human** work —
accounts, secrets, hosting, legal sign-off, and the store upload itself, which the
build agent cannot do. Each item links to the doc that explains it.

Legend: ☐ to do · 🔑 needs an account/secret · ✍️ needs sign-off · 📱 needs a device.

---

## 1. Accounts & backend  🔑

- ☐ Create an **Apple Developer account** + an **App Store Connect** app record.
- ☐ Create a **production Supabase project** (separate from any staging).
- ☐ Apply the schema: `supabase link` → `supabase db push` (never the test setup
  stubs). — [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) §1
- ☐ Stand up the pilot school (idempotent, secret-free scripts):
  `01_pilot_school.sql` → note the `school_id` → `02_promote_owner.sql` →
  `03_mint_invitation.sql`. — [supabase/production/](../supabase/production/README.md)
- ☐ (When email/OTP is wanted) configure a transactional email provider + verified
  sending subdomain. Not required for the invite-code pilot.

## 2. Legal & policy  ✍️

- ☐ Have counsel review + finalize the drafts:
  [PRIVACY_POLICY](legal/PRIVACY_POLICY.md), [TERMS_OF_USE (+EULA)](legal/TERMS_OF_USE.md),
  [COMMUNITY_GUIDELINES](legal/COMMUNITY_GUIDELINES.md).
- ☐ **Host** the finalized Privacy Policy (and ToS/EULA) at public URLs.
- ☐ Set the **Privacy Policy URL** in App Store Connect.

## 3. App configuration  🔑

- ☐ Replace the placeholder **bundle identifier** `test.example.swap.demo` in
  `apps/mobile/app.json` with your real reverse-domain id.
- ☐ Set EAS env for `preview` + `production`: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the **anon** key), `EXPO_PUBLIC_SUPPORT_URL`,
  `EXPO_PUBLIC_PILOT_SCHOOL_ID` (the `school_id` from step 1). —
  [BUILD_AND_ENVIRONMENTS.md](BUILD_AND_ENVIRONMENTS.md)
- ☐ Run the **preflight**: `pnpm check:mobile-env` (with that env) → must exit 0.

## 4. Store assets & metadata  📱

- ☐ Final **app icon** 1024×1024 PNG (export/replace the placeholder
  [`icon.svg`](../apps/mobile/assets/icon.svg)). — [appstore/ASSETS.md](appstore/ASSETS.md)
- ☐ **Screenshots** on a real device/simulator at the required sizes.
- ☐ Fill **metadata** (name/subtitle/description/keywords/URLs) and **age rating**. —
  [appstore/APP_STORE_METADATA.md](appstore/APP_STORE_METADATA.md)
- ☐ Fill **App Privacy** answers from
  [appstore/PRIVACY_NUTRITION_LABELS.md](appstore/PRIVACY_NUTRITION_LABELS.md).

## 5. Reviewer access  🔑

- ☐ Provision a **reviewer test account** (verified in the review school) + an
  **invitation code**, and paste them + the walkthrough into App Review notes. —
  [appstore/APP_REVIEW_NOTES.md](appstore/APP_REVIEW_NOTES.md)
- ☐ (Optional) a second account and a moderator account to demo an exchange + the
  moderation queue.

## 6. Final QA & security  📱

- ☐ Smoke-test the real path on a device (enroll → post → cross-school isolation →
  offer/handoff → report → delete). — [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) §4
- ☐ Run `/security-review` once more.
- ☐ Confirm Supabase automated **backups** are on. — [backup-restore.md](backup-restore.md)

## 7. Build & submit

- ☐ `eas build --profile production --platform ios`
- ☐ `eas submit --profile production --platform ios`
- ☐ Submit for review in App Store Connect with the notes from step 5.

---

## Pre-submit gate (from the guideline audit)

Everything code-side is ✅ in
[appstore/APP_REVIEW_GUIDELINE_AUDIT.md](appstore/APP_REVIEW_GUIDELINE_AUDIT.md):
13+ age gate, invitation-only enrollment, per-school RLS isolation, report + block +
human moderation, in-app account deletion + data export, no ads / no payments / no
tracking / no precise location, finite non-attention-maximizing discovery. The 🟨
items in that audit are exactly the human steps listed above.
