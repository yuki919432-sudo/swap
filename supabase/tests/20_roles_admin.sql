-- 20_roles_admin.sql
-- School admins are scoped to their own school; suspended members lose access.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');

-- adminA administers A; adminB administers B.
insert into auth.users (id) values
  ('aaaa0001-0000-0000-0000-000000000001'),  -- admin A
  ('bbbb0001-0000-0000-0000-000000000001'),  -- admin B
  ('aaaa0002-0000-0000-0000-000000000002'),  -- member of A (starts pending)
  ('aaaa0003-0000-0000-0000-000000000003'),  -- suspended member of A
  ('bbbb0002-0000-0000-0000-000000000002');   -- member of B (cross-school target)
insert into public.users (id, display_name) values
  ('aaaa0001-0000-0000-0000-000000000001', 'Admin A'),
  ('bbbb0001-0000-0000-0000-000000000001', 'Admin B'),
  ('aaaa0002-0000-0000-0000-000000000002', 'Member A'),
  ('aaaa0003-0000-0000-0000-000000000003', 'Suspended A'),
  ('bbbb0002-0000-0000-0000-000000000002', 'Member B');

insert into school_admins (school_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa0001-0000-0000-0000-000000000001', 'school_admin'),
  ('b0000000-0000-0000-0000-0000000000bb', 'bbbb0001-0000-0000-0000-000000000001', 'school_admin');

insert into school_memberships (id, school_id, user_id, status) values
  ('dddd0002-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', 'aaaa0002-0000-0000-0000-000000000002', 'pending'),
  ('dddd0003-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000aa', 'aaaa0003-0000-0000-0000-000000000003', 'suspended'),
  ('dddd0009-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-0000000000bb', 'bbbb0002-0000-0000-0000-000000000002', 'verified');

-- A listing in School A (only a verified member should see it).
insert into listings (school_id, owner_id, post_type, title, description, category) values
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa0001-0000-0000-0000-000000000001', 'give', 'A item', 'desc', 'other');

-- ---------------------------------------- School A admin acting on School B --
select tests.authenticate_as('aaaa0001-0000-0000-0000-000000000001');

-- Updating a School B membership raises no error but is silently a no-op (RLS
-- USING matches no rows). We verify the row is untouched below, as superuser.
select lives_ok(
  $$update school_memberships set status = 'suspended' where id = 'dddd0009-0000-0000-0000-000000000009'$$,
  'School A admin update against a School B membership runs without error');

-- Inserting a School B admin row must be rejected by RLS WITH CHECK.
select throws_ok(
  $$insert into school_admins (school_id, user_id, role)
    values ('b0000000-0000-0000-0000-0000000000bb', 'aaaa0002-0000-0000-0000-000000000002', 'school_moderator')$$,
  '42501', null,
  'School A admin cannot create a School B admin');

-- School A admin CAN approve a School A membership (positive control).
select lives_ok(
  $$update school_memberships set status = 'verified' where id = 'dddd0002-0000-0000-0000-000000000002'$$,
  'School A admin can update a School A membership');

-- Verify effects from ground truth (superuser bypasses RLS).
select tests.reset_auth();
select is((select status::text from school_memberships where id = 'dddd0009-0000-0000-0000-000000000009'),
  'verified', 'the School B membership was NOT changed by the School A admin');
select is((select status::text from school_memberships where id = 'dddd0002-0000-0000-0000-000000000002'),
  'verified', 'the School A membership WAS updated by the School A admin');

-- ---------------------------------------------- suspended vs verified member --
select tests.authenticate_as('aaaa0003-0000-0000-0000-000000000003');
select is((select count(*)::int from listings), 0,
  'Suspended member cannot read school content');
select ok(not app.is_verified_member('a0000000-0000-0000-0000-0000000000aa'),
  'is_verified_member is false for a suspended membership');

select tests.authenticate_as('aaaa0002-0000-0000-0000-000000000002');
select is((select count(*)::int from listings), 1,
  'Now-verified member can read school content');

select * from finish();
rollback;
