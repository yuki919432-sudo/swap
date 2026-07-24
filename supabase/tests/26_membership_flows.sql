-- 26_membership_flows.sql
-- Phase 1B.2 membership resolution RPCs: roster matching, manual request +
-- review, status changes, invitation wrapper, and status retrieval.
begin;
select no_plan();

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');
-- A enables roster; B does not.
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['roster','manual','email_otp','invite_code']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['manual','email_otp']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('ad000000-0000-0000-0000-000000000001', 'reviewer@example.test', now()),        -- reviewer (school_admin A)
  ('c0000000-0000-0000-0000-000000000001', 'roster@example.test', now()),          -- on roster, confirmed
  ('c0000000-0000-0000-0000-000000000002', 'notroster@example.test', now()),       -- confirmed, not on roster
  ('c0000000-0000-0000-0000-000000000003', 'unconfirmed@example.test', null),      -- NOT confirmed
  ('c0000000-0000-0000-0000-000000000004', 'manual1@example.test', now()),         -- manual requester
  ('c0000000-0000-0000-0000-000000000005', 'manual2@example.test', now()),         -- manual requester (reject)
  ('c0000000-0000-0000-0000-000000000006', 'plain@example.test', now()),           -- plain verified member
  ('c0000000-0000-0000-0000-000000000007', 'invite@example.test', now());          -- invitation redeemer
insert into public.users (id, display_name)
  select id, 'U' from auth.users;

insert into school_admins (school_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'ad000000-0000-0000-0000-000000000001', 'membership_reviewer');

-- Roster contains only roster@example.test for School A.
insert into student_roster_entries (school_id, email_normalized, email_hash) values
  ('aaaa0000-0000-0000-0000-0000000000aa', app.normalize_email('roster@example.test'), app.hash_email('roster@example.test'));

-- A verified member for non-reviewer authorization checks.
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000006', 'verified');

-- An invitation for School A (known code).
insert into invitations (school_id, code_prefix, code_hash, type, max_uses, uses_count) values
  ('aaaa0000-0000-0000-0000-0000000000aa', left('MEMBER-INVITE-1',9), app.hash_code('MEMBER-INVITE-1'), 'single_use', 1, 0);

-- ============================================================ membership_status
select tests.authenticate_as('c0000000-0000-0000-0000-000000000006');
select is(public.get_membership_status('aaaa0000-0000-0000-0000-0000000000aa'), 'verified',
  'membership_status returns the caller''s status');
select is(public.get_membership_status('bbbb0000-0000-0000-0000-0000000000bb'), null,
  'membership_status is null where the caller has no membership');

-- ============================================================ redeem_invitation
select tests.authenticate_as('c0000000-0000-0000-0000-000000000007');
select is(
  (public.redeem_invitation('MEMBER-INVITE-1') ->> 'status'), 'verified',
  'redeem_invitation RPC returns a verified membership');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'c0000000-0000-0000-0000-000000000007'), 'verified',
  'redeem_invitation created the membership');

-- ============================================================ roster matching
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select is(
  (public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa') ->> 'status'), 'verified',
  'a rostered, email-confirmed user resolves to a verified membership');
select lives_ok(
  $$select public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa')$$,
  'roster resolution is idempotent');
select tests.reset_auth();
select is((select matched_user_id from student_roster_entries
           where school_id = 'aaaa0000-0000-0000-0000-0000000000aa'),
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'the roster entry is marked matched');

-- not on the roster
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa')$$,
  'P0001', 'roster_no_match', 'a non-rostered user is rejected');

-- email not confirmed
select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.resolve_roster_membership('aaaa0000-0000-0000-0000-0000000000aa')$$,
  '42501', 'email_not_verified', 'an unconfirmed email cannot resolve a roster membership');

-- roster not enabled for School B
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.resolve_roster_membership('bbbb0000-0000-0000-0000-0000000000bb')$$,
  'P0001', 'method_not_enabled', 'roster resolution fails when the school has not enabled it');

-- ============================================================ manual request + review
select tests.authenticate_as('c0000000-0000-0000-0000-000000000004');
select is(
  (public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', 2027, 'Transfer student') ->> 'status'),
  'pending', 'request_membership creates a pending request');
-- dedupe: a second request returns the same pending request (no duplicate).
select lives_ok(
  $$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', 2027, 'again')$$,
  'a repeat request is deduped');
select tests.reset_auth();
select is((select count(*)::int from membership_requests
           where user_id = 'c0000000-0000-0000-0000-000000000004' and status = 'pending'), 1,
  'only one pending request exists after a repeat');
select is((select status::text from school_memberships
           where user_id = 'c0000000-0000-0000-0000-000000000004'), 'pending',
  'a pending membership was seeded on request');

-- a non-reviewer cannot review (capture the id as superuser; the non-reviewer
-- cannot see the request row under RLS to fetch it).
select tests.reset_auth();
select set_config('swap.req004',
  (select id::text from membership_requests where user_id = 'c0000000-0000-0000-0000-000000000004' and status = 'pending'),
  false);
select tests.authenticate_as('c0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.review_membership_request(current_setting('swap.req004')::uuid, true, null)$$,
  '42501', 'not_authorized', 'a non-reviewer cannot review a membership request');

-- the reviewer approves
select tests.authenticate_as('ad000000-0000-0000-0000-000000000001');
select is(
  (public.review_membership_request(
     (select id from membership_requests where user_id = 'c0000000-0000-0000-0000-000000000004' and status = 'pending'),
     true, 'looks good') ->> 'status'),
  'approved', 'the reviewer approves the request');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'c0000000-0000-0000-0000-000000000004'), 'verified',
  'approval verifies the membership');

-- reject flow
select tests.authenticate_as('c0000000-0000-0000-0000-000000000005');
select lives_ok($$select public.request_membership('aaaa0000-0000-0000-0000-0000000000aa', null, null)$$,
  'second user requests membership');
select tests.authenticate_as('ad000000-0000-0000-0000-000000000001');
select is(
  (public.review_membership_request(
     (select id from membership_requests where user_id = 'c0000000-0000-0000-0000-000000000005' and status = 'pending'),
     false, 'not eligible') ->> 'status'),
  'rejected', 'the reviewer rejects the request');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'c0000000-0000-0000-0000-000000000005'), 'rejected',
  'rejection marks the membership rejected');

-- ============================================================ set_membership_status
-- reviewer suspends the plain member
select tests.authenticate_as('ad000000-0000-0000-0000-000000000001');
select is(
  (public.set_membership_status(
     (select id from school_memberships where user_id = 'c0000000-0000-0000-0000-000000000006'),
     'suspended', 'policy violation') ->> 'status'),
  'suspended', 'a reviewer can suspend a member');

-- a non-staff user cannot change someone else's status (capture id as superuser).
select tests.reset_auth();
select set_config('swap.mem006',
  (select id::text from school_memberships where user_id = 'c0000000-0000-0000-0000-000000000006'),
  false);
select tests.authenticate_as('c0000000-0000-0000-0000-000000000004');
select throws_ok(
  $$select public.set_membership_status(current_setting('swap.mem006')::uuid, 'suspended', null)$$,
  '42501', 'not_authorized', 'a non-staff user cannot change another member''s status');

-- a member may leave on their own
select is(
  (public.set_membership_status(
     (select id from school_memberships where user_id = 'c0000000-0000-0000-0000-000000000004'),
     'left', null) ->> 'status'),
  'left', 'a member can leave on their own');

-- invalid transition
select tests.authenticate_as('ad000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$select public.set_membership_status(%L, 'pending', null)$$,
    (select id from school_memberships where user_id = 'c0000000-0000-0000-0000-000000000006')),
  'P0001', 'invalid_membership_transition', 'an unsupported target status is rejected');

-- unknown membership
select throws_ok(
  $$select public.set_membership_status('dddddddd-0000-0000-0000-00000000dead', 'suspended', null)$$,
  'P0001', 'membership_not_found', 'an unknown membership id is rejected');

select * from finish();
rollback;
