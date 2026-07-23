# Backup & Restore Plan

## Backups

- **Managed:** enable Supabase automated daily backups + Point-in-Time Recovery
  (PITR) on production (Pro plan). PITR is the primary recovery mechanism.
- **Logical (defense in depth):** periodic `pg_dump` of the production database
  to encrypted, access-controlled off-site storage. Exclude nothing needed for
  safety/dispute history; the `private` schema (emails/OTP) is included and must
  stay encrypted at rest.
- **Storage objects:** Supabase Storage buckets are backed up per Supabase's
  object durability; keep an inventory of buckets and their retention.

## What must survive a restore

Transaction, report, moderation, and audit history (append-only) — these are
never client-deletable and are essential for investigations and disputes.

## Restore procedure (outline)

1. Provision a fresh Supabase project (or restore in place via PITR).
2. Restore the database (PITR to a timestamp, or `pg_restore` of the latest dump).
3. Re-apply any migrations newer than the backup, in order.
4. Verify: run a read-only smoke check (row counts per major table; a few RLS
   spot-checks) and confirm audit-log continuity.
5. Rotate any secrets that may have been exposed during the incident.
6. Reconnect Edge Functions, email webhooks, and OAuth redirect URIs.

## Testing

Rehearse a restore into a scratch project at least quarterly and record the
elapsed time (RTO) and the data loss window (RPO). Target RPO ≤ 24h with daily
backups; tighter with PITR.

## Retention of backups

Retain daily backups for at least 30 days and monthly snapshots longer per the
data-retention policy. Encrypt backups; restrict access to platform owners.
