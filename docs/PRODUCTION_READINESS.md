# Production readiness runbook (pilot)

The end-to-end steps to take SWAP! from this repo to a working **production** backend
and a pilot build. Human-only items (accounts, secrets, store submission) are called
out; everything else is scripted and in the repo.

The guiding rule: **RLS in the database is the security authority.** The client only
ever carries the public **anon** key; the service-role key never leaves the Supabase
dashboard/CI.

---

## 0. Prerequisites (human)

- A **production Supabase project** (separate from any staging project).
- The **Supabase CLI** authenticated and linked to that project.
- An **Apple Developer account** + the final bundle identifier.
- A **support contact** URL or email (`https://…` or `mailto:…`).
- (Later, for OTP) a transactional email provider + a verified sending subdomain.

Keep staging and production as **separate** projects with separate keys.

---

## 1. Apply the schema (migrations)

The migrations in `supabase/migrations/*.sql` are the entire production schema —
tables, enums, RLS, functions, grants, storage buckets/policies, reference data.

```
supabase link --project-ref <prod-ref>
supabase db push          # applies 0001 … 0033 in order
```

- **Never** apply anything under `supabase/tests/setup/*` to a hosted project — those
  are local stubs for the Supabase platform pieces production already provides.
- `0021_reference_data.sql` seeds prohibited categories + feature flags automatically.
- `0022_storage.sql` creates the `listing-images` / `event-covers` / `avatars`
  buckets and their object RLS when the storage schema is present (i.e. on a real
  project). No manual bucket setup is needed.

Verify locally first that migrations apply cleanly and all tests pass:

```
pnpm verify
```

---

## 2. Stand up the pilot school (environment-specific data)

Migrations intentionally contain **no** school-specific rows. Use the idempotent,
secret-free scripts in [`supabase/production/`](../supabase/production/README.md).
Run them against the production database (its pooled connection string as
`$PROD_DATABASE_URL`):

```
# 1) the school + settings (invite_code + manual) + safe handoff locations
psql "$PROD_DATABASE_URL" -v school_name='IMG Academy' -v school_slug='img-academy' \
  -f supabase/production/01_pilot_school.sql
#    -> prints the new school_id (save it)

# 2) promote the school's first owner (they must have signed up in the app first)
psql "$PROD_DATABASE_URL" -v school_id='<school_id>' -v owner_email='dean@school.example' \
  -f supabase/production/02_promote_owner.sql

# 3) mint a shared invitation code students will redeem
psql "$PROD_DATABASE_URL" -v school_id='<school_id>' -v code='SWAP-PILOT-2026' -v max_uses=500 \
  -f supabase/production/03_mint_invitation.sql
```

Edit the safe handoff locations in `01_pilot_school.sql` to the real approved campus
spots before running (or add more later in the DB).

---

## 3. Configure the mobile build environment (EAS)

The client reads only `EXPO_PUBLIC_*` values, injected per EAS profile — never
committed. Set them for the `preview` (internal pilot) and `production` (store)
profiles:

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_APP_MODE` | `pilot` (already set by the profile) |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<prod-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the project's **anon** (public) key |
| `EXPO_PUBLIC_SUPPORT_URL` | your support `https://…` or `mailto:…` |
| `EXPO_PUBLIC_PILOT_SCHOOL_ID` | the `school_id` from step 2 |

See [`BUILD_AND_ENVIRONMENTS.md`](BUILD_AND_ENVIRONMENTS.md) for the `eas env` commands.

### Preflight — fail loudly before building

Run the environment preflight with the same env you will build with. It refuses a
pilot build that is missing the backend/support config or that carries a service-role
key:

```
EXPO_PUBLIC_APP_MODE=pilot \
EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… \
EXPO_PUBLIC_SUPPORT_URL=… EXPO_PUBLIC_PILOT_SCHOOL_ID=… \
pnpm check:mobile-env
```

A non-zero exit means **do not build** until the reported problems are fixed.

---

## 4. Smoke test against production

With the pilot build (or a dev client pointed at prod), confirm the real path:

1. Sign up → 13+ age gate → redeem the invitation code → land verified in the school.
2. Post a listing (image upload lands in `listing-images/<school>/<listing>/…`).
3. A second account in the **same** school sees it; an account in a **different**
   school does **not** (tenant isolation).
4. Send an offer, plan a handoff at a safe location, complete it.
5. Report a listing → the owner-moderator sees it in the moderation queue.
6. Request account deletion → account is signed out and marked `deletion_requested`.

Any cross-school leakage is a hard stop — RLS should make it impossible; the pgTAP
isolation suite guards it, but verify once on the real project.

---

## 5. Ongoing

- Backups: confirm the project's automated backups (see
  [`backup-restore.md`](backup-restore.md)).
- Migrations after launch: add new numbered files; never edit an applied migration;
  no destructive change without a backup.
- Security: run `/security-review` before public rollout.

---

## Human-only checklist

- [ ] Production Supabase project created + CLI linked
- [ ] `supabase db push` applied all migrations
- [ ] `supabase/production/` scripts run (school, owner, invitation)
- [ ] EAS env set for `preview` + `production`; `pnpm check:mobile-env` passes
- [ ] Smoke test passed on the real project
- [ ] Apple Developer account + bundle id ready (for Step 6/8)
