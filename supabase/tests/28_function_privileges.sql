-- 28_function_privileges.sql
-- Proves app.write_audit cannot be executed (or its rows forged) by clients, and
-- that EXECUTE on app/public functions matches an explicit allowlist. A newly
-- added SECURITY DEFINER function is NOT client-executable unless explicitly
-- granted (the default-privileges safety net from 0024).
begin;
select no_plan();

-- The explicit allowlist of functions `authenticated` may execute.
create temp table allow (nspname text, proname text);
insert into allow values
  ('app','is_verified_member'), ('app','is_school_staff'), ('app','has_school_role'),
  ('app','is_platform_admin'), ('app','has_platform_role'), ('app','is_conversation_member'),
  ('app','is_blocked_between'), ('app','shares_verified_school'), ('app','has_block_in_conversation'),
  ('app','create_invitation'), ('app','redeem_invitation'), ('app','create_offer'),
  ('app','accept_offer'), ('app','decline_offer'), ('app','cancel_offer'),
  ('app','confirm_handoff'), ('app','join_event'), ('app','get_member_email'),
  ('app','request_account_deletion'),
  ('public','get_membership_status'), ('public','redeem_invitation'),
  ('public','resolve_roster_membership'), ('public','request_membership'),
  ('public','review_membership_request'), ('public','set_membership_status');

-- ---- app.write_audit is not executable by authenticated -------------------
select ok(
  not has_function_privilege('authenticated',
    (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'write_audit'), 'EXECUTE'),
  'authenticated has no EXECUTE on app.write_audit');

-- ---- positive: every allowlisted function IS executable by authenticated ---
select is(
  (select count(*)::int
   from allow a
   join pg_namespace n on n.nspname = a.nspname
   join pg_proc p on p.pronamespace = n.oid and p.proname = a.proname
   where not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'every allowlisted function is executable by authenticated');

-- ---- negative: nothing outside the allowlist is executable by authenticated
--      (extension-owned functions such as pg_trgm/pgTAP are excluded).
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from allow a where a.nspname = n.nspname and a.proname = p.proname)),
  0, 'no non-allowlisted app/public function is executable by authenticated');

-- ---- a regular user cannot execute write_audit or forge an audit row -------
insert into schools (id, name, slug, status) values ('aaaa0000-0000-0000-0000-0000000000aa', 'A', 'fp-a', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code']::verification_method[]);
insert into auth.users (id) values ('a1000000-0000-0000-0000-0000000000f1'), ('a1000000-0000-0000-0000-0000000000f2');
insert into public.users (id, display_name) values
  ('a1000000-0000-0000-0000-0000000000f1', 'U'), ('a1000000-0000-0000-0000-0000000000f2', 'Admin');
insert into school_admins (school_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-0000000000f2', 'school_admin');
insert into invitations (id, school_id, code_prefix, code_hash, type, max_uses, uses_count) values
  ('b1000000-0000-0000-0000-0000000000f1', 'aaaa0000-0000-0000-0000-0000000000aa', left('FORGE-CODE-01',9), app.hash_code('FORGE-CODE-01'), 'single_use', 1, 0);

select tests.authenticate_as('a1000000-0000-0000-0000-0000000000f1');
select throws_ok(
  $$select app.write_audit('platform', null::uuid, 'forged', 'user', null::uuid, '{}'::jsonb)$$,
  '42501', null, 'a student cannot directly execute app.write_audit');
select throws_ok(
  $$insert into audit_logs (actor_role, action) values ('platform', 'forged')$$,
  '42501', null, 'a student cannot INSERT a forged audit row directly');

-- a school admin (still just an authenticated user) also cannot
select tests.authenticate_as('a1000000-0000-0000-0000-0000000000f2');
select throws_ok(
  $$select app.write_audit('platform', null::uuid, 'forged', 'user', null::uuid, '{}'::jsonb)$$,
  '42501', null, 'a school admin cannot directly execute app.write_audit');

-- ---- authorized RPC still writes its audit row internally ------------------
select tests.authenticate_as('a1000000-0000-0000-0000-0000000000f1');
select lives_ok($$select public.redeem_invitation('FORGE-CODE-01')$$,
  'an authorized user can redeem an invitation');
select tests.reset_auth();
select is(
  (select count(*)::int from audit_logs
   where action = 'invitation_redeemed'
     and target_id = 'b1000000-0000-0000-0000-0000000000f1'), 1,
  'the RPC wrote its audit row internally (via the definer owner)');

-- ---- a newly added SECURITY DEFINER function is caught by the allowlist ----
-- PostgreSQL makes new functions PUBLIC-executable by default (and that built-in
-- default cannot be stripped via ALTER DEFAULT PRIVILEGES). The safety net is
-- THIS allowlist test: an un-approved new function must make it fail.
create function app.__zz_probe() returns int language sql security definer
  set search_path = app, pg_catalog as 'select 1';
select ok(
  has_function_privilege('authenticated', 'app.__zz_probe()'::regprocedure, 'EXECUTE'),
  'a new function is PUBLIC-executable by Postgres default (must be explicitly handled)');
select cmp_ok(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from allow a where a.nspname = n.nspname and a.proname = p.proname)),
  '>=', 1,
  'the allowlist test detects an un-approved new function (this is the CI safety net)');

select * from finish();
rollback;
