-- 0022_storage.sql
-- Storage buckets and object policies.
--
-- The `storage` schema exists on Supabase but NOT on a bare local Postgres used
-- for pgTAP runs, so the whole migration is guarded: it applies on Supabase and
-- is skipped (with a NOTICE) locally. Storage isolation mirrors table RLS:
-- the FIRST path segment is the tenant key.
--
-- Path conventions (documented in docs/storage.md):
--   listing-images/<school_id>/<listing_id>/<file>
--   event-covers/<school_id>/<event_id>/<file>
--   message-attachments/<school_id>/<conversation_id>/<file>
--   avatars/<user_id>/<file>

do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'storage schema not present (local/pgTAP run) — skipping storage buckets/policies';
    return;
  end if;

  -- Buckets (private; per-file MIME + size limits). 5 MiB image cap.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('listing-images', 'listing-images', false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    ('event-covers', 'event-covers', false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    ('avatars', 'avatars', false, 2097152,
     array['image/jpeg', 'image/png', 'image/webp']),
    ('message-attachments', 'message-attachments', false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do nothing;

  -- ---- listing-images: read = verified member of the school in path[1];
  --      write = owner of the listing in path[2].
  -- Read = verified member OR school staff (for moderation) OR platform admin,
  -- mirroring the table-level content-read rule. Staff need read access so they
  -- can moderate/remove objects (a DELETE must be able to see the row).
  execute $p$
    create policy listing_images_read on storage.objects for select to authenticated
    using (bucket_id = 'listing-images'
           and (app.is_verified_member(((storage.foldername(name))[1])::uuid)
                or app.is_school_staff(((storage.foldername(name))[1])::uuid)
                or app.is_platform_admin()));
  $p$;
  execute $p$
    create policy listing_images_write on storage.objects for insert to authenticated
    with check (bucket_id = 'listing-images'
                and app.is_verified_member(((storage.foldername(name))[1])::uuid)
                and exists (select 1 from public.listings l
                            where l.id = ((storage.foldername(name))[2])::uuid
                              and l.owner_id = auth.uid()));
  $p$;
  execute $p$
    create policy listing_images_delete on storage.objects for delete to authenticated
    using (bucket_id = 'listing-images'
           and exists (select 1 from public.listings l
                       where l.id = ((storage.foldername(name))[2])::uuid
                         and (l.owner_id = auth.uid()
                              or app.has_school_role(l.school_id, 'school_owner', 'school_admin', 'school_moderator'))));
  $p$;

  -- ---- event-covers: read = verified member; write = event organizer.
  execute $p$
    create policy event_covers_read on storage.objects for select to authenticated
    using (bucket_id = 'event-covers'
           and (app.is_verified_member(((storage.foldername(name))[1])::uuid)
                or app.is_school_staff(((storage.foldername(name))[1])::uuid)
                or app.is_platform_admin()));
  $p$;
  execute $p$
    create policy event_covers_write on storage.objects for insert to authenticated
    with check (bucket_id = 'event-covers'
                and exists (select 1 from public.events e
                            where e.id = ((storage.foldername(name))[2])::uuid
                              and e.organizer_id = auth.uid()));
  $p$;

  -- ---- avatars: a user manages only their own folder (path[1] = user_id).
  execute $p$
    create policy avatars_read on storage.objects for select to authenticated
    using (bucket_id = 'avatars');
  $p$;
  execute $p$
    create policy avatars_write on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());
  $p$;
  execute $p$
    create policy avatars_delete on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and ((storage.foldername(name))[1])::uuid = auth.uid());
  $p$;

  -- ---- message-attachments: read/write limited to conversation members.
  execute $p$
    create policy message_attachments_read on storage.objects for select to authenticated
    using (bucket_id = 'message-attachments'
           and (app.is_conversation_member(((storage.foldername(name))[2])::uuid)
                or app.is_school_staff(((storage.foldername(name))[1])::uuid)
                or app.is_platform_admin()));
  $p$;
  execute $p$
    create policy message_attachments_write on storage.objects for insert to authenticated
    with check (bucket_id = 'message-attachments'
                and app.is_verified_member(((storage.foldername(name))[1])::uuid)
                and app.is_conversation_member(((storage.foldername(name))[2])::uuid));
  $p$;
end;
$$;
