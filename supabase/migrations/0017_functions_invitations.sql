-- 0017_functions_invitations.sql
-- Audit writer + invitation create/redeem. All SECURITY DEFINER so they can
-- write privileged tables (audit_logs, invitations) after re-checking the caller.

-- Central audit writer. audit_logs INSERT is revoked from clients, so this
-- definer function is the only application path that appends audit rows.
create or replace function app.write_audit(
  p_actor_role text,
  p_school uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
begin
  insert into public.audit_logs (actor_id, actor_role, school_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_actor_role, p_school, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Create an invitation. Generates a high-entropy code, stores ONLY its hash +
-- a non-secret prefix, and returns the plaintext exactly once to the caller.
create or replace function app.create_invitation(
  p_school uuid,
  p_type invitation_type default 'single_use',
  p_max_uses int default 1,
  p_requires_approval boolean default false,
  p_expires_at timestamptz default null
)
returns table (invitation_id uuid, code text)
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_code text;
  v_prefix text;
  v_id uuid;
  v_max int := greatest(1, coalesce(p_max_uses, 1));
begin
  if not (app.has_school_role(p_school, 'school_owner', 'school_admin') or app.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_type = 'single_use' then
    v_max := 1;
  end if;

  -- 128 bits of entropy from two v4 UUIDs, hex, upper-cased.
  v_code := 'SWAP-' || upper(replace(gen_random_uuid()::text, '-', '')
                           || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_prefix := left(v_code, 9);

  insert into invitations (school_id, code_prefix, code_hash, type, max_uses, requires_approval, expires_at, created_by)
  values (p_school, v_prefix, app.hash_code(v_code), p_type, v_max, coalesce(p_requires_approval, false), p_expires_at, auth.uid())
  returning id into v_id;

  perform app.write_audit('school_admin', p_school, 'invitation_created', 'invitation', v_id,
                          jsonb_build_object('type', p_type, 'max_uses', v_max));

  invitation_id := v_id;
  code := v_code;
  return next;
end;
$$;

-- Redeem an invitation. Consumes a use ATOMICALLY (single UPDATE guarded by
-- uses_count < max_uses), records the use, and creates/updates the membership.
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
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Atomic consume: the row lock + `uses_count < max_uses` predicate guarantees
  -- no invitation is ever over-used, even under concurrency.
  update invitations
     set uses_count = uses_count + 1
   where code_hash = app.hash_code(p_code)
     and revoked = false
     and (expires_at is null or expires_at > now())
     and uses_count < max_uses
  returning * into v_inv;

  if not found then
    raise exception 'invalid_or_exhausted_invitation' using errcode = 'P0001';
  end if;

  -- One redemption per user per invitation.
  begin
    insert into invite_code_uses (invitation_id, user_id) values (v_inv.id, v_uid);
  exception when unique_violation then
    raise exception 'invitation_already_used_by_user' using errcode = 'P0001';
  end;

  v_status := case when v_inv.requires_approval then 'pending'::membership_status else 'verified'::membership_status end;

  insert into school_memberships (school_id, user_id, status, verification_method, verified_at)
  values (v_inv.school_id, v_uid, v_status, 'invite_code',
          case when v_status = 'verified' then now() else null end)
  on conflict (school_id, user_id) do update
     set status = case when school_memberships.status = 'verified' then school_memberships.status else excluded.status end,
         verification_method = 'invite_code',
         verified_at = coalesce(school_memberships.verified_at, excluded.verified_at)
  returning * into v_membership;

  perform app.write_audit('student', v_inv.school_id, 'invitation_redeemed', 'invitation', v_inv.id,
                          jsonb_build_object('resulting_status', v_status));
  return v_membership;
end;
$$;

grant execute on function app.create_invitation(uuid, invitation_type, int, boolean, timestamptz) to authenticated;
grant execute on function app.redeem_invitation(text) to authenticated;
