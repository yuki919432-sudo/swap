# SWAP! Database

PostgreSQL (Supabase). UUID primary keys (`gen_random_uuid()`), `timestamptz`
timestamps, foreign keys, targeted indexes, unique/check constraints, and soft
deletion on user-facing content. Transaction / report / moderation / audit
history is preserved and never hard-deleted through the client.

## Schemas

| Schema | Purpose | Client access |
| --- | --- | --- |
| `public` | Application tables + RPC-callable functions | RLS-gated (`authenticated`) |
| `app` | Internal authorization helpers + privileged functions | EXECUTE only; not exposed to PostgREST |
| `private` | Sensitive data (emails, OTP, invite secrets, email logs) | **None** — service role only |
| `auth` | Supabase-provided identity (`auth.users`, `auth.uid()`, …) | Managed by Supabase |

## Migration order

| # | File | Contents |
| --- | --- | --- |
| 0001 | extensions_schemas | `pg_trgm`; `app` + `private` schemas |
| 0002 | enums | All enum types (mirror `packages/types/src/enums.ts`) |
| 0003 | identity_core | schools, school_domains, school_settings, safe_handoff_locations, users, user_preferences |
| 0004 | private_identity | private.user_emails, private.otp_codes, private.email_events |
| 0005 | memberships | school_memberships, school_admins, membership_requests, student_roster_entries |
| 0006 | platform_admins | platform_admins |
| 0007 | invitations | invitations (hashed), invite_code_uses |
| 0008 | marketplace | prohibited_categories, listings, listing_images, saved_listings, looking_for_matches |
| 0009 | reservations_offers | offers, offer_items, transactions, listing_reservations, handoff_confirmations, transaction_feedback |
| 0010 | messaging | conversations, conversation_members, messages |
| 0011 | community_events | events, event_participants, event_updates, community_posts, announcements |
| 0012 | trust_safety | reports, blocks, moderation_actions, audit_logs |
| 0013 | notifications_platform | notifications, device_tokens, feature_flags |
| 0014 | rls_helpers | `app.*` authorization helper functions |
| 0015 | grants | Role privileges (anon/authenticated/service_role) |
| 0016 | rls_policies | RLS enable + all policies |
| 0017 | functions_invitations | `app.write_audit`, `app.create_invitation`, `app.redeem_invitation` |
| 0018 | functions_offers | create/accept/decline/cancel offer, confirm_handoff, join_event, get_member_email |
| 0019 | audit_immutability | Append-only trigger on audit_logs |
| 0020 | retention_lifecycle | Account deletion/anonymization + retention functions |
| 0021 | reference_data | Prohibited categories + baseline feature flags |
| 0022 | storage | Storage buckets + object policies (guarded; Supabase only) |

## Table groups (39 tables)

**Identity & tenancy:** `schools`, `school_domains`, `school_settings`,
`safe_handoff_locations`, `users` (public profile — **no email/phone**),
`user_preferences` (active_school_id = navigation hint only),
`school_memberships`, `school_admins` (predefined role), `membership_requests`,
`student_roster_entries`, `platform_admins`, `invitations`, `invite_code_uses`.

**Marketplace:** `prohibited_categories`, `listings`, `listing_images`,
`saved_listings`, `looking_for_matches`.

**Exchange:** `offers`, `offer_items`, `transactions`, `listing_reservations`,
`handoff_confirmations`, `transaction_feedback`.

**Messaging:** `conversations`, `conversation_members` (`last_read_at` drives
unread — correction #2), `messages`.

**Community:** `events` (timestamptz + timezone — correction #3),
`event_participants`, `event_updates`, `community_posts` (correction #7),
`announcements`.

**Trust & safety:** `reports`, `blocks`, `moderation_actions`, `audit_logs`
(append-only, FK-free).

**Notifications & platform:** `notifications`, `device_tokens`, `feature_flags`.

**Private:** `private.user_emails`, `private.otp_codes`, `private.email_events`.

## Key invariants (enforced in-DB)

- `one_active_reservation_per_listing` — partial unique index on
  `listing_reservations(listing_id) WHERE status='active'`. One listing → at most
  one active reservation → no double-booking (correction #1).
- `invitations`: `code_hash` unique + `uses_count <= max_uses` check; single-use
  ⇒ `max_uses = 1`. Plaintext codes are never stored (correction #6).
- `offers`: `from_user_id <> to_user_id`; `transactions.offer_id` unique.
- `handoff_confirmations`: unique `(transaction_id, user_id)` → bilateral proof.
- `blocks`: unique `(blocker_id, blocked_id)`, `blocker_id <> blocked_id`.
- `audit_logs`: append-only trigger blocks UPDATE/DELETE (correction: immutable).

## Lifecycle & retention

Soft deletion (`deleted_at`) on listings / events / community_posts /
announcements. Account states via `users.account_status`
(`active|deletion_requested|deactivated|anonymized`). Maintenance functions
(service role): `app.expire_stale_content`, `app.purge_expired_ephemeral`,
`app.anonymize_user`. See [privacy-data-retention.md](privacy-data-retention.md).
