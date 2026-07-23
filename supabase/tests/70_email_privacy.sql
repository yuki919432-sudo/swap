-- 70_email_privacy.sql
-- Public users cannot read student emails; admins can only via the audited,
-- role-restricted accessor.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');
insert into auth.users (id, email) values
  ('000000ad-0000-0000-0000-0000000000ad', 'admin@example.test'),
  ('00000001-0000-0000-0000-000000000001', 'student.one@example.test'),
  ('00000002-0000-0000-0000-000000000002', 'student.two@example.test');
insert into public.users (id, display_name) values
  ('000000ad-0000-0000-0000-0000000000ad', 'Admin'),
  ('00000001-0000-0000-0000-000000000001', 'Student One'),
  ('00000002-0000-0000-0000-000000000002', 'Student Two');
insert into private.user_emails (user_id, email, email_normalized, email_hash)
  select id, email, app.normalize_email(email), app.hash_email(email) from auth.users;
insert into school_admins (school_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '000000ad-0000-0000-0000-0000000000ad', 'membership_reviewer');
insert into school_memberships (id, school_id, user_id, status) values
  ('11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '00000001-0000-0000-0000-000000000001', 'verified'),
  ('22220000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '00000002-0000-0000-0000-000000000002', 'verified');

-- The public users table exposes no email/phone column at all.
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'users'
     and column_name in ('email', 'phone', 'phone_number')), 0,
  'public.users has no email or phone column');

-- A student cannot touch the private schema.
select tests.authenticate_as('00000001-0000-0000-0000-000000000001');
select throws_ok(
  $$select count(*) from private.user_emails$$,
  '42501', null,
  'a student cannot read private.user_emails');

-- A student cannot read another student''s email via the accessor.
select throws_ok(
  $$select app.get_member_email('22220000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'a student cannot read another member''s email via get_member_email');

-- A membership reviewer CAN, and the access is audited.
select tests.authenticate_as('000000ad-0000-0000-0000-0000000000ad');
select is(
  app.get_member_email('11110000-0000-0000-0000-000000000001'),
  'student.one@example.test',
  'a membership reviewer can read a member email via the accessor');

select tests.reset_auth();
select is(
  (select count(*)::int from audit_logs
   where action = 'member_email_accessed'
     and target_id = '00000001-0000-0000-0000-000000000001'), 1,
  'reading a member email writes an audit_logs entry');

select * from finish();
rollback;
