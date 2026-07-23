# Incident Response Notes

Lightweight plan for the current stage; expand before public launch.

## Severity

| Sev | Example |
| --- | --- |
| SEV1 | Cross-tenant data exposure; auth bypass; database data loss |
| SEV2 | OTP/email outage blocking sign-ups; broad functionality down |
| SEV3 | Localized bug; single-school issue; degraded performance |

## First response

1. **Contain.** For a suspected data-exposure or auth bypass, disable the
   affected path (feature flag, revoke keys, disable a school via
   `schools.status = 'disabled'`, or take an Edge Function offline).
2. **Preserve evidence.** Do not delete logs. `audit_logs` is append-only;
   capture relevant `audit_logs`, `moderation_actions`, and provider logs.
3. **Assess scope.** Identify affected schools/users and the data classes
   involved (note anything from the `private` schema).

## Specific playbooks

- **Suspected tenant-isolation breach:** freeze deploys; run the pgTAP isolation
  suite (`pnpm db:test`) against a copy of production schema; diff RLS policies
  against `supabase/migrations`; patch + add a regression test before re-enabling.
- **Credential leak (service role / provider):** rotate immediately in Supabase/
  provider dashboards; invalidate sessions; audit access during the exposure
  window; confirm no service-role key ever shipped in a client bundle.
- **Email abuse / deliverability failure:** inspect `private.email_events`;
  tighten OTP rate limits; pause a sending stream if being abused.
- **Account compromise / harassment:** suspend the member
  (`school_memberships.status = 'suspended'`), apply `moderation_actions`, and
  preserve `reports`/messages as evidence.

## Communication

Notify the platform owner for SEV1/SEV2. For confirmed exposure of personal data
(students, possibly minors), follow the (to-be-finalized, legally reviewed)
notification obligations — see [privacy-data-retention.md](privacy-data-retention.md).

## After action

Write a short postmortem: timeline, root cause, blast radius, remediation, and a
new automated test that would have caught it. Track follow-ups to closure.
