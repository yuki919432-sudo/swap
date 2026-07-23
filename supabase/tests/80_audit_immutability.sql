-- 80_audit_immutability.sql
-- audit_logs is append-only: application users cannot UPDATE or DELETE, and even
-- an elevated role is blocked by the trigger (short of disabling it).
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');
insert into auth.users (id) values ('000000ad-0000-0000-0000-0000000000ad');
insert into public.users (id, display_name) values ('000000ad-0000-0000-0000-0000000000ad', 'Admin');
insert into school_admins (school_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '000000ad-0000-0000-0000-0000000000ad', 'school_admin');

-- Seed one audit row (superuser insert is allowed; only mutation is blocked).
insert into audit_logs (id, actor_id, actor_role, school_id, action, target_type, target_id)
values ('a0d17000-0000-0000-0000-000000000001', '000000ad-0000-0000-0000-0000000000ad',
        'system', 'aaaaaaaa-0000-0000-0000-00000000aaaa', 'seed_event', 'user', '000000ad-0000-0000-0000-0000000000ad');

-- An authenticated app user cannot UPDATE or DELETE audit rows (privilege revoked).
select tests.authenticate_as('000000ad-0000-0000-0000-0000000000ad');
select throws_ok(
  $$update audit_logs set action = 'tampered' where id = 'a0d17000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'an application user cannot UPDATE audit_logs');
select throws_ok(
  $$delete from audit_logs where id = 'a0d17000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'an application user cannot DELETE audit_logs');

-- A school admin CAN read their school''s audit log.
select is((select count(*)::int from audit_logs
           where id = 'a0d17000-0000-0000-0000-000000000001'), 1,
  'a school admin can read their school audit log');

-- Even the elevated test-runner role is blocked by the append-only trigger.
select tests.reset_auth();
select throws_ok(
  $$update audit_logs set action = 'tampered' where id = 'a0d17000-0000-0000-0000-000000000001'$$,
  null, null,
  'the append-only trigger blocks UPDATE even for the table owner');
select throws_ok(
  $$delete from audit_logs where id = 'a0d17000-0000-0000-0000-000000000001'$$,
  null, null,
  'the append-only trigger blocks DELETE even for the table owner');

select * from finish();
rollback;
