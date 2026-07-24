-- 24_verification_defaults.sql
-- Correction: roster is an OPTIONAL adapter, never a dependency. The pilot default
-- for a new school enables only invitation codes + manual approval; roster (and
-- OAuth / email OTP) are opt-in. A school on the defaults must be fully usable and
-- must NOT be able to resolve membership via roster.
begin;
select plan(4);

-- A school created with the default settings gets exactly {invite_code, manual}.
insert into schools (id, name, slug, status) values
  ('dddd0000-0000-0000-0000-0000000000dd', 'Default School', 'default-school', 'active');
insert into school_settings (school_id) values ('dddd0000-0000-0000-0000-0000000000dd');

select is(
  (select enabled_verification_methods from school_settings where school_id = 'dddd0000-0000-0000-0000-0000000000dd'),
  array['invite_code','manual']::verification_method[],
  'a new school defaults to invite_code + manual');

select ok(
  (select not ('roster'::verification_method = any (enabled_verification_methods))
     from school_settings where school_id = 'dddd0000-0000-0000-0000-0000000000dd'),
  'roster is NOT enabled by default (optional adapter)');

-- Roster resolution is refused when roster is not enabled — proving the marketplace
-- can run with no roster integration at all.
insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'nomatch@example.test', now());
insert into public.users (id, display_name) values ('d0000000-0000-0000-0000-000000000001', 'U');

select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.resolve_roster_membership('dddd0000-0000-0000-0000-0000000000dd')$$,
  'P0001', 'method_not_enabled',
  'roster resolution is refused when the school has not enabled roster');
select tests.reset_auth();

-- Manual approval works on a default-config school with no roster involved.
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.request_membership('dddd0000-0000-0000-0000-0000000000dd', null, 'Please add me')$$,
  'manual membership request works on a default (rosterless) school');
select tests.reset_auth();

select * from finish();
rollback;
