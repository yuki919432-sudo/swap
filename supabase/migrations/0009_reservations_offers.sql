-- 0009_reservations_offers.sql
-- Correction #1: listing double-booking is prevented by a dedicated reservation
-- table with a PARTIAL UNIQUE INDEX. A cross-table unique index over
-- offer_items + offers is impossible in Postgres; this table makes the invariant
-- enforceable at the storage layer. Offer acceptance (0017) fills these rows
-- inside a single transaction after locking + validating every listing.

create table offers (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools (id) on delete cascade,
  listing_id     uuid references listings (id) on delete set null, -- primary/context listing
  from_user_id   uuid not null references users (id) on delete cascade,
  to_user_id     uuid not null references users (id) on delete cascade,
  message        text check (message is null or length(message) <= 2000),
  proposed_location_id uuid references safe_handoff_locations (id) on delete set null,
  proposed_at    timestamptz,
  status         offer_status not null default 'sent',
  parent_offer_id uuid references offers (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);
comment on table offers is 'Structured exchange offers, supporting N:M items and counteroffers (parent_offer_id).';
create index offers_school_idx on offers (school_id, status);
create index offers_to_user_idx on offers (to_user_id, status);
create index offers_from_user_idx on offers (from_user_id, status);

create table offer_items (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references offers (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  direction  offer_item_direction not null,
  created_at timestamptz not null default now(),
  unique (offer_id, listing_id, direction)
);
create index offer_items_offer_idx on offer_items (offer_id);
create index offer_items_listing_idx on offer_items (listing_id);

create table transactions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools (id) on delete cascade,
  offer_id     uuid not null unique references offers (id) on delete cascade,
  status       transaction_status not null default 'handoff_pending',
  handoff_location_id uuid references safe_handoff_locations (id) on delete set null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  disputed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table transactions is 'Created atomically when an offer is accepted. Preserved (never hard-deleted).';
create index transactions_school_idx on transactions (school_id, status);

-- The reservation lock table.
create table listing_reservations (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools (id) on delete cascade,
  listing_id     uuid not null references listings (id) on delete cascade,
  offer_id       uuid not null references offers (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete cascade,
  reserved_by    uuid not null references users (id) on delete cascade,
  status         reservation_status not null default 'active',
  created_at     timestamptz not null default now(),
  released_at    timestamptz
);
comment on table listing_reservations is
  'One ACTIVE reservation per listing (partial unique index). Prevents double-booking at the storage layer.';

-- The core invariant: a listing may have at most one ACTIVE reservation.
create unique index one_active_reservation_per_listing
  on listing_reservations (listing_id)
  where status = 'active';

create index listing_reservations_offer_idx on listing_reservations (offer_id);
create index listing_reservations_txn_idx on listing_reservations (transaction_id);

-- Bilateral handoff confirmation. One row per (transaction, user); a transaction
-- only completes when BOTH parties have a row (enforced in app.confirm_handoff).
create table handoff_confirmations (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  user_id        uuid not null references users (id) on delete cascade,
  confirmed_at   timestamptz not null default now(),
  unique (transaction_id, user_id)
);

create table transaction_feedback (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  from_user_id   uuid not null references users (id) on delete cascade,
  to_user_id     uuid not null references users (id) on delete cascade,
  rating         int not null check (rating between 1 and 5),
  comment        text check (comment is null or length(comment) <= 2000),
  created_at     timestamptz not null default now(),
  unique (transaction_id, from_user_id)
);

create trigger offers_set_updated_at before update on offers
  for each row execute function app.set_updated_at();
create trigger transactions_set_updated_at before update on transactions
  for each row execute function app.set_updated_at();
