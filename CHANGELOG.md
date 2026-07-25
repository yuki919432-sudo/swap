# Changelog

All notable changes to SWAP! are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## [Unreleased]

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
