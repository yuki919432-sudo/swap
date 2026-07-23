-- 25_privilege_boundaries.sql
-- Privilege escalation is blocked: role-gated functions, no self-promotion, and
-- client-supplied ids cannot grant access.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');

insert into auth.users (id) values
  ('aaaa0001-0000-0000-0000-000000000001'),  -- plain verified student in A
  ('aaaa00ad-0000-0000-0000-0000000000ad'),  -- school_admin in A
  ('0f000000-0000-0000-0000-000000000001'),  -- platform admin (inactive)
  ('bbbb0001-0000-0000-0000-000000000001');   -- verified student in B
insert into public.users (id, display_name) values
  ('aaaa0001-0000-0000-0000-000000000001', 'Student A'),
  ('aaaa00ad-0000-0000-0000-0000000000ad', 'Admin A'),
  ('0f000000-0000-0000-0000-000000000001', 'Inactive Platform'),
  ('bbbb0001-0000-0000-0000-000000000001', 'Student B');
insert into school_memberships (id, school_id, user_id, status) values
  ('dddd0001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'aaaa0001-0000-0000-0000-000000000001', 'verified'),
  ('dddd000b-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000bb', 'bbbb0001-0000-0000-0000-000000000001', 'verified');
insert into school_admins (id, school_id, user_id, role) values
  ('adad0001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'aaaa00ad-0000-0000-0000-0000000000ad', 'school_admin');
-- An INACTIVE platform admin row.
insert into platform_admins (user_id, role, active) values
  ('0f000000-0000-0000-0000-000000000001', 'platform_admin', false);

-- ------------------ students cannot execute admin/service-only DEFINER fns ----
select tests.authenticate_as('aaaa0001-0000-0000-0000-000000000001');

-- get_member_email is granted to authenticated but authorizes internally.
select throws_ok(
  $$select app.get_member_email('dddd0001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a student cannot read a member email via get_member_email');

-- service-role-only maintenance functions are not EXECUTE-able by students.
select throws_ok(
  $$select app.anonymize_user('aaaa0001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a student cannot execute app.anonymize_user (no EXECUTE grant)');
select throws_ok(
  $$select app.expire_stale_content()$$,
  '42501', null,
  'a student cannot execute app.expire_stale_content (no EXECUTE grant)');
select throws_ok(
  $$select app.purge_expired_ephemeral()$$,
  '42501', null,
  'a student cannot execute app.purge_expired_ephemeral (no EXECUTE grant)');

-- ------------------ client-supplied ids cannot escalate ----------------------
-- Cannot create a listing in another school.
select throws_ok(
  $$insert into listings (school_id, owner_id, post_type, title, description, category)
    values ('b0000000-0000-0000-0000-0000000000bb','aaaa0001-0000-0000-0000-000000000001','give','x','y','other')$$,
  '42501', null,
  'a member of A cannot insert a listing into School B (client school_id ignored)');

-- Cannot create a listing owned by someone else.
select throws_ok(
  $$insert into listings (school_id, owner_id, post_type, title, description, category)
    values ('a0000000-0000-0000-0000-0000000000aa','bbbb0001-0000-0000-0000-000000000001','give','x','y','other')$$,
  '42501', null,
  'a member cannot insert a listing owned by another user');

-- Cannot self-grant a verified membership (insert forces pending).
select throws_ok(
  $$insert into school_memberships (school_id, user_id, status)
    values ('b0000000-0000-0000-0000-0000000000bb','aaaa0001-0000-0000-0000-000000000001','verified')$$,
  '42501', null,
  'a user cannot self-insert a verified membership (status forced pending)');

-- Cannot forge a moderation action (not staff).
select throws_ok(
  $$insert into moderation_actions (school_id, actor_id, action, target_type, target_id)
    values ('a0000000-0000-0000-0000-0000000000aa','aaaa0001-0000-0000-0000-000000000001','remove_content','listing','dddd0001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a student cannot forge a moderation_actions row');

-- Cannot self-promote to platform admin.
select throws_ok(
  $$insert into platform_admins (user_id, role, active)
    values ('aaaa0001-0000-0000-0000-000000000001','platform_owner',true)$$,
  '42501', null,
  'a student cannot insert themselves into platform_admins');

-- ------------------ school admin cannot cross into platform -------------------
select tests.authenticate_as('aaaa00ad-0000-0000-0000-0000000000ad', 'aal2');
select ok(not app.is_platform_admin(),
  'a school admin (even with aal2) is not a platform admin');
select throws_ok(
  $$select app.anonymize_user('aaaa0001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a school admin cannot execute a platform/service maintenance function');
-- A school admin cannot promote themselves to school_owner (write needs owner).
-- The UPDATE runs without error but matches no rows (RLS USING); verified below.
select lives_ok(
  $$update school_admins set role = 'school_owner' where id = 'adad0001-0000-0000-0000-000000000001'$$,
  'a school_admin self-promotion UPDATE runs without error');

-- Confirm from ground truth that the self-promotion had no effect.
select tests.reset_auth();
select is((select role::text from school_admins where id = 'adad0001-0000-0000-0000-000000000001'),
  'school_admin', 'the school_admin role was NOT elevated');

-- ------------------ inactive / no-MFA platform admin rejected ----------------
select tests.authenticate_as('0f000000-0000-0000-0000-000000000001', 'aal2');
select ok(not app.is_platform_admin(),
  'an INACTIVE platform admin is rejected even with aal2');
select tests.reset_auth();
update platform_admins set active = true where user_id = '0f000000-0000-0000-0000-000000000001';
select tests.authenticate_as('0f000000-0000-0000-0000-000000000001', 'aal1');
select ok(not app.is_platform_admin(),
  'an active platform admin WITHOUT aal2 is rejected');
select tests.authenticate_as('0f000000-0000-0000-0000-000000000001', 'aal2');
select ok(app.is_platform_admin(),
  'an active platform admin WITH aal2 is accepted');

select * from finish();
rollback;
