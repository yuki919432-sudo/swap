-- 0018_functions_offers.sql
-- Exchange lifecycle as atomic, authorization-checked functions. Clients have
-- no direct write access to offers/transactions/reservations (see 0016); these
-- functions are the only mutation path, so invariants live in one place.

-- --------------------------------------------------------------- create_offer
create or replace function app.create_offer(
  p_school uuid,
  p_to_user uuid,
  p_items jsonb,                 -- [{ "listing_id": uuid, "direction": "offered"|"requested" }, ...]
  p_message text default null,
  p_listing_id uuid default null,
  p_proposed_location_id uuid default null,
  p_proposed_at timestamptz default null,
  p_parent_offer_id uuid default null
)
returns offers
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_offer offers;
  v_item jsonb;
  v_listing listings;
  v_has_offered boolean := false;
  v_has_requested boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_uid = p_to_user then raise exception 'cannot_offer_to_self'; end if;
  if not app.is_verified_member(p_school) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if app.is_blocked_between(v_uid, p_to_user) then raise exception 'blocked' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'offer_requires_items';
  end if;

  insert into offers (school_id, listing_id, from_user_id, to_user_id, message,
                      proposed_location_id, proposed_at, status, parent_offer_id)
  values (p_school, p_listing_id, v_uid, p_to_user, p_message,
          p_proposed_location_id, p_proposed_at, 'sent', p_parent_offer_id)
  returning * into v_offer;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_listing from listings where id = (v_item->>'listing_id')::uuid;
    if not found then raise exception 'listing_not_found'; end if;
    if v_listing.school_id <> p_school then raise exception 'cross_school_listing' using errcode = '42501'; end if;
    insert into offer_items (offer_id, listing_id, direction)
    values (v_offer.id, v_listing.id, (v_item->>'direction')::offer_item_direction);
    if (v_item->>'direction') = 'offered' then v_has_offered := true; end if;
    if (v_item->>'direction') = 'requested' then v_has_requested := true; end if;
  end loop;

  if not (v_has_offered and v_has_requested) then
    raise exception 'offer_requires_offered_and_requested_items';
  end if;

  -- If this is a counteroffer, mark the parent countered.
  if p_parent_offer_id is not null then
    update offers set status = 'countered'
     where id = p_parent_offer_id and to_user_id = v_uid and status = 'sent';
  end if;

  perform app.write_audit('student', p_school, 'offer_created', 'offer', v_offer.id, '{}'::jsonb);
  return v_offer;
end;
$$;

-- --------------------------------------------------------------- accept_offer
-- Correction #1: atomic acceptance. Validate ALL listings under row locks, THEN
-- reserve. The partial unique index one_active_reservation_per_listing makes
-- concurrent double-acceptance impossible; a failure rolls back the whole
-- function, so no listing is ever left partially reserved.
create or replace function app.accept_offer(p_offer uuid)
returns transactions
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_offer offers;
  v_txn transactions;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select * into v_offer from offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.to_user_id <> v_uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status <> 'sent' then raise exception 'invalid_offer_state'; end if;

  -- Phase 1 — lock + validate every involved listing before mutating anything.
  for r in
    select l.* from offer_items oi join listings l on l.id = oi.listing_id
    where oi.offer_id = p_offer
    for update of l
  loop
    if r.school_id <> v_offer.school_id then raise exception 'cross_school_listing'; end if;
    if r.deleted_at is not null or r.status <> 'active' then
      raise exception 'listing_not_available:%', r.id;
    end if;
    if exists (select 1 from listing_reservations lr where lr.listing_id = r.id and lr.status = 'active') then
      raise exception 'listing_already_reserved:%', r.id;
    end if;
  end loop;

  -- Phase 2 — create transaction, reservations, and flip listing statuses.
  insert into transactions (school_id, offer_id, status, handoff_location_id, scheduled_at)
  values (v_offer.school_id, v_offer.id, 'handoff_pending', v_offer.proposed_location_id, v_offer.proposed_at)
  returning * into v_txn;

  for r in select l.id from offer_items oi join listings l on l.id = oi.listing_id where oi.offer_id = p_offer
  loop
    insert into listing_reservations (school_id, listing_id, offer_id, transaction_id, reserved_by, status)
    values (v_offer.school_id, r.id, v_offer.id, v_txn.id, v_uid, 'active');
    update listings set status = 'reserved' where id = r.id;
  end loop;

  update offers set status = 'accepted' where id = v_offer.id;

  perform app.write_audit('student', v_offer.school_id, 'offer_accepted', 'transaction', v_txn.id,
                          jsonb_build_object('offer_id', v_offer.id));
  return v_txn;
end;
$$;

-- --------------------------------------------------------------- decline / cancel
create or replace function app.decline_offer(p_offer uuid)
returns offers
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_uid uuid := auth.uid(); v_offer offers;
begin
  select * into v_offer from offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.to_user_id <> v_uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status <> 'sent' then raise exception 'invalid_offer_state'; end if;
  update offers set status = 'declined' where id = p_offer returning * into v_offer;
  perform app.write_audit('student', v_offer.school_id, 'offer_declined', 'offer', p_offer, '{}'::jsonb);
  return v_offer;
end;
$$;

create or replace function app.cancel_offer(p_offer uuid)
returns offers
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_uid uuid := auth.uid(); v_offer offers;
begin
  select * into v_offer from offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_offer.from_user_id <> v_uid then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_offer.status not in ('draft', 'sent') then raise exception 'invalid_offer_state'; end if;
  update offers set status = 'cancelled' where id = p_offer returning * into v_offer;
  return v_offer;
end;
$$;

-- --------------------------------------------------------------- confirm_handoff
-- Bilateral: the transaction only completes once BOTH parties have confirmed.
create or replace function app.confirm_handoff(p_transaction uuid)
returns transactions
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_txn transactions;
  v_offer offers;
  v_both int;
begin
  select * into v_txn from transactions where id = p_transaction for update;
  if not found then raise exception 'transaction_not_found'; end if;
  select * into v_offer from offers where id = v_txn.offer_id;
  if v_uid not in (v_offer.from_user_id, v_offer.to_user_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_txn.status <> 'handoff_pending' then raise exception 'invalid_transaction_state'; end if;

  insert into handoff_confirmations (transaction_id, user_id)
  values (p_transaction, v_uid)
  on conflict (transaction_id, user_id) do nothing;

  -- Count DISTINCT confirmations from the two actual participants only.
  select count(distinct user_id) into v_both
  from handoff_confirmations
  where transaction_id = p_transaction
    and user_id in (v_offer.from_user_id, v_offer.to_user_id);

  if v_both >= 2 then
    update transactions set status = 'completed', completed_at = now()
     where id = p_transaction returning * into v_txn;
    update offers set status = 'completed' where id = v_offer.id;
    update listings set status = 'completed'
     where id in (select listing_id from listing_reservations where transaction_id = p_transaction);
    update listing_reservations set status = 'completed', released_at = now()
     where transaction_id = p_transaction;
    perform app.write_audit('student', v_txn.school_id, 'transaction_completed', 'transaction', v_txn.id, '{}'::jsonb);
  end if;

  return v_txn;
end;
$$;

-- --------------------------------------------------------------- join_event
-- Capacity is enforced atomically: the event row lock serializes concurrent
-- joins, so the count check cannot be raced past max_participants.
create or replace function app.join_event(p_event uuid)
returns event_participants
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_event events;
  v_count int;
  v_row event_participants;
begin
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if not app.is_verified_member(v_event.school_id) then raise exception 'not_a_member' using errcode = '42501'; end if;
  if v_event.status not in ('published', 'full') then raise exception 'event_not_open'; end if;

  if v_event.max_participants is not null then
    select count(*) into v_count from event_participants where event_id = p_event;
    if v_count >= v_event.max_participants then raise exception 'event_full'; end if;
  end if;

  insert into event_participants (event_id, user_id) values (p_event, v_uid)
  on conflict (event_id, user_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from event_participants where event_id = p_event and user_id = v_uid;
  end if;

  -- Flip to full when capacity is now reached.
  if v_event.max_participants is not null then
    select count(*) into v_count from event_participants where event_id = p_event;
    if v_count >= v_event.max_participants then
      update events set status = 'full' where id = p_event and status = 'published';
    end if;
  end if;

  return v_row;
end;
$$;

-- --------------------------------------------------------------- get_member_email
-- Correction #9: the ONLY application path to a member's email. Role-restricted
-- and audit-logged. Regular students can never reach this data.
create or replace function app.get_member_email(p_membership uuid)
returns text
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
declare
  v_m school_memberships;
  v_email text;
begin
  select * into v_m from school_memberships where id = p_membership;
  if not found then raise exception 'membership_not_found'; end if;

  if not (app.has_school_role(v_m.school_id, 'school_owner', 'school_admin', 'membership_reviewer')
          or app.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select email into v_email from private.user_emails where user_id = v_m.user_id;

  perform app.write_audit(
    case when app.is_platform_admin() then 'platform' else 'school_admin' end,
    v_m.school_id, 'member_email_accessed', 'user', v_m.user_id, '{}'::jsonb);

  return v_email;
end;
$$;

grant execute on function app.create_offer(uuid, uuid, jsonb, text, uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function app.accept_offer(uuid) to authenticated;
grant execute on function app.decline_offer(uuid) to authenticated;
grant execute on function app.cancel_offer(uuid) to authenticated;
grant execute on function app.confirm_handoff(uuid) to authenticated;
grant execute on function app.join_event(uuid) to authenticated;
grant execute on function app.get_member_email(uuid) to authenticated;
