-- 0032_moderation.sql
-- Moderator tools over the Phase-0012 Trust & Safety tables. School moderators
-- (and admins/owners/platform) can triage reports and act on content/users through
-- server-authoritative, role-gated SECURITY DEFINER RPCs. Every decision is logged
-- to moderation_actions AND the append-only audit log.
--
-- Design:
--   * Authorization is checked in the DB via app.has_school_role — never trusted
--     from the client. A moderator can only act within THEIR OWN school.
--   * No new tables/enums. Content take-downs set listing status to 'removed';
--     restore returns it to 'active'. Suspension sets the membership to 'suspended'.
--   * Reads for the queue reuse the existing reports_select policy (moderators of the
--     school can read its reports). Private-message CONTENT is never bulk-exposed —
--     review is anchored to a specific report row, not a blanket moderator grant.

-- --------------------------------------------------------------- helper --------
create or replace function app.assert_moderator(p_school uuid)
returns void
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
begin
  if not (app.has_school_role(p_school, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function app.assert_moderator(uuid) from public;

-- ============================================================ resolve_report ===
create or replace function public.resolve_report(
  p_report     uuid,
  p_status     report_status,
  p_resolution text default null
) returns reports
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_r public.reports;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then raise exception 'report_not_found'; end if;
  perform app.assert_moderator(v_r.school_id);

  update public.reports
     set status = p_status,
         resolution = coalesce(p_resolution, resolution),
         assigned_moderator_id = v_me,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() else resolved_at end
   where id = p_report
   returning * into v_r;

  if p_status = 'dismissed' then
    insert into public.moderation_actions (school_id, actor_id, action, target_type, target_id, report_id, reason)
      values (v_r.school_id, v_me, 'dismiss', v_r.target_type, v_r.target_id, v_r.id, p_resolution);
  end if;
  perform app.write_audit('school_admin', v_r.school_id, 'report_resolved', 'report', v_r.id,
                          jsonb_build_object('status', p_status::text));
  return v_r;
end;
$$;
grant execute on function public.resolve_report(uuid, report_status, text) to authenticated, service_role;

-- ============================================= moderator_set_listing_status ====
-- Hide / remove / restore a listing. hide + remove both take it out of circulation
-- ('removed'); restore returns it to 'active'. The distinction is preserved in the
-- moderation_actions log for accountability.
create or replace function public.moderator_set_listing_status(
  p_listing uuid,
  p_action  moderation_action_type,
  p_report  uuid default null,
  p_reason  text default null
) returns listings
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_l public.listings; v_status listing_status;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_action not in ('hide_content', 'remove_content', 'restore_content') then
    raise exception 'invalid_action';
  end if;
  select * into v_l from public.listings where id = p_listing for update;
  if not found then raise exception 'listing_not_found'; end if;
  perform app.assert_moderator(v_l.school_id);

  v_status := case when p_action = 'restore_content' then 'active'::listing_status else 'removed'::listing_status end;
  update public.listings set status = v_status where id = p_listing returning * into v_l;

  insert into public.moderation_actions (school_id, actor_id, action, target_type, target_id, report_id, reason)
    values (v_l.school_id, v_me, p_action, 'listing', v_l.id, p_report, p_reason);
  perform app.write_audit('school_admin', v_l.school_id, 'moderation_listing_' || p_action::text, 'listing', v_l.id, '{}'::jsonb);
  return v_l;
end;
$$;
grant execute on function public.moderator_set_listing_status(uuid, moderation_action_type, uuid, text) to authenticated, service_role;

-- ============================================= moderator_suspend_member ========
create or replace function public.moderator_suspend_member(
  p_user   uuid,
  p_school uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform app.assert_moderator(p_school);
  update public.school_memberships set status = 'suspended'
   where user_id = p_user and school_id = p_school;
  insert into public.moderation_actions (school_id, actor_id, action, target_type, target_id, report_id, reason)
    values (p_school, v_me, 'suspend_user', 'user', p_user, null, p_reason);
  perform app.write_audit('school_admin', p_school, 'moderation_suspend_user', 'user', p_user, '{}'::jsonb);
end;
$$;
grant execute on function public.moderator_suspend_member(uuid, uuid, text) to authenticated, service_role;
