-- 65_invitation_security.sql
-- Invitation hardening: expiry/revocation, generic errors (no near-miss leak),
-- school binding, and no full code in audit metadata.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('a0000000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]);
insert into auth.users (id) values
  ('aaaa00ad-0000-0000-0000-0000000000ad'),  -- admin A
  ('00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000002'),
  ('00000003-0000-0000-0000-000000000003');
insert into public.users (id, display_name) values
  ('aaaa00ad-0000-0000-0000-0000000000ad', 'Admin A'),
  ('00000001-0000-0000-0000-000000000001', 'U1'),
  ('00000002-0000-0000-0000-000000000002', 'U2'),
  ('00000003-0000-0000-0000-000000000003', 'U3');
insert into school_admins (school_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa00ad-0000-0000-0000-0000000000ad', 'school_admin');

-- Controlled invitations with known plaintext codes (hash computed in-DB).
insert into invitations (school_id, code_prefix, code_hash, type, max_uses, uses_count, revoked, expires_at) values
  ('a0000000-0000-0000-0000-0000000000aa', left('VALID-A-CODE-01',9), app.hash_code('VALID-A-CODE-01'), 'single_use', 1, 0, false, null),
  ('a0000000-0000-0000-0000-0000000000aa', left('EXPIRED-CODE-01',9), app.hash_code('EXPIRED-CODE-01'), 'shared', 5, 0, false, now() - interval '1 hour'),
  ('a0000000-0000-0000-0000-0000000000aa', left('REVOKED-CODE-01',9), app.hash_code('REVOKED-CODE-01'), 'shared', 5, 0, true, null),
  ('a0000000-0000-0000-0000-0000000000aa', left('EXHAUSTED-01',9), app.hash_code('EXHAUSTED-01'), 'single_use', 1, 1, false, null);

-- ------------------------------------------------- expiry / revoke / exhausted
select tests.authenticate_as('00000001-0000-0000-0000-000000000001');

-- A valid code succeeds and binds to School A only.
select lives_ok($$select app.redeem_invitation('VALID-A-CODE-01')$$,
  'a valid invitation redeems');
select tests.reset_auth();
select is((select school_id::text from school_memberships where user_id = '00000001-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-0000000000aa',
  'a School A invitation creates a membership ONLY in School A');
select is((select count(*)::int from school_memberships
           where user_id = '00000001-0000-0000-0000-000000000001'
             and school_id = 'b0000000-0000-0000-0000-0000000000bb'), 0,
  'a School A invitation never creates a School B membership');

-- Generic, identical error for every failure mode (no near-correct signal).
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select throws_ok($$select app.redeem_invitation('EXPIRED-CODE-01')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'expired code returns the generic error');
select throws_ok($$select app.redeem_invitation('REVOKED-CODE-01')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'revoked code returns the generic error');
select throws_ok($$select app.redeem_invitation('EXHAUSTED-01')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'exhausted code returns the generic error');
select throws_ok($$select app.redeem_invitation('TOTALLY-WRONG-GUESS')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'a wrong/nonexistent code returns the SAME generic error');
select throws_ok($$select app.redeem_invitation('VALID-A-CODE-0X')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'an almost-correct code reveals nothing (same generic error)');

-- Single-use cannot be replayed by a second user (already consumed above).
select throws_ok($$select app.redeem_invitation('VALID-A-CODE-01')$$,
  'P0001', 'invalid_or_exhausted_invitation', 'a consumed single-use code cannot be replayed');

-- ------------------------------------------------- no full code in audit -----
-- Create an invitation through the real function (which writes an audit row).
select tests.authenticate_as('aaaa00ad-0000-0000-0000-0000000000ad');
create temp table made as
  select * from app.create_invitation('a0000000-0000-0000-0000-0000000000aa', 'single_use', 1, false, null);

select tests.authenticate_as('00000003-0000-0000-0000-000000000003');
select lives_ok(format($$select app.redeem_invitation(%L)$$, (select code from made)),
  'U3 redeems the freshly created invitation');

select tests.reset_auth();
-- The full code must not appear in any audit_logs row (action/target/metadata).
select is(
  (select count(*)::int from audit_logs
   where action in ('invitation_created', 'invitation_redeemed')
     and (coalesce(metadata::text, '') like '%' || (select code from made) || '%'
          or coalesce(target_id::text, '') like '%' || (select code from made) || '%')), 0,
  'no audit_logs row contains the full invitation code');
-- And the plaintext code is not stored on the invitation row either.
select is(
  (select count(*)::int from invitations
   where code_prefix = (select code from made) or code_hash = (select code from made)), 0,
  'the invitations row stores no plaintext code');

select * from finish();
rollback;
