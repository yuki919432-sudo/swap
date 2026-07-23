-- 0023_membership_functions.sql
-- Phase 1B.2: school membership resolution as PostgREST-callable RPCs.
--
-- These live in `public` so supabase-js `.rpc()` can reach them. Each is
-- SECURITY DEFINER with a pinned search_path, performs its OWN authorization
-- (re-checking the caller), and writes an audit entry. EXECUTE is revoked from
-- PUBLIC and granted only to `authenticated` (the anon role has no auth.uid()).
--
-- The real security remains RLS + these functions' internal checks; the TS layer
-- (@swap/server) is a typed convenience over them.

-- ---------------------------------------------------- membership_status ------
-- The caller's own membership status for a school (or null). UI gating only.
create or replace function public.get_membership_status(p_school uuid)
returns text
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select m.status::text
  from public.school_memberships m
  where m.school_id = p_school and m.user_id = auth.uid();
$$;

-- ---------------------------------------------------- redeem_invitation ------
-- Thin wrapper over app.redeem_invitation (Verification Method E).
create or replace function public.redeem_invitation(p_code text)
returns jsonb
language sql volatile security definer
set search_path = app, public, auth, pg_catalog
as $$
  select to_jsonb(app.redeem_invitation(p_code));
$$;

-- ------------------------------------------- resolve_roster_membership -------
-- Verification Method D: match the caller's VERIFIED email (read from the
-- session, never client input) against the school roster.
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

  insert into public.school_memberships (school_id, user_id, status, verification_method, verified_at)
  values (p_school, v_uid, 'verified', 'roster', now())
  on conflict (school_id, user_id) do update
     set status = case when public.school_memberships.status = 'verified'
                       then public.school_memberships.status else 'verified' end,
         verification_method = 'roster',
         verified_at = coalesce(public.school_memberships.verified_at, now())
  returning * into v_m;

  update public.student_roster_entries set matched_user_id = v_uid
   where school_id = p_school and email_hash = v_hash;

  perform app.write_audit('student', p_school, 'roster_membership_resolved', 'membership', v_m.id, '{}'::jsonb);
  return to_jsonb(v_m);
end;
$$;

-- ---------------------------------------------------- request_membership -----
-- Verification Method F: submit a manual request. Dedupes to one pending request
-- per user per school and seeds a pending membership so status is queryable.
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
  v_req public.membership_requests;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then
    raise exception 'not_found:school' using errcode = 'P0001';
  end if;

  select * into v_req from public.membership_requests
   where school_id = p_school and user_id = v_uid and status = 'pending'
   order by created_at desc limit 1;

  if not found then
    insert into public.membership_requests (school_id, user_id, method, submitted_data, status)
    values (p_school, v_uid, 'manual',
            jsonb_build_object('grad_year', p_grad_year, 'explanation', p_explanation), 'pending')
    returning * into v_req;

    insert into public.school_memberships (school_id, user_id, status, verification_method)
    values (p_school, v_uid, 'pending', 'manual')
    on conflict (school_id, user_id) do nothing;

    perform app.write_audit('student', p_school, 'membership_requested', 'membership_request', v_req.id, '{}'::jsonb);
  end if;

  return to_jsonb(v_req);
end;
$$;

-- --------------------------------------------- review_membership_request -----
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
  select * into v_req from public.membership_requests where id = p_request;
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

-- ------------------------------------------------- set_membership_status -----
-- Reviewer status change (suspend / reinstate / reject / expire / remove) or a
-- member's own leave.
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
  select * into v_m from public.school_memberships where id = p_membership;
  if not found then raise exception 'membership_not_found' using errcode = 'P0001'; end if;

  if p_status = 'left' and v_m.user_id = auth.uid() then
    null; -- a member may leave on their own
  elsif app.has_school_role(v_m.school_id, 'school_owner', 'school_admin', 'membership_reviewer')
        or app.is_platform_admin() then
    null; -- staff may manage
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

-- ------------------------------------------------------------- grants --------
revoke execute on function public.get_membership_status(uuid) from public;
revoke execute on function public.redeem_invitation(text) from public;
revoke execute on function public.resolve_roster_membership(uuid) from public;
revoke execute on function public.request_membership(uuid, int, text) from public;
revoke execute on function public.review_membership_request(uuid, boolean, text) from public;
revoke execute on function public.set_membership_status(uuid, membership_status, text) from public;

grant execute on function public.get_membership_status(uuid) to authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;
grant execute on function public.resolve_roster_membership(uuid) to authenticated;
grant execute on function public.request_membership(uuid, int, text) to authenticated;
grant execute on function public.review_membership_request(uuid, boolean, text) to authenticated;
grant execute on function public.set_membership_status(uuid, membership_status, text) to authenticated;
