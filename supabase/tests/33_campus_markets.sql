-- 33_campus_markets.sql
-- Student stalls + temporary markets: school isolation, permissions, and the
-- lifecycle guarantees (association ≠ ownership; cancel/remove never delete).
begin;
select no_plan();

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'cm-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'cm-b', 'active'),
  ('cccc0000-0000-0000-0000-0000000000cc', 'School M', 'cm-m', 'active');
insert into school_settings (school_id, enabled_verification_methods, market_creation_policy) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[], 'verified_students'),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['invite_code','manual']::verification_method[], 'verified_students'),
  ('cccc0000-0000-0000-0000-0000000000cc', array['invite_code','manual']::verification_method[], 'moderators_only');

insert into auth.users (id, email, email_confirmed_at) values
  ('c0000000-0000-0000-0000-000000000001', 's1@a.test', now()),  -- School A verified (host)
  ('c0000000-0000-0000-0000-000000000002', 's2@a.test', now()),  -- School A verified (seller)
  ('c0000000-0000-0000-0000-000000000003', 'pend@a.test', now()),-- School A pending
  ('c0000000-0000-0000-0000-000000000004', 'sb@b.test', now()),  -- School B verified (outsider)
  ('c0000000-0000-0000-0000-000000000005', 'sm@m.test', now());  -- School M verified (non-staff)
insert into public.users (id, display_name) select id, 'U' from auth.users;
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000001', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000002', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000003', 'pending'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'c0000000-0000-0000-0000-000000000004', 'verified'),
  ('cccc0000-0000-0000-0000-0000000000cc', 'c0000000-0000-0000-0000-000000000005', 'verified');

-- listings owned by the School A seller (for market association eligibility)
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition) values
  ('11110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002','give','Desk lamp','x','dormitory_items','good'),
  ('11110000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002','swap','Sneakers','x','shoes','good');
-- a listing owned by s1 (host), to test "only listings you control"
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition) values
  ('11110000-0000-0000-0000-000000000003','aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','give','Kettle','x','dormitory_items','good');

-- ============================================= stalls
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into stalls (school_id, user_id, description) values
    ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','Dorm odds and ends')$$,
  'a verified student can open their own stall');
select throws_ok(
  $$insert into stalls (school_id, user_id) values ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a student cannot open a stall owned by someone else');
select tests.reset_auth();

-- a pending member cannot open a stall
select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$insert into stalls (school_id, user_id) values ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000003')$$,
  '42501', null, 'a pending member cannot open a stall');
select tests.reset_auth();

-- ============================================= market creation (policy)
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into markets (id, school_id, host_user_id, title, description, status, allowed_categories) values
    ('22220000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
     'c0000000-0000-0000-0000-000000000001','Dorm Move-Out Sale','Everything must go','active',
     array['dormitory_items','furniture'])$$,
  'a verified student can create a market when policy = verified_students');
select throws_like(
  $$insert into markets (school_id, host_user_id, title, allowed_categories) values
    ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','Bad Market', array['weapons'])$$,
  '%category_prohibited%', 'a market cannot allow a universally-prohibited category');
select tests.reset_auth();

-- a pending member cannot create a market
select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$insert into markets (school_id, host_user_id, title) values
    ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000003','Nope')$$,
  '42501', null, 'a pending member cannot create a market');
select tests.reset_auth();

-- moderators_only policy blocks a plain verified student
select tests.authenticate_as('c0000000-0000-0000-0000-000000000005');
select throws_ok(
  $$insert into markets (school_id, host_user_id, title) values
    ('cccc0000-0000-0000-0000-0000000000cc','c0000000-0000-0000-0000-000000000005','Student market')$$,
  '42501', null, 'moderators_only policy blocks a non-staff verified student from creating a market');
select tests.reset_auth();

-- ============================================= joining + listing association
-- s2 joins the market and adds their own listings.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into market_sellers (market_id, school_id, user_id) values
    ('22220000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002')$$,
  'a verified student can join a market as a seller');
select lives_ok(
  $$insert into market_listings (market_id, school_id, listing_id, added_by) values
    ('22220000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa','11110000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002')$$,
  'a student can add a listing they own to a market');
-- cannot add a listing they do NOT own (s1's kettle)
select throws_ok(
  $$insert into market_listings (market_id, school_id, listing_id, added_by) values
    ('22220000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa','11110000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a student cannot add a listing they do not control');
select tests.reset_auth();

-- ============================================= a listing in multiple markets
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
insert into markets (id, school_id, host_user_id, title, status) values
  ('22220000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','Sneaker Market','active');
select tests.reset_auth();
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
insert into market_listings (market_id, school_id, listing_id, added_by) values
  ('22220000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa','11110000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from market_listings where listing_id = '11110000-0000-0000-0000-000000000001'), 2,
  'a single listing can belong to multiple markets');

-- removing a listing from a market does NOT delete the listing
delete from market_listings where market_id = '22220000-0000-0000-0000-000000000002' and listing_id = '11110000-0000-0000-0000-000000000001';
select is((select count(*)::int from listings where id = '11110000-0000-0000-0000-000000000001' and deleted_at is null), 1,
  'removing a listing from a market leaves the listing intact');
select tests.reset_auth();

-- ============================================= cancel a market (lifecycle)
-- The host cancels market 1; its participating listing + association survive.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
update markets set status = 'cancelled' where id = '22220000-0000-0000-0000-000000000001';
select tests.reset_auth();
select is((select status from markets where id = '22220000-0000-0000-0000-000000000001'), 'cancelled'::market_status,
  'the market is cancelled');
select is((select count(*)::int from market_listings where market_id = '22220000-0000-0000-0000-000000000001'), 1,
  'cancelling a market does not delete its listing associations');
select is((select count(*)::int from listings where id = '11110000-0000-0000-0000-000000000001' and deleted_at is null), 1,
  'cancelling a market does not delete the participating listing');
select is((select count(*)::int from audit_logs where action = 'market_cancelled' and target_id = '22220000-0000-0000-0000-000000000001'), 1,
  'market cancellation is audited');

-- ============================================= cross-school isolation
select tests.authenticate_as('c0000000-0000-0000-0000-000000000004');   -- School B outsider
select is((select count(*)::int from markets where school_id = 'aaaa0000-0000-0000-0000-0000000000aa'), 0,
  'a School B member cannot see School A markets');
select is((select count(*)::int from stalls where school_id = 'aaaa0000-0000-0000-0000-0000000000aa'), 0,
  'a School B member cannot see School A stalls');
select is((select count(*)::int from market_sellers), 0,
  'a School B member cannot see School A market participants');
select is((select count(*)::int from market_listings), 0,
  'a School B member cannot see School A listing↔market associations');
select tests.reset_auth();

-- ============================================= same-school visibility + audit of create
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select ok((select count(*)::int from markets where school_id = 'aaaa0000-0000-0000-0000-0000000000aa') >= 2,
  'a same-school member can browse the school markets');
select tests.reset_auth();
select is((select count(*)::int from audit_logs where action = 'market_created' and school_id = 'aaaa0000-0000-0000-0000-0000000000aa'), 2,
  'market creation is audited');

select * from finish();
rollback;
