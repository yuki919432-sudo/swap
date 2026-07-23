-- 10_tenant_isolation.sql
-- Proves School A members cannot reach School B listings, messages, or profiles,
-- and that cross-school profiles are invisible.
begin;
select no_plan();

-- -------------------------------------------------------------- fixtures ----
insert into schools (id, name, slug, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'School A', 'school-a', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'School B', 'school-b', 'active');

-- Users: a1,a2 in A ; b1,b2 in B.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@example.test');
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'A One'),
  ('00000000-0000-0000-0000-0000000000a2', 'A Two'),
  ('00000000-0000-0000-0000-0000000000b1', 'B One'),
  ('00000000-0000-0000-0000-0000000000b2', 'B Two');
insert into school_memberships (school_id, user_id, status) values
  ('a0000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a1', 'verified'),
  ('a0000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a2', 'verified'),
  ('b0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b1', 'verified'),
  ('b0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b2', 'verified');

insert into listings (id, school_id, owner_id, post_type, title, description, category) values
  ('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a1', 'give', 'A Item', 'from school A', 'other'),
  ('22222222-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b1', 'give', 'B Item', 'from school B', 'other');

-- A conversation + message that live entirely in School B.
insert into conversations (id, school_id, context_type) values
  ('cccccccc-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-0000000000bb', 'direct');
insert into conversation_members (conversation_id, user_id) values
  ('cccccccc-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b1'),
  ('cccccccc-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b2');
insert into messages (conversation_id, school_id, sender_id, body) values
  ('cccccccc-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000b1', 'secret B message');

-- --------------------------------------------------- assertions as A One ----
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is((select count(*)::int from listings), 1,
  'A member sees exactly one listing (their own school)');
select is((select count(*)::int from listings
           where school_id = 'b0000000-0000-0000-0000-0000000000bb'), 0,
  'A member cannot read School B listings');
select is((select count(*)::int from listings
           where id = '22222222-0000-0000-0000-00000000000b'), 0,
  'A member cannot read a specific School B listing by id');

select is((select count(*)::int from messages), 0,
  'A member cannot read School B messages');
select is((select count(*)::int from conversations
           where id = 'cccccccc-0000-0000-0000-0000000000bb'), 0,
  'A member cannot read a School B conversation');

select is((select count(*)::int from users
           where id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'A member cannot see a cross-school user profile');
select is((select count(*)::int from users
           where id = '00000000-0000-0000-0000-0000000000a2'), 1,
  'A member can see a same-school user profile');
select ok((select count(*)::int from users
           where id = '00000000-0000-0000-0000-0000000000a1') = 1,
  'A member can see their own profile');

-- --------------------------------------------------- assertions as B One ----
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from listings
           where id = '11111111-0000-0000-0000-00000000000a'), 0,
  'B member cannot read a School A listing');
select is((select count(*)::int from messages), 1,
  'B member CAN read their own school conversation message');

select * from finish();
rollback;
