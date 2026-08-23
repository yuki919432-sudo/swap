# SWAP! 1.0.4 — major-redesign update to the existing app (`app.replit.swap`)

This update ships the **new SWAP! codebase** as version **1.0.4** of the *existing*
App Store app **"SWAP! by ShareCycle"** (bundle id `app.replit.swap`). It is **not a
new listing**. Existing users receive it as a normal update.

> **Prerequisite (blocker):** the release build must point at the **production
> Supabase backend**. A build with no backend shows the "Backend not configured"
> screen and will be rejected. Wire the backend (see
> [../PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md)) and set the EAS env before
> building.

## Version / build numbering

- `app.json` → `version: "1.0.4"`, `ios.bundleIdentifier: "app.replit.swap"`.
- `eas.json` → `cli.appVersionSource: "remote"` + `production.autoIncrement: true`.
  EAS reads the latest build number from App Store Connect and picks the next one,
  so the build can never collide with a build number already used by 1.0.x.
  (This needs App Store Connect API access — see below.)

## One-time credentials (owner)

1. **App Store Connect API key** (recommended for non-interactive build/submit):
   App Store Connect → Users and Access → Integrations → App Store Connect API →
   create a key (Admin or App Manager). Download the `.p8` (once), note the **Key ID**
   and **Issuer ID**. Provide these to EAS when prompted (or via
   `EXPO_APPLE_APP_SPECIFIC_PASSWORD` / `eas credentials`).
2. **`ascAppId`**: App Store Connect → your SWAP! app → **App Information → General
   Information → Apple ID** (a number). Put it in `eas.json` →
   `submit.production.ios.ascAppId` (replace the placeholder).
3. Build under the **Apple Team that owns `app.replit.swap`**. EAS fetches/creates the
   distribution certificate + provisioning profile for that bundle id (no entitlements
   are used, so nothing else to configure).

## Build & upload (runs on your machine — not from the dev container)

```
# from apps/mobile, with the pilot EAS env set (Supabase URL/anon, support URL, pilot school id)
pnpm check:mobile-env            # must exit 0
eas login
eas build --profile production --platform ios
#  -> produces a signed .ipa; EAS assigns the next build number from App Store Connect
eas submit --profile production --platform ios
#  -> uploads to the EXISTING SWAP! app (via ascAppId); appears under the 1.0.4 "Build" section
```

Then in App Store Connect → SWAP! → **1.0.4 (Prepare for Submission)**: select the
uploaded build, refresh metadata/screenshots as needed, paste the App Review note
below + reviewer credentials, set **Manually release this version**, and **Add for
Review**.

## App Review note (paste into App Review Information → Notes)

> SWAP! 1.0.4 is a major redesign of the existing SWAP! campus exchange app. It
> rebuilds the student give / swap / borrow / lend marketplace on a new,
> school-isolated backend with invitation-based enrollment, in-app reporting and
> blocking with human moderation, and full in-app account deletion and data export.
>
> SWAP! is invitation-only and school-scoped, so there is no open sign-up. To review
> the app without any real student, roster, or manual approval, use the synthetic
> review account below — it is pre-verified in a dedicated review school and is also a
> moderator, so one login demonstrates the entire app.
>
> Test email: <from review_seed.mjs>
> Test password: <from review_seed.mjs>
> Invitation code (optional, to demonstrate enrollment): <from review_seed.mjs>
>
> Walkthrough: age gate (13+) → sign in → browse listings → create a listing (attach a
> photo) → wishlist → message the seller → make an offer → report a listing → open
> Settings → Moderation queue to resolve it → Settings → Account & privacy to edit
> profile, download data, or delete the account.
>
> No payments and no advertising. Minimum age 13. See the walkthrough detail in the
> app's App Review notes.

(Reviewer credentials come from running `supabase/production/review_seed.mjs` against
the production project — see [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md).)

## Notes / risks

- **User data continuity:** the new codebase uses the new Supabase backend; accounts
  and data from the old (Replit) backend do not carry over. After updating, users
  start fresh (age gate → sign up → invite code). Acceptable for the pilot reset;
  worth a line in the release notes.
- Keep the store listing name "SWAP! by ShareCycle"; the on-device name is "SWAP!"
  (these are allowed to differ).
- Do not create a second app record — always target the existing `app.replit.swap`.
