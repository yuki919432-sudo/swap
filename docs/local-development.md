# Local Development

## Prerequisites

- Node.js ≥ 20 and pnpm ≥ 10 (`packageManager` is pinned).
- PostgreSQL 16 with the **pgTAP** extension and **pg_prove**:
  ```bash
  sudo apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
  ```
- A running local Postgres cluster and a role that can create databases. The
  scripts connect with `psql` using your environment's default connection (peer
  auth as a superuser-owned role works well).

The Supabase CLI is optional for Phase 1A; the scripts here drive a plain local
Postgres so the security tests are fully runnable without the full Supabase stack.

## Install workspace dependencies

```bash
pnpm install
```

## Database commands

```bash
pnpm db:reset   # recreate swap_dev, apply schema, load synthetic seed
pnpm db:seed    # (re)load synthetic seed into swap_dev
pnpm db:test    # recreate swap_test, apply schema, run the pgTAP suite
```

Override database names via env (`SWAP_DEV_DB`, `SWAP_TEST_DB`, `SWAP_ADMIN_DB`).

## What the scripts do

- `scripts/apply-schema.sh <db>` — applies the local bootstrap
  (`supabase/tests/setup/00_bootstrap.sql`) then every migration in
  `supabase/migrations/` in order.
- `scripts/db-reset.sh` — drop/create `swap_dev`, apply schema, seed.
- `scripts/db-test.sh` — drop/create `swap_test`, apply schema, install pgTAP +
  helpers, run `supabase/tests/*.sql` with `pg_prove`.

## Environment variables

Copy `.env.example` to `.env.local` (never commit real values). Phase 1A needs
no external credentials to run the schema + tests; email/OAuth values are stubs
until later phases.

## Applying to a real Supabase project (later)

Do **not** apply `supabase/tests/setup/*` to Supabase (it stubs platform pieces).
Push only `supabase/migrations/*` via the Supabase CLI / `db push`. Storage
migration `0022` runs there because the `storage` schema exists.

## Code quality

```bash
pnpm lint          # ESLint (flat config, shared)
pnpm format:check  # Prettier
pnpm typecheck     # tsc across packages
```
