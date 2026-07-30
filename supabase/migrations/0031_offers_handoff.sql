-- 0031_offers_handoff.sql
-- Structured offers + handoff coordination on top of the Phase 1G messaging
-- system, reusing the Phase 1A reservation invariant (one ACTIVE reservation per
-- listing, migration 0009) and the offers/transactions/reservations tables.
--
-- Design:
--   * Offers are conversation-centered: every offer belongs to a conversation and
--     surfaces as a card; each transition drops a system message into the thread.
--   * Acceptance is ATOMIC and concurrency-safe — it locks + validates the listings
--     then inserts listing_reservations, whose partial unique index makes a second
--     accept for the same item impossible (the loser gets a clear error).
--   * Privacy is participant-only: the Phase 1A staff/platform read clauses on
--     offers/transactions/reservations are dropped. Moderators do NOT get offer
--     access; future review goes through the reports table.
--   * NO payments/deposits/ratings. Sale is a modelled kind but not enabled.

-- ---------------------------------------------------------------- enums -------
-- Live/actionable state for the conversation-centered flow (distinct from the
-- Phase 1A 'sent' used by the legacy app.* offer functions).
alter type offer_status add value if not exists 'pending';

create type offer_kind as enum ('give', 'swap', 'borrow', 'lend', 'sale');
create type handoff_status as enum ('not_scheduled', 'scheduled', 'ready', 'completed', 'cancelled', 'disputed');
-- Borrow/lend item flow: collection and return are DISTINCT events.
create type handoff_stage as enum ('none', 'handed_over', 'return_due', 'returned');

-- ---------------------------------------------------- extend offers/txns ------
alter table offers
  add column kind               offer_kind not null default 'give',
  add column conversation_id    uuid references conversations (id) on delete set null,
  add column offered_listing_id uuid references listings (id) on delete set null,
  add column handoff_location_text text check (handoff_location_text is null or length(handoff_location_text) <= 200),
  add column return_by          timestamptz,
  add column expires_at         timestamptz;
create index offers_conversation_idx on offers (conversation_id, status);

alter table transactions
  add column kind                 offer_kind,
  add column handoff_status       handoff_status not null default 'not_scheduled',
  add column handoff_stage        handoff_stage not null default 'none',
  add column handoff_location_text text,
  add column return_by            timestamptz,
  add column handed_over_at       timestamptz,
  add column returned_at          timestamptz;

-- --------------------------------------------- tighten offer privacy ----------
drop policy offers_select on offers;
create policy offers_select on offers for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy offer_items_select on offer_items;
create policy offer_items_select on offer_items for select to authenticated
  using (exists (select 1 from offers o where o.id = offer_items.offer_id
                   and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())));

drop policy transactions_select on transactions;
create policy transactions_select on transactions for select to authenticated
  using (exists (select 1 from offers o where o.id = transactions.offer_id
                   and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())));

drop policy reservations_select on listing_reservations;
create policy reservations_select on listing_reservations for select to authenticated
  using (reserved_by = auth.uid()
         or exists (select 1 from offers o where o.id = listing_reservations.offer_id
                      and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())));

drop policy handoff_conf_select on handoff_confirmations;
create policy handoff_conf_select on handoff_confirmations for select to authenticated
  using (exists (select 1 from transactions t join offers o on o.id = t.offer_id
                   where t.id = handoff_confirmations.transaction_id
                     and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())));

-- ------------------------------------------------ internal helper -------------
-- Post a system message into the offer's conversation (best-effort; offers not
-- tied to a conversation simply skip it). Runs inside the definer functions.
create or replace function app.post_offer_system_message(p_conversation uuid, p_school uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
begin
  if p_conversation is null then return; end if;
  insert into public.messages (conversation_id, school_id, sender_id, type, body)
  values (p_conversation, p_school, null, 'system', p_body);
end;
$$;
revoke execute on function app.post_offer_system_message(uuid, uuid, text) from public;

-- ================================================= create_exchange_offer ======
create or replace function public.create_exchange_offer(
  p_conversation    uuid,
  p_kind            offer_kind,
  p_listing         uuid,
  p_offered_listing uuid default null,
  p_note            text default null,
  p_handoff_at      timestamptz default null,
  p_location_text   text default null,
  p_location_id     uuid default null,
  p_return_by       timestamptz default null,
  p_expires_at      timestamptz default null
) returns offers
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_me      uuid := auth.uid();
  v_conv    conversations;
  v_other   uuid;
  v_listing listings;
  v_offered listings;
  v_offer   offers;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind = 'sale' then raise exception 'sale_not_enabled'; end if;

  select * into v_conv from public.conversations where id = p_conversation;
  if not found then raise exception 'conversation_not_found'; end if;
  if not app.is_conversation_member(p_conversation) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not app.is_verified_member(v_conv.school_id) then raise exception 'not_a_member' using errcode = '42501'; end if;

  select user_id into v_other from public.conversation_members
   where conversation_id = p_conversation and user_id <> v_me limit 1;
  if v_other is null then raise exception 'no_counterpart'; end if;
  if app.is_blocked_between(v_me, v_other) then raise exception 'blocked' using errcode = '42501'; end if;

  -- Only one live/actionable offer per conversation chain at a time.
  if exists (select 1 from public.offers o where o.conversation_id = p_conversation and o.status = 'pending') then
    raise exception 'offer_already_active';
  end if;

  select * into v_listing from public.listings where id = p_listing for update;
  if not found then raise exception 'listing_not_found'; end if;
  if v_listing.school_id <> v_conv.school_id then raise exception 'cross_school_listing' using errcode = '42501'; end if;
  if v_listing.deleted_at is not null or v_listing.status <> 'active' then raise exception 'listing_not_available'; end if;

  -- Ownership by kind. Lend = the caller offers THEIR item; everything else = the
  -- caller requests the OTHER participant's item.
  if p_kind = 'lend' then
    if v_listing.owner_id <> v_me then raise exception 'not_listing_owner' using errcode = '42501'; end if;
  else
    if v_listing.owner_id = v_me then raise exception 'cannot_request_own_listing'; end if;
    if v_listing.owner_id <> v_other then raise exception 'listing_not_counterpart_owned'; end if;
  end if;

  -- Swap: the caller must own the offered listing; it must be a different, valid item.
  if p_kind = 'swap' then
    if p_offered_listing is null then raise exception 'swap_requires_offered_listing'; end if;
    if p_offered_listing = p_listing then raise exception 'cannot_swap_same_listing'; end if;
    select * into v_offered from public.listings where id = p_offered_listing for update;
    if not found then raise exception 'offered_listing_not_found'; end if;
    if v_offered.owner_id <> v_me then raise exception 'not_offered_listing_owner' using errcode = '42501'; end if;
    if v_offered.school_id <> v_conv.school_id then raise exception 'cross_school_listing' using errcode = '42501'; end if;
    if v_offered.deleted_at is not null or v_offered.status <> 'active' then raise exception 'offered_listing_not_available'; end if;
  end if;

  insert into public.offers (school_id, conversation_id, kind, listing_id, offered_listing_id,
                             from_user_id, to_user_id, message, proposed_location_id, proposed_at,
                             handoff_location_text, return_by, expires_at, status)
  values (v_conv.school_id, p_conversation, p_kind, p_listing,
          case when p_kind = 'swap' then p_offered_listing else null end,
          v_me, v_other, p_note, p_location_id, p_handoff_at,
          p_location_text, case when p_kind in ('borrow', 'lend') then p_return_by else null end,
          p_expires_at, 'pending')
  returning * into v_offer;

  -- Requested + (swap) offered items recorded for the reservation step.
  insert into public.offer_items (offer_id, listing_id, direction) values (v_offer.id, p_listing, 'requested');
  if p_kind = 'swap' then
    insert into public.offer_items (offer_id, listing_id, direction) values (v_offer.id, p_offered_listing, 'offered');
  end if;

  perform app.post_offer_system_message(p_conversation, v_conv.school_id, '📦 Sent a ' || p_kind::text || ' offer');
  perform app.write_audit('student', v_conv.school_id, 'offer_created', 'offer', v_offer.id, '{}'::jsonb);
  return v_offer;
end;
$$;

-- ================================================= accept_exchange_offer ======
-- Atomic + concurrency-safe: lock/validate the listings, then reserve them. The
-- one_active_reservation_per_listing partial unique index means a second accept
-- for an already-reserved item fails and the whole call rolls back.
create or replace function public.accept_exchange_offer(p_offer uuid)
returns transactions
language plpgsql
security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_me    uuid := auth.uid();
  v_offer offers;
  v_txn   transactions;
  r       record;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_offer from public.offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.to_user_id <> v_me then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status <> 'pending' then raise exception 'invalid_offer_state'; end if;
  if app.is_blocked_between(v_offer.from_user_id, v_offer.to_user_id) then raise exception 'blocked' using errcode = '42501'; end if;

  -- Lock + validate every involved listing BEFORE mutating anything.
  for r in
    select l.* from public.offer_items oi join public.listings l on l.id = oi.listing_id
    where oi.offer_id = p_offer for update of l
  loop
    if r.school_id <> v_offer.school_id then raise exception 'cross_school_listing' using errcode = '42501'; end if;
    if r.deleted_at is not null or r.status <> 'active' then raise exception 'listing_not_available'; end if;
    if exists (select 1 from public.listing_reservations lr where lr.listing_id = r.id and lr.status = 'active') then
      raise exception 'listing_not_available';  -- already reserved by another accepted offer
    end if;
  end loop;

  insert into public.transactions (school_id, offer_id, kind, status, handoff_status,
                                   handoff_location_id, handoff_location_text, scheduled_at, return_by)
  values (v_offer.school_id, v_offer.id, v_offer.kind, 'handoff_pending',
          case when v_offer.proposed_at is not null or v_offer.proposed_location_id is not null
                    or v_offer.handoff_location_text is not null then 'scheduled'::handoff_status
               else 'not_scheduled'::handoff_status end,
          v_offer.proposed_location_id, v_offer.handoff_location_text, v_offer.proposed_at, v_offer.return_by)
  returning * into v_txn;

  for r in select l.id from public.offer_items oi join public.listings l on l.id = oi.listing_id where oi.offer_id = p_offer
  loop
    insert into public.listing_reservations (school_id, listing_id, offer_id, transaction_id, reserved_by, status)
    values (v_offer.school_id, r.id, v_offer.id, v_txn.id, v_me, 'active');
    update public.listings set status = 'reserved' where id = r.id;
  end loop;

  update public.offers set status = 'accepted' where id = v_offer.id;
  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '✅ Accepted the offer — plan the handoff');
  perform app.write_audit('student', v_offer.school_id, 'offer_accepted', 'transaction', v_txn.id,
                          jsonb_build_object('offer_id', v_offer.id));
  return v_txn;
end;
$$;

-- ================================================= decline / cancel ===========
create or replace function public.decline_exchange_offer(p_offer uuid)
returns offers
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_offer offers;
begin
  select * into v_offer from public.offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.to_user_id <> v_me then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status <> 'pending' then raise exception 'invalid_offer_state'; end if;
  update public.offers set status = 'declined' where id = p_offer returning * into v_offer;
  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '❌ Declined the offer');
  return v_offer;
end;
$$;

create or replace function public.cancel_exchange_offer(p_offer uuid)
returns offers
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_offer offers;
begin
  select * into v_offer from public.offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.from_user_id <> v_me then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status <> 'pending' then raise exception 'invalid_offer_state'; end if;
  update public.offers set status = 'cancelled' where id = p_offer returning * into v_offer;
  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '🚫 Cancelled the offer');
  return v_offer;
end;
$$;

-- ================================================= counter_exchange_offer =====
-- The recipient of the current proposal counters: the parent becomes 'countered'
-- and a new pending offer (parent_offer_id set, from/to swapped) carries the
-- revised terms. The chain preserves history; only the new offer is actionable.
create or replace function public.counter_exchange_offer(
  p_parent          uuid,
  p_offered_listing uuid default null,
  p_note            text default null,
  p_handoff_at      timestamptz default null,
  p_location_text   text default null,
  p_location_id     uuid default null,
  p_return_by       timestamptz default null
) returns offers
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare
  v_me     uuid := auth.uid();
  v_parent offers;
  v_offer  offers;
  v_offered listings;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_parent from public.offers where id = p_parent for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_parent.to_user_id <> v_me then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_parent.status <> 'pending' then raise exception 'invalid_offer_state'; end if;
  if app.is_blocked_between(v_parent.from_user_id, v_parent.to_user_id) then raise exception 'blocked' using errcode = '42501'; end if;

  -- For a swap counter, the counter-proposer (now the sender) may substitute one of
  -- THEIR OWN listings as the offered item.
  if p_offered_listing is not null then
    select * into v_offered from public.listings where id = p_offered_listing for update;
    if not found then raise exception 'offered_listing_not_found'; end if;
    if v_offered.owner_id <> v_me then raise exception 'not_offered_listing_owner' using errcode = '42501'; end if;
    if v_offered.school_id <> v_parent.school_id then raise exception 'cross_school_listing' using errcode = '42501'; end if;
    if v_offered.deleted_at is not null or v_offered.status <> 'active' then raise exception 'offered_listing_not_available'; end if;
  end if;

  update public.offers set status = 'countered' where id = p_parent;

  insert into public.offers (school_id, conversation_id, kind, listing_id, offered_listing_id,
                             from_user_id, to_user_id, message, proposed_location_id, proposed_at,
                             handoff_location_text, return_by, expires_at, status, parent_offer_id)
  values (v_parent.school_id, v_parent.conversation_id, v_parent.kind, v_parent.listing_id,
          coalesce(p_offered_listing, v_parent.offered_listing_id),
          v_me, v_parent.from_user_id, p_note, p_location_id, p_handoff_at,
          p_location_text, case when v_parent.kind in ('borrow', 'lend') then p_return_by else null end,
          v_parent.expires_at, 'pending', p_parent)
  returning * into v_offer;

  insert into public.offer_items (offer_id, listing_id, direction) values (v_offer.id, v_parent.listing_id, 'requested');
  if v_offer.kind = 'swap' and v_offer.offered_listing_id is not null then
    insert into public.offer_items (offer_id, listing_id, direction) values (v_offer.id, v_offer.offered_listing_id, 'offered');
  end if;

  perform app.post_offer_system_message(v_parent.conversation_id, v_parent.school_id, '🔁 Sent a counteroffer');
  return v_offer;
end;
$$;

-- ================================================= handoff plan ===============
create or replace function public.set_handoff_plan(
  p_transaction   uuid,
  p_handoff_at    timestamptz default null,
  p_location_text text default null,
  p_location_id   uuid default null,
  p_ready         boolean default false
) returns transactions
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_txn transactions; v_offer offers;
begin
  select * into v_txn from public.transactions where id = p_transaction for update;
  if not found then raise exception 'transaction_not_found'; end if;
  select * into v_offer from public.offers where id = v_txn.offer_id;
  if v_me not in (v_offer.from_user_id, v_offer.to_user_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_txn.status <> 'handoff_pending' then raise exception 'invalid_transaction_state'; end if;

  update public.transactions
     set scheduled_at = coalesce(p_handoff_at, scheduled_at),
         handoff_location_id = coalesce(p_location_id, handoff_location_id),
         handoff_location_text = coalesce(p_location_text, handoff_location_text),
         handoff_status = case when p_ready then 'ready'::handoff_status else 'scheduled'::handoff_status end
   where id = p_transaction returning * into v_txn;

  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id,
    case when p_ready then '📍 Handoff is ready' else '🗓️ Handoff scheduled' end);
  return v_txn;
end;
$$;

-- ================================================= confirm completion =========
-- Give/Swap: bilateral. The transaction completes only when BOTH participants
-- confirm; then the listings complete and the reservations release.
create or replace function public.confirm_completion(p_transaction uuid)
returns transactions
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_txn transactions; v_offer offers; v_both int;
begin
  select * into v_txn from public.transactions where id = p_transaction for update;
  if not found then raise exception 'transaction_not_found'; end if;
  select * into v_offer from public.offers where id = v_txn.offer_id;
  if v_me not in (v_offer.from_user_id, v_offer.to_user_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_txn.status <> 'handoff_pending' then raise exception 'invalid_transaction_state'; end if;
  if v_txn.kind in ('borrow', 'lend') then raise exception 'use_return_flow_for_borrow_lend'; end if;

  insert into public.handoff_confirmations (transaction_id, user_id) values (p_transaction, v_me)
  on conflict (transaction_id, user_id) do nothing;

  select count(distinct user_id) into v_both from public.handoff_confirmations
   where transaction_id = p_transaction and user_id in (v_offer.from_user_id, v_offer.to_user_id);

  if v_both >= 2 then
    update public.transactions set status = 'completed', handoff_status = 'completed', completed_at = now()
     where id = p_transaction returning * into v_txn;
    update public.offers set status = 'completed' where id = v_offer.id;
    update public.listings set status = 'completed'
     where id in (select listing_id from public.listing_reservations where transaction_id = p_transaction);
    update public.listing_reservations set status = 'completed', released_at = now() where transaction_id = p_transaction;
    perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '🎉 Handoff complete');
    perform app.write_audit('student', v_txn.school_id, 'transaction_completed', 'transaction', v_txn.id, '{}'::jsonb);
  else
    perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '👍 Marked the handoff complete — waiting on the other person');
  end if;
  return v_txn;
end;
$$;

-- ================================================= borrow/lend handover =======
-- The item is handed over (collection). DISTINCT from return.
create or replace function public.mark_handed_over(p_transaction uuid)
returns transactions
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_txn transactions; v_offer offers;
begin
  select * into v_txn from public.transactions where id = p_transaction for update;
  if not found then raise exception 'transaction_not_found'; end if;
  select * into v_offer from public.offers where id = v_txn.offer_id;
  if v_me not in (v_offer.from_user_id, v_offer.to_user_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_txn.kind not in ('borrow', 'lend') then raise exception 'not_a_borrow_lend'; end if;
  if v_txn.status <> 'handoff_pending' then raise exception 'invalid_transaction_state'; end if;

  update public.transactions
     set handoff_stage = 'return_due', handoff_status = 'ready', handed_over_at = now()
   where id = p_transaction returning * into v_txn;
  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '🤝 Item handed over — return expected');
  return v_txn;
end;
$$;

-- The item is returned. Completes the transaction and RESTORES the listing to
-- active (the lent item goes back into circulation).
create or replace function public.mark_returned(p_transaction uuid)
returns transactions
language plpgsql security definer set search_path = app, public, auth, pg_catalog
as $$
declare v_me uuid := auth.uid(); v_txn transactions; v_offer offers;
begin
  select * into v_txn from public.transactions where id = p_transaction for update;
  if not found then raise exception 'transaction_not_found'; end if;
  select * into v_offer from public.offers where id = v_txn.offer_id;
  if v_me not in (v_offer.from_user_id, v_offer.to_user_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_txn.kind not in ('borrow', 'lend') then raise exception 'not_a_borrow_lend'; end if;
  if v_txn.handoff_stage <> 'return_due' then raise exception 'item_not_handed_over'; end if;

  update public.transactions
     set handoff_stage = 'returned', handoff_status = 'completed', status = 'completed',
         returned_at = now(), completed_at = now()
   where id = p_transaction returning * into v_txn;
  update public.offers set status = 'completed' where id = v_offer.id;
  -- Restore the borrowed/lent item to active; release its reservation.
  update public.listings set status = 'active'
   where id in (select listing_id from public.listing_reservations where transaction_id = p_transaction);
  update public.listing_reservations set status = 'released', released_at = now() where transaction_id = p_transaction;
  perform app.post_offer_system_message(v_offer.conversation_id, v_offer.school_id, '↩️ Item returned — all done');
  perform app.write_audit('student', v_txn.school_id, 'borrow_returned', 'transaction', v_txn.id, '{}'::jsonb);
  return v_txn;
end;
$$;

-- ------------------------------------------------------------- grants ---------
grant execute on function public.create_exchange_offer(uuid, offer_kind, uuid, uuid, text, timestamptz, text, uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.accept_exchange_offer(uuid) to authenticated, service_role;
grant execute on function public.decline_exchange_offer(uuid) to authenticated, service_role;
grant execute on function public.cancel_exchange_offer(uuid) to authenticated, service_role;
grant execute on function public.counter_exchange_offer(uuid, uuid, text, timestamptz, text, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.set_handoff_plan(uuid, timestamptz, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.confirm_completion(uuid) to authenticated, service_role;
grant execute on function public.mark_handed_over(uuid) to authenticated, service_role;
grant execute on function public.mark_returned(uuid) to authenticated, service_role;
