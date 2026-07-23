-- 30_platform_mfa.sql
-- Platform access requires BOTH an active platform_admins row AND JWT aal2 (MFA).
-- A separate app/subdomain is not a boundary; the database is.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('c0000000-0000-0000-0000-0000000000cc', 'School C', 'school-c', 'active');

insert into auth.users (id) values
  ('0f000000-0000-0000-0000-000000000001'),  -- real platform owner
  ('ad000000-0000-0000-0000-000000000002'),  -- a school admin (not platform)
  ('00000000-0000-0000-0000-000000000003');   -- ordinary user
insert into public.users (id, display_name) values
  ('0f000000-0000-0000-0000-000000000001', 'Platform Owner'),
  ('ad000000-0000-0000-0000-000000000002', 'School Admin'),
  ('00000000-0000-0000-0000-000000000003', 'Plain User');

insert into platform_admins (user_id, role, active) values
  ('0f000000-0000-0000-0000-000000000001', 'platform_owner', true);
insert into school_admins (school_id, user_id, role) values
  ('c0000000-0000-0000-0000-0000000000cc', 'ad000000-0000-0000-0000-000000000002', 'school_admin');

-- A school admin (aal1) is NOT a platform admin.
select tests.authenticate_as('ad000000-0000-0000-0000-000000000002', 'aal1');
select ok(not app.is_platform_admin(),
  'A non-MFA school admin cannot access platform-admin functions');

-- A real platform admin WITHOUT MFA (aal1) is denied.
select tests.authenticate_as('0f000000-0000-0000-0000-000000000001', 'aal1');
select ok(not app.is_platform_admin(),
  'A platform admin without aal2 is denied platform access');
select ok(not app.has_platform_role('platform_owner'),
  'has_platform_role is false without aal2');
select throws_ok(
  $$insert into schools (name, slug, status) values ('X', 'x-denied', 'active')$$,
  '42501', null,
  'A platform admin without aal2 cannot create a school');

-- The same platform admin WITH MFA (aal2) is allowed.
select tests.authenticate_as('0f000000-0000-0000-0000-000000000001', 'aal2');
select ok(app.is_platform_admin(),
  'A platform admin with an active role and aal2 can access platform functions');
select ok(app.has_platform_role('platform_owner'),
  'has_platform_role true for active owner with aal2');
select lives_ok(
  $$insert into schools (name, slug, status) values ('New School', 'new-school', 'active')$$,
  'A platform admin with aal2 can create a school');

-- An ordinary user with aal2 is still not a platform admin (no row).
select tests.authenticate_as('00000000-0000-0000-0000-000000000003', 'aal2');
select ok(not app.is_platform_admin(),
  'aal2 alone (no platform_admins row) does not grant platform access');

select * from finish();
rollback;
