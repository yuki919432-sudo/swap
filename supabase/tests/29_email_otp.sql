-- 29_email_otp.sql
-- Email OTP: no plaintext stored, expiry, replay, supersede, attempt limits +
-- lockout, cooldown, daily caps, cross-user/cross-school binding, suspended/
-- rejected blocked, no partial membership, and hash privacy.
begin;
select no_plan();

-- Helper: sha256(salt || code) hex — matches the DB and the Edge Function.
create or replace function pg_temp.h(salt text, code text) returns text
  language sql immutable as $$ select encode(sha256(convert_to(salt || code, 'UTF8')), 'hex'); $$;

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'A', 'otp-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'B', 'otp-b', 'active'),
  ('cccc0000-0000-0000-0000-0000000000cc', 'C', 'otp-c', 'active'); -- email_otp disabled
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['email_otp']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['email_otp']::verification_method[]),
  ('cccc0000-0000-0000-0000-0000000000cc', array['manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1000000-0000-0000-0000-000000000001', 'v@a.test', now()),
  ('e1000000-0000-0000-0000-000000000002', 'other@a.test', now()),
  ('e1000000-0000-0000-0000-000000000003', 'susp@a.test', now()),
  ('e1000000-0000-0000-0000-000000000004', 'rej@a.test', now()),
  ('e1000000-0000-0000-0000-000000000005', 'fresh@a.test', now()),
  ('e1000000-0000-0000-0000-000000000006', 'cool@a.test', now()),
  ('e1000000-0000-0000-0000-000000000007', 'clean@a.test', now());
insert into public.users (id, display_name) select id, 'U' from auth.users;
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'e1000000-0000-0000-0000-000000000003', 'suspended'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'e1000000-0000-0000-0000-000000000004', 'rejected');

-- ================================================= plaintext never stored
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000aa',
  'v@a.test', 'school_membership_verification', pg_temp.h('s1', '123456'), 's1');
select is((select count(*)::int from private.otp_challenges
           where code_hash like '%123456%' or metadata::text like '%123456%'), 0,
  'the plaintext OTP is not stored anywhere on the challenge');
select is((select code_hash from private.otp_challenges
           where user_id = 'e1000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
  pg_temp.h('s1', '123456'), 'only the salted hash is stored');

-- ================================================= wrong code -> attempts++
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid',
  'a wrong code returns otp_invalid');
select tests.reset_auth();
select is((select attempts from private.otp_challenges
           where user_id = 'e1000000-0000-0000-0000-000000000001' and consumed_at is null), 1,
  'a wrong attempt increments the counter (and persists)');

-- ================================================= correct code verifies
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '123456') ->> 'ok'), 'true',
  'the correct code verifies');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = 'e1000000-0000-0000-0000-000000000001'), 'verified',
  'verification creates a verified membership via email_otp');

-- ================================================= replay is rejected
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '123456') ->> 'error'), 'otp_invalid',
  'a consumed OTP cannot be replayed');

-- ================================================= expiry
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000aa',
  'v@a.test', 'school_membership_verification', pg_temp.h('s2', '222222'), 's2', interval '-1 minute', interval '0');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '222222') ->> 'error'), 'otp_expired',
  'an expired OTP is rejected');

-- ================================================= newly issued supersedes
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000aa',
  'v@a.test', 'school_membership_verification', pg_temp.h('s3', '333333'), 's3', interval '10 minutes', interval '0');
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000aa',
  'v@a.test', 'school_membership_verification', pg_temp.h('s4', '444444'), 's4', interval '10 minutes', interval '0');
select is((select count(*)::int from private.otp_challenges
           where user_id = 'e1000000-0000-0000-0000-000000000001' and consumed_at is null and superseded_at is null), 1,
  'only one active challenge remains after re-issue');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '333333') ->> 'error'), 'otp_invalid',
  'the superseded (old) code no longer works');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '444444') ->> 'ok'), 'true',
  'the newly issued code works');

-- ================================================= attempt limit + lockout
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-0000000000aa',
  'other@a.test', 'school_membership_verification', pg_temp.h('s5', '123456'), 's5', interval '10 minutes', interval '0');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000002');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid', 'wrong 1');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid', 'wrong 2');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid', 'wrong 3');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid', 'wrong 4');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'error'), 'otp_invalid', 'wrong 5 (locks)');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '123456') ->> 'error'), 'otp_locked',
  'after the attempt limit the challenge is locked, even for the correct code');

-- ================================================= resend cooldown
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000006', 'aaaa0000-0000-0000-0000-0000000000aa',
  'cool@a.test', 'school_membership_verification', pg_temp.h('s6', '111111'), 's6');
select throws_ok(
  $$select public.request_otp_challenge('e1000000-0000-0000-0000-000000000006','aaaa0000-0000-0000-0000-0000000000aa',
      'cool@a.test','school_membership_verification', 'x', 'y')$$,
  'P0001', 'otp_cooldown', 'a resend within the cooldown window is rejected');

-- ================================================= daily cap (per email)
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-0000000000aa',
  'fresh@a.test', 'school_membership_verification', pg_temp.h('d', '1'), 'd', interval '10 minutes', interval '0', 2, 100);
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-0000000000aa',
  'fresh@a.test', 'school_membership_verification', pg_temp.h('d', '2'), 'd', interval '10 minutes', interval '0', 2, 100);
select throws_ok(
  $$select public.request_otp_challenge('e1000000-0000-0000-0000-000000000005','aaaa0000-0000-0000-0000-0000000000aa',
      'fresh@a.test','school_membership_verification','x','y', interval '10 minutes', interval '0', 2, 100)$$,
  'P0001', 'otp_daily_limit', 'the per-email daily cap is enforced');

-- ================================================= cross-user + cross-school
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000006', 'aaaa0000-0000-0000-0000-0000000000aa',
  'cool@a.test', 'school_membership_verification', pg_temp.h('s7', '777777'), 's7', interval '10 minutes', interval '0');
-- another user (with no challenge of their own) cannot use it
select tests.authenticate_as('e1000000-0000-0000-0000-000000000007');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '777777') ->> 'error'), 'otp_invalid',
  'an OTP cannot be used by a different authenticated user');
-- the owner cannot use it against a different school
select tests.authenticate_as('e1000000-0000-0000-0000-000000000006');
select is((public.verify_email_otp('bbbb0000-0000-0000-0000-0000000000bb', '777777') ->> 'error'), 'otp_invalid',
  'a School A OTP cannot verify School B membership');

-- ================================================= suspended / rejected blocked
select tests.reset_auth();
select public.request_otp_challenge('e1000000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-0000000000aa',
  'susp@a.test', 'school_membership_verification', pg_temp.h('s8', '888888'), 's8', interval '10 minutes', interval '0');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000003');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '888888') ->> 'error'), 'membership_suspended',
  'a suspended member cannot self-reinstate through OTP');
select tests.reset_auth();
select is((select consumed_at from private.otp_challenges
           where user_id = 'e1000000-0000-0000-0000-000000000003' and superseded_at is null), null,
  'a blocked OTP attempt does not consume the challenge');
select is((select status::text from school_memberships where user_id = 'e1000000-0000-0000-0000-000000000003'), 'suspended',
  'the suspended membership is unchanged');

select public.request_otp_challenge('e1000000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-0000000000aa',
  'rej@a.test', 'school_membership_verification', pg_temp.h('s9', '999999'), 's9', interval '10 minutes', interval '0');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000004');
select is((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '999999') ->> 'error'), 'membership_rejected',
  'a rejected member cannot bypass rejection through OTP');

-- ================================================= no partial membership on failure
select tests.authenticate_as('e1000000-0000-0000-0000-000000000005');
select ok((public.verify_email_otp('aaaa0000-0000-0000-0000-0000000000aa', '000000') ->> 'ok') = 'false',
  'a failed verification returns ok=false');
select tests.reset_auth();
-- fresh@a.test never became verified via a failed attempt
select is((select count(*)::int from school_memberships
           where user_id = 'e1000000-0000-0000-0000-000000000005' and status = 'verified'), 0,
  'a failed verification creates no verified membership');

-- ================================================= method disabled
select throws_ok(
  $$select public.request_otp_challenge('e1000000-0000-0000-0000-000000000001','cccc0000-0000-0000-0000-0000000000cc',
      'v@a.test','school_membership_verification','x','y')$$,
  'P0001', 'method_not_enabled', 'OTP request fails when email_otp is not enabled');

-- ================================================= OTP hashes are private
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select count(*) from private.otp_challenges$$,
  '42501', null, 'application users cannot read OTP challenge hashes');

-- ================================================= delivery events (webhook)
select tests.reset_auth();
-- an admin for school A
insert into auth.users (id) values ('e1000000-0000-0000-0000-0000000000ad');
insert into public.users (id, display_name) values ('e1000000-0000-0000-0000-0000000000ad', 'Admin');
insert into school_admins (school_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'e1000000-0000-0000-0000-0000000000ad', 'school_admin');

select is(public.record_email_event('postmark', 'msg-1', 'delivered', 'v@a.test', 'aaaa0000-0000-0000-0000-0000000000aa', '{}'::jsonb, true),
  true, 'a new delivery event is recorded');
select is(public.record_email_event('postmark', 'msg-1', 'delivered', 'v@a.test', 'aaaa0000-0000-0000-0000-0000000000aa', '{}'::jsonb, true),
  false, 'a replayed webhook event is idempotent (no duplicate)');

-- admin sees masked delivery status
select tests.authenticate_as('e1000000-0000-0000-0000-0000000000ad');
select is(
  (public.get_email_delivery_status('aaaa0000-0000-0000-0000-0000000000aa') -> 0 ->> 'email'),
  'v*@a.test', 'delivery status shows a masked email to the admin');
-- a non-admin cannot read delivery status
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.get_email_delivery_status('aaaa0000-0000-0000-0000-0000000000aa')$$,
  '42501', 'not_authorized', 'a non-admin cannot read delivery status');

-- ================================================= retirement of the placeholder
select tests.reset_auth();
select hasnt_table('private', 'otp_codes',
  'the Phase-1A placeholder private.otp_codes is retired (0026)');
select has_table('private', 'otp_challenges',
  'private.otp_challenges is the canonical OTP store');

-- ================================================= retention purge
-- Seed one consumed + one active challenge; purge (0 grace) removes only the
-- consumed one, leaving the active challenge intact.
insert into private.otp_challenges
  (user_id, school_id, email_normalized, email_hash, code_hash, code_salt, expires_at, consumed_at)
values ('e1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000aa',
        'purge@a.test', app.hash_email('purge@a.test'), 'h', 's', now() + interval '10 min', now() - interval '2 days'),
       ('e1000000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-0000000000aa',
        'keep@a.test', app.hash_email('keep@a.test'), 'h', 's', now() + interval '10 min', null);
select app.purge_expired_otp(interval '1 day');
select is((select count(*)::int from private.otp_challenges where email_normalized = 'purge@a.test'), 0,
  'purge_expired_otp removes a consumed challenge past the grace window');
select is((select count(*)::int from private.otp_challenges where email_normalized = 'keep@a.test'), 1,
  'purge_expired_otp keeps an active challenge');

select * from finish();
rollback;
