# SWAP! Mobile (Expo)

A polished, user-facing **mobile vertical slice** of SWAP! — an Expo + Expo Router
+ TypeScript app you can open on an iPhone via **Expo Go**. It runs entirely on
**synthetic data** in a clearly-labeled, development-only **demo mode**. It is not a
public launch: no real accounts, no real emails, no production credentials, no RLS
bypass, no messaging/offers/payments.

## Quick start (Expo Go)

```bash
# from the repo root
pnpm install

# enable demo mode for local dev
cp apps/mobile/.env.example apps/mobile/.env   # sets EXPO_PUBLIC_ENABLE_DEMO_MODE=true

pnpm mobile:start        # start the Metro dev server (QR code)
# or: pnpm mobile:ios / pnpm mobile:android
```

Then:

1. Install **Expo Go** on your iPhone (App Store).
2. Ensure the phone and this machine are on the same network.
3. Scan the QR code shown by `pnpm mobile:start` with the Camera app → opens in Expo Go.
4. Tap **Explore the demo**, pick a synthetic school + profile, and browse.

> Chromium/Playwright are unrelated here — this is a native RN app. If you can't use
> a phone, `pnpm mobile:start --web` runs a rough web preview (layout only).

## Demo mode

Controlled by `EXPO_PUBLIC_ENABLE_DEMO_MODE=true` **and** a development runtime:

- clearly labeled everywhere (a persistent "DEMO MODE · SYNTHETIC DATA" banner),
- the demo entry is hidden when the flag is not `true`,
- unavailable in production builds (gated on `__DEV__`), even if the flag is set,
- no fake production JWT, no RLS bypass, no production credentials, no real
  school/student data.

Synthetic profiles include a **verified university student**, a **verified
high-school student**, a **pending student**, and a **school moderator**. Gating
logic is the pure, unit-tested `resolveDemoMode()` (`src/config/demo.ts`).

## Repository architecture (the Supabase swap-in seam)

Screens **never import mock arrays**. They depend only on repository interfaces
(`src/data/repositories/types.ts`), injected via `RepositoryProvider`:

| Interface | Demo implementation |
| --- | --- |
| `SessionRepository` | `MockSessionRepository` |
| `MarketplaceRepository` | `MockMarketplaceRepository` |
| `CommunityRepository` | `MockCommunityRepository` |
| `InboxRepository` | `MockInboxRepository` |
| `SavedListingsRepository` | `MockSavedListingsRepository` |
| `DraftListingsRepository` | `MockDraftListingsRepository` |

To move to real data later, implement these same interfaces against Supabase and
change only `RepositoryProvider` — **no screen changes**. The marketplace query
semantics (search/filter/sort) live in the pure, tested
`applyMarketplaceQuery()` so they carry over unchanged.

## Real backend (Supabase)

The same repository interfaces have **real Supabase-backed implementations**
(`src/data/repositories/supabase/`). The data source is chosen in ONE place —
`RepositoryProvider` — with **no screen changes**:

- **Demo mode** (no Supabase env, or signed out): the Mock repositories.
- **Real backend** (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  set **and** a signed-in user): the Supabase repositories.

Everything runs under the caller's own session, so **Row-Level Security is the real
authority** — a user only sees/writes what their verified school membership allows.

| Capability | Implementation |
| --- | --- |
| Listing feed / search / filters / sort | `SupabaseMarketplaceRepository.list` → PostgREST (`ilike` search, `in` filters, `order`) |
| Listing detail | `getById` with embedded images + owner |
| Create listing | `createListing` → insert row + upload images to Storage (`listing-images/{school}/{listing}/…`) + record image rows |
| Delete listing | `deleteListing` → soft-delete (`deleted_at`, status `removed`) |
| Images | private bucket → served via **signed URLs** |
| Saved listings | `SupabaseSavedListingsRepository` (user-scoped by RLS) |
| Session | `SupabaseSessionRepository` reads the real user's profile + verified membership + school |

**Sign in (dev/pilot):** with a backend configured, Welcome → *Join your school* →
`sign-in` (real Supabase email+password auth — a genuine JWT, not fake auth). Student
verification (invitation code / admin approval / email OTP) is the next auth milestone.

**Optimistic UI + states:** saving flips instantly and reconciles on failure; the
Marketplace shows a loading skeleton, an empty state, and a **retry** error state;
publishing shows progress and a friendly error on failure.

**Two-user acceptance proof:** `src/data/repositories/supabase/marketplace.integration.test.ts`
boots a real Supabase stack in CI and exercises the actual repository classes — two
same-school users create listings, upload images, browse, search, save, and view
each other's items; a third user from another school is isolated by RLS.

Run against a local stack: `pnpm mobile:test` is unit-only; the integration test runs
via `pnpm --filter @swap/mobile test:integration` with `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from `supabase status`.

### Real-backend limitations (this checkpoint)

- Drafts stay **local** (on-device); publishing a draft creates a real listing.
- Free-text handoff location isn't persisted (real handoff locations are a
  predefined-list feature); `handoff_location_id` is left null.
- Institution type isn't modeled in the DB yet; real schools default to
  "university" for the local moderation context (regulated categories stay off).
- Community / Inbox are stubs (empty) against the real backend until their
  milestones. Moderation is still the **local simulator** (as requested).

## Wishlist & recommendations

Two distinct concepts:

- **Saved listings** — a bookmark on an existing listing (Phase 1D).
- **Wishlist ("looking for")** — persistent "I'm looking for…" requests
  (`WishlistRepository`, backed by the `wishlist_items` table): title, description,
  preferred category/condition, budget (future), swap-acceptable, urgency, and
  school visibility. Wishes surface throughout the app (Home entry, "around campus",
  student stalls).

**Match outbox + notification hook (prepared, not sent).** A database trigger runs
a deterministic matcher on every new listing and records `(wishlist → listing,
score)` rows into `wishlist_matches` with an `notified_at` outbox column. A future
push-notification service ("A new item matching your wishlist has been listed.")
implements `WishlistNotifier` and marks rows notified — `NoopWishlistNotifier` is
the current no-op. No push notifications are sent in this phase.

**Recommendation engine** (`src/recommendations/`) — modular and replaceable:
screens depend on the `RecommendationEngine` interface, not the implementation. The
`DeterministicRecommendationEngine` builds labeled shelves — *Recommended for you*,
*Because you liked…*, *Matches your wishlist*, *Popular in your school*, *Trending
this week*, *New in categories you browse* — plus per-listing *Similar listings*.
Pure, deterministic scoring (token overlap + category/condition + a popularity
signal); **no external AI/ML**. Browsing history (viewed categories) is a local
signal. The authoritative wishlist match outbox is computed server-side; the client
engine powers the broader shelves and can be swapped for a smarter/served ranker
later without touching the UI.

## Local persistence

Repositories persist through a tiny `KeyValueStore` (`src/data/storage.ts`):

- app runtime → **AsyncStorage** (`@react-native-async-storage/async-storage`),
- tests → `InMemoryKeyValueStore`.

Persisted, demo-scoped, on-device only: **selected demo profile**, **saved
listings**, **drafts**, and **locally-published demo listings**. Nothing leaves the
device.

## Design system

Centralized tokens in `src/theme/` — colors (light/dark semantic sets),
typography, spacing, radii, shadows, icon sizes, motion. Components read them via
`useTheme()`; **no literal style values are scattered in screens**. The look is
modern, campus-focused, and trustworthy: strong dark type, warm neutral
backgrounds, a fresh green/mint accent, rounded cards, generous spacing, restrained
motion, tactile press feedback.

## Trust & Safety (local demo simulator only)

This slice does **not** implement the production moderation backend or any external
AI. `src/moderation/simulator.ts` is a deterministic, local simulator with four
outcomes — **allow / warn / block / escalate**:

- normal textbook/furniture listing → **allow**,
- phone number or personal address → **warn**,
- universally-prohibited test content (`[[PROHIBITED_TEST]]`, weapons, …) → **block**,
- severe threat fixture (`[[SEVERE_THREAT_TEST]]`) → **escalate**.

Warned / blocked / escalated drafts stay **unpublished**; the user may **edit and
retry**; there is **never an automatic suspension**. Publishing also runs the shared
`@swap/validation` `createListingSchema`, so the form matches the backend rules.

**Regulated vs. universal.** Tobacco / nicotine / vaping / alcohol are **regulated**
categories kept **separate** from universal prohibitions (`src/moderation/categories.ts`):
disabled by default, **never** enable-able for a high-school institution, and only a
*future* university capability gated on legal/age/jurisdiction/campus-policy review.
(The backend `@swap/types` PROHIBITED_CATEGORIES still bundles alcohol/nicotine;
reconciling that is a flagged T&S **backend** follow-up — see
`docs/trust-and-safety-roadmap.md`.)

## Screens & navigation

Expo Router file tree under `app/`:

```
app/
  _layout.tsx            Root: providers (Theme, Repositories, Session) + Stack
  index.tsx              Welcome ("Your campus has more to share.")
  demo-select.tsx        Synthetic school + profile selector
  (tabs)/_layout.tsx     Tab bar (gated on a selected demo session)
  (tabs)/index.tsx       Home
  (tabs)/marketplace.tsx Marketplace (search, filters, sort, skeleton, refresh)
  (tabs)/community.tsx   Community
  (tabs)/inbox.tsx       Inbox (preview; messaging is Coming soon)
  (tabs)/profile.tsx     Profile
  listing/[id].tsx       Listing details (carousel, save/share/report, primary CTA)
  create.tsx             Create listing → preview → moderation → publish/draft
  my-listings.tsx        Drafts / Active / Reserved / Completed / Expired + Saved
  settings.tsx           Switch demo profile, exit demo, about
```

## Commands

```bash
pnpm mobile:start      # Expo dev server
pnpm mobile:ios        # open iOS simulator (if available)
pnpm mobile:android    # open Android emulator (if available)
pnpm mobile:test       # vitest logic tests
pnpm verify            # full repo verification (DB suites, typecheck, lint, all tests)
```

## Placeholder features (intentionally not built here)

- **Messaging / Inbox** — UI + preview only; no Realtime, no conversations.
- **Offers & handoff** — a polished "coming soon" sheet; never fakes a transaction.
- **Sharing / Reporting** — coming-soon sheets.
- **Real school verification / sign-in** — the "Join your school" flow is a
  coming-soon sheet; only the demo session is functional.
- **Community RSVPs / posting** — preview + coming-soon.

## Known limitations

- Demo data and locally-published listings live only on the device (AsyncStorage);
  clearing storage or "Exit demo" resets them.
- Images are emoji/gradient placeholders, or a locally-picked photo (never uploaded).
- No backend calls at all — this slice is deliberately offline/synthetic.
- Screen components are thin wrappers over the tested logic; they are exercised by
  hand in Expo Go rather than by a rendering test runner (the logic they call is
  covered by vitest).

## Future: swapping to Supabase

Implement the repository interfaces against `@supabase/supabase-js` (reusing
`@swap/server` where useful), wire them in `RepositoryProvider`, and add real auth.
Screens, design tokens, and the marketplace query semantics stay as-is.
