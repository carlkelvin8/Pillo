-- 1. Clinic logo: a path inside the public `clinic-logos` bucket (first folder = clinic id).
alter table public.clinics
  add column logo_path text
  constraint clinics_logo_path_shape check (
    logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
  );
grant update (logo_path) on public.clinics to authenticated;

-- The bucket and its policies only exist on Supabase (the local test stub has no storage schema).
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('clinic-logos', 'clinic-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 1048576,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

  -- Only the clinic's owners may write to their own folder. Reads go through the public URL.
  drop policy if exists clinic_logos_insert on storage.objects;
  create policy clinic_logos_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'clinic-logos'
      and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and private.has_role(((storage.foldername(name))[1])::uuid, array['owner']::public.app_role[])
    );
  drop policy if exists clinic_logos_update on storage.objects;
  create policy clinic_logos_update on storage.objects for update to authenticated
    using (
      bucket_id = 'clinic-logos'
      and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and private.has_role(((storage.foldername(name))[1])::uuid, array['owner']::public.app_role[])
    );
  drop policy if exists clinic_logos_delete on storage.objects;
  create policy clinic_logos_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'clinic-logos'
      and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and private.has_role(((storage.foldername(name))[1])::uuid, array['owner']::public.app_role[])
    );
end
$storage$;

-- 2. Payment records: staff can log GCash and Maya payments they received outside the app.
drop policy payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[])
    and (
      (provider = 'manual' and status = 'succeeded' and method in ('cash', 'bank', 'gcash', 'maya'))
      or (provider in ('paymongo', 'mock') and status = 'pending' and method is null)
    )
  );
