# Row Level Security

RLS is the source of truth for tenant isolation. It is enabled on **all 39**
`public` tables and never disabled for convenience. Policies are scoped
`to authenticated`, so the `anon` role and any unmatched request see nothing.

## Helper functions (`app`, SECURITY DEFINER)

All are `SECURITY DEFINER` with a pinned `search_path`, owned by the migration
role so they read membership/admin tables without triggering those tables' RLS
(avoiding recursion). Invokers hold only EXECUTE.

| Function | Returns true when… |
| --- | --- |
| `is_verified_member(school)` | caller has a `verified` membership in `school` (suspended/pending/left/expired excluded) |
| `is_school_staff(school)` | caller has any active `school_admins` row for `school` |
| `has_school_role(school, roles…)` | caller has an active role in `roles` for `school` |
| `is_platform_admin()` | JWT `aal2` **and** an active `platform_admins` row |
| `has_platform_role(roles…)` | JWT `aal2` **and** active platform role in `roles` |
| `is_conversation_member(conv)` | caller is a member of `conv` |
| `is_blocked_between(a, b)` | a directed block exists in either direction |
| `shares_verified_school(other)` | caller and `other` share a verified school |
| `has_block_in_conversation(conv, user)` | `user` is blocked to/from another member of `conv` |

**Content-read shorthand:**
`is_verified_member(school_id) OR is_school_staff(school_id) OR is_platform_admin()`.

## Design rules

- No table trusts a client-supplied `school_id`; writes check ownership +
  verified membership in `WITH CHECK`.
- Cross-cutting invariants (offer acceptance, handoff, invitation consumption,
  roster/email access) run in SECURITY DEFINER functions that re-check the caller
  — RLS alone cannot express "no other active reservation".
- Suspended/pending members fail `is_verified_member`, so they cannot read
  tenant content.
- Platform reads of sensitive data are a distinct, audit-logged path
  (`app.get_member_email`, `app.write_audit`), not the student query path.

## Policy matrix

Commands with a policy per table (INSERT/UPDATE/DELETE without a policy = denied;
writes then occur only through SECURITY DEFINER functions):

| Table | Policies | Read visibility (summary) | Writes |
| --- | --- | --- | --- |
| schools | SELECT/INSERT/UPDATE | active schools, own memberships, staff, platform | platform (owner/admin); school_owner update |
| school_domains | SELECT/ALL | staff, platform | school_owner/admin, platform |
| school_settings | SELECT/INSERT/UPDATE | members, staff, platform | school_owner/admin, platform |
| safe_handoff_locations | SELECT/ALL | members, staff, platform | school_owner/admin, platform |
| users | SELECT/INSERT/UPDATE | self, same verified school, platform | self only |
| user_preferences | ALL | self | self |
| school_memberships | SELECT/INSERT/UPDATE | self, reviewers, platform | self pending insert; reviewer/platform update |
| school_admins | SELECT/ALL | self, staff, platform | school_owner, platform |
| membership_requests | SELECT/INSERT/UPDATE | self, reviewers, platform | self insert; reviewer update |
| student_roster_entries | SELECT/ALL | reviewers, platform | reviewers, platform |
| platform_admins | SELECT/ALL | self, platform | platform_owner |
| invitations | SELECT/ALL | school_owner/admin, platform | school_owner/admin, platform |
| invite_code_uses | SELECT | self, school staff, platform | function only |
| prohibited_categories | SELECT | all authenticated | platform (migration) |
| listings | SELECT/INSERT/UPDATE | members/staff/platform; drafts owner-only | owner (verified) or staff |
| listing_images | SELECT/ALL | members/staff/platform | listing owner or staff |
| saved_listings | ALL | self | self (verified) |
| looking_for_matches | SELECT | members/staff/platform | service role |
| offers | SELECT | participants, staff, platform | functions only |
| offer_items | SELECT | offer participants/staff/platform | functions only |
| transactions | SELECT | participants, staff, platform | functions only |
| listing_reservations | SELECT | reserved_by, offer participants, staff, platform | functions only |
| handoff_confirmations | SELECT | txn participants, staff, platform | function only |
| transaction_feedback | SELECT/INSERT | participants/staff/platform | participant after completion |
| conversations | SELECT/INSERT | members, staff, platform | verified member insert |
| conversation_members | SELECT/UPDATE | conversation members, platform | self (last_read_at) |
| messages | SELECT/INSERT | conversation members, staff, platform | member + verified + not blocked |
| events | SELECT/INSERT/UPDATE | members/staff/platform; drafts/pending organizer-only | organizer or staff |
| event_participants | SELECT/DELETE | self, organizer, staff, platform | self leave; join via function |
| event_updates | SELECT/INSERT | organizer + participants + platform | organizer |
| community_posts | SELECT/INSERT/UPDATE | members/staff/platform; drafts author-only | author or staff |
| announcements | SELECT/ALL | members/staff/platform | school_owner/admin, platform |
| reports | SELECT/INSERT/UPDATE | reporter, moderators, platform | reporter insert; moderator update |
| blocks | SELECT/INSERT/DELETE | blocker, platform | self |
| moderation_actions | SELECT/INSERT | moderators, platform | moderators, platform (actor=self) |
| audit_logs | SELECT | school_owner/admin, platform | **none** (append-only; functions insert) |
| notifications | SELECT/UPDATE/DELETE | self | self (read/delete); insert server-side |
| device_tokens | ALL | self | self |
| feature_flags | SELECT | all authenticated | service role |

## Storage

Storage object policies mirror the same predicates using the first path segment
as the tenant key. See [storage.md](storage.md).

## Hardening notes

- Every SECURITY DEFINER function in `app` pins a `search_path` starting with
  `app` (verified by `05_definer_search_path.sql`), preventing search-path
  hijacking of the definer's elevated execution.
- Maintenance functions (`anonymize_user`, `expire_stale_content`,
  `purge_expired_ephemeral`) have `EXECUTE` revoked from `PUBLIC` and granted only
  to `service_role`, so application users cannot invoke them.
- Storage read policies include school staff / platform admin (not only verified
  members) so moderation deletes can see the target object; see [storage.md](storage.md).

## Testing

Every isolation and privilege guarantee has an automated pgTAP proof, plus
multi-connection concurrency proofs; see [testing.md](testing.md). CI runs the
full suite on every change, so RLS changes cannot merge without it.
