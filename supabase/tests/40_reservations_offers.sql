-- 40_reservations_offers.sql
-- Correction #1 proofs: single active reservation per listing, atomic
-- acceptance, no partial reservation on failure, no double-booking.
begin;
select no_plan();

-- -------------------------------------------------------------- fixtures ----
insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');

insert into auth.users (id) values
  ('5e11e100-0000-0000-0000-000000000000'),  -- seller
  ('b0000000-0000-0000-0000-000000000000'),  -- buyer
  ('73140000-0000-0000-0000-000000000000');  -- third
insert into public.users (id, display_name) values
  ('5e11e100-0000-0000-0000-000000000000', 'Seller'),
  ('b0000000-0000-0000-0000-000000000000', 'Buyer'),
  ('73140000-0000-0000-0000-000000000000', 'Third');
insert into school_memberships (school_id, user_id, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'verified'),
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'b0000000-0000-0000-0000-000000000000', 'verified'),
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '73140000-0000-0000-0000-000000000000', 'verified');

-- Listings (all School A, active).
insert into listings (id, school_id, owner_id, post_type, title, description, category) values
  ('11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'swap', 'L1 (seller)', 'd', 'other'),
  ('11110000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'swap', 'L2 (seller)', 'd', 'other'),
  ('1111ffff-0000-0000-0000-0000000000fe', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000', 'swap', 'Lx (seller)', 'd', 'other'),
  ('bbbb0000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000aaaa', 'b0000000-0000-0000-0000-000000000000', 'swap', 'Buyer A', 'd', 'other'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000aaaa', 'b0000000-0000-0000-0000-000000000000', 'swap', 'Buyer B', 'd', 'other'),
  ('cccc0000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '73140000-0000-0000-0000-000000000000', 'swap', 'Third C', 'd', 'other');

-- Offers, created through the real function (captures generated ids).
select tests.authenticate_as('b0000000-0000-0000-0000-000000000000');
create temp table o1 as select id from app.create_offer(
  'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000',
  '[{"listing_id":"bbbb0000-0000-0000-0000-00000000000a","direction":"offered"},
    {"listing_id":"11110000-0000-0000-0000-000000000001","direction":"requested"}]'::jsonb);
create temp table o3 as select id from app.create_offer(
  'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000',
  '[{"listing_id":"bbbb0000-0000-0000-0000-00000000000b","direction":"offered"},
    {"listing_id":"11110000-0000-0000-0000-000000000002","direction":"requested"},
    {"listing_id":"11110000-0000-0000-0000-000000000001","direction":"requested"}]'::jsonb);

select tests.authenticate_as('73140000-0000-0000-0000-000000000000');
create temp table o2 as select id from app.create_offer(
  'aaaaaaaa-0000-0000-0000-00000000aaaa', '5e11e100-0000-0000-0000-000000000000',
  '[{"listing_id":"cccc0000-0000-0000-0000-00000000000c","direction":"offered"},
    {"listing_id":"11110000-0000-0000-0000-000000000001","direction":"requested"}]'::jsonb);

-- ------------------------ partial unique index: one active reservation/listing
select tests.reset_auth();
-- A standalone offer to satisfy the reservation FK (Lx is used nowhere else).
insert into offers (id, school_id, listing_id, from_user_id, to_user_id, status)
  values ('0ffe0000-0000-0000-0000-0000000000fe', 'aaaaaaaa-0000-0000-0000-00000000aaaa',
          '1111ffff-0000-0000-0000-0000000000fe', 'b0000000-0000-0000-0000-000000000000',
          '5e11e100-0000-0000-0000-000000000000', 'sent');
select lives_ok(
  $$insert into listing_reservations (school_id, listing_id, offer_id, reserved_by, status)
    values ('aaaaaaaa-0000-0000-0000-00000000aaaa','1111ffff-0000-0000-0000-0000000000fe',
            '0ffe0000-0000-0000-0000-0000000000fe','5e11e100-0000-0000-0000-000000000000','active')$$,
  'first active reservation for a listing is allowed');
select throws_ok(
  $$insert into listing_reservations (school_id, listing_id, offer_id, reserved_by, status)
    values ('aaaaaaaa-0000-0000-0000-00000000aaaa','1111ffff-0000-0000-0000-0000000000fe',
            '0ffe0000-0000-0000-0000-0000000000fe','5e11e100-0000-0000-0000-000000000000','active')$$,
  '23505', null,
  'a second ACTIVE reservation for the same listing is rejected (partial unique index)');

-- ------------------------------------------------- atomic accept of offer O1 --
select tests.authenticate_as('5e11e100-0000-0000-0000-000000000000');
select lives_ok(
  format($$select app.accept_offer(%L)$$, (select id from o1)),
  'seller accepts O1');

select tests.reset_auth();
select is((select status::text from offers where id = (select id from o1)), 'accepted',
  'O1 is accepted');
select is((select count(*)::int from transactions where offer_id = (select id from o1)), 1,
  'a transaction was created for O1');
select is((select status::text from listings where id = '11110000-0000-0000-0000-000000000001'), 'reserved',
  'requested listing L1 is now reserved');
select is((select status::text from listings where id = 'bbbb0000-0000-0000-0000-00000000000a'), 'reserved',
  'offered listing Buyer A is now reserved');
select is((select count(*)::int from listing_reservations
           where offer_id = (select id from o1) and status = 'active'), 2,
  'exactly two active reservations back O1');

-- ------------------------------------- double-booking: O2 competes for L1 -----
select tests.authenticate_as('5e11e100-0000-0000-0000-000000000000');
select throws_ok(
  format($$select app.accept_offer(%L)$$, (select id from o2)),
  null, null,
  'accepting O2 fails because L1 is already reserved (no double-booking)');

select tests.reset_auth();
select is((select status::text from offers where id = (select id from o2)), 'sent',
  'O2 remains sent after the failed acceptance');
select is((select count(*)::int from listing_reservations where offer_id = (select id from o2)), 0,
  'O2 created no reservations');
select is((select count(*)::int from transactions where offer_id = (select id from o2)), 0,
  'O2 created no transaction (one listing cannot join two accepted transactions)');

-- --------------------------- failed accept does not partially reserve (O3) ----
select tests.authenticate_as('5e11e100-0000-0000-0000-000000000000');
select throws_ok(
  format($$select app.accept_offer(%L)$$, (select id from o3)),
  null, null,
  'accepting O3 fails (contains already-reserved L1)');

select tests.reset_auth();
select is((select status::text from listings where id = '11110000-0000-0000-0000-000000000002'), 'active',
  'the other requested listing L2 was NOT reserved by the failed O3');
select is((select status::text from listings where id = 'bbbb0000-0000-0000-0000-00000000000b'), 'active',
  'the offered listing Buyer B was NOT reserved by the failed O3');
select is((select count(*)::int from listing_reservations where offer_id = (select id from o3)), 0,
  'the failed O3 created zero reservations (fully atomic rollback)');
select is((select status::text from offers where id = (select id from o3)), 'sent',
  'O3 remains sent after the failed acceptance');

-- ----------------------------------------------- acceptance authorization -----
select tests.authenticate_as('b0000000-0000-0000-0000-000000000000');
select throws_ok(
  format($$select app.accept_offer(%L)$$, (select id from o2)),
  '42501', null,
  'a non-recipient cannot accept an offer');

select * from finish();
rollback;
