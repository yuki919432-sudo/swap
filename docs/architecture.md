# SWAP! Architecture

## 1. What SWAP! is

A private, school-scoped marketplace and community platform. Each school is a
separate **tenant**; verified students interact only within their own school.
The two core domains are **school-scoped content** (listings, events, community
posts) and **school-scoped identity** (membership, verification, roles).
Everything else — offers, messaging, notifications, moderation — builds on those.

## 2. High-level architecture

| Layer | Technology | Role |
| --- | --- | --- |
| Mobile client | Expo / React Native / Expo Router (later phase) | Student app |
| School admin dashboard | Next.js on Vercel (later phase) | Per-school administration |
| Platform admin dashboard | Separate Next.js app + MFA (later phase) | Platform operations |
| Backend | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions | Data + privileged logic |
| Authorization source of truth | Postgres **Row Level Security** | Tenant isolation |
| Transactional email | Postmark + dedicated sending subdomain | OTP + notifications |

**Principle:** tenant isolation and every privileged invariant are enforced in
the database (RLS + SECURITY DEFINER functions), never only in the client.
Edge Functions handle logic that needs the service role or external providers
(OAuth token exchange, OTP email, roster import), and always re-check the caller.

## 3. Multi-tenancy

- Every school-scoped row carries a `school_id`.
- Access is granted only through the requesting user's **verified** membership,
  resolved server-side — never from a client-supplied `school_id`.
- A user may eventually belong to multiple schools. The client stores a
  preferred `active_school_id` in `user_preferences` purely for navigation; it
  confers **no** authorization. Each request independently verifies membership
  (see [rls.md](rls.md), correction #8).

## 4. Session & role model

- Supabase Auth issues JWTs. `auth.uid()` identifies the user; `auth.jwt()->>'aal'`
  carries the MFA assurance level.
- **Students** act through RLS-gated queries and a small set of RPC functions.
- **School roles** are predefined and testable (`school_owner`, `school_admin`,
  `school_moderator`, `membership_reviewer`, `event_reviewer`) — not arbitrary
  JSON (correction #5).
- **Platform admins** require an active `platform_admins` row **and** `aal2`
  (MFA). The separate platform app/subdomain is defense-in-depth, not the
  boundary (correction #4). See [auth.md](auth.md).

## 5. School verification

Six configurable methods funnel through a single membership pipeline so no school
is blocked by any one method failing: Google OAuth, Microsoft OAuth, school-email
OTP, pre-approved roster, invitation codes, and manual approval. Details and
flows in [school-verification.md](school-verification.md).

## 6. Marketplace data flow

`create listing (draft/active)` → `school_id`/`owner_id` stamped and RLS-checked
→ images stored under a school-scoped path → visible to verified members / staff
→ matched against open Looking-For posts (later phase) → owner edits while
`draft|active`; edits freeze once `reserved`/`in_transaction` → admins can remove
(soft delete + moderation action) → `expired` via scheduled job, renewable.

## 7. Exchange & handoff data flow (correction #1)

1. `app.create_offer` inserts an offer + `offer_items` (N offered / M requested),
   after checking membership and blocks.
2. Recipient accepts / declines / counters. A counter is a new offer with
   `parent_offer_id`.
3. **`app.accept_offer` is atomic**: it locks every involved listing, validates
   all are `active` and unreserved, then creates the transaction, inserts
   `listing_reservations` (status `active`), and flips listings to `reserved` —
   all in one transaction. The partial unique index
   `one_active_reservation_per_listing` makes a second active reservation for any
   listing impossible, so concurrent double-acceptance cannot occur and a failed
   acceptance reserves nothing.
4. Both parties pick a safe handoff location + time.
5. **`app.confirm_handoff` requires both parties.** Only when both confirmations
   exist does the transaction become `completed` and listings `completed`.
6. Mismatch → dispute → school admin.

Why a dedicated `listing_reservations` table: a Postgres unique index cannot span
`offer_items` and `offers`, so the invariant is expressed on a single table with
a partial unique index (correction #1).

## 8. Event data flow (corrections #3, #7)

Events use timezone-safe `starts_at`/`ends_at timestamptz` + a stored IANA
`timezone` (handles midnight spans, DST, cross-timezone viewing). Approval policy
per school gates `draft → pending_approval → published`. `app.join_event`
enforces capacity atomically under an event row lock. Non-event community
activity (volunteer/club/project/study-group/etc.) lives in the reusable
`community_posts` table, which may optionally reference an event.

## 9. Administration permissions

See the matrix in [rls.md](rls.md) and [admin-guide.md](admin-guide.md). School
admins manage only their own school; platform admins (MFA) manage schools and
platform settings and may investigate with every sensitive access audit-logged.

## 10. Phased plan

- **Phase 1A (this):** monorepo, schema, RLS, isolation model, verification &
  offer primitives, seed, automated proofs, docs.
- **Phase 1B:** listing/image APIs + search, membership review UI, notification
  infrastructure, design system, admin dashboard skeleton.
- **Phase 2:** realtime messaging, full offer UI, push.
- **Phase 3:** events & community UI, approvals, reminders.
- **Phase 4:** Looking-For matching, impact dashboard, invitations/referrals,
  multi-school membership, feature-flag surfaces.

## 11. Estimated infrastructure cost

Pilot (1–2 schools): **$0–50/mo** (Supabase free/Pro ~$25, Postmark low tens,
Vercel/EAS free tiers). Several live schools with backups + paid Vercel + steady
EAS builds: roughly **$150–300/mo**, dominated by image storage and
notification volume. Revisit after Phase 1B telemetry.

## 12. Major technical risks

1. RLS correctness under multi-tenancy — mitigated by mandatory isolation tests.
2. OAuth restricted by school Workspace/Azure admins — mitigated by six methods.
3. Offer-acceptance races — mitigated by the partial unique index + row locks.
4. Email deliverability to school domains — mitigated by Postmark + SPF/DKIM/DMARC
   + bounce monitoring + fallback methods.
5. Minors' data / regulatory scope — see [privacy-data-retention.md](privacy-data-retention.md);
   legal review required before public launch.
6. Realtime + RLS interaction at scale — validated early in Phase 2.
