-- 50_handoff.sql
-- Bilateral confirmation: a transaction completes only after BOTH parties confirm.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');
insert into auth.users (id) values
  ('5e11e100-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-000000000000'),
  ('00007000-0000-0000-0000-000000000000');  -- non-participant
insert into public.users (id, display_name) values
  ('5e11e100-0000-0000-0000-000000000000', 'Seller'),
  ('b0000000-0000-0000-0000-000000000000', 'Buyer'),
  ('00007000-0000-0000-0000-000000000000', 'Outsider');
insert into school_memberships (school_id, user_id, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'verified'),
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'b0000000-0000-0000-0000-000000000000', 'verified'),
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '00007000-0000-0000-0000-000000000000', 'verified');
insert into listings (id, school_id, owner_id, post_type, title, description, category) values
  ('11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'swap', 'L1', 'd', 'other'),
  ('bbbb0000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000aaaa', 'b0000000-0000-0000-0000-000000000000', 'swap', 'LB', 'd', 'other');

-- Buyer offers, seller accepts -> a handoff_pending transaction.
select tests.authenticate_as('b0000000-0000-0000-0000-000000000000');
create temp table o1 as select id from app.create_offer(
  'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000',
  '[{"listing_id":"bbbb0000-0000-0000-0000-00000000000a","direction":"offered"},
    {"listing_id":"11110000-0000-0000-0000-000000000001","direction":"requested"}]'::jsonb);
select tests.authenticate_as('5e11e100-0000-0000-0000-000000000000');
create temp table t1 as select id from app.accept_offer((select id from o1));

-- Non-participant cannot confirm.
select tests.authenticate_as('00007000-0000-0000-0000-000000000000');
select throws_ok(
  format($$select app.confirm_handoff(%L)$$, (select id from t1)),
  '42501', null,
  'a non-participant cannot confirm a handoff');

-- First confirmation (buyer): must NOT complete the transaction.
select tests.authenticate_as('b0000000-0000-0000-0000-000000000000');
select lives_ok(format($$select app.confirm_handoff(%L)$$, (select id from t1)),
  'buyer confirms handoff (1 of 2)');
select tests.reset_auth();
select is((select status::text from transactions where id = (select id from t1)), 'handoff_pending',
  'transaction is NOT completed after only one confirmation');
select ok((select completed_at is null from transactions where id = (select id from t1)),
  'completed_at is still null after one confirmation');

-- Repeat confirmation by the same user is idempotent (still not complete).
select tests.authenticate_as('b0000000-0000-0000-0000-000000000000');
select lives_ok(format($$select app.confirm_handoff(%L)$$, (select id from t1)),
  'buyer confirming twice is idempotent');
select tests.reset_auth();
select is((select status::text from transactions where id = (select id from t1)), 'handoff_pending',
  'a duplicate single-party confirmation does not complete the transaction');
select is((select count(*)::int from handoff_confirmations where transaction_id = (select id from t1)), 1,
  'only one confirmation row exists');

-- Second confirmation (seller): completes bilaterally.
select tests.authenticate_as('5e11e100-0000-0000-0000-000000000000');
select lives_ok(format($$select app.confirm_handoff(%L)$$, (select id from t1)),
  'seller confirms handoff (2 of 2)');
select tests.reset_auth();
select is((select status::text from transactions where id = (select id from t1)), 'completed',
  'transaction completes after both parties confirm');
select is((select status::text from listings where id = '11110000-0000-0000-0000-000000000001'), 'completed',
  'reserved listing becomes completed');
select is((select count(*)::int from listing_reservations
           where transaction_id = (select id from t1) and status = 'completed'), 2,
  'reservations are marked completed');
select is((select status::text from offers where id = (select id from o1)), 'completed',
  'the offer is marked completed');

select * from finish();
rollback;
