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

- Read requires `app.is_verified_member(path[1])` (or conversation membership for
  attachments); avatars are readable by any authenticated user (display).
- Write additionally checks ownership: listing owner (`path[2]` = listing_id),
  event organizer, self (avatar), or conversation membership.
- File type and size are enforced by bucket `allowed_mime_types` +
  `file_size_limit`; clients should also compress images before upload.

## Upload flow (later phases)

Clients request a signed upload URL / use the Supabase Storage SDK with the
authenticated session; the object policy enforces the tenant + ownership checks.
The service-role key is never shipped to the mobile app.

## Deletion & retention

Deleting a listing/event soft-deletes the row; associated objects are pruned by a
maintenance job. Anonymization removes avatar objects for the affected user.
