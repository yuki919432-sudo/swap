-- 90_blocks.sql
-- Blocking prevents new messages and new offers between the two users.
begin;
select no_plan();

insert into schools (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', 'School A', 'school-a', 'active');
insert into auth.users (id) values
  ('00000001-0000-0000-0000-000000000001'),  -- u1 (blocker)
  ('00000002-0000-0000-0000-000000000002');  -- u2 (blocked)
insert into public.users (id, display_name) values
  ('00000001-0000-0000-0000-000000000001', 'U1'),
  ('00000002-0000-0000-0000-000000000002', 'U2');
insert into school_memberships (school_id, user_id, status) values
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '00000001-0000-0000-0000-000000000001', 'verified'),
  ('aaaaaaaa-0000-0000-0000-00000000aaaa', '00000002-0000-0000-0000-000000000002', 'verified');
insert into conversations (id, school_id, context_type) values
  ('c0000000-0000-0000-0000-0000000000cc', 'aaaaaaaa-0000-0000-0000-00000000aaaa', 'direct');
insert into conversation_members (conversation_id, user_id) values
  ('c0000000-0000-0000-0000-0000000000cc', '00000001-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000cc', '00000002-0000-0000-0000-000000000002');
-- Two listings so a (pre-block) offer between them is well-formed.
insert into listings (id, school_id, owner_id, post_type, title, description, category) values
  ('11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '00000001-0000-0000-0000-000000000001', 'swap', 'L1', 'd', 'other'),
  ('22220000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000aaaa', '00000002-0000-0000-0000-000000000002', 'swap', 'L2', 'd', 'other');

-- Before any block: U2 can message the shared conversation.
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body)
    values ('c0000000-0000-0000-0000-0000000000cc','aaaaaaaa-0000-0000-0000-00000000aaaa',
            '00000002-0000-0000-0000-000000000002','hello before block')$$,
  'U2 can message before being blocked');

-- U1 blocks U2.
select tests.authenticate_as('00000001-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into blocks (school_id, blocker_id, blocked_id)
    values ('aaaaaaaa-0000-0000-0000-00000000aaaa','00000001-0000-0000-0000-000000000001','00000002-0000-0000-0000-000000000002')$$,
  'U1 blocks U2');

-- Now U2 (the blocked user) cannot send a new message.
select tests.authenticate_as('00000002-0000-0000-0000-000000000002');
select throws_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body)
    values ('c0000000-0000-0000-0000-0000000000cc','aaaaaaaa-0000-0000-0000-00000000aaaa',
            '00000002-0000-0000-0000-000000000002','after block')$$,
  '42501', null,
  'a blocked user cannot send new messages');

-- And U2 cannot open a new exchange offer to U1.
select throws_ok(
  $$select app.create_offer('aaaaaaaa-0000-0000-0000-00000000aaaa','00000001-0000-0000-0000-000000000001',
      '[{"listing_id":"22220000-0000-0000-0000-000000000002","direction":"offered"},
        {"listing_id":"11110000-0000-0000-0000-000000000001","direction":"requested"}]'::jsonb)$$,
  '42501', null,
  'a blocked user cannot send a new exchange offer');

-- The block is directional in storage but symmetric in effect: U1 is also stopped.
select tests.authenticate_as('00000001-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body)
    values ('c0000000-0000-0000-0000-0000000000cc','aaaaaaaa-0000-0000-0000-00000000aaaa',
            '00000001-0000-0000-0000-000000000001','from blocker')$$,
  '42501', null,
  'once a block exists, messaging is prevented in both directions');

select * from finish();
rollback;
