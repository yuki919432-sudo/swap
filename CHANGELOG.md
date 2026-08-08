# Changelog

All notable changes to SWAP! are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## [Unreleased]

### Trust & Safety — user reporting, blocking & support (2026-08-08)

Step 3a toward the pilot: the user-facing UGC safety surface App Review requires,
built over the existing `0012_trust_safety` backend (no migration; direct RLS).

- **Report anything**: a reusable `ReportSheet` (reason picker + optional note) files
  a report against a listing/image, a user, or a message/conversation. Wired into the
  listing detail and the conversation ••• menu. Notes run through the local moderation
  simulator before they're attached.
- **`ReportRepository`** (Supabase + Mock): `submitReport` + `listBlockedUsers` +
  `unblock`. Reports/blocks are written under RLS — reporter + school are
  server-resolved; the client can't forge another user's report or block.
- **Settings → Safety & Support**: manage **blocked students** (list + unblock) and a
  **Contact support** path (`EXPO_PUBLIC_SUPPORT_URL`), plus guidance on reporting.
- Tests: report mock (submit + block list + unblock). Mobile **157**.
- Moderator review queue + content actions (hide/remove/suspend) land in Step 3b
  (adds a tested migration). Private-message review will be tied to an explicit report.

### Authentication, age gate & membership UX (2026-08-08)

Step 2 toward the Florida boarding-high-school pilot: a real onboarding funnel over
the existing (already-approved) auth/membership backend. Release-blocker work; no
new product features.

- **Onboarding funnel** (`src/features/onboarding.ts`, pure + tested): 13+ age gate →
  Supabase email/password auth → invitation-code enrollment → membership-status
  screens. Only a **verified** member of an **active** school reaches the app.
- **13+ age gate** (`src/config/ageGate.ts`): privacy-minimal — confirms 13-or-older,
  blocks under-13 **before any account is created**, and stores only a local boolean
  (no date of birth, no new server data, no parent-consent flow — deferred for review).
- **Auth**: email/password **sign up + sign in**, session restoration, sign-out,
  password-reset request (functional once SMTP is configured), clear errors/retry.
- **MembershipRepository** (Supabase + Mock): `myMembership` / `redeemInvitation` /
  `requestManual` over the server-authoritative `redeem_invitation` /
  `request_membership` RPCs; the client can only read its **own** membership row (RLS).
- **Membership states**: pending / rejected / suspended / inactive-school screens,
  each with retry + sign-out. Manual-approval fallback via an optional
  `EXPO_PUBLIC_PILOT_SCHOOL_ID` (else a support path). Invitation-only by default.
- **PilotGate** (`src/onboarding/PilotGate.tsx`): gates pilot builds behind the funnel
  as the single client enforcement point; demo builds are unchanged. Production
  email-OTP architecture remains available for later activation (not required here).
- Tests: onboarding resolver (full funnel), age gate, membership mock. Mobile **155**.

### Pilot build & environment safety (2026-07-31)

First step of the path to a Florida boarding-high-school pilot: make builds
explicit about whether they may use demo data, and guarantee a real build never
silently serves synthetic listings.

- **App mode** (`EXPO_PUBLIC_APP_MODE` = `demo` | `pilot`, default `demo`). A pure,
  unit-tested resolver (`src/config/appMode.ts`) chooses the data source.
- **No silent mock fallback.** In `pilot` mode the app **always** uses the real
  Supabase repositories; if the backend is not configured it renders a clear
  **"Backend not configured"** screen (`MissingBackendScreen`) instead of falling
  back to demo data. Enforced in the single data-source chooser (`RepositoryProvider`).
- **Service-role key guard.** `supabaseEnvStatus()` decodes the anon key's JWT
  `role` claim; a `service_role` key is treated as a misconfiguration (never a
  usable client key) and surfaces the missing-backend screen.
- **EAS build profiles** (`apps/mobile/eas.json`): `development` (demo, dev client),
  `preview` (pilot, internal/TestFlight), `production` (pilot, store). Backend
  secrets are supplied per profile as EAS env — never committed.
- Docs: `docs/BUILD_AND_ENVIRONMENTS.md` (modes, env vars, profiles, secret
  handling, the no-fallback guarantee); `.env.example` documents `APP_MODE`.
- Tests: `appMode` resolver (pilot never → mock; demo → mock unless configured +
  signed in) and the service-role-key detector. Mobile suite **138**.

### Wishlist completion & polish (2026-07-30)

Pilot-ready polish of the existing first-class Wishlist ("Looking For") feature —
no rebuild of the schema, matcher, outbox, repositories, or the deterministic
recommendation engine. Saved Listings (bookmarks) and Wishlist (persistent
requests) stay clearly separate in data and UI.

**Repository (Mock + Supabase, same interface)**
- `WishlistRepository.update(id, patch)` — edit a request's title/details/category/
  condition/urgency/swap (owner-only via RLS UPDATE; Mock mirrors it).
- `matchDetailsForMe()` — resolves the match outbox against each listing's CURRENT
  state, carrying the matched listing (owner id, post type, status) and an
  `available` flag so a taken-down / reserved / completed listing is shown cleanly
  as "no longer available" instead of a dead link (the match row persists).
- Mock `listMine()` now returns requests of ALL statuses (cancelled included) so a
  request can be reopened; a hard `remove()` is what takes it off the list.

**Mobile UX (`app/wishlist.tsx`)**
- Full request lifecycle: create, **edit**, mark **fulfilled**, **reopen**,
  **cancel**, **delete**, and a show-on-stall toggle — via a per-item action sheet.
- Status views: **Active / Fulfilled / Inactive** filter with counts.
- **Matched listings** section: each match shows the item and a **Message owner**
  action (starts/reuses a conversation from the match); unavailable matches render
  as "No longer available". Clear loading (skeletons), error+retry, empty, and
  no-match states throughout.
- Home and Campus Market keep **"Matches Your Wishlist"** (recommendation +
  discovery shelves); Campus Market shows **privacy-safe demand counts** (distinct
  students only, never identities) and each demand cluster now **prefills the create
  screen** to list in response to visible campus demand.

**In-app activity events (prepared, NOT sent)**
- New `src/activity` module models `wishlist_match`, `matched_listing_unavailable`,
  `wishlist_fulfilled`, and `demand_response` events with deterministic ids, plus an
  idempotent `KvActivityRecorder` (and a no-op). The wishlist/create flows emit them
  for a future in-app activity feed — **no push notifications** are sent.

**Tests**
- pgTAP `32_wishlist.sql` (+2 → suite **311 / 22 files**): a **fulfilled** or
  **cancelled** request accrues **no new matches**; cross-school members still can't
  see (or infer demand from) another school's wishlist.
- Vitest (mobile **132**): edit, reopen, `matchDetails` available **and** unavailable
  handling, **message the owner from a match**, **Saved vs Wishlist stay separate**,
  the activity-event builders + recorder, and a data-source test proving a **pilot
  build wires the real `SupabaseWishlistRepository`** (not demo data).
- Integration (`wishlist.integration.test.ts`, real Supabase): message the matched
  owner, a fulfilled wish stops new matches, and a taken-down listing is flagged
  unavailable.

No external AI, no matcher rewrite, no payments, no push — a polished, reliable
wishlist journey.

### Phase 1H — Offers & handoff coordination (2026-07-27)

A lightweight, conversation-centered structured offer + handoff flow on top of the
Phase 1G messaging system, reusing the Phase 1A reservation invariant. Students can
agree on Give / Swap / Borrow / Lend, a handoff time + campus spot, and completion —
no payments, deposits, ratings, maps, or live location. `sale` is modelled but not
enabled.

**Backend (migration 0031)**
- Extends the Phase 1A `offers`/`transactions` tables: offers gain `kind`
  (give/swap/borrow/lend/sale), `conversation_id`, `offered_listing_id`,
  `handoff_location_text`, `return_by`, `expires_at`; transactions gain
  `handoff_status`, `handoff_stage`, `handoff_location_text`, `return_by`,
  `handed_over_at`, `returned_at`, `kind`. New enums `offer_kind` / `handoff_status`
  / `handoff_stage`; `offer_status` gains `pending` (the live/actionable state).
- **Privacy tightened**: offers/offer_items/transactions/reservations/handoff reads
  are participant-only — the Phase 1A staff/platform read clauses are dropped, so
  moderators do NOT see private offers.
- **Concurrency-safe acceptance** reuses the `one_active_reservation_per_listing`
  partial unique index: `public.accept_exchange_offer` locks + validates the
  listing(s) then inserts reservations, so two accepts for the same item can never
  both win (the loser gets a clear "no longer available"). Swap acceptance reserves
  **both** listings atomically.
- Public SECURITY DEFINER RPCs (all authorization/ownership/school/block checks
  server-side): `create_exchange_offer`, `accept_/decline_/cancel_/
  counter_exchange_offer`, `set_handoff_plan`, `confirm_completion` (bilateral for
  give/swap), `mark_handed_over` + `mark_returned` (borrow/lend — collection and
  return are DISTINCT events; a returned item goes back to `active`). Each
  transition posts a system message into the conversation. One active proposal per
  conversation; counters set `parent_offer_id` and mark the parent `countered`
  (revision chain preserved). Prohibited/regulated categories can't be smuggled in;
  declined/cancelled/expired offers never delete listings.
- **pgTAP `35_offers_handoff.sql` (30 assertions)**: create, participant-only +
  no-moderator reads, ownership, no self-accept, atomic reserve, **competing accept
  → one winner**, decline leaves listing available, swap dual-reserve, counter
  history, blocked can't create, completed listing can't receive an offer, bilateral
  completion → listing completed, borrow handoff-vs-return. **Full pgTAP suite green
  — 309 assertions / 22 files.** Enum parity **38/38**.

**Mobile**
- `OfferRepository` (Mock + Supabase) behind the existing abstraction:
  create/accept/decline/cancel/counter, setHandoffPlan, confirmCompletion,
  markHandedOver, markReturned, listForConversation, getById (with the revision
  chain), myActiveOffers, myHandoffs. Domain `Offer` / `OfferDetail` / `Handoff`.
  Schemas `createExchangeOffer` / `counterExchangeOffer` / `handoffPlan`.
- Offer notes + handoff instructions pass the **local moderation simulator** before
  submit (warn/block/escalate withholds the text).
- Screens: **Create Offer** (kind + swap-item picker + handoff time/spot + borrow
  return date), **Offer Detail** (accept/decline/counter/cancel, Handoff Plan card,
  bilateral completion, borrow handed-over → returned, revision history,
  conflict/unavailable states), offer cards + a "Make an offer" button inside the
  conversation thread, and **My Offers & Handoffs**. "This item is no longer
  available" surfaced on conflict.
- Tests: `offers.mock` (lifecycle, swap dual-reserve, reserved-blocks-new,
  completion, counter chain, borrow return, block), `createOffer` (moderation gate),
  and a real-backend integration proof across two schools + a pending member.

### Phase 1G — Messaging vertical slice (2026-07-27)

Real, same-school 1:1 messaging tied to listings, stalls, and markets — enough for
students to ask "is this still available?", coordinate a swap/borrow, or arrange a
pickup. No offers, payments, attachments, push, or realtime. Builds on the Phase 1A
messaging tables (0010) and directed blocks (0012).

**Backend (migration 0030)**
- Extends `conversations` with `status` (active/archived/closed), `last_message_at`,
  explicit `listing_id`/`market_id`/`stall_id`, and a canonical `dedup_key` with a
  partial unique index → **at most one active conversation per pair per context**.
  `conversation_members` gains `last_read_message_id`; `messages` gains `type`
  (text/system), `edited_at`, `deleted_at`, `moderation_status`, and a nullable
  `sender_id` (system messages have none, enforced by a check).
- **Tightens message privacy**: conversation/message/member SELECT is now
  **participant-only**. The Phase 1A staff-read clauses are dropped — moderators and
  platform admins no longer read private message content. Future safety review must
  go through the explicit reports table, not an ambient policy. Direct conversation
  INSERT is removed (creation only via the RPC); message INSERT is pinned to
  `sender_id = auth.uid()`, `type = 'text'`, an active conversation, verified
  membership, and no block.
- `app.start_conversation(other, listing?, market?, stall?)` — SECURITY DEFINER,
  idempotent: verifies both users share a **verified** school, rejects self/blocked,
  de-dups, and seeds both members + a system message atomically.
  `app.conversation_unread_counts()` — per-user unread (messages after the caller's
  `last_read_at`, not their own, not deleted). Both allowlisted; a trigger keeps
  `last_message_at` fresh.
- New enums `conversation_status` / `message_type` / `message_moderation_status`
  (TS + DB, parity 35/35). pgTAP `34_messaging.sql` (23 assertions): start + dedup,
  participant-only reads, **moderator/cross-school/non-participant cannot read or
  infer**, sender-spoof blocked, pending/suspended cannot initiate, conversation
  survives listing soft-delete, per-user read state, block prevents sends.

**Mobile**
- `MessagingRepository` (Mock + Supabase) behind the existing abstraction:
  list/get conversations, start (RPC), send, mark-read, unread total, block/unblock,
  and a poll-based `watchConversation` **refresh abstraction (explicitly not fake
  realtime)**. `Listing` gains `ownerId` so "Message owner" knows the recipient.
  Schemas `startConversationSchema` / `editMessageSchema` in `@swap/validation`.
- Outgoing text passes the local moderation simulator (`assessMessage`) before send;
  warn/block/escalate is shown and the text is **not transmitted**.
- Screens: a real **Inbox** (list, unread badges, empty/loading/error+retry,
  latest-activity sort), a **Conversation thread** (chronological bubbles, sender
  distinction, context header with unavailable state, optimistic send + failed-send
  retry, keyboard-safe, block/unblock), and entry points — "Message owner" (Listing
  detail), "Message <name>" (Student Stall), "Message host" (Temporary Market).
- Tests: `messaging.mock` (start/dedup, per-user read state, block, unavailable
  context), `sendMessage` (moderation gate), and a real-backend integration proof
  (`messaging.integration`) across two schools + a pending member.

### Phase 1F — Campus Markets & Student Stalls (2026-07-27)

A year-round student flea-market district inside each school: an always-open,
discovery-first **Campus Market** (derived from the school scope, no popularity
analytics), lightweight **Student Stalls**, and themed, time-boxed **Temporary
Markets**. Wishlist demand is woven throughout. No payments, messaging, offers,
push notifications, external AI moderation, or T&S backend.

**Backend (migration 0029)**
- `stalls` — one casual stall per verified student per school (`unique(school_id,
  user_id)`, optional ≤500-char description, soft-deleted, `updated_at` trigger).
  RLS: same-school members + staff/platform read; a verified member inserts only
  their own; owner updates their own.
- `markets` — temporary markets (host, host label, title, description, cover path,
  start/end, optional location + handoff instructions, allowed categories,
  `allows_regulated`, status). Soft-deleted; `check(ends_at >= starts_at)`. A
  trigger rejects prohibited categories in `allowed_categories` (a market can never
  be a side door). A SECURITY DEFINER audit trigger writes `market_created` /
  `market_cancelled`. RLS insert requires `app.can_create_market(school)` and pins
  `host_user_id = auth.uid()`; a `WITH CHECK` keeps the host fixed so a moderator
  editing a market can never silently become the owner.
- `market_sellers` / `market_listings` — seller participation and listing↔market
  associations (`unique` per pair, `added_by`). RLS: same-school read; a member
  joins only as themselves and only while a market is upcoming/active; a member
  associates only a listing they own, in the same school, while the market is
  upcoming/active. Removing an association never deletes the listing; cancelling or
  ending a market never deletes listings or associations.
- New enums `market_status` (upcoming/active/ended/cancelled) and
  `market_creation_policy` (verified_students/clubs_only/moderators_only), plus a
  per-school `school_settings.market_creation_policy` (default `verified_students`)
  and a `wishlist_items.show_on_stall` opt-in. `app.can_create_market` added to the
  function-privilege allowlist. TS + DB enum parity (32/32).
- pgTAP `33_campus_markets.sql`: cross-school isolation (markets/stalls/sellers/
  associations all invisible to another school), stall create own/blocked-for-
  others/blocked-for-pending, market create by a verified student, prohibited
  category rejected, pending blocked, `moderators_only` blocks a plain student,
  join + add-own-listing, cannot-add-unowned, a listing in two markets, remove ≠
  delete, cancel ≠ delete (+ audited), create audited.

**Mobile**
- `StallRepository`, `MarketRepository`, `CampusMarketRepository` (Mock + Supabase)
  behind the existing abstraction; domain `Stall` / `StallDetail` / `Market` /
  `MarketDetail`; `MarketplaceRepository.listMine` for "add to market" pickers;
  `WishlistRepository.setShowOnStall`. Schemas `upsertStallSchema` /
  `createMarketSchema` / `addListingToMarketSchema` / `joinMarketSchema` in
  `@swap/validation`.
- `buildDiscoveryShelves` / `buildDemandClusters` — pure, deterministic Campus
  Market builders shared by both data sources. Shelves (New Today, Matches Your
  Wishlist, Free Stuff, Trending on Campus, Ending Soon, Textbooks, Dorm
  Essentials, Fashion and Sneakers, Unexpected Finds) each carry a **supported
  signal** (recency / wishlist / category / free / ending) — never an invented
  popularity or view count. "Students Are Looking For" reports **privacy-safe**
  demand clusters (distinct-student counts only, no names or ids).
- `createMarket` flow: shared validation + the local moderation simulator over the
  market text **and every allowed category**, keeping the strictest verdict, so
  prohibited/regulated categories can't be enabled via a market (HS can never
  enable regulated).
- Screens: Campus Market home, Browse Stalls, Stall detail, My Stall (low-friction
  open/edit + per-request stall visibility), Temporary Markets directory, Market
  detail (join/leave, add existing listing, create-for-market, remove own listing,
  host end/cancel), Create Market (moderated), Add-to-market picker with
  fits-this-market / in-demand suggestions. Home gains a Campus Market entry.
- Demo data (stalls, markets, seller participation, associations) — all synthetic,
  no real data. Tests: `campusDiscovery` (shelves + privacy-safe demand),
  `campusMarkets.mock` (My-Stall-only-owner-content, wishlist visibility, listing
  in multiple markets, remove/cancel ≠ delete, join/leave), `createMarket`
  (validation + moderation gates), and a real-backend integration proof
  (`campusMarkets.integration`) driving three real users across two schools.

### Phase 1E — Wishlist & discovery (2026-07-26)

A first-class Wishlist ("looking for") system distinct from saved bookmarks, plus a
modular deterministic recommendation engine. No external AI/ML; no push
notifications (the notification data model + hook are prepared, not sent).

**Backend (migration 0028)**
- `wishlist_items` — persistent, school-scoped "looking for" requests (title,
  description, preferred category/condition, budget [future], swap-acceptable,
  urgency, visibility, status). Soft-deleted; RLS: owner CRUD, same-school verified
  members read active items; prohibited preferred categories rejected.
- `wishlist_matches` — a match **outbox**: an AFTER-INSERT trigger on listings runs
  a deterministic matcher (`app.match_listing_to_wishlists`, pg_trgm title
  similarity + category + condition + swap compatibility, threshold 0.25) and
  records `(wishlist → listing, score)` rows with a `notified_at` outbox column for
  a FUTURE "matching item listed" notification. RLS: only the wishlist owner reads
  their matches.
- New enums `wishlist_urgency` / `wishlist_status` / `wishlist_visibility` (TS +
  DB, enum-parity enforced). pgTAP `32_wishlist.sql` (RLS + matcher: match on a
  related listing, no match on an unrelated one or the wisher's own, owner-only
  outbox visibility).

**Mobile**
- `WishlistRepository` (Mock + Supabase) behind the existing abstraction; domain
  `WishlistItem` / `WishlistMatch`; `createWishlistItemSchema` in `@swap/validation`.
- Modular `RecommendationEngine` (interface) + `DeterministicRecommendationEngine`:
  shelves for recommended / because-you-liked / matches-your-wishlist / popular /
  trending / new-in-categories, plus per-listing similar listings. Browsing-history
  signal; `WishlistNotifier` + `NoopWishlistNotifier` (prepared, no push).
- UI: Wishlist screen (create + my wishlist + campus wishes), recommendation
  shelves on Home, "Similar listings" on the listing detail, wishlist entry on
  Profile.

**Tests**
- +21 mobile unit tests (scoring, engine shelves + determinism, notifier, mock
  wishlist repo) → 73 mobile unit tests. Real-backend integration
  `wishlist.integration.test.ts` (two users: create wishlist, matching listing
  populates the outbox via the trigger, owner-only visibility, self-listing
  excluded). Full pgTAP suite now 234 assertions; enum parity 30/30.

### Phase 1D — Real Supabase-backed marketplace (2026-07-25)

Replace the mobile mock marketplace repositories with real Supabase-backed
implementations, making the app usable against the real backend. Repository
abstraction unchanged; only the implementations were replaced — no screen rewrites.
Out of scope (unchanged): full Trust & Safety backend, messaging, offers, payments,
public deployment. The local moderation simulator is kept as-is.

- **Supabase repositories** (`apps/mobile/src/data/repositories/supabase/`): real
  listing CRUD (create/soft-delete), feed, detail, search (`ilike`), post-type /
  category / condition filters, sort — all under RLS via the caller's own session.
  `SavedListingsRepository` (user-scoped) and `SessionRepository` (real profile +
  verified membership + school) too.
- **Storage image upload**: picked images upload to the private `listing-images`
  bucket under `{school_id}/{listing_id}/…` and are served via **signed URLs**.
- **Data-source selection**: `RepositoryProvider` uses the Supabase repos when a
  backend is configured (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
  and a user is signed in; otherwise the demo Mock repos. New `AuthProvider`
  (Supabase auth) + a dev/pilot email+password `sign-in` screen (real JWT, not fake
  auth). The demo banner hides itself against the real backend.
- **Optimistic UI + states**: instant save toggle with reconcile-on-failure; loading
  skeleton, empty state, and a retry error state in Marketplace; publish progress +
  error handling.
- **Two-user acceptance proof**: `marketplace.integration.test.ts` boots a real
  Supabase stack in CI and drives the ACTUAL repository classes — two same-school
  users create listings, upload images, browse, search, save, and view each other's
  items; a third user from another school is isolated by RLS. Wired into the
  Integration workflow (`pnpm --filter @swap/mobile test:integration`).
- **Tests**: 52 mobile unit tests (mappers + fake-client repo coverage + existing
  logic) and the real-backend integration suite. Existing pgTAP / OTP / membership /
  storage / server suites unchanged and green.
- **Docs**: `apps/mobile/README.md` real-backend section + limitations;
  `apps/mobile/.env.example` gains the Supabase URL/anon-key vars.

**Known limitations**: drafts stay local (publish creates a real listing); free-text
handoff not persisted (predefined-list feature); institution type not yet modeled
(defaults to "university" for the moderation context); Community/Inbox are empty
stubs against the real backend; moderation remains the local simulator.

### Phase 1C — Mobile vertical slice (Expo) (2026-07-25)

A polished, user-facing mobile app you can open on an iPhone via Expo Go, running
entirely on synthetic data in a development-only demo mode. Not a public launch: no
real accounts/emails, no production credentials, no RLS bypass, no messaging/offers/
payments, no production Trust & Safety backend.

- **App**: `apps/mobile` — Expo SDK 52, Expo Router, TypeScript, wired into the pnpm
  monorepo; reuses `@swap/types` (enums) and `@swap/validation` (`createListingSchema`).
- **Demo mode**: gated by `EXPO_PUBLIC_ENABLE_DEMO_MODE=true` AND a dev runtime
  (`__DEV__`) — hidden when disabled, unavailable in production builds, clearly
  labeled. Synthetic cast: verified university student, verified HS student, pending
  student, school moderator.
- **Repository architecture**: `SessionRepository`, `MarketplaceRepository`,
  `CommunityRepository`, `InboxRepository`, `SavedListingsRepository`,
  `DraftListingsRepository` interfaces with Mock implementations; screens depend only
  on interfaces (Supabase swap-in later needs no screen changes). Local persistence
  via a `KeyValueStore` (AsyncStorage in-app, in-memory in tests) for selected
  profile, saved listings, drafts, and locally-published demo listings.
- **Design tokens**: centralized colors (light/dark), typography, spacing, radii,
  shadows, icon sizes, motion — no scattered literal styles.
- **Screens**: Welcome, demo school/profile selector, Home, Marketplace (search +
  post-type/category/condition filters + sort + skeleton + empty + pull-to-refresh),
  Listing details (carousel, save/share/report, coming-soon offers), Create (image
  picker, shared validation, preview, save draft, publish-to-demo), My Listings
  (Drafts/Active/Reserved/Completed/Expired + Saved), Community, Inbox (preview),
  Profile, Settings.
- **Local moderation simulator**: deterministic allow/warn/block/escalate; warned/
  blocked/escalated stay unpublished; edit-and-retry; never auto-suspends. Regulated
  categories (tobacco/nicotine/vaping/alcohol) kept SEPARATE from universal
  prohibitions — off by default, never enable-able for high schools, future
  university capability only.
- **Tests**: 43 vitest logic tests (demo-mode gating, feed/filter/search, saving,
  persistence, drafts, validation, publish outcomes for each moderation result,
  edit-changes-outcome, no-real-data fixture scan). Existing suites unchanged and
  green.
- **Docs**: `apps/mobile/README.md` (Expo Go, demo mode, repo architecture,
  persistence, placeholders, limitations, Supabase swap-in). Root scripts
  `mobile:start|ios|android|test`.

### Correction — roster is an optional adapter, never a dependency (2026-07-24)

Student roster access is optional (privacy / institutional / contractual /
operational constraints), so the product must be fully usable with no roster
integration.

- **Migration 0027**: `school_settings.enabled_verification_methods` default
  changed from `{email_otp, manual}` to **`{invite_code, manual}`** — the pilot
  default. Email OTP is opt-in after deliverability is confirmed; Google/Microsoft
  OAuth opt-in once the institution permits the app; roster opt-in only when a
  school lawfully provides roster data.
- Roster is never required to create a school, launch a pilot, approve members, or
  use the marketplace / community / admin tools. `resolve_roster_membership`
  already returns `method_not_enabled` unless the school enabled roster.
- pgTAP `24_verification_defaults.sql`: the default is `{invite_code, manual}`,
  roster is not enabled by default, roster resolution is refused on a default
  school, and manual approval works with no roster involved (suite now 222).
- Seed sets explicit per-school posture (one school invite+manual+OTP with **no**
  roster; one school additionally demonstrates the optional roster adapter — all
  synthetic).
- Docs updated to describe roster as an optional verification method (priority
  order, default pilot config, roster-privacy: explicit authorization, minimal
  email-only data, no student exposure, school-removable, retention/deletion,
  never real data in tests/seeds): `school-verification.md`, `architecture.md`,
  `admin-guide.md`, `privacy-data-retention.md`.

### Phase 1B.3 — Email OTP (Verification Method C) (2026-07-24)

Email-OTP infrastructure + end-to-end authorization tests. No listing/community
CRUD, no dashboards, no external AI moderation, no production deploy.

**Challenge model + flows (migration 0026)**
- `private.otp_challenges` (no client grants) binds each challenge to
  `(user_id, school_id, email_hash, purpose)`. Stores only `sha256(salt‖code)` +
  salt — **the plaintext OTP is never stored** anywhere. At most one active
  challenge per key (partial unique index); issuing a new one atomically
  supersedes the prior active one.
- `public.request_otp_challenge(...)` (**service-role only**) enforces school
  active + `email_otp` enabled + resend cooldown + per-email/per-user daily caps,
  supersedes, and inserts — all transactionally in the database.
- `public.verify_email_otp(...)` (`authenticated`) locks the active challenge,
  rejects expired/consumed/superseded/locked, enforces the attempt limit +
  15-minute lockout, compares by hash, consumes atomically (replay-safe), and
  applies the approved membership transition only from `pending/left/expired/none`.
  Suspended/rejected are blocked with no partial membership. Returns a result
  object `{ ok, error?, membership? }` so `attempts++`/lockout side effects persist.
  The email is read from the caller's own session — never client input — so a
  School A OTP can never verify School B and an OTP can never be used by another
  user.
- Delivery events: `public.record_email_event(...)` (**service-role only**,
  idempotent via a unique index) + `public.get_email_delivery_status(...)`
  (role-gated, **masked** emails). `app.purge_expired_otp(...)` retention.
- Retired the unused Phase-1A placeholder `private.otp_codes`; folded its purge
  into a single challenge-aware retention path.

**Provider + webhook architecture (@swap/server)**
- `EmailProvider` interface with `FakeEmailProvider` (tests), `DevEmailProvider`
  (never sends), and `PostmarkEmailProvider` (inactive unless a token is
  configured; timeout + transient/rejected normalization + idempotency key).
  **No real email is sent and no real Postmark token is required.**
- Webhook security: constant-time secret verification, HMAC-SHA256 helper,
  64 KiB size limit, event-type allowlist, minimal-detail parsing. Replay is a
  DB-enforced no-op.
- `packages/server/src/otp.ts`: code generation, DB-matching hashing, the issue
  orchestration (hash+salt only reach the DB), and the client verify wrapper with
  typed error mapping.

**Edge Functions (Deno)**
- `supabase/functions/otp-request` — authenticated request path; reads the
  caller's verified email; generates/hashes the code; calls the service-role RPC;
  sends via provider; returns a **generic** response that never reveals roster /
  membership / block existence (rate-limits → generic 429).
- `supabase/functions/email-webhook` — authenticates first (constant-time secret),
  size-limits, allowlists, then records via the service-role RPC.

**Tests**
- pgTAP `29_email_otp.sql` (now 38 assertions in-file) + retirement/purge proofs.
- vitest: `otp.test.ts`, `email/provider.test.ts`, `email/webhook.test.ts`
  (79 server unit tests total).
- Concurrency scenario 6: two simultaneous final verifications — exactly one
  succeeds, the challenge is consumed once, one membership created.
- PostgREST integration (real API boundary): `membership.integration.mjs` (item A)
  + `otp.integration.mjs`. The Storage-integration workflow is renamed **Integration**
  and runs all three suites in one booted stack.
- Full pgTAP suite: 218 assertions across 17 files.

**Docs**: `docs/otp.md` (state diagram, rate rules, provider interface, webhook
security model, privacy/retention), updated `school-verification.md`,
`email-deliverability.md`, `database.md`, `privacy-data-retention.md`, `.env.example`.

**Trust & Safety**: `docs/trust-and-safety-roadmap.md` records (does not implement)
T&S as the mandatory next checkpoint before any content CRUD.

### Phase 1B checkpoint hardening — security review fixes (2026-07-24)

Pre-approval hardening from a code-level security review. Still no Phase 1B.3+.

**Audit-log forgery prevention (migration 0024)**
- `app.write_audit` is no longer executable by any client role. Client EXECUTE on
  all `app` functions is revoked and re-granted to an explicit allowlist (RLS
  helpers + client-callable RPCs). Internal SECURITY DEFINER callers still write
  audit rows (they run as the function owner).
- pgTAP `28_function_privileges.sql`: proves write_audit is not client-executable,
  audit rows can't be forged, EXECUTE matches the allowlist, and an un-approved
  new function is caught by the allowlist (the CI safety net — PostgreSQL's
  built-in PUBLIC EXECUTE on new functions cannot be stripped via default privs).

**Membership state guards + method/validation enforcement (migration 0025)**
- Suspended/rejected memberships can never self-verify via roster or invitation;
  the membership row is locked before its state is evaluated (no lost concurrent
  suspension). Blocked attempts change nothing: no status change, no invitation
  use consumed, no `invite_code_uses` row, no roster overwrite, no success audit;
  stable typed errors `membership_suspended` / `membership_rejected`.
- Already-verified redemption is idempotent and consumes no use.
- Every membership RPC enforces the school's active status and enabled
  verification methods IN THE DATABASE, plus input validation (explanation/reason
  length, graduation-year range, invitation-code length) mirroring
  `@swap/validation`. Documented in docs/membership-states.md.
- pgTAP `27_membership_state_guards.sql` (26 assertions) + concurrency Scenario 5
  (concurrent suspension vs. self-verification).

**TS**: new stable error codes `membership_suspended` / `membership_rejected` and
`invalid_input` → `validation_failed` mapping, with unit tests.

**CI note**: GitHub runners emit a Node-20-action deprecation warning for
`actions/checkout@v4` etc.; these are the current maintained majors, so it is
non-blocking and left as-is until a maintained upgrade exists.

### Phase 1B.1/1B.2 — auth foundation + membership resolution (2026-07-23)

Checkpoint work (no email OTP or listing CRUD yet). Phase 1A is merged to main;
this is a separate branch/PR.

**Shared server package (`@swap/server`)**
- Typed AppErrors with client-safe serialization; PostgreSQL/PostgREST SQLSTATE →
  AppError mapping; bounded retry with full jitter that retries ONLY genuinely
  transient failures (40P01 deadlock, 40001 serialization) — never blind 23505.
- Zod request validation; rate-limit interface + in-memory/noop limiters; audit
  writer; auth context + MFA (aal2) guards; membership-status authz guards.
- RPC boundary + anon/user/service Supabase client factories (service client is
  server-only, browser-guarded). OAuth provider adapter interface + stubs.
- Focused generated-style DB types (regenerate via `pnpm db:gen-types`).
- 34 vitest unit tests.

**Membership resolution (migration 0023, public SECURITY DEFINER RPCs)**
- `get_membership_status`, `redeem_invitation` (wrapper), `resolve_roster_membership`,
  `request_membership`, `review_membership_request`, `set_membership_status`.
  Each re-checks authorization, respects the school's enabled methods, and audits.
- TS flows in `@swap/server/membership` over these RPCs.
- pgTAP `26_membership_flows.sql` (25 assertions); search_path meta-test now also
  covers `public` SECURITY DEFINER functions.

**Real Supabase Storage integration test**
- `.github/workflows/storage-integration.yml` boots a disposable `supabase start`
  stack, applies migrations clean, and runs
  `supabase/tests/integration/storage.integration.mjs` (real Storage service),
  proving all 11 requirements; tears down after. No production project/secrets.

**CI**: main workflow now also runs `pnpm test` (unit). Full local `pnpm verify`
(unicode, pgTAP 147, storage-replica 17, concurrency 25, enum parity 27, drift,
typecheck, lint, unit 34) is green.

### Phase 1A final cleanup — dangerous-Unicode guard (2026-07-23)

- Removed a non-ASCII em dash from `.env.example` (now plain ASCII); a full repo
  scan confirmed no bidirectional or hidden Unicode control characters anywhere.
- Added `scripts/check-unicode.mjs` (`pnpm check:unicode`): fails when any tracked
  text file contains bidi controls, zero-width/invisible formatting characters, a
  BOM, or C0/C1 controls (other than tab/LF/CR). Ordinary printable punctuation is
  allowed. Wired into `pnpm verify` (first step) and CI (early step); documented
  in docs/testing.md. Self-tested to confirm it detects RLO + zero-width space.

### Phase 1A hardening — verification & CI (2026-07-23)

Requested pre-approval hardening pass. No Phase 1B application code.

- **CI** (`.github/workflows/ci.yml`): clean-DB migrations, full pgTAP suite,
  storage tests, concurrency tests, typecheck, lint, TS↔DB enum parity, and a
  schema-drift check. Red suite blocks the PR; RLS changes always run the suite.
- **Concurrency tests** (`supabase/tests/concurrency/run.mjs`, node-postgres,
  real separate connections): competing acceptances for a shared listing;
  overlapping multi-listing offers; a deadlock scenario (asserts `40P01`); and a
  concurrent final invitation use. Expected application-layer errors documented.
- **Storage integration tests**: a faithful local replica of the Supabase
  `storage` schema + pgTAP proving upload/read/delete/moderation isolation,
  suspended-member loss, and invalid-path safety. Real-Supabase process documented.
- **Privilege-boundary tests** (`25_privilege_boundaries.sql`) and a **search_path
  meta-test** (`05_definer_search_path.sql`).
- **Invitation-security tests** (`65_invitation_security.sql`): expiry/revocation,
  a single generic error across all failure modes, school binding, and no full
  code in audit metadata.
- **Repeatability**: `pnpm verify` runs the full flow twice and diffs the schema
  (no drift). Explicit scripts (`db:start`, `db:test:storage`,
  `db:test:concurrency`, `check:enum-parity`, `verify`) plus an **optional,
  opt-in, production-safe** session hook (disabled by default).
- **Fixes surfaced by the new tests:**
  - Maintenance functions were `PUBLIC`-executable (Postgres default); `EXECUTE`
    revoked from `PUBLIC`, granted only to `service_role`.
  - Storage read policies now include school staff / platform admin so moderators
    can see (and remove) objects; previously a moderator's delete matched no rows.
- Verification totals: **191 automated checks** (pgTAP 122, storage 17,
  concurrency 25, enum parity 27), all passing.

### Phase 1A — Architecture foundation & security model (2026-07-23)

Initial clean-slate foundation built from the SWAP! V2 specification. No previous
("Replit") code is reused.

**Monorepo & tooling**
- pnpm workspace scaffold (`apps/`, `packages/`, `supabase/`, `docs/`, `scripts/`).
- Shared config package (`@swap/config`): flat ESLint, Prettier, base tsconfig.
- Shared `@swap/types` (domain types + enum single source of truth) and
  `@swap/validation` (Zod schemas for client + server).

**Database (22 migrations, 39 tables)**
- Full normalized schema: identity/tenancy, marketplace, exchange, messaging,
  community, trust & safety, notifications, platform, and a `private` schema for
  sensitive data.
- Applied the required architecture corrections:
  1. `listing_reservations` table + partial unique index
     `one_active_reservation_per_listing`; atomic `app.accept_offer`.
  2. Read state via `conversation_members.last_read_at` (no per-message JSON).
  3. Events use `starts_at`/`ends_at timestamptz` + IANA `timezone`.
  4. Explicit `platform_admins`; access requires active row **and** JWT `aal2`.
  5. Predefined school roles (owner/admin/moderator/membership_reviewer/
     event_reviewer).
  6. Invitations store only a non-secret prefix + sha256 hash; atomic redemption.
  7. Reusable `community_posts` model separate from `events`.
  8. `user_preferences.active_school_id` is a navigation hint only; never
     authorization.
  9. Email isolated in `private.user_emails`; audited `app.get_member_email`.
  10. Account-deletion states + anonymization + retention functions.

**Security**
- Row Level Security enabled on all 39 tables; 76 policies scoped
  `to authenticated`.
- SECURITY DEFINER authorization helpers (`app.is_verified_member`,
  `app.has_school_role`, `app.is_platform_admin`, …).
- Atomic privileged functions: create/accept/decline/cancel offer,
  bilateral `confirm_handoff`, capacity-safe `join_event`, invitation
  create/redeem, audited email access.
- Append-only `audit_logs` (grants revoked + trigger).
- Storage buckets + object policies mirroring tenant isolation (Supabase-guarded).

**Data**
- Fully synthetic seed (2 fictional schools; no real names/domains/rosters).
- Platform-wide reference data (prohibited categories, baseline feature flags).

**Testing**
- pgTAP suite (10 files, **91 assertions, all passing**) proving every Phase 1A
  completion requirement (tenant isolation, admin scoping, MFA gating,
  reservation uniqueness, atomic acceptance, no partial reservation, invitation
  limits, no plaintext codes, email privacy, audit immutability, block
  enforcement).

**Documentation**
- README + architecture, database, RLS (with policy matrix), auth,
  school-verification, email-deliverability, storage, privacy/data-retention,
  testing, local-development, deployment, admin-guide, backup-restore,
  incident-response, and legal placeholders. `.env.example` with no real secrets.
