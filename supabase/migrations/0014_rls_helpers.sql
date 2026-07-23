-- 0014_rls_helpers.sql
-- Authorization helper functions used by RLS policies and RPC functions.
--
-- All authorization helpers are SECURITY DEFINER and owned by the migration role
-- so they can read membership/admin tables WITHOUT triggering those tables' RLS
-- (this avoids recursive policy evaluation). search_path is pinned so a caller
-- cannot shadow `public`/`auth` with objects in a writable schema.

-- ---------------------------------------------------------- small utilities --
create or replace function app.normalize_email(p_email text)
returns text language sql immutable as $$
  select lower(btrim(p_email));
$$;

create or replace function app.hash_email(p_email text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(app.normalize_email(p_email), 'UTF8')), 'hex');
$$;

-- Deterministic hash for invitation/OTP codes. High-entropy input, so a plain
-- sha256 is appropriate (and never stores the plaintext code).
create or replace function app.hash_code(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(btrim(p_code), 'UTF8')), 'hex');
$$;

create or replace function app.jwt_aal()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

-- ------------------------------------------------------ membership helpers --
create or replace function app.is_verified_member(p_school uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'verified'
  );
$$;
comment on function app.is_verified_member(uuid) is
  'True only for status=verified. Suspended/pending/left/expired are excluded, so they cannot read tenant content.';

-- Any active school staff member (owner/admin/moderator/reviewer) for a school.
create or replace function app.is_school_staff(p_school uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1 from public.school_admins a
    where a.user_id = auth.uid()
      and a.school_id = p_school
      and a.active
  );
$$;

-- Active staff member holding one of the specified roles for a school.
create or replace function app.has_school_role(p_school uuid, variadic p_roles school_role[])
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1 from public.school_admins a
    where a.user_id = auth.uid()
      and a.school_id = p_school
      and a.active
      and a.role = any (p_roles)
  );
$$;

-- ------------------------------------------------------- platform helpers --
-- Correction #4: platform access requires an ACTIVE row AND MFA (aal2).
create or replace function app.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select app.jwt_aal() = 'aal2'
     and exists (
       select 1 from public.platform_admins pa
       where pa.user_id = auth.uid()
         and pa.active
     );
$$;
comment on function app.is_platform_admin() is
  'Requires JWT aal2 (MFA) AND an active platform_admins row. A non-MFA session returns false even for a real platform admin.';

create or replace function app.has_platform_role(variadic p_roles platform_role[])
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select app.jwt_aal() = 'aal2'
     and exists (
       select 1 from public.platform_admins pa
       where pa.user_id = auth.uid()
         and pa.active
         and pa.role = any (p_roles)
     );
$$;

-- ----------------------------------------------------- conversation helper --
create or replace function app.is_conversation_member(p_conversation uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = auth.uid()
  );
$$;

-- Is there a directed block between two users (in either direction)?
create or replace function app.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Do the current user and p_other both hold a verified membership in a common
-- school? Gates public-profile visibility so cross-school users stay invisible.
create or replace function app.shares_verified_school(p_other uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.school_memberships m_self
    join public.school_memberships m_other
      on m_other.school_id = m_self.school_id
    where m_self.user_id = auth.uid()
      and m_self.status = 'verified'
      and m_other.user_id = p_other
      and m_other.status = 'verified'
  );
$$;

-- Is p_user blocked to/from any OTHER member of the conversation? Used to stop a
-- blocked user from sending new messages into a shared conversation.
create or replace function app.has_block_in_conversation(p_conversation uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = app, public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.blocks b
      on (b.blocker_id = cm.user_id and b.blocked_id = p_user)
      or (b.blocker_id = p_user and b.blocked_id = cm.user_id)
    where cm.conversation_id = p_conversation
      and cm.user_id <> p_user
  );
$$;
