# Storage

Supabase Storage. All buckets are **private**; access is granted by object
policies that mirror table RLS, using the **first path segment as the tenant
key**. Migration `0022_storage.sql` creates buckets + policies on Supabase and is
skipped on bare local Postgres (no `storage` schema).

## Buckets

| Bucket | Path convention | Read | Write | Limits |
| --- | --- | --- | --- | --- |
| `listing-images` | `<school_id>/<listing_id>/<file>` | verified member of `school_id` | listing owner | 5 MiB; jpeg/png/webp/heic |
| `event-covers` | `<school_id>/<event_id>/<file>` | verified member of `school_id` | event organizer | 5 MiB; jpeg/png/webp/heic |
| `avatars` | `<user_id>/<file>` | any authenticated | self only | 2 MiB; jpeg/png/webp |
| `message-attachments` | `<school_id>/<conversation_id>/<file>` | conversation member | member + verified | 5 MiB; jpeg/png/webp/heic |

## Policy model

- Read requires `app.is_verified_member(path[1])` **or** `app.is_school_staff(path[1])`
  **or** `app.is_platform_admin()` (staff/platform need read access so they can
  moderate — a DELETE must be able to see the row). Message attachments read for
  conversation members (plus staff/platform). Avatars are readable by any
  authenticated user (display).
- Write additionally checks ownership: listing owner (`path[2]` = listing_id),
  event organizer, self (avatar), or conversation membership.
- Delete: listing owner or school staff (moderation); avatar owner.
- Invalid paths cannot bypass isolation: an empty/short path yields a NULL tenant
  key (denied), and a non-UUID segment raises a cast error (denied) — proven in
  the storage test.
- File type and size are enforced by bucket `allowed_mime_types` +
  `file_size_limit`; clients should also compress images before upload.

## Testing (two layers)

**1. Fast policy-replica unit tests** — `pnpm db:test:storage`. Runs the real
migration-0022 object policies against a faithful local replica of the Supabase
`storage` schema (`supabase/tests/setup/02_storage_stub.sql` +
`supabase/tests/storage/01_storage_policies.sql`). Exercises the policy LOGIC
(authorized upload, cross-school denials, owner/non-owner/moderator delete,
suspended-member loss, invalid-path safety) with no Docker.

**2. Real Storage integration test** — the actual Supabase Storage service on a
disposable local stack. Automated in CI by
`.github/workflows/storage-integration.yml`:

- boots `supabase start` on the runner (a throwaway stack, throwaway keys),
- applies every migration from a clean state (`supabase db reset`),
- runs `supabase/tests/integration/storage.integration.mjs`,
- tears the stack down; never touches production; needs no production secrets.

It proves all 11 requirements end-to-end through the real service: authorized
upload; cross-school upload denial; private cross-school read denial; owner
delete; non-owner delete denial; moderator remove within scope; cross-school
moderation denial; suspended-member loss; malformed/manipulated path rejection;
service-level MIME + size enforcement; and that signed URLs do not expose
unauthorized private objects.

Run it locally the same way (requires Docker + the Supabase CLI):

```bash
supabase start
supabase db reset --no-seed
export SUPABASE_URL=...        # from `supabase status -o json` (API_URL)
export SUPABASE_ANON_KEY=...   # ANON_KEY
export SUPABASE_SERVICE_ROLE_KEY=...  # SERVICE_ROLE_KEY
pnpm storage:integration
supabase stop
```

Do not run these against a production or pilot project. The fast replica tests
remain the unit-level check; this integration job is additional, not a
replacement.

## Upload flow (later phases)

Clients request a signed upload URL / use the Supabase Storage SDK with the
authenticated session; the object policy enforces the tenant + ownership checks.
The service-role key is never shipped to the mobile app.

## Deletion & retention

Deleting a listing/event soft-deletes the row; associated objects are pruned by a
maintenance job. Anonymization removes avatar objects for the affected user.
