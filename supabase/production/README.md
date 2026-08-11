# Production bootstrap (pilot school)

These scripts stand up **environment-specific** data that migrations deliberately do
**not** contain: the pilot school itself, its settings, safe handoff locations, its
first owner, and its invitation code(s). Reference data (prohibited categories,
feature flags) already ships in migration `0021` and needs no action here.

> Run these **against the production Supabase project only after `supabase db push`
> has applied all migrations.** They are idempotent (safe to re-run) and contain **no
> secrets** — you pass every value on the command line.

Order and required variables (psql `-v name=value`):

| # | Script | Required `-v` variables | Purpose |
|---|--------|-------------------------|---------|
| 1 | `01_pilot_school.sql` | `school_name`, `school_slug` | Create the school + default settings (`invite_code` + `manual`) + safe handoff locations. Prints the new `school_id`. |
| 2 | `02_promote_owner.sql` | `school_id`, `owner_email` | Make an already-signed-up account the school **owner** (and verify their membership). |
| 3 | `03_mint_invitation.sql` | `school_id`, `code`, `max_uses` | Create a shared invitation code students redeem to enroll. |
| — | `review_seed.mjs` | env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REVIEW_PASSWORD` | **Optional, App Review only.** Stands up an isolated **synthetic** review school (sample listings + a pre-verified reviewer/moderator account + a seller). Keeps fake data out of the real pilot school. Run: `node supabase/production/review_seed.mjs`. |

`school_slug` must be lowercase, `^[a-z0-9][a-z0-9-]{1,62}$` (e.g. `img-academy`).

See [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md) for the full
runbook (connecting, applying migrations, storage, EAS env, smoke test).

Example (against a hosted project, using its pooled connection string):

```
psql "$PROD_DATABASE_URL" -v school_name='IMG Academy' -v school_slug='img-academy' \
  -f supabase/production/01_pilot_school.sql
# note the printed school_id, then:
psql "$PROD_DATABASE_URL" -v school_id='<uuid>' -v owner_email='dean@school.example' \
  -f supabase/production/02_promote_owner.sql
psql "$PROD_DATABASE_URL" -v school_id='<uuid>' -v code='SWAP-PILOT-2026' -v max_uses=500 \
  -f supabase/production/03_mint_invitation.sql
```
