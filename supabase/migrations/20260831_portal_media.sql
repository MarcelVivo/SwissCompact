-- Private Medienablage für Bilder und Videos im mandantenfähigen Kundenportal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swisscompact-media',
  'swisscompact-media',
  false,
  262144000,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists swisscompact_media_read on storage.objects;
create policy swisscompact_media_read on storage.objects
for select to authenticated using (
  bucket_id = 'swisscompact-media'
  and swisscompact.is_tenant_member(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists swisscompact_media_insert on storage.objects;
create policy swisscompact_media_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'swisscompact-media'
  and swisscompact.can_edit_tenant(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists swisscompact_media_update on storage.objects;
create policy swisscompact_media_update on storage.objects
for update to authenticated using (
  bucket_id = 'swisscompact-media'
  and swisscompact.can_edit_tenant(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
) with check (
  bucket_id = 'swisscompact-media'
  and swisscompact.can_edit_tenant(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists swisscompact_media_delete on storage.objects;
create policy swisscompact_media_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'swisscompact-media'
  and swisscompact.can_edit_tenant(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);
