# Changelog

All notable changes to SWAP! are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## [Unreleased]

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
