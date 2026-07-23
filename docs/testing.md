# Testing

Phase 1A tests are written in **pgTAP** and run with **pg_prove** directly
against a throwaway Postgres database. They exercise the real RLS policies and
SECURITY DEFINER functions by switching into the `authenticated` role and setting
JWT claims, exactly as Supabase does at runtime.

## One-time setup (Debian/Ubuntu)

```bash
sudo apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
```

You need a local Postgres you can connect to as a superuser and a role that owns
the test databases (see [local-development.md](local-development.md)).

## Run

```bash
pnpm db:test      # scripts/db-test.sh
```

This recreates `swap_test`, applies the local bootstrap + all migrations, installs
pgTAP + helpers, and runs `supabase/tests/*.sql`.

## How role simulation works (local only)

- `supabase/tests/setup/00_bootstrap.sql` recreates the Supabase platform pieces
  our migrations assume: the `anon`/`authenticated`/`service_role` roles and a
  minimal `auth` schema (`auth.users`, `auth.uid()`, `auth.jwt()`, …). On real
  Supabase these already exist, so this file is **never** applied by `db push`.
- `supabase/tests/setup/01_helpers.sql` provides `tests.authenticate_as(uuid,
  aal)`, `tests.become_service_role()`, `tests.become_anon()`, `tests.reset_auth()`.
  Role switching uses `set_config('role', …, is_local => true)`, the reliable
  Supabase test pattern.

## Coverage — the Phase 1A completion requirements

| Proof | File |
| --- | --- |
| A-school member reads A listings; not B listings/conversations; cross-school profiles hidden | `10_tenant_isolation.sql` |
| A-school admin cannot administer B; suspended member has no access; verified member does | `20_roles_admin.sql` |
| Non-MFA school admin blocked; platform admin without `aal2` blocked; with `aal2` allowed | `30_platform_mfa.sql` |
| One active reservation per listing; atomic acceptance; failed accept reserves nothing; no double-booking | `40_reservations_offers.sql` |
| Transaction cannot complete after one confirmation; completes after both | `50_handoff.sql` |
| Invitation use limits enforced atomically; no plaintext codes stored; single-use & approval flows | `60_invitations.sql` |
| Public users cannot read student emails; admin access is audited | `70_email_privacy.sql` |
| Audit logs cannot be updated or deleted by application users (or by the owner) | `80_audit_immutability.sql` |
| Blocked user cannot send new messages or offers | `90_blocks.sql` |
| DB enums match the TypeScript source of truth | `01_enum_parity.sql` |

**Latest run:** 10 files, **91 assertions, all passing.**

## Convention

Every migration that changes RLS or a security invariant must ship with a
matching pgTAP proof in the same change.
