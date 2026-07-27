-- 34_messaging.sql
-- Messaging vertical slice: same-school 1:1 conversations, deterministic de-dup,
-- strict participant-only privacy (moderators do NOT get message access), sender
-- integrity, blocking, per-user read state, and survival of listing soft-deletion.
begin;
select no_plan();

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'msg-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'msg-b', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['invite_code','manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'u1@a.test', now()),  -- A verified (initiator)
  ('d0000000-0000-0000-0000-000000000002', 'u2@a.test', now()),  -- A verified (recipient)
  ('d0000000-0000-0000-0000-000000000003', 'u3@a.test', now()),  -- A verified non-participant
  ('d0000000-0000-0000-0000-000000000004', 'umod@a.test', now()),-- A verified moderator (non-participant)
  ('d0000000-0000-0000-0000-000000000005', 'upend@a.test', now()),-- A pending
  ('d0000000-0000-0000-0000-000000000006', 'ususp@a.test', now()),-- A suspended
  ('d0000000-0000-0000-0000-000000000007', 'ub@b.test', now());  -- B verified (outsider)
insert into public.users (id, display_name) select id, 'U' from auth.users;
insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000001', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000002', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000003', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000004', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000005', 'pending'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000006', 'suspended'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'd0000000-0000-0000-0000-000000000007', 'verified');
insert into school_admins (school_id, user_id, role) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000004', 'school_moderator');

insert into listings (id, school_id, owner_id, post_type, title, description, category, condition) values
  ('99990000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
   'd0000000-0000-0000-0000-000000000002','give','Desk lamp','x','dormitory_items','good');

-- ============================================= start a conversation
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
create temp table conv as
  select public.start_conversation(
    'd0000000-0000-0000-0000-000000000002',
    '99990000-0000-0000-0000-000000000001', null, null) as id;
select isnt((select id from conv), null, 'a verified student can start a conversation with a same-school student about a listing');
select is((select count(*)::int from conversation_members where conversation_id = (select id from conv)), 2,
  'the conversation has exactly two members');
select is((select count(*)::int from messages where conversation_id = (select id from conv) and type = 'system'), 1,
  'a system message opens the conversation');

-- de-dup: same pair + same listing returns the SAME conversation
select is(
  public.start_conversation('d0000000-0000-0000-0000-000000000002','99990000-0000-0000-0000-000000000001', null, null),
  (select id from conv),
  'starting again for the same pair + context is de-duplicated to one active conversation');

-- a text message from the initiator. NOTE: pgTAP runs in ONE transaction, so
-- now() is frozen; we use clock_timestamp() for created_at so a message is
-- genuinely "after" a member's default last_read_at (which is now() at insert).
select lives_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body, created_at)
    select id, 'aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000001', 'Is this still available?', clock_timestamp() from conv$$,
  'a participant can send a text message');

-- a participant cannot forge another user as the sender
select throws_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body)
    select id, 'aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000002', 'spoofed' from conv$$,
  '42501', null, 'a sender cannot spoof another user''s identity');
select tests.reset_auth();

-- ============================================= recipient reads; unread state
select tests.authenticate_as('d0000000-0000-0000-0000-000000000002');
select ok((select count(*)::int from messages where conversation_id = (select id from conv)) >= 2,
  'the other participant can read the conversation messages');
select ok(
  (select unread from public.conversation_unread_counts() where conversation_id = (select id from conv)) >= 1,
  'the recipient has unread messages before opening the thread');
-- the recipient replies (so the initiator will have something unread) ...
insert into messages (conversation_id, school_id, sender_id, body, created_at)
  select id, 'aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000002', 'Yes it is!', clock_timestamp() from conv;
-- ... then opens the thread → marks read (last_read_at after every message so far).
update conversation_members set last_read_at = clock_timestamp()
  where conversation_id = (select id from conv) and user_id = 'd0000000-0000-0000-0000-000000000002';
select ok(
  not exists (select 1 from public.conversation_unread_counts() where conversation_id = (select id from conv)),
  'opening the thread clears the recipient''s unread count');
select tests.reset_auth();

-- read state is per-user: the initiator has NOT read the recipient's reply
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select ok(
  exists (select 1 from public.conversation_unread_counts() where conversation_id = (select id from conv)),
  'read state is per-user: the initiator still has unread items after the recipient read');
select tests.reset_auth();

-- ============================================= privacy: non-participants
-- a same-school non-participant cannot read the conversation or its messages
select tests.authenticate_as('d0000000-0000-0000-0000-000000000003');
select is((select count(*)::int from conversations where id = (select id from conv)), 0,
  'a same-school non-participant cannot read the conversation');
select is((select count(*)::int from messages where conversation_id = (select id from conv)), 0,
  'a same-school non-participant cannot read the messages');
select tests.reset_auth();

-- a school MODERATOR does not automatically gain access to private messages
select tests.authenticate_as('d0000000-0000-0000-0000-000000000004');
select is((select count(*)::int from conversations where id = (select id from conv)), 0,
  'a school moderator cannot read a private conversation they are not part of');
select is((select count(*)::int from messages where conversation_id = (select id from conv)), 0,
  'a school moderator cannot read private messages (no broad moderator read-all)');
select tests.reset_auth();

-- a cross-school user cannot read or infer the conversation
select tests.authenticate_as('d0000000-0000-0000-0000-000000000007');
select is((select count(*)::int from conversations where id = (select id from conv)), 0,
  'a cross-school user cannot read/infer the conversation');
select is((select count(*)::int from messages where conversation_id = (select id from conv)), 0,
  'a cross-school user cannot read the messages');
select tests.reset_auth();

-- ============================================= permission to initiate
-- a pending member cannot start a conversation
select tests.authenticate_as('d0000000-0000-0000-0000-000000000005');
select throws_ok(
  $$select public.start_conversation('d0000000-0000-0000-0000-000000000001', null, null, null)$$,
  '42501', null, 'a pending member cannot start a conversation');
select tests.reset_auth();

-- a suspended member cannot start a conversation
select tests.authenticate_as('d0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.start_conversation('d0000000-0000-0000-0000-000000000001', null, null, null)$$,
  '42501', null, 'a suspended member cannot start a conversation');
select tests.reset_auth();

-- a cross-school user cannot start a conversation with a School A student
select tests.authenticate_as('d0000000-0000-0000-0000-000000000007');
select throws_ok(
  $$select public.start_conversation('d0000000-0000-0000-0000-000000000001', null, null, null)$$,
  '42501', null, 'a cross-school user cannot start a conversation (no cross-school messaging)');
select tests.reset_auth();

-- ============================================= listing soft-delete survival
update listings set deleted_at = now() where id = '99990000-0000-0000-0000-000000000001';
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from conversations where id = (select id from conv)), 1,
  'the conversation survives after its listing is soft-deleted');
select ok((select count(*)::int from messages where conversation_id = (select id from conv)) >= 2,
  'the message history survives after the listing is soft-deleted');
select tests.reset_auth();

-- ============================================= blocking
-- u1 blocks u2; u2 can no longer send into the shared conversation
insert into blocks (school_id, blocker_id, blocked_id) values
  ('aaaa0000-0000-0000-0000-0000000000aa','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
select tests.authenticate_as('d0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$insert into messages (conversation_id, school_id, sender_id, body)
    select id, 'aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000002', 'still there?' from conv$$,
  '42501', null, 'a blocked user cannot send new messages into the conversation');
-- and cannot start a fresh conversation with the blocker
select throws_ok(
  $$select public.start_conversation('d0000000-0000-0000-0000-000000000001', null, null, null)$$,
  '42501', null, 'a block prevents starting a new conversation');
select tests.reset_auth();

select * from finish();
rollback;
