-- 02_storage_stub.sql  (LOCAL / TEST ONLY — never applied on Supabase)
--
-- A faithful local replica of the Supabase `storage` schema, sufficient to make
-- migration 0022_storage.sql apply and to test its object RLS policies exactly
-- as they run in production. This validates the policy LOGIC (tenant isolation,
-- ownership, moderation, path extraction). It does NOT exercise the Supabase
-- storage SERVICE (multipart upload, signed URLs, MIME/size enforcement) — that
-- remains a manual/integration check documented in docs/storage.md.
--
-- Applied by scripts/db-test-storage.sh AFTER the bootstrap and BEFORE the
-- migrations, so 0022 finds the storage schema present.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

-- Matches Supabase semantics: the path segments EXCLUDING the final filename.
-- 'school/listing/f.jpg' -> {school,listing}; 'nofolder.jpg' -> {} (so [1] IS NULL).
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;
