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

**Wishlist journey (pilot).** The full lifecycle lives on `/wishlist`: create,
**edit** (`WishlistRepository.update`), mark **fulfilled**, **reopen**, **cancel**,
**delete**, and a show-on-stall toggle, with **Active / Fulfilled / Inactive**
status views. `matchDetailsForMe()` resolves the match outbox against each listing's
current state, so the **Matched listings** section can offer **"Message owner"**
(starts/reuses a conversation) for live matches and cleanly show **"No longer
available"** for taken-down / reserved / completed ones. Loading (skeletons),
error+retry, empty, and no-match states are all handled. Campus Market demand
clusters **prefill the create screen** so you can list in response to visible
demand.

**Match outbox + notification hook (prepared, not sent).** A database trigger runs
a deterministic matcher on every new listing and records `(wishlist → listing,
score)` rows into `wishlist_matches` with an `notified_at` outbox column. A future
push-notification service ("A new item matching your wishlist has been listed.")
implements `WishlistNotifier` and marks rows notified — `NoopWishlistNotifier` is
the current no-op. **No push notifications are sent.** Alongside it, `src/activity`
models prepared **in-app activity events** — `wishlist_match`,
`matched_listing_unavailable`, `wishlist_fulfilled`, `demand_response` — with an
idempotent `KvActivityRecorder` for a future in-app activity feed (again, nothing is
pushed). A fulfilled or cancelled request accrues no new matches; matches never
cross schools (RLS), and demand is only ever an aggregate count.

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

## Campus Markets & Student Stalls

A year-round student flea-market district inside each school. Three surfaces, all
behind the same repository abstraction (`StallRepository`, `MarketRepository`,
`CampusMarketRepository` — Mock + Supabase):

- **Campus Market** (`/campus-market`) — the school's always-open, discovery-first
  market. It is **derived**, not a table: it turns the school's listings + the
  viewer's wishlist into deterministic shelves via `buildDiscoveryShelves`
  (`src/data/repositories/campusDiscovery.ts`). Each shelf carries a *supported
  signal* — recency, wishlist match, category, free, ending-soon — and an honest
  subtitle. We **never** invent popularity or view counts. "Students Are Looking
  For" surfaces **privacy-safe** demand clusters (`buildDemandClusters`): distinct
  student counts only, no names or ids.
- **Student Stalls** (`/stalls`, `/stall/[id]`, `/my-stall`) — a casual personal
  profile over a student's own listings; *not* a business storefront (no inventory
  dashboards, sales analytics, or payment config). Opening a stall is one tap. My
  Stall shows the owner's give/swap/looking-for/borrow/lend breakdown and lets the
  owner choose which wishlist requests are visible on the stall (`show_on_stall`).
- **Temporary Markets** (`/markets`, `/markets/[id]`, `/markets/create`,
  `/markets/add-listing`) — themed, time-boxed pop-ups hosted by students/clubs.
  May be fully online or tied to a general campus spot (**no maps, no private
  addresses**). Verified students join as sellers, add existing listings they own
  or create new ones for the market, and remove their own; hosts can end/cancel.
  A listing may belong to zero or more markets while still living in the Campus
  Market and on its owner's stall — removing an association or cancelling a market
  never deletes the listing.

Creating a market passes the same two gates as a listing: shared validation
(`createMarketSchema`) **and** the local moderation simulator over the market text
*and every allowed category* (`src/features/createMarket.ts`), keeping the
strictest verdict — so a market can't become a side door for prohibited or
institution-disabled regulated categories (high schools can never enable
regulated).

## Messaging

Real, same-school 1:1 conversations tied to a listing, market, or stall (or none),
behind `MessagingRepository` (Mock + Supabase). Screens: **Inbox**
(`/(tabs)/inbox`) and **Conversation thread** (`/messages/[id]`); entry points are
"Message owner" (Listing detail), "Message <name>" (Student Stall), and "Message
host" (Temporary Market).

- **Conversations** are created only through the `app.start_conversation` RPC
  (SECURITY DEFINER), which verifies both users share a *verified* school, rejects
  self/blocked, and **de-duplicates** (one active conversation per pair per
  context). A listing/market/stall conversation shows a context card; if the item
  is later removed the conversation is preserved and the card shows an *unavailable*
  state.
- **Privacy is participant-only.** RLS lets only the two participants read a
  conversation or its messages — moderators and platform admins do **not** get
  message access. `sender_id` is pinned to the authenticated user; cross-school and
  pending/suspended users can't initiate or send.
- **Read state** is per-user (`conversation_members.last_read_at`); unread counts
  come from `app.conversation_unread_counts()` and drive the Inbox badges. Opening a
  thread marks it read.
- **Optimistic send with reconciliation**: a message appears immediately; on failure
  the bubble is marked *Failed* with a Retry action. Outgoing text first passes the
  local moderation simulator (`assessMessage`) — warn/block/escalate is shown and
  the text is **never transmitted**.
- **Blocking** (directed, `blocks` table) prevents starting or sending; existing
  history stays visible to the blocker. Blocking can't weaken school isolation.
- **Realtime**: this checkpoint uses an explicit **poll-based refresh**
  (`watchConversation`, ~5s) — *not* fake realtime. A Supabase Realtime channel can
  replace it behind the same signature later; reconnection would then be the
  Realtime client's responsibility. Today, each tick is an independent fetch, so
  transient failures self-heal on the next interval.

Not in this checkpoint: offers, payments, file/image/voice/location attachments,
push notifications, and any production Trust & Safety backend.

## Offers & handoff

Structured, conversation-centered exchange on top of messaging, behind
`OfferRepository` (Mock + Supabase). Kinds: **Give / Swap / Borrow / Lend** (`sale`
is modelled but not enabled — no payments). Screens: **Create Offer**
(`/offers/create`), **Offer Detail** (`/offers/[id]`), **My Offers & Handoffs**
(`/offers`), plus offer cards + a "Make an offer" button inside the conversation
thread (`/messages/[id]`).

- **Everything sensitive is a server RPC.** Create/accept/decline/cancel/counter and
  the handoff transitions go through SECURITY DEFINER functions, so ownership,
  same-school, block, and availability checks live in the database — the client
  never asserts ownership or school id.
- **Acceptance is atomic + concurrency-safe.** It reuses the Phase 1A
  `one_active_reservation_per_listing` partial unique index: the listing(s) are
  locked + validated, then reserved. Two accepts for the same item can't both win —
  the loser sees *"This item is no longer available."* A **swap** reserves both
  listings atomically.
- **Completion.** Give/Swap complete **bilaterally** (both confirm → the listing
  completes). Borrow/Lend track collection and return as **distinct** events
  (`handed_over` → `return_due` → `returned`); a returned item goes back to
  `active`.
- **Counteroffers** modify terms and preserve a revision chain (`parent_offer_id`);
  only one active proposal exists per conversation at a time.
- **Privacy**: offers are readable only by the two participants — moderators do not
  get access. **Blocking** prevents creating/countering. Offer notes + handoff
  instructions run through the local moderation simulator before submit.
- Not in this checkpoint: payments, deposits, ratings/reviews, push, maps/live
  location, attachments, and any production Trust & Safety backend.

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
