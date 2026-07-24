# Membership States & Transitions

`school_memberships.status` is one of: `pending`, `verified`, `rejected`,
`suspended`, `left`, `expired`. Only `verified` unlocks tenant content (RLS).

## Self-service transition matrix (roster / invitation)

Self-service methods are `resolve_roster_membership` and `redeem_invitation`.
They lock the membership row (`SELECT … FOR UPDATE`) before evaluating state, so a
concurrent administrator suspension cannot be lost.

| From | Self-service result |
| --- | --- |
| (none) | → `verified` (auto method) or `pending` (approval-required invitation) |
| `pending` | → `verified` (auto) / stays `pending` (approval invitation) |
| `verified` | stays `verified` (idempotent; **no invitation use is consumed**) |
| `left` | → `verified` / `pending` (may rejoin via a valid method) |
| `expired` | → `verified` / `pending` (may re-verify via a valid method) |
| `suspended` | **BLOCKED** → `membership_suspended` |
| `rejected` | **BLOCKED** → `membership_rejected` |

**Only administrator functions may reinstate a blocked membership:**
`review_membership_request` (approve) and `set_membership_status` (staff/platform).
A member may set their own status to `left`.

### Blocked-attempt guarantees

A blocked self-service attempt (suspended/rejected) changes **nothing**:

- membership status is unchanged,
- no invitation use is consumed and no `invite_code_uses` row is created,
- no roster entry is newly assigned or overwritten,
- no success audit event is written,
- the caller receives a stable typed error (`membership_suspended` /
  `membership_rejected`).

Proven by `supabase/tests/27_membership_state_guards.sql` and the concurrency
scenario in `supabase/tests/concurrency/run.mjs`.

## School-side enforcement (in the database)

Every membership RPC enforces, in the database (not only in TypeScript):

- the school exists and is `active`;
- the relevant method is in `school_settings.enabled_verification_methods`
  (`manual` for requests, `roster` for roster, `invite_code` for invitations).
  Disabling a method invalidates that self-service path immediately, and an
  existing invitation cannot bypass a subsequently disabled `invite_code` method.

Method-disabled cases return one stable error: `method_not_enabled`
(→ `forbidden` / `verification_method_not_enabled`). A disabled/non-active school
returns the generic `invalid_or_exhausted_invitation` for invitations (so state
is not leaked).

## Invitation-for-existing-member

Before consuming a use, `redeem_invitation` checks, in order: input format,
invitation validity (hash/revoked/expiry/`uses_count < max_uses`), school active,
`invite_code` enabled, and membership state (suspended/rejected blocked). An
**already-verified** member's redemption returns idempotently and does **not**
consume a use. Any failure rolls back both `uses_count` and `invite_code_uses`
(single transaction). No plaintext code is written to logs, audit metadata, or
error messages (only a hash + non-secret prefix are stored).

## Database input validation (parity with `@swap/validation`)

The public RPCs are reachable directly via PostgREST, so validation is enforced
in the database as well as in Zod. Keep these aligned:

| Field | Limit | TS schema |
| --- | --- | --- |
| explanation | non-blank, ≤ 2000 chars | `mediumText` |
| review reason | ≤ 2000 chars | `mediumText` |
| graduation year | 1950 … current year + 10 | `gradYear` |
| invitation code | 6 … 64 chars | `redeemInviteSchema` |

Violations raise `invalid_input:<field>` → mapped to the `validation_failed`
application error. When either side changes a limit, update both and this table.
