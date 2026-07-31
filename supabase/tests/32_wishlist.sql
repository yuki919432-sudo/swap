-- 32_wishlist.sql
-- Wishlist ("looking for") data model: RLS isolation + the deterministic match
-- outbox populated by the new-listing trigger.
begin;
select plan(14);

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'wl-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'wl-b', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['invite_code','manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('c0000000-0000-0000-0000-000000000001', 'wisher@a.test', now()),   -- School A, has a wishlist
  ('c0000000-0000-0000-0000-000000000002', 'lister@a.test', now()),   -- School A, posts a matching listing
  ('c0000000-0000-0000-0000-000000000003', 'other@b.test', now());    -- School B outsider
insert into public.users (id, display_name) select id, 'U' from auth.users;

insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000001', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'c0000000-0000-0000-0000-000000000002', 'verified'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'c0000000-0000-0000-0000-000000000003', 'verified');

-- ============================================= a verified member creates a wishlist
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into wishlist_items (id, school_id, user_id, title, preferred_category, urgency)
    values ('11110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
            'c0000000-0000-0000-0000-000000000001','Mini fridge for my dorm','dormitory_items','high')$$,
  'a verified member can create a wishlist item');

-- cannot create a wishlist for someone else
select throws_ok(
  $$insert into wishlist_items (school_id, user_id, title)
    values ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000002','not mine')$$,
  '42501', null, 'cannot create a wishlist owned by another user');

-- prohibited preferred_category is rejected
select throws_like(
  $$insert into wishlist_items (school_id, user_id, title, preferred_category)
    values ('aaaa0000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','x','weapons')$$,
  '%category_prohibited%', 'a prohibited preferred_category is rejected');
select tests.reset_auth();

-- ============================================= same-school member sees the wishlist
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from wishlist_items where school_id='aaaa0000-0000-0000-0000-0000000000aa'), 1,
  'a same-school verified member can see the wishlist');
select tests.reset_auth();

-- ============================================= cross-school isolation
select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select is((select count(*)::int from wishlist_items), 0,
  'a member of another school cannot see the wishlist');
select tests.reset_auth();

-- ============================================= the matcher trigger populates the outbox
-- lister@a posts a "give" listing that matches the wishlist title + category.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition)
  values ('22220000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
          'c0000000-0000-0000-0000-000000000002','give','Mini fridge','Works great','dormitory_items','good');
select tests.reset_auth();

-- a wishlist_match row now exists for the wisher's item.
select is((select count(*)::int from wishlist_matches
           where wishlist_item_id='11110000-0000-0000-0000-000000000001'
             and listing_id='22220000-0000-0000-0000-000000000001'), 1,
  'the new matching listing created a wishlist_match (trigger + deterministic matcher)');
select ok((select score from wishlist_matches
           where wishlist_item_id='11110000-0000-0000-0000-000000000001') >= 0.25,
  'the recorded match score clears the threshold');
select is((select notified_at from wishlist_matches
           where wishlist_item_id='11110000-0000-0000-0000-000000000001'), null,
  'the match starts un-notified (outbox for a future notification)');

-- a non-matching listing (unrelated title, different category) creates no match.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition)
  values ('22220000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa',
          'c0000000-0000-0000-0000-000000000002','give','Chemistry textbook','8th edition','textbooks','good');
select tests.reset_auth();
select is((select count(*)::int from wishlist_matches
           where listing_id='22220000-0000-0000-0000-000000000002'), 0,
  'an unrelated listing creates no wishlist match');

-- a listing by the wisher themselves does not match their own wishlist.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition)
  values ('22220000-0000-0000-0000-000000000003','aaaa0000-0000-0000-0000-0000000000aa',
          'c0000000-0000-0000-0000-000000000001','give','Mini fridge','mine','dormitory_items','good');
select tests.reset_auth();
select is((select count(*)::int from wishlist_matches
           where listing_id='22220000-0000-0000-0000-000000000003'), 0,
  'a wisher''s own listing does not match their own wishlist');

-- ============================================= match-outbox visibility (RLS)
-- The wisher sees their own match; the lister does not.
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from wishlist_matches), 1, 'the wishlist owner can read their own matches');
select tests.reset_auth();
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from wishlist_matches), 0, 'a non-owner cannot read the wishlist owner''s matches');
select tests.reset_auth();

-- ============================================= fulfilled/cancelled stop new matches
-- Once the wisher marks the request FULFILLED, a freshly-listed matching item must
-- NOT create a new active match (the deterministic matcher only serves active wishes).
update wishlist_items set status = 'fulfilled' where id = '11110000-0000-0000-0000-000000000001';
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition)
  values ('22220000-0000-0000-0000-000000000004','aaaa0000-0000-0000-0000-0000000000aa',
          'c0000000-0000-0000-0000-000000000002','give','Mini fridge','another one','dormitory_items','good');
select tests.reset_auth();
select is((select count(*)::int from wishlist_matches where listing_id='22220000-0000-0000-0000-000000000004'), 0,
  'a fulfilled wishlist does not accrue new matches');

-- Same for a CANCELLED request.
update wishlist_items set status = 'cancelled' where id = '11110000-0000-0000-0000-000000000001';
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition)
  values ('22220000-0000-0000-0000-000000000005','aaaa0000-0000-0000-0000-0000000000aa',
          'c0000000-0000-0000-0000-000000000002','give','Mini fridge','yet another','dormitory_items','good');
select tests.reset_auth();
select is((select count(*)::int from wishlist_matches where listing_id='22220000-0000-0000-0000-000000000005'), 0,
  'a cancelled wishlist does not accrue new matches');

select * from finish();
rollback;
