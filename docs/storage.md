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

## Integration testing

Storage policy **logic** is tested automatically against a faithful local replica
of the Supabase `storage` schema (`supabase/tests/setup/02_storage_stub.sql` +
`supabase/tests/storage/01_storage_policies.sql`, run by `pnpm db:test:storage`).
This exercises the real migration-0022 object policies: authorized upload,
cross-school upload denial, cross-school read denial, owner vs. non-owner delete,
moderator scope, cross-school moderation denial, suspended-member loss, and
invalid-path safety.

What the replica does **not** cover — and must be checked against a real,
disposable, **non-production** Supabase environment before launch:

1. `supabase start` (local Docker) or a dedicated test project — both provide the
   real `storage` schema and storage API.
2. Apply migrations (`supabase db push`); migration 0022 creates the buckets and
   policies.
3. With a verified School A member's session, upload to
   `listing-images/<schoolA>/<listingA>/…` (expect success) and to a School B
   path (expect failure); attempt to download a private School B object (expect
   failure); verify MIME/size limits reject disallowed/oversized files.
4. Confirm owner-only delete and moderator moderation as above.

Credentials for a test project belong in environment variables / CI secrets
(documented in `.env.example`), never committed. Do not run these against a
production project.

## Upload flow (later phases)

Clients request a signed upload URL / use the Supabase Storage SDK with the
authenticated session; the object policy enforces the tenant + ownership checks.
The service-role key is never shipped to the mobile app.

## Deletion & retention

Deleting a listing/event soft-deletes the row; associated objects are pruned by a
maintenance job. Anonymization removes avatar objects for the affected user.
