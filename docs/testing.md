# Testing & Verification

Verification is automated and authoritative — it does not rely on convention.
The same checks run locally (`pnpm verify`) and in CI (`.github/workflows/ci.yml`).
Every check starts from a **clean database** and applies every migration in order.

## One command

```bash
pnpm verify
```

Runs, in order, failing on the first problem:

1. clean migrate + full pgTAP suite (cycle 1)
2. synthetic seed loads
3. TypeScript ↔ DB enum parity
4. schema repeatability / drift check (reset again, diff schema)
5. storage-policy tests
6. multi-connection concurrency tests
7. typecheck + lint

## Individual commands

```bash
pnpm db:test              # clean DB + full pgTAP suite (pg_prove)
pnpm db:test:storage      # storage-policy pgTAP (storage schema replica)
pnpm db:test:concurrency  # multi-connection concurrency (node-postgres)
pnpm check:enum-parity    # TS <-> DB enum parity (Node >= 22.6)
pnpm check:unicode        # dangerous-Unicode guard (see below)
pnpm typecheck            # tsc across packages
pnpm lint                 # ESLint
```

## Dangerous-Unicode guard

`pnpm check:unicode` (`scripts/check-unicode.mjs`) scans every git-tracked text
file and **fails** if it finds a bidirectional control (e.g. RLO/LRO/PDI),
a zero-width or invisible formatting character, a byte-order mark, or a C0/C1
control character other than tab/LF/CR. These "Trojan Source" characters can make
reviewed source differ from what runs. Ordinary printable Unicode punctuation
(em dashes, curly quotes, accents) is intentionally allowed. The scanner uses
numeric codepoint ranges, so the scanner file is itself pure ASCII and never
self-flags. It runs first in `pnpm verify` and as an early CI step, so dangerous
characters cannot enter source, scripts, SQL, config, env-examples, or docs.

## One-time setup (Debian/Ubuntu)

```bash
sudo apt-get install -y postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
```

You need a local Postgres reachable as a superuser-owned role over the local
socket (see [local-development.md](local-development.md)). The concurrency and
enum-parity scripts use `node-postgres` over `PGHOST` (default
`/var/run/postgresql`) and require **Node ≥ 22.6** (for `--experimental-strip-types`).

## CI

`.github/workflows/ci.yml` runs on every push and PR. It provisions PostgreSQL
16 + pgTAP, then runs typecheck, lint, the clean-migrate pgTAP suite, enum
parity, the schema-drift check, storage tests, and concurrency tests. **A red
suite blocks the PR.** Because `db:test` always runs the entire security suite,
any change to RLS, migrations, or policies is exercised — RLS changes cannot
merge without the security suite passing. The local `pnpm verify` runs the same
checks.

## Latest run (all green)

| Suite | Command | Result |
| --- | --- | --- |
| Dangerous-Unicode guard | `pnpm check:unicode` | 94 files scanned, **0 dangerous chars** |
| pgTAP core | `pnpm db:test` | 13 files, **122 assertions**, 0 failed, 0 skipped |
| Storage policies | `pnpm db:test:storage` | 1 file, **17 assertions**, 0 failed |
| Concurrency | `pnpm db:test:concurrency` | **25 assertions**, 0 failed |
| Enum parity | `pnpm check:enum-parity` | **27 checks**, 0 failed |

No warnings in pgTAP/pg_prove output. `--experimental-strip-types` prints a Node
experimental-feature warning (expected).

## How role simulation works (local only)

- `supabase/tests/setup/00_bootstrap.sql` recreates the Supabase platform pieces
  our migrations assume: the `anon`/`authenticated`/`service_role` roles and a
  minimal `auth` schema. On real Supabase these already exist, so this file is
  **never** applied by `db push`.
- `supabase/tests/setup/01_helpers.sql` provides `tests.authenticate_as(uuid,
  aal)`, `tests.become_service_role()`, `tests.become_anon()`, `tests.reset_auth()`.
- `supabase/tests/setup/02_storage_stub.sql` (storage runs only) provides a
  faithful local replica of the Supabase `storage` schema — see
  [storage.md](storage.md#integration-testing).

## pgTAP coverage — the Phase 1A completion requirements

| Proof | File |
| --- | --- |
| DB enums match the TypeScript source of truth | `01_enum_parity.sql` |
| Every SECURITY DEFINER `app` fn pins a safe search_path | `05_definer_search_path.sql` |
| A-school member reads A listings; not B listings/conversations; cross-school profiles hidden | `10_tenant_isolation.sql` |
| School A admin cannot administer B; suspended member no access; verified member yes | `20_roles_admin.sql` |
| Students can't run admin/service DEFINER fns; no self-promotion; client ids can't escalate; no forged moderation | `25_privilege_boundaries.sql` |
| Non-MFA/inactive platform admin blocked; aal2 + active allowed | `30_platform_mfa.sql`, `25_privilege_boundaries.sql` |
| One active reservation/listing; atomic acceptance; no partial reserve; no double-booking | `40_reservations_offers.sql` |
| Transaction completes only after both confirmations | `50_handoff.sql` |
| Invitation limits atomic; single-use & approval flows | `60_invitations.sql` |
| Expired/revoked/exhausted/wrong all fail with one generic error; A-code can't join B; no full code in audit | `65_invitation_security.sql` |
| Public users can't read student emails; admin access audited | `70_email_privacy.sql` |
| Audit logs immutable (app users and owner) | `80_audit_immutability.sql` |
| Blocked user cannot message or offer | `90_blocks.sql` |
| Storage upload/read/delete/moderation isolation; suspended loss; invalid-path safety | `storage/01_storage_policies.sql` |

## Concurrency coverage & expected DB errors

`supabase/tests/concurrency/run.mjs` uses **real separate connections** and
makes the race deterministic by holding one transaction's locks open while a
second blocks, then committing the first. Scenarios:

1. Two offers competing for one shared listing → exactly one accept succeeds; one
   active reservation; one transaction; loser stays `sent`; unrelated listings
   untouched.
2. Two offers sharing **two** overlapping listings → same guarantees across both.
3. **Deadlock** (crossed lock order) → exactly one transaction aborts with
   `40P01`; both rolled back leave no reservations.
4. Two simultaneous **final** invitation uses → exactly one succeeds; `uses_count`
   stops at `max_uses`; one membership; one `invite_code_uses`.

**Errors the application layer must handle** (map to a user-friendly retry/236
message):

| SQLSTATE | Source | Meaning | App action |
| --- | --- | --- | --- |
| `40P01` | Postgres | deadlock detected, one txn aborted | retry once |
| `23505` | `one_active_reservation_per_listing` | lost the reservation race | surface "already reserved" |
| `P0001` `listing_not_available` / `listing_already_reserved` | `app.accept_offer` | listing taken/withdrawn | surface "no longer available" |
| `P0001` `invalid_or_exhausted_invitation` | `app.redeem_invitation` | wrong/expired/revoked/exhausted (generic) | surface "invalid code" |

Automatic retry is **not** implemented in Phase 1A (deferred to the Phase 1B
application layer); these are the errors that layer must catch.

## Convention

Every migration that changes RLS or a security invariant ships with a matching
pgTAP proof in the same change; CI enforces the suite.
