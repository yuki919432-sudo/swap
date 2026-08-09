-- 0033_account_deletion.sql
-- Client-callable account controls over the retention model from 0020.
--
-- 0020 defined the authoritative retention/deletion model in the `app` schema
-- (app.request_account_deletion — soft, reversible; app.anonymize_user — scrubs
-- personal data while preserving transaction/report/moderation/audit history).
-- PostgREST only exposes `public`, so this migration adds thin, self-scoped
-- `public` RPCs the mobile app can call. No new tables, no new retention policy —
-- these surface what already exists.
--
-- Design:
--   * request_account_deletion is a wrapper that delegates to the existing app fn
--     (which is SECURITY DEFINER, audits, and only ever touches auth.uid()'s row).
--   * export_my_account returns ONLY the caller's own data (every query is filtered
--     by auth.uid()); it is SECURITY DEFINER so the read is complete and not
--     narrowed by per-table RLS, but it can never return another user's rows.

-- ===================================================== request_account_deletion
-- The caller requests deletion of their OWN account (soft/reversible until purged
-- by maintenance). Delegates to the app-schema function so there is a single
-- source of truth for what "deletion requested" means.
create or replace function public.request_account_deletion()
returns users
language plpgsql
security invoker
set search_path = app, public, auth, pg_catalog
as $$
begin
  return app.request_account_deletion();
end;
$$;
grant execute on function public.request_account_deletion() to authenticated;

-- =========================================================== export_my_account
-- Returns a single jsonb document with the caller's own data, for the in-app
-- "Download my data" control (data-portability / §25 account controls). Every
-- sub-query is scoped to auth.uid(); no school, admin, or other-user data is
-- ever included beyond the caller's own rows.
create or replace function public.export_my_account()
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_me uuid := auth.uid();
  v_out jsonb;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'exported_at', now(),
    'schema_version', 1,
    'profile', (
      select to_jsonb(u) - 'id'
        from public.users u where u.id = v_me
    ),
    'preferences', (
      select to_jsonb(p) - 'user_id'
        from public.user_preferences p where p.user_id = v_me
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'school_id', m.school_id, 'status', m.status,
               'verification_method', m.verification_method,
               'verified_at', m.verified_at, 'created_at', m.created_at))
        from public.school_memberships m where m.user_id = v_me
    ), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'post_type', l.post_type, 'title', l.title,
               'description', l.description, 'category', l.category,
               'condition', l.condition, 'status', l.status,
               'created_at', l.created_at))
        from public.listings l where l.owner_id = v_me and l.deleted_at is null
    ), '[]'::jsonb),
    'saved_listings', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'created_at', s.created_at))
        from public.saved_listings s where s.user_id = v_me
    ), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'title', w.title, 'description', w.description,
               'status', w.status, 'created_at', w.created_at))
        from public.wishlist_items w where w.user_id = v_me and w.deleted_at is null
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'listing_id', o.listing_id, 'direction',
               case when o.from_user_id = v_me then 'sent' else 'received' end,
               'status', o.status, 'message', o.message, 'created_at', o.created_at))
        from public.offers o where o.from_user_id = v_me or o.to_user_id = v_me
    ), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'target_type', r.target_type, 'reason', r.reason,
               'status', r.status, 'created_at', r.created_at))
        from public.reports r where r.reporter_id = v_me
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at))
        from public.blocks b where b.blocker_id = v_me
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;
grant execute on function public.export_my_account() to authenticated;
