-- 35_offers_handoff.sql
-- Structured offers + handoff: creation, participant-only privacy, ownership,
-- ATOMIC reservation (one winner under contention), swap dual-reservation,
-- counteroffer history, blocking, availability guards, completion lifecycle, and
-- the borrow/lend collection-vs-return distinction.
begin;
select no_plan();

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'off-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'off-b', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['invite_code','manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 's1@a.test', now()),  -- A verified (offer sender)
  ('e0000000-0000-0000-0000-000000000002', 's2@a.test', now()),  -- A verified (listing owner / recipient)
  ('e0000000-0000-0000-0000-000000000003', 's3@a.test', now()),  -- A verified (competitor)
  ('e0000000-0000-0000-0000-000000000004', 'mod@a.test', now()), -- A verified moderator (non-participant)
  ('e0000000-0000-0000-0000-000000000005', 'pend@a.test', now()),-- A pending
  ('e0000000-0000-0000-0000-000000000006', 'sb@b.test', now());  -- B verified (outsider)
insert into public.users (id, display_name) select id, 'U' from auth.users;
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000001','verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000002','verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000003','verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000004','verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000005','pending'),
  ('bbbb0000-0000-0000-0000-0000000000bb','e0000000-0000-0000-0000-000000000006','verified');
insert into school_admins (school_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000004','school_moderator');

-- s2 owns the items being requested; s1 owns a swap item.
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition) values
  ('a1110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000002','give','Desk lamp','x','dormitory_items','good'),
  ('a1110000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000002','swap','Sneakers','x','shoes','good'),
  ('a1110000-0000-0000-0000-000000000003','aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000002','lend','Textbook','x','textbooks','good'),
  ('a1110000-0000-0000-0000-000000000009','aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000001','swap','My kettle','x','dormitory_items','good');

-- Conversations (via the RPC): s1<->s2 and s3<->s2.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
create temp table c1 as select public.start_conversation('e0000000-0000-0000-0000-000000000002', null, null, null) as id;
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000003');
create temp table c2 as select public.start_conversation('e0000000-0000-0000-0000-000000000002', null, null, null) as id;
select tests.reset_auth();

-- ============================================= create an offer
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
create temp table o1 as select (public.create_exchange_offer(
  (select id from c1), 'give', 'a1110000-0000-0000-0000-000000000001')).id as id;
select isnt((select id from o1), null, 'a verified student can create a give offer for a same-school listing');

-- cannot offer a listing you do not own (swap: offered listing must be yours)
select throws_ok(
  $$select public.create_exchange_offer((select id from c1), 'swap',
      'a1110000-0000-0000-0000-000000000002', 'a1110000-0000-0000-0000-000000000001')$$,
  'P0001', null, 'cannot offer a swap listing you do not own');
select tests.reset_auth();

-- ============================================= privacy: cross-school + moderator
select tests.authenticate_as('e0000000-0000-0000-0000-000000000006');
select is((select count(*)::int from offers where id = (select id from o1)), 0,
  'a cross-school user cannot read/infer the offer');
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000004');
select is((select count(*)::int from offers where id = (select id from o1)), 0,
  'a school moderator cannot read a private offer (no auto moderator access)');
select tests.reset_auth();

-- ============================================= cannot accept your own offer
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select throws_ok($$select public.accept_exchange_offer((select id from o1))$$,
  '42501', null, 'the sender cannot accept their own offer');
select tests.reset_auth();

-- ============================================= blocked cannot create
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
insert into blocks (school_id, blocker_id, blocked_id) values
  ('aaaa0000-0000-0000-0000-0000000000aa','e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000001');
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_exchange_offer((select id from c1), 'give', 'a1110000-0000-0000-0000-000000000003')$$,
  '42501', null, 'a blocked user cannot create a new offer');
select tests.reset_auth();
-- unblock for the rest of the tests
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
delete from blocks where blocker_id = 'e0000000-0000-0000-0000-000000000002';
select tests.reset_auth();

-- ============================================= competing acceptance → one winner
-- s3 also creates a give offer for the SAME listing (still active) in c2.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000003');
create temp table o2 as select (public.create_exchange_offer(
  (select id from c2), 'give', 'a1110000-0000-0000-0000-000000000001')).id as id;
select tests.reset_auth();

-- s2 accepts the first; the listing is reserved atomically.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
create temp table t1 as select (public.accept_exchange_offer((select id from o1))).id as id;
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000001'), 'reserved'::listing_status,
  'accepting an offer reserves the listing');
select is((select count(*)::int from listing_reservations where listing_id = 'a1110000-0000-0000-0000-000000000001' and status = 'active'), 1,
  'exactly one active reservation exists for the listing');
-- the second acceptance for the same listing loses.
select throws_like($$select public.accept_exchange_offer((select id from o2))$$,
  '%listing_not_available%', 'a competing acceptance for the same listing fails (one winner)');
select tests.reset_auth();

-- ============================================= decline leaves listing available
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
create temp table o3 as select (public.create_exchange_offer(
  (select id from c1), 'give', 'a1110000-0000-0000-0000-000000000003')).id as id;
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
select lives_ok($$select public.decline_exchange_offer((select id from o3))$$, 'the recipient can decline an offer');
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000003'), 'active'::listing_status,
  'a declined offer leaves the listing available');
select tests.reset_auth();

-- ============================================= completion updates lifecycle
-- Both participants confirm the give handoff; the listing completes.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.confirm_completion((select id from t1))$$, 'a participant marks the handoff complete');
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000001'), 'reserved'::listing_status,
  'the listing stays reserved until BOTH confirm');
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
select lives_ok($$select public.confirm_completion((select id from t1))$$, 'the other participant confirms completion');
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000001'), 'completed'::listing_status,
  'mutual confirmation completes the listing');
select is((select status from offers where id = (select id from o1)), 'completed'::offer_status, 'the offer is completed');
select tests.reset_auth();

-- a completed listing cannot receive a new offer
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_exchange_offer((select id from c1), 'give', 'a1110000-0000-0000-0000-000000000001')$$,
  'P0001', null, 'a completed listing cannot receive a new offer');
select tests.reset_auth();

-- ============================================= swap reserves BOTH listings
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
create temp table o4 as select (public.create_exchange_offer(
  (select id from c1), 'swap', 'a1110000-0000-0000-0000-000000000002', 'a1110000-0000-0000-0000-000000000009')).id as id;
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
select lives_ok($$select public.accept_exchange_offer((select id from o4))$$, 'a swap offer can be accepted');
select is((select count(*)::int from listings
           where id in ('a1110000-0000-0000-0000-000000000002','a1110000-0000-0000-0000-000000000009')
             and status = 'reserved'), 2, 'accepting a swap reserves BOTH listings atomically');
select tests.reset_auth();

-- ============================================= counteroffer preserves history
-- s1 opens a borrow offer for s2's textbook; s2 counters (new return date).
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
create temp table o5 as select (public.create_exchange_offer(
  (select id from c1), 'borrow', 'a1110000-0000-0000-0000-000000000003', null, 'Can I borrow this?',
  null, null, null, '2026-03-01T00:00:00Z')).id as id;
select tests.reset_auth();
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
create temp table o5c as select (public.counter_exchange_offer(
  (select id from o5), null, 'How about two weeks?', null, null, null, '2026-02-14T00:00:00Z')).id as id;
select is((select status from offers where id = (select id from o5)), 'countered'::offer_status,
  'countering marks the parent offer countered (history preserved)');
select is((select parent_offer_id from offers where id = (select id from o5c)), (select id from o5),
  'the counteroffer links to its parent (revision chain)');
select is((select count(*)::int from offers where status = 'pending' and parent_offer_id = (select id from o5)), 1,
  'only one active proposal exists in the chain');
select tests.reset_auth();

-- ============================================= borrow: handoff vs return distinct
-- The counteroffer runs s2 -> s1, so s1 (its recipient) accepts it.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select public.accept_exchange_offer((select id from o5c));
create temp table t5 as select id from transactions where offer_id = (select id from o5c);
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000003'), 'reserved'::listing_status,
  'accepting a borrow reserves the item');
select lives_ok($$select public.mark_handed_over((select id from t5))$$, 'the item can be marked handed over');
select is((select handoff_stage from transactions where id = (select id from t5)), 'return_due'::handoff_stage,
  'handed over is a DISTINCT state from returned (return_due)');
select lives_ok($$select public.mark_returned((select id from t5))$$, 'the item can be marked returned');
select is((select handoff_stage from transactions where id = (select id from t5)), 'returned'::handoff_stage,
  'the item is marked returned');
select is((select status from listings where id = 'a1110000-0000-0000-0000-000000000003'), 'active'::listing_status,
  'a returned borrow/lend item goes back to active');
select tests.reset_auth();

-- ============================================= conversation survives offers
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from conversations where id = (select id from c1)), 1,
  'the conversation survives completed/cancelled offers');
select ok((select count(*)::int from messages where conversation_id = (select id from c1) and type = 'system') >= 2,
  'offer state changes leave system messages in the thread');
select tests.reset_auth();

select * from finish();
rollback;
