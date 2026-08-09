-- 37_account.sql
-- Client-callable account controls (migration 0033): a member can request deletion
-- of their OWN account (soft/reversible) and export ONLY their own data. Proves the
-- self-scoping — one member's export never leaks another member's rows.
begin;
select plan(7);

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'acct-a', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('c0000000-0000-0000-0000-000000000001', 'alice@a.test', now()),
  ('c0000000-0000-0000-0000-000000000002', 'bob@a.test',   now());
insert into public.users (id, display_name) values
  ('c0000000-0000-0000-0000-000000000001', 'Alice'),
  ('c0000000-0000-0000-0000-000000000002', 'Bob');
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000001', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000002', 'verified');

-- Each user owns one listing.
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition, status) values
  ('11110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
   'c0000000-0000-0000-0000-000000000001','give','Alice lamp','x','dormitory_items','good','active'),
  ('11110000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa',
   'c0000000-0000-0000-0000-000000000002','give','Bob desk','x','dormitory_items','good','active');

-- ==================================================== deletion is self-scoped
-- Anonymous callers cannot request deletion.
select tests.reset_auth();
select throws_ok(
  $$select public.request_account_deletion()$$,
  '42501', null, 'an unauthenticated caller cannot request account deletion');

-- Alice requests deletion of her own account.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.request_account_deletion()$$,
  'a member can request deletion of their own account');
select tests.reset_auth();
select is(
  (select account_status::text from public.users where id = 'c0000000-0000-0000-0000-000000000001'),
  'deletion_requested', 'the account is marked deletion_requested (soft, reversible)');
select isnt(
  (select deletion_requested_at from public.users where id = 'c0000000-0000-0000-0000-000000000001'),
  null, 'deletion_requested_at was stamped');

-- ======================================================= export is self-scoped
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
-- Bob's export contains Bob's listing...
select is(
  (select (public.export_my_account() #>> '{listings,0,title}')),
  'Bob desk', 'export returns the caller''s own listing');
-- ...and never Alice's data (exactly one listing, and it is not Alice''s).
select is(
  (select jsonb_array_length(public.export_my_account() -> 'listings')),
  1, 'export contains only the caller''s own listings (no other member''s rows)');
-- Profile block reflects the caller.
select is(
  (select (public.export_my_account() #>> '{profile,display_name}')),
  'Bob', 'export profile block is the caller''s own profile');
select tests.reset_auth();

select * from finish();
rollback;
