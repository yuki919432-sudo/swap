-- 60_invitations.sql
-- Invitation codes: never stored in plaintext; use limits enforced atomically.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', array['invite_code','manual']::verification_method[]);
insert into auth.users (id) values
  ('000000ad-0000-0000-0000-0000000000ad'),
  ('00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000002'),
  ('00000003-0000-0000-0000-000000000003'),
  ('00000004-0000-0000-0000-000000000004'),
  ('00000005-0000-0000-0000-000000000005');
insert into public.users (id, display_name) values
  ('000000ad-0000-0000-0000-0000000000ad', 'Admin'),
  ('00000001-0000-0000-0000-000000000001', 'U1'),
  ('00000002-0000-0000-0000-000000000002', 'U2'),
  ('00000003-0000-0000-0000-000000000003', 'U3'),
  ('00000004-0000-0000-0000-000000000004', 'U4'),
  ('00000005-0000-0000-0000-000000000005', 'U5');
insert into school_admins (school_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '000000ad-0000-0000-0000-0000000000ad', 'school_admin');

-- ------------------------------------------------- create invitations --------
select tests.authenticate_as('000000ad-0000-0000-0000-0000000000ad');
create temp table inv_single as
  select * from app.create_invitation('aaaaaaaa-0000-0000-0000-00000000aaaa', 'single_use', 1, false, null);
create temp table inv_shared as
  select * from app.create_invitation('aaaaaaaa-0000-0000-0000-00000000aaaa', 'shared', 2, false, null);
create temp table inv_approval as
  select * from app.create_invitation('aaaaaaaa-0000-0000-0000-00000000aaaa', 'shared', 5, true, null);

-- ------------------------------------------------- no plaintext stored --------
select tests.reset_auth();
select is(
  (select count(*)::int from invitations
   where code_prefix = (select code from inv_single)
      or code_hash = (select code from inv_single)), 0,
  'the full invitation code is never stored in plaintext');
select is(
  (select code_hash from invitations where id = (select invitation_id from inv_single)),
  app.hash_code((select code from inv_single)),
  'stored code_hash equals sha256 of the code');

-- ------------------------------------------------- single-use limit -----------
select tests.authenticate_as('00000001-0000-0000-0000-000000000001');
select lives_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_single)),
  'U1 redeems the single-use invitation');
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select throws_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_single)),
  null, null, 'U2 cannot redeem an exhausted single-use invitation');

select tests.reset_auth();
select is((select uses_count from invitations where id = (select invitation_id from inv_single)), 1,
  'single-use uses_count stays exactly 1 (atomic, no over-increment)');
select is((select status::text from school_memberships
           where user_id = '00000001-0000-0000-0000-000000000001'), 'verified',
  'redeeming a non-approval invitation yields a verified membership');

-- ------------------------------------------------- shared use limit -----------
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select lives_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_shared)),
  'U2 redeems the shared invitation (1/2)');
select tests.authenticate_as('00000003-0000-0000-0000-000000000003');
select lives_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_shared)),
  'U3 redeems the shared invitation (2/2)');
select tests.authenticate_as('00000004-0000-0000-0000-000000000004');
select throws_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_shared)),
  null, null, 'U4 cannot redeem beyond the shared max_uses');

select tests.reset_auth();
select is((select uses_count from invitations where id = (select invitation_id from inv_shared)), 2,
  'shared uses_count stops exactly at max_uses = 2');

-- Same user cannot double-consume a shared invitation.
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select throws_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_shared)),
  null, null, 'a user cannot redeem the same invitation twice');
select tests.reset_auth();
select is((select uses_count from invitations where id = (select invitation_id from inv_shared)), 2,
  'the rejected double-redeem did not increment uses_count (atomic rollback)');

-- ------------------------------------------------- requires_approval ----------
select tests.authenticate_as('00000005-0000-0000-0000-000000000005');
select lives_ok(format($$select app.redeem_invitation(%L)$$, (select code from inv_approval)),
  'U5 redeems an approval-required invitation');
select tests.reset_auth();
select is((select status::text from school_memberships
           where user_id = '00000005-0000-0000-0000-000000000005'), 'pending',
  'an approval-required invitation yields a PENDING membership');

select * from finish();
rollback;
