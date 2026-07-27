-- 0030_messaging_slice.sql
-- Messaging vertical slice (Phase 1G). Builds on the Phase 1A messaging tables
-- (conversations / conversation_members / messages, migration 0010) and the
-- directed blocks table (0012). This migration:
--   * adds lifecycle + context + message-type columns the app needs,
--   * enforces deterministic de-duplication of active conversations,
--   * TIGHTENS message privacy: conversation/message reads are participant-only.
--     School staff and platform admins NO LONGER read private message content
--     (the Phase 1A policies granted staff read; Phase 1G forbids a broad
--     moderator/admin read-all). Any future safety-review access must go through
--     an explicit report + authorization path (the reports table already exists),
--     not an ambient policy.
--   * adds SECURITY DEFINER helpers to start a conversation (with both members +
--     a system message, atomically and idempotently) and to compute per-user
--     unread counts.

-- ---------------------------------------------------------------- enums -------
create type conversation_status as enum ('active', 'archived', 'closed');
create type message_type as enum ('text', 'system');
-- Prepared for a future production moderation pipeline; only 'clear' is used now.
create type message_moderation_status as enum ('clear', 'flagged', 'hidden');

-- --------------------------------------------------------- conversations ------
alter table conversations
  add column status          conversation_status not null default 'active',
  add column last_message_at timestamptz not null default now(),
  add column listing_id      uuid references listings (id) on delete set null,
  add column market_id       uuid references markets (id) on delete set null,
  add column stall_id        uuid references stalls (id) on delete set null,
  -- Canonical de-dup key: sorted(participant pair) + context. A partial unique
  -- index keeps at most ONE active conversation per pair per context.
  add column dedup_key       text;

create unique index conversations_dedup_active
  on conversations (dedup_key) where status = 'active' and dedup_key is not null;
create index conversations_inbox_idx on conversations (school_id, last_message_at desc);
create index conversations_listing_idx on conversations (listing_id);
create index conversations_market_idx on conversations (market_id);

-- ----------------------------------------------------- conversation_members ---
alter table conversation_members
  add column last_read_message_id uuid references messages (id) on delete set null;

-- --------------------------------------------------------------- messages -----
alter table messages
  add column type             message_type not null default 'text',
  add column edited_at        timestamptz,
  add column deleted_at       timestamptz,
  add column moderation_status message_moderation_status not null default 'clear';

-- System messages have no human sender; user messages must have one.
alter table messages alter column sender_id drop not null;
alter table messages add constraint messages_sender_by_type check (
  (type = 'system' and sender_id is null) or (type <> 'system' and sender_id is not null)
);

-- ------------------------------------------------- tighten read privacy -------
-- Participant-only reads. Removing the staff/platform clauses is the whole point:
-- private messages are not readable by moderators or admins by default.
drop policy conversations_select on conversations;
create policy conversations_select on conversations for select to authenticated
  using (app.is_conversation_member(id));

drop policy conv_members_select on conversation_members;
create policy conv_members_select on conversation_members for select to authenticated
  using (app.is_conversation_member(conversation_id));

drop policy messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (app.is_conversation_member(conversation_id));

-- Conversations are created ONLY through app.start_conversation (SECURITY DEFINER),
-- which guarantees both members, same-school verification, block checks, and
-- de-dup. Drop the direct client INSERT path so no malformed/half conversation
-- (one member, wrong school) can be created.
drop policy conversations_insert on conversations;

-- Users may only insert their OWN text messages into an active conversation they
-- belong to, when not blocked. System messages are inserted by the definer
-- function only. `type = 'text'` stops a user forging a system message.
drop policy messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and type = 'text'
    and app.is_conversation_member(conversation_id)
    and app.is_verified_member(school_id)
    and not app.has_block_in_conversation(conversation_id, auth.uid())
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and c.status = 'active' and c.school_id = messages.school_id
    )
  );

-- A sender may edit / soft-delete their OWN message (edited_at / deleted_at).
create policy messages_update on messages for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ------------------------------------------------- start-conversation RPC -----
-- Idempotent: returns the existing active conversation for the same pair+context,
-- else creates it with both members + a system message. All the security checks
-- (same verified school, not blocked) live here so clients cannot bypass them.
create or replace function app.start_conversation(
  p_other   uuid,
  p_listing uuid default null,
  p_market  uuid default null,
  p_stall   uuid default null
) returns uuid
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_me      uuid := auth.uid();
  v_school  uuid;
  v_ctx     text;
  v_key     text;
  v_conv    uuid;
  v_created boolean := false;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_other = v_me then
    raise exception 'cannot_message_self' using errcode = '22023';
  end if;

  -- Both users must hold a VERIFIED membership in the SAME school.
  select m_self.school_id into v_school
  from public.school_memberships m_self
  join public.school_memberships m_other on m_other.school_id = m_self.school_id
  where m_self.user_id = v_me and m_self.status = 'verified'
    and m_other.user_id = p_other and m_other.status = 'verified'
  limit 1;
  if v_school is null then
    raise exception 'not_same_verified_school' using errcode = '42501';
  end if;

  -- No conversation across a directed block (either direction).
  if app.is_blocked_between(v_me, p_other) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  v_ctx := coalesce('l:' || p_listing::text, 'm:' || p_market::text, 's:' || p_stall::text, 'direct');
  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text || ':' || v_ctx;

  -- Fast path: reuse the existing active conversation for this pair+context.
  select id into v_conv from public.conversations where dedup_key = v_key and status = 'active' limit 1;
  if v_conv is not null then
    return v_conv;
  end if;

  begin
    insert into public.conversations
      (school_id, context_type, context_id, listing_id, market_id, stall_id, status, dedup_key, last_message_at)
    values
      (v_school,
       case when p_listing is not null then 'listing'::conversation_context else 'direct'::conversation_context end,
       coalesce(p_listing, p_market, p_stall),
       p_listing, p_market, p_stall, 'active', v_key, now())
    returning id into v_conv;
    v_created := true;
  exception when unique_violation then
    -- Raced with a concurrent create; reuse the winner.
    select id into v_conv from public.conversations where dedup_key = v_key and status = 'active' limit 1;
    v_created := false;
  end;

  if v_created then
    insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_me), (v_conv, p_other);
    insert into public.messages (conversation_id, school_id, sender_id, type, body)
      values (v_conv, v_school, null, 'system', 'Conversation started');
  end if;

  return v_conv;
end;
$$;
revoke execute on function app.start_conversation(uuid, uuid, uuid, uuid) from public;
grant execute on function app.start_conversation(uuid, uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------- unread-count helper -----
-- Per-user unread counts (messages after the caller's last_read_at, not their own,
-- not soft-deleted). Definer so a single round-trip powers the inbox + badge.
create or replace function app.conversation_unread_counts()
returns table (conversation_id uuid, unread integer)
language sql
stable
security definer
set search_path = app, public, auth, pg_catalog
as $$
  select cm.conversation_id, count(m.id)::int as unread
  from public.conversation_members cm
  join public.messages m on m.conversation_id = cm.conversation_id
  where cm.user_id = auth.uid()
    and m.sender_id is distinct from auth.uid()
    and m.deleted_at is null
    and m.created_at > cm.last_read_at
  group by cm.conversation_id;
$$;
revoke execute on function app.conversation_unread_counts() from public;
grant execute on function app.conversation_unread_counts() to authenticated, service_role;

-- ------------------------------------------- keep last_message_at fresh -------
create or replace function app.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
begin
  update public.conversations
     set last_message_at = new.created_at, updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;
revoke execute on function app.touch_conversation_on_message() from public;

create trigger messages_touch_conversation after insert on messages
  for each row execute function app.touch_conversation_on_message();
