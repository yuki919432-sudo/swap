-- 01_storage_policies.sql
-- Storage object RLS proofs. Runs against the local storage-schema replica with
-- migration 0022's real policies applied. Verifies tenant isolation, ownership,
-- moderation scope, suspension, and path-extraction safety.
begin;
select no_plan();

-- Buckets were created by migration 0022 (storage schema present).
select is((select count(*)::int from storage.buckets where id = 'listing-images'), 1,
  'the listing-images bucket exists');

-- -------------------------------------------------------------- fixtures ----
insert into schools (id, name, slug, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');
insert into auth.users (id) values
  ('aaaa0001-0000-0000-0000-000000000001'),  -- member A (listing owner)
  ('aaaa0002-0000-0000-0000-000000000002'),  -- member A (other student)
  ('aaaa00ad-0000-0000-0000-0000000000ad'),  -- moderator A
  ('aaaa0055-0000-0000-0000-000000000055'),  -- suspended A
  ('bbbb0001-0000-0000-0000-000000000001');   -- member B
insert into public.users (id, display_name) values
  ('aaaa0001-0000-0000-0000-000000000001', 'Member A'),
  ('aaaa0002-0000-0000-0000-000000000002', 'Member A2'),
  ('aaaa00ad-0000-0000-0000-0000000000ad', 'Moderator A'),
  ('aaaa0055-0000-0000-0000-000000000055', 'Suspended A'),
  ('bbbb0001-0000-0000-0000-000000000001', 'Member B');
insert into school_memberships (school_id, user_id, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa0001-0000-0000-0000-000000000001', 'verified'),
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa0002-0000-0000-0000-000000000002', 'verified'),
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa0055-0000-0000-0000-000000000055', 'suspended'),
  ('b0000000-0000-0000-0000-0000000000bb', 'bbbb0001-0000-0000-0000-000000000001', 'verified');
insert into school_admins (school_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000aa', 'aaaa00ad-0000-0000-0000-0000000000ad', 'school_moderator');
insert into listings (id, school_id, owner_id, post_type, title, description, category) values
  ('11110000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000aa', 'aaaa0001-0000-0000-0000-000000000001', 'give', 'A listing', 'd', 'other'),
  ('22220000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000bb', 'bbbb0001-0000-0000-0000-000000000001', 'give', 'B listing', 'd', 'other');

-- Path helpers (school_id / listing_id / file).
-- A object path: a0000000-...-aa/11110000-...-0a/f.jpg
-- B object path: b0000000-...-bb/22220000-...-0b/g.jpg
insert into storage.objects (bucket_id, name) values
  ('listing-images', 'b0000000-0000-0000-0000-0000000000bb/22220000-0000-0000-0000-00000000000b/g.jpg');

-- ------------------------------------- member A uploads to authorized path ---
select tests.authenticate_as('aaaa0001-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('listing-images','a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f.jpg','aaaa0001-0000-0000-0000-000000000001')$$,
  'a verified School A member can upload to their own School A listing path');

-- ------------------------------------- member A cannot upload to School B -----
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('listing-images','b0000000-0000-0000-0000-0000000000bb/22220000-0000-0000-0000-00000000000b/x.jpg')$$,
  '42501', null,
  'a School A member cannot upload to a School B path');

-- ------------------------------------- member A cannot read a B object --------
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'listing-images'
     and name like 'b0000000-0000-0000-0000-0000000000bb/%'), 0,
  'a School A member cannot read a private School B object');

-- ------------------------------------- another student cannot delete it -------
select tests.authenticate_as('aaaa0002-0000-0000-0000-000000000002');
select lives_ok(
  $$delete from storage.objects
    where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f.jpg'$$,
  'a non-owner delete runs without error (RLS matches no rows)');
select tests.reset_auth();
select is(
  (select count(*)::int from storage.objects
   where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f.jpg'), 1,
  'another regular student could NOT delete the owner''s object');

-- ------------------------------------- owner CAN delete their object ----------
select tests.authenticate_as('aaaa0001-0000-0000-0000-000000000001');
select lives_ok(
  $$delete from storage.objects
    where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f.jpg'$$,
  'the listing owner can delete their object');
select tests.reset_auth();
select is(
  (select count(*)::int from storage.objects
   where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f.jpg'), 0,
  'the owner''s object was deleted');

-- ------------------------------------- moderator scope ------------------------
-- Re-create an A object, then a School A moderator removes it (allowed).
insert into storage.objects (bucket_id, name, owner) values
  ('listing-images','a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f2.jpg','aaaa0001-0000-0000-0000-000000000001');
select tests.authenticate_as('aaaa00ad-0000-0000-0000-0000000000ad');
select lives_ok(
  $$delete from storage.objects
    where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f2.jpg'$$,
  'a School A moderator can remove a School A object');
-- The same moderator cannot touch a School B object.
select lives_ok(
  $$delete from storage.objects
    where name = 'b0000000-0000-0000-0000-0000000000bb/22220000-0000-0000-0000-00000000000b/g.jpg'$$,
  'a School A moderator delete against a School B object runs without error');
select tests.reset_auth();
select is(
  (select count(*)::int from storage.objects
   where name = 'a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/f2.jpg'), 0,
  'the moderator removed the School A object');
select is(
  (select count(*)::int from storage.objects
   where name = 'b0000000-0000-0000-0000-0000000000bb/22220000-0000-0000-0000-00000000000b/g.jpg'), 1,
  'a School A moderator could NOT administer School B storage');

-- ------------------------------------- suspended member loses access ----------
select tests.authenticate_as('aaaa0055-0000-0000-0000-000000000055');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('listing-images','a0000000-0000-0000-0000-0000000000aa/11110000-0000-0000-0000-00000000000a/susp.jpg')$$,
  '42501', null,
  'a suspended member cannot upload');

-- ------------------------------------- invalid paths cannot bypass ------------
select tests.authenticate_as('aaaa0001-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('listing-images','nofolder.jpg')$$,
  null, null,
  'a path with no folder cannot bypass school extraction (empty folder -> NULL school)');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('listing-images','not-a-uuid/11110000-0000-0000-0000-00000000000a/f.jpg')$$,
  null, null,
  'a non-UUID first segment cannot bypass school extraction');

-- ------------------------------------- avatars: own folder only ---------------
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars','aaaa0001-0000-0000-0000-000000000001/me.jpg')$$,
  'a user can upload their own avatar');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars','bbbb0001-0000-0000-0000-000000000001/spoof.jpg')$$,
  '42501', null,
  'a user cannot upload an avatar into another user''s folder');

select * from finish();
rollback;
