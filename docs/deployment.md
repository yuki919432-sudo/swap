# Deployment

> Phase 1A introduces no paid resources and performs no deployment. This is the
> intended shape for later phases. **Do not** create paid resources without
> explicit approval.

## Environments

| Environment | Supabase | Email | Purpose |
| --- | --- | --- | --- |
| Local | plain Postgres (scripts) | none / sandbox | schema + tests |
| Staging | dedicated Supabase project | Postmark sandbox/test stream | integration |
| Production | dedicated Supabase project | Postmark live + verified subdomain | live |

Keep staging and production as **separate** Supabase projects with separate keys.

## Database migrations

- Source of truth: `supabase/migrations/*.sql`, applied in order via the Supabase
  CLI (`supabase db push`) or migration tooling.
- Never apply `supabase/tests/setup/*` to a hosted project.
- Never make destructive schema changes without warning and a backup.

## Backends (later phases)

- School admin dashboard and platform admin dashboard: separate Next.js apps on
  Vercel, each with server-side authorization. The platform app enforces MFA
  (`aal2`) and lives on a separate subdomain.
- Edge Functions (OTP send/verify, OAuth resolution, roster import, offer/handoff
  RPC wrappers, Postmark webhooks) deploy with the Supabase CLI.
- Mobile app builds via EAS.

## Secrets

All secrets come from environment configuration / the Supabase dashboard, never
from the repository. The service-role key is server-only and never bundled into
the mobile app.

## Pre-deploy checklist

1. `pnpm db:test` green.
2. Migrations reviewed; no destructive change without backup.
3. DNS (SPF/DKIM/DMARC) verified for the sending subdomain before enabling OTP.
4. OAuth redirect URIs registered for the target environment.
5. Backups configured (see [backup-restore.md](backup-restore.md)).
