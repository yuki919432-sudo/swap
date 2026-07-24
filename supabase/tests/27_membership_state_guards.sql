-- 27_membership_state_guards.sql
-- Suspended/rejected memberships cannot be re-verified through any self-service
-- method; blocked attempts change nothing (no status change, no invitation use
-- consumed, no roster assignment). Also: DB-side method enforcement + validation.
begin;
select no_plan();

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'A', 'sga', 'active'),
  ('cccc0000-0000-0000-0000-0000000000cc', 'C', 'sgc', 'active'),   -- no self-service methods
  ('dddd0000-0000-0000-0000-0000000000dd', 'D', 'sgd', 'disabled'); -- disabled school
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['roster','manual','invite_code']::verification_method[]),
  ('cccc0000-0000-0000-0000-0000000000cc', array['email_otp']::verification_method[]),
  ('dddd0000-0000-0000-0000-0000000000dd', array['invite_code']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('a1000000-0000-0000-0000-000000000001', 'susp@a.test', now()),
  ('a1000000-0000-0000-0000-000000000002', 'rej@a.test', now()),
  ('a1000000-0000-0000-0000-000000000003', 'ver@a.test', now()),
  ('a1000000-0000-0000-0000-000000000004', 'pend@a.test', now()),
  ('a1000000-0000-0000-0000-000000000005', 'left@a.test', now()),
  ('a1000000-0000-0000-0000-000000000006', 'in@a.test', now());
insert into public.users (id, display_name) select id, 'U' from auth.users;

insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000001', 'suspended'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000002', 'rejected'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000003', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000004', 'pending'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000005', 'left');

-- Roster for A includes every test email (so a match exists; the block is by state).
insert into student_roster_entries (school_id, email_normalized, email_hash)
select 'aaaa0000-0000-0000-0000-0000000000aa', app.normalize_email(email), app.hash_email(email)
from auth.users where email like '%@a.test';

-- Invitations (School A: auto + approval; School C: invite_code disabled; School D: disabled school).
insert into invitations (id, school_id, code_prefix, code_hash, type, max_uses, uses_count, requires_approval) values
  ('b1000000-0000-0000-0000-0000000000a1', 'aaaa0000-0000-0000-0000-0000000000aa', left('AUTO-CODE-01',9), app.hash_code('AUTO-CODE-01'), 'shared', 10, 0, false),
  ('b1000000-0000-0000-0000-0000000000a2', 'aaaa0000-0000-0000-0000-0000000000aa', left('APPROVAL-CODE-1',9), app.hash_code('APPROVAL-CODE-1'), 'shared', 10, 0, true),
  ('b1000000-0000-0000-0000-0000000000c1', 'cccc0000-0000-0000-0000-0000000000cc', left('CDIS-CODE-01',9), app.hash_code('CDIS-CODE-01'), 'shared', 10, 0, false),
  ('b1000000-0000-0000-0000-0000000000d1', 'dddd0000-0000-0000-0000-0000000000dd', left('DDIS-CODE-01',9), app.hash_code('DDIS-CODE-01'), 'shared', 10, 0, false);

-- ================================================= suspended: roster blocked
select tests.authenticate_as('a1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa')$$,
  'P0001', 'membership_suspended', 'a suspended member cannot roster-verify');
select throws_ok(
  $$select public.redeem_invitation('AUTO-CODE-01')$$,
  'P0001', 'membership_suspended', 'a suspended member cannot auto-verify via invitation');
select throws_ok(
  $$select public.redeem_invitation('APPROVAL-CODE-1')$$,
  'P0001', 'membership_suspended', 'a suspended member cannot go pending via approval invitation');
select throws_ok(
  $$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', null, null)$$,
  'P0001', 'membership_suspended', 'a suspended member cannot submit a manual request');

select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'a1000000-0000-0000-0000-000000000001'), 'suspended',
  'the suspended membership is unchanged');
select is((select uses_count from invitations where id = 'b1000000-0000-0000-0000-0000000000a1'), 0,
  'a blocked invitation attempt did NOT consume a use');
select is((select count(*)::int from invite_code_uses
           where user_id = 'a1000000-0000-0000-0000-000000000001'), 0,
  'a blocked invitation attempt created no invite_code_uses row');
select is((select matched_user_id from student_roster_entries
           where school_id = 'aaaa0000-0000-0000-0000-0000000000aa'
             and email_hash = app.hash_email('susp@a.test')), null,
  'a blocked roster attempt did not assign the roster entry');

-- ================================================= rejected: blocked
select tests.authenticate_as('a1000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa')$$,
  'P0001', 'membership_rejected', 'a rejected member cannot roster-verify');
select throws_ok(
  $$select public.redeem_invitation('AUTO-CODE-01')$$,
  'P0001', 'membership_rejected', 'a rejected member cannot verify via invitation');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'a1000000-0000-0000-0000-000000000002'), 'rejected',
  'the rejected membership is unchanged');

-- ================================================= verified: idempotent, no consume
select tests.authenticate_as('a1000000-0000-0000-0000-000000000003');
select is(
  (public.redeem_invitation('AUTO-CODE-01') ->> 'status'), 'verified',
  'an already-verified member redeeming stays verified');
select tests.reset_auth();
select is((select uses_count from invitations where id = 'b1000000-0000-0000-0000-0000000000a1'), 0,
  'an already-verified member does NOT consume an invitation use');

-- ================================================= allowed transitions (control)
select tests.authenticate_as('a1000000-0000-0000-0000-000000000004');  -- pending -> verified (roster)
select is(
  (public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa') ->> 'status'), 'verified',
  'a pending member can verify via roster');
select tests.authenticate_as('a1000000-0000-0000-0000-000000000005');  -- left -> verified (invite)
select is(
  (public.redeem_invitation('AUTO-CODE-01') ->> 'status'), 'verified',
  'a member who left can re-verify via invitation');
select tests.reset_auth();
select is((select uses_count from invitations where id = 'b1000000-0000-0000-0000-0000000000a1'), 1,
  'the left->verified redemption consumed exactly one use');

-- ================================================= method-disabled (School C)
select tests.authenticate_as('a1000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.request_membership('cccc0000-0000-0000-0000-0000000000cc', null, null)$$,
  'P0001', 'method_not_enabled', 'manual request fails when manual is not enabled');
select throws_ok(
  $$select public.resolve_roster_membership('cccc0000-0000-0000-0000-0000000000cc')$$,
  'P0001', 'method_not_enabled', 'roster fails when roster is not enabled');
select throws_ok(
  $$select public.redeem_invitation('CDIS-CODE-01')$$,
  'P0001', 'method_not_enabled', 'invitation redemption fails when invite_code is not enabled');

-- ================================================= disabled school
select throws_ok(
  $$select public.redeem_invitation('DDIS-CODE-01')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'an invitation for a disabled school is rejected (generic error)');

-- ================================================= DB-side input validation
select throws_ok(
  $$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', 1000, null)$$,
  'P0001', 'invalid_input:grad_year', 'an out-of-range graduation year is rejected');
select throws_ok(
  format($$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', null, %L)$$, repeat('x', 2001)),
  'P0001', 'invalid_input:explanation', 'an over-long explanation is rejected');
select throws_ok(
  $$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', null, '   ')$$,
  'P0001', 'invalid_input:explanation', 'a whitespace-only explanation is rejected');
select throws_ok(
  $$select public.redeem_invitation('abc')$$,
  'P0001', 'invalid_input:code', 'an invitation code that is too short is rejected');

select * from finish();
rollback;
