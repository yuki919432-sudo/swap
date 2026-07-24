-- 0025_membership_hardening.sql
-- Hardens the self-service membership-resolution functions (created in 0017/0023)
-- via CREATE OR REPLACE in a NEW migration (historical migrations are untouched).
--
-- Guarantees:
--   * A suspended or rejected membership can NEVER be re-verified through a
--     self-service method (roster / invitation). Only administrator functions
--     (review_membership_request / set_membership_status) may reinstate.
--   * The membership row is locked (FOR UPDATE) before its state is evaluated, so
--     a concurrent suspension cannot be lost.
--   * A blocked attempt changes nothing: no status change, no invitation use
--     consumed, no roster entry assigned/overwritten, no success audit — and the
--     caller gets a stable typed error (membership_suspended / membership_rejected).
--   * Each RPC enforces the school's enabled verification methods and active
--     status IN THE DATABASE (not only in TypeScript).
--   * Database-side input validation mirrors @swap/validation (see
--     docs/membership-states.md for the limits and the transition matrix).
--
-- Membership-state transition matrix for SELF-SERVICE verification (roster/invite):
--   (none)   -> verified | pending      (a valid method succeeds)
--   pending  -> verified | pending      (auto method verifies; approval keeps pending)
--   verified -> verified (idempotent; an invitation use is NOT consumed)
--   left     -> verified | pending      (may rejoin via a valid method)
--   expired  -> verified | pending      (may re-verify via a valid method)
--   suspended-> BLOCKED (membership_suspended)   -- admin-only reinstatement
--   rejected -> BLOCKED (membership_rejected)    -- admin-only transition

-- Shared limits (keep aligned with packages/validation/src/*).
--   explanation / reason : <= 2000 chars, non-blank if present
--   grad_year            : 1950 .. current_year + 10
--   invitation code      : 6 .. 64 chars

-- ---------------------------------------------------- app.redeem_invitation --
create or replace function app.redeem_invitation(p_code text)
returns school_memberships
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_inv invitations;
  v_membership school_memberships;
  v_status membership_status;
  v_existing membership_status;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- Bound the input (PostgREST callers bypass the TS layer).
  if p_code is null or length(p_code) < 6 or length(p_code) > 64 then
    raise exception 'invalid_input:code' using errcode = 'P0001';
  end if;

  -- Look up + lock the invitation WITHOUT consuming a use yet.
  select * into v_inv from invitations where code_hash = app.hash_code(p_code) for update;
  if not found then raise exception 'invalid_or_exhausted_invitation' using errcode = 'P0001'; end if;
  if v_inv.revoked
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or v_inv.uses_count >= v_inv.max_uses then
    raise exception 'invalid_or_exhausted_invitation' using errcode = 'P0001';
  end if;

  -- School must be active AND have invite_code enabled (checked in the DB).
  if not exists (select 1 from schools where id = v_inv.school_id and status = 'active') then
    raise exception 'invalid_or_exhausted_invitation' using errcode = 'P0001';
  end if;
  if not coalesce(
       (select 'invite_code' = any (enabled_verification_methods)
        from school_settings where school_id = v_inv.school_id), false) then
    raise exception 'method_not_enabled' using errcode = 'P0001';
  end if;

  -- Lock the caller's membership row and guard its state BEFORE any mutation.
  select status into v_existing
  from school_memberships where school_id = v_inv.school_id and user_id = v_uid for update;

  if v_existing = 'suspended' then raise exception 'membership_suspended' using errcode = 'P0001'; end if;
  if v_existing = 'rejected' then raise exception 'membership_rejected' using errcode = 'P0001'; end if;

  -- Already verified: idempotent, and DO NOT consume a use.
  if v_existing = 'verified' then
    select * into v_membership from school_memberships
     where school_id = v_inv.school_id and user_id = v_uid;
    return v_membership;
  end if;

  v_status := case when v_inv.requires_approval then 'pending'::membership_status else 'verified' end;

  -- Consume exactly one use (row already locked). Rolls back with the whole
  -- function if anything below fails.
  update invitations set uses_count = uses_count + 1 where id = v_inv.id;

  begin
    insert into invite_code_uses (invitation_id, user_id) values (v_inv.id, v_uid);
  exception when unique_violation then
    raise exception 'invitation_already_used_by_user' using errcode = 'P0001';
  end;

  insert into school_memberships (school_id, user_id, status, verification_method, verified_at)
  values (v_inv.school_id, v_uid, v_status, 'invite_code',
          case when v_status = 'verified' then now() else null end)
  on conflict (school_id, user_id) do update
     set status = v_status,
         verification_method = 'invite_code',
         verified_at = case when v_status = 'verified'
                            then coalesce(school_memberships.verified_at, now())
                            else school_memberships.verified_at end
   where school_memberships.status in ('pending', 'left', 'expired')
  returning * into v_membership;

  perform app.write_audit('student', v_inv.school_id, 'invitation_redeemed', 'invitation', v_inv.id,
                          jsonb_build_object('resulting_status', v_status));
  return v_membership;
end;
$$;

-- ------------------------------------------- public.resolve_roster_membership
create or replace function public.resolve_roster_membership(p_school uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_hash text;
  v_existing membership_status;
  v_m public.school_memberships;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then
    raise exception 'not_found:school' using errcode = 'P0001';
  end if;
  if not coalesce(
       (select 'roster' = any (enabled_verification_methods)
        from public.school_settings where school_id = p_school), false) then
    raise exception 'method_not_enabled' using errcode = 'P0001';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is null or v_confirmed is null then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  v_hash := app.hash_email(v_email);
  if not exists (select 1 from public.student_roster_entries
                 where school_id = p_school and email_hash = v_hash) then
    raise exception 'roster_no_match' using errcode = 'P0001';
  end if;

  -- Lock + guard membership state BEFORE assigning the roster entry.
  select status into v_existing
  from public.school_memberships where school_id = p_school and user_id = v_uid for update;

  if v_existing = 'suspended' then raise exception 'membership_suspended' using errcode = 'P0001'; end if;
  if v_existing = 'rejected' then raise exception 'membership_rejected' using errcode = 'P0001'; end if;

  if v_existing = 'verified' then
    -- Idempotent: only assign the roster match if not already assigned.
    update public.student_roster_entries set matched_user_id = v_uid
     where school_id = p_school and email_hash = v_hash and matched_user_id is null;
    select * into v_m from public.school_memberships where school_id = p_school and user_id = v_uid;
    return to_jsonb(v_m);
  end if;

  insert into public.school_memberships (school_id, user_id, status, verification_method, verified_at)
  values (p_school, v_uid, 'verified', 'roster', now())
  on conflict (school_id, user_id) do update
     set status = 'verified',
         verification_method = 'roster',
         verified_at = coalesce(public.school_memberships.verified_at, now())
   where public.school_memberships.status in ('pending', 'left', 'expired')
  returning * into v_m;

  update public.student_roster_entries set matched_user_id = v_uid
   where school_id = p_school and email_hash = v_hash;

  perform app.write_audit('student', p_school, 'roster_membership_resolved', 'membership', v_m.id, '{}'::jsonb);
  return to_jsonb(v_m);
end;
$$;

-- ------------------------------------------------- public.request_membership -
create or replace function public.request_membership(
  p_school uuid,
  p_grad_year int default null,
  p_explanation text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_existing membership_status;
  v_req public.membership_requests;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then
    raise exception 'not_found:school' using errcode = 'P0001';
  end if;
  if not coalesce(
       (select 'manual' = any (enabled_verification_methods)
        from public.school_settings where school_id = p_school), false) then
    raise exception 'method_not_enabled' using errcode = 'P0001';
  end if;

  -- DB-side input validation (mirrors @swap/validation).
  if p_explanation is not null
     and (length(btrim(p_explanation)) = 0 or length(p_explanation) > 2000) then
    raise exception 'invalid_input:explanation' using errcode = 'P0001';
  end if;
  if p_grad_year is not null
     and (p_grad_year < 1950 or p_grad_year > extract(year from now())::int + 10) then
    raise exception 'invalid_input:grad_year' using errcode = 'P0001';
  end if;

  -- Lock + guard membership state.
  select status into v_existing
  from public.school_memberships where school_id = p_school and user_id = v_uid for update;
  if v_existing = 'suspended' then raise exception 'membership_suspended' using errcode = 'P0001'; end if;
  if v_existing = 'rejected' then raise exception 'membership_rejected' using errcode = 'P0001'; end if;

  -- Dedupe: one pending request per user per school.
  select * into v_req from public.membership_requests
   where school_id = p_school and user_id = v_uid and status = 'pending'
   order by created_at desc limit 1;

  if not found then
    insert into public.membership_requests (school_id, user_id, method, submitted_data, status)
    values (p_school, v_uid, 'manual',
            jsonb_build_object('grad_year', p_grad_year, 'explanation', p_explanation), 'pending')
    returning * into v_req;

    -- Seed a pending membership only when there is none (never downgrade).
    insert into public.school_memberships (school_id, user_id, status, verification_method)
    values (p_school, v_uid, 'pending', 'manual')
    on conflict (school_id, user_id) do nothing;

    perform app.write_audit('student', p_school, 'membership_requested', 'membership_request', v_req.id, '{}'::jsonb);
  end if;

  return to_jsonb(v_req);
end;
$$;

-- --------------------------------------------- public.review_membership_request
create or replace function public.review_membership_request(
  p_request uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_req public.membership_requests;
  v_m public.school_memberships;
begin
  if p_reason is not null and (length(p_reason) > 2000) then
    raise exception 'invalid_input:reason' using errcode = 'P0001';
  end if;

  select * into v_req from public.membership_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0001'; end if;

  if not (app.has_school_role(v_req.school_id, 'school_owner', 'school_admin', 'membership_reviewer')
          or app.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then raise exception 'invalid_request_state' using errcode = 'P0001'; end if;

  update public.membership_requests
     set status = case when p_approve then 'approved'::membership_request_status else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request returning * into v_req;

  -- Administrator-controlled transition (may reinstate a suspended member).
  update public.school_memberships
     set status = case when p_approve then 'verified'::membership_status else 'rejected' end,
         verified_at = case when p_approve then coalesce(verified_at, now()) else verified_at end
   where school_id = v_req.school_id and user_id = v_req.user_id
   returning * into v_m;

  if v_m.id is null and p_approve then
    insert into public.school_memberships (school_id, user_id, status, verification_method, verified_at)
    values (v_req.school_id, v_req.user_id, 'verified', 'manual', now());
  end if;

  perform app.write_audit(
    case when app.is_platform_admin() then 'platform' else 'school_admin' end,
    v_req.school_id,
    case when p_approve then 'membership_request_approved' else 'membership_request_rejected' end,
    'membership_request', v_req.id, jsonb_build_object('reason', p_reason));

  return to_jsonb(v_req);
end;
$$;

-- ------------------------------------------------- public.set_membership_status
create or replace function public.set_membership_status(
  p_membership uuid,
  p_status membership_status,
  p_reason text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_m public.school_memberships;
begin
  if p_reason is not null and (length(p_reason) > 2000) then
    raise exception 'invalid_input:reason' using errcode = 'P0001';
  end if;

  select * into v_m from public.school_memberships where id = p_membership for update;
  if not found then raise exception 'membership_not_found' using errcode = 'P0001'; end if;

  if p_status = 'left' and v_m.user_id = auth.uid() then
    null; -- a member may leave on their own
  elsif app.has_school_role(v_m.school_id, 'school_owner', 'school_admin', 'membership_reviewer')
        or app.is_platform_admin() then
    null; -- staff may manage (incl. reinstating a suspended member)
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_status not in ('verified', 'suspended', 'rejected', 'expired', 'left') then
    raise exception 'invalid_membership_transition' using errcode = 'P0001';
  end if;

  update public.school_memberships
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else suspended_at end,
         left_at = case when p_status = 'left' then now() else left_at end,
         verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else verified_at end
   where id = p_membership returning * into v_m;

  perform app.write_audit(
    case when app.is_platform_admin() then 'platform'
         when v_m.user_id = auth.uid() then 'student' else 'school_admin' end,
    v_m.school_id, 'membership_status_changed', 'membership', v_m.id,
    jsonb_build_object('status', p_status, 'reason', p_reason));

  return to_jsonb(v_m);
end;
$$;
