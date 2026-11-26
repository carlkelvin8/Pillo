-- Storage `remove()` is a DELETE with a WHERE on name, which needs a SELECT policy to match rows.
-- Without one the old logo file is silently never deleted. Owners may see only their own folder.
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  drop policy if exists clinic_logos_select on storage.objects;
  create policy clinic_logos_select on storage.objects for select to authenticated
    using (
      bucket_id = 'clinic-logos'
      and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and private.has_role(((storage.foldername(name))[1])::uuid, array['owner']::public.app_role[])
    );
end
$storage$;

-- An owner can only point logo_path at their own clinic's folder.
alter table public.clinics
  add constraint clinics_logo_path_own_folder
  check (logo_path is null or logo_path like id::text || '/%');
