# SWAP!

A private, **school-scoped** marketplace and community platform. Each school is
its own isolated tenant: verified students give, swap, request, borrow, and lend
items, and organize events, clubs, projects, volunteering, and study groups —
only ever within their own school.

> **Not** a public marketplace. No payments, auctions, shipping, or
> cryptocurrency. Built for trust, privacy, and safe school communities.

This repository is a clean, production-oriented foundation built from the SWAP!
V2 specification. It does not reuse any previous ("Replit") code.

## Status: Phase 1A — Architecture foundation & security model

Phase 1A delivers the secure core: the monorepo, database schema, Row Level
Security, the multi-tenant isolation model, verification/invitation/offer
building blocks, synthetic seed data, and an automated test suite that **proves**
the security invariants. UI, OAuth production wiring, email sending, realtime,
and push are later phases (see [docs/architecture.md](docs/architecture.md)).

## Repository layout

```
apps/            # (later phases) mobile (Expo), admin + platform (Next.js)
packages/
  config/        # shared ESLint / Prettier / tsconfig
  types/         # shared TS domain types + enum single-source-of-truth
  validation/    # shared Zod schemas (client + server)
supabase/
  migrations/    # ordered SQL migrations (schema, RLS, functions)
  tests/         # pgTAP test suite (+ local-only bootstrap/helpers)
  seed/          # synthetic development seed data
docs/            # architecture, database, RLS, auth, email, privacy, ...
scripts/         # db-reset / db-test / db-seed helpers
```

## Quick start (database + tests)

Requires PostgreSQL 16 with **pgTAP** + **pg_prove**, and Node ≥ 22.6.

```bash
# one-time: install pgTAP + pg_prove (Debian/Ubuntu)
sudo apt-get install -y postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

pnpm install
pnpm db:reset    # fresh dev database with synthetic seed
pnpm verify      # clean migrate + all test suites + typecheck + lint + drift check
```

`pnpm verify` runs the same checks as CI. See
[docs/local-development.md](docs/local-development.md) for individual commands and
[docs/testing.md](docs/testing.md) for what each suite proves.

**Latest verification (all green):** pgTAP core 122, storage 17, concurrency 25,
enum parity 27 — **191 automated checks, 0 failed**. CI: `.github/workflows/ci.yml`.

## Documentation

| Doc | Contents |
| --- | --- |
| [architecture.md](docs/architecture.md) | System design, tenancy, data flows, phases, costs, risks |
| [database.md](docs/database.md) | Full schema, tables, keys, indexes, lifecycle |
| [rls.md](docs/rls.md) | RLS strategy + the policy matrix |
| [auth.md](docs/auth.md) | Authentication & session model (aal2 for platform admin) |
| [school-verification.md](docs/school-verification.md) | The six verification methods |
| [email-deliverability.md](docs/email-deliverability.md) | Postmark, SPF/DKIM/DMARC, bounces |
| [storage.md](docs/storage.md) | Buckets, path conventions, storage policies |
| [privacy-data-retention.md](docs/privacy-data-retention.md) | Minors, retention, deletion, legal placeholders |
| [testing.md](docs/testing.md) | Test harness + coverage matrix |
| [deployment.md](docs/deployment.md) | Environments and deploy outline |
| [admin-guide.md](docs/admin-guide.md) | School & platform administration |
| [backup-restore.md](docs/backup-restore.md) | Backup & restore plan |
| [incident-response.md](docs/incident-response.md) | Incident handling notes |

## Security posture (Phase 1A)

- Postgres **Row Level Security** is the source of truth for tenant isolation;
  it is never disabled for convenience.
- Every privileged action is re-checked in the database (SECURITY DEFINER
  functions), not hidden behind UI.
- Platform-admin access requires an active `platform_admins` row **and** MFA
  (JWT `aal2`) — application/subdomain separation is not treated as a boundary.
- Emails are never in public tables; invitation codes are never stored in
  plaintext; audit logs are append-only.

See [CHANGELOG.md](CHANGELOG.md) for the Phase 1A change list.
