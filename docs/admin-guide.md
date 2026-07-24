# Administration Guide

## Roles

**School roles** (`school_admins.role`, one per admin, predefined — correction #5):

| Role | Can |
| --- | --- |
| `school_owner` | everything for the school, incl. managing school admins & settings |
| `school_admin` | domains, settings, invitations, roster, announcements, moderation |
| `school_moderator` | review reports; hide/remove content; warn/suspend members |
| `membership_reviewer` | review membership requests; import roster; read member emails (audited) |
| `event_reviewer` | approve/manage events |

A school admin can **never** access another school's data (RLS + tested).

**Platform roles** (`platform_admins.role`, requires MFA `aal2`):

| Role | Can |
| --- | --- |
| `platform_owner` | manage platform admins, schools, all settings |
| `platform_admin` | create/approve/disable schools, assign school admins, review platform reports |
| `platform_support` | scoped investigation/support (audited) |

Platform reads of sensitive data are audit-logged. There are no default admin
credentials.

## School dashboard (later phase) surfaces

Pending membership requests · verified/suspended members · approved domains ·
verification-method settings · **optional** roster import (CSV) · invitation
management · listings · events · reports · announcements · safe handoff locations
· school settings · basic analytics · audit logs.

New pilot schools default to **invitation codes + manual approval** only; email
OTP, OAuth, and roster matching are opt-in per school. Roster import is never
required to run a school — see [school-verification.md](school-verification.md).

## School settings

Name, logo, accent color (branding must not override status colors or reduce
accessibility), approved domains, enabled verification methods, event approval
policy, enabled post types, enabled categories, borrowing on/off, grad-year
visibility, participant-name visibility, community guidelines, safe handoff
locations, notification settings.

## Common operations (Phase 1A primitives)

- **Approve/reject membership:** update `school_memberships.status` (reviewer/
  owner/admin), or approve `membership_requests`.
- **Create invitation:** `app.create_invitation(school, type, max_uses,
  requires_approval, expires_at)` — returns the code once; only the hash is
  stored.
- **Read a member's email (when operationally necessary):**
  `app.get_member_email(membership_id)` — role-restricted and audit-logged.
- **Moderation:** update `reports`, insert `moderation_actions`, set content
  `deleted_at` / status `removed`, suspend via `school_memberships.status`.

## Platform operations

Create/approve/disable schools; assign/remove school admins; review platform
reports; manage prohibited categories and feature flags; review audit logs.
All require an active platform role **and** MFA.
