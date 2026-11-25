-- Phase 1: tenancy foundation.
-- clinics, memberships, profiles, invitations, audit_log + RLS + signup functions.
--
-- Conventions
--  * Every tenant table carries clinic_id and is protected by RLS.
--  * clinic_id is NEVER taken from the client for authorization: policies check
--    membership of auth.uid() via private.is_member / private.has_role.
--  * Clients get no INSERT on clinics/memberships/audit_log; those go through
--    SECURITY DEFINER functions (create_clinic, accept_pending_invitations, log_audit).
--  * Privileges are granted per column where only some columns may change.
--  * audit_log.meta must never contain patient names or contact details (RA 10173).

-- ---------------------------------------------------------------------------
-- Schemas, types, shared trigger
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('owner', 'doctor', 'receptionist', 'billing');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  timezone text not null default 'Asia/Manila',
  -- Dr. Pill switches chosen in onboarding. Validated with Zod in the app.
  assistant_settings jsonb not null default
    '{"answer_questions": true, "book_appointments": true, "send_reminders": true, "share_payment_links": true, "tone": "warm"}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per signed-up user. Not tenant-scoped (a user may work at several clinics).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  email text check (char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  email text not null
    check (email = lower(btrim(email)))
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    check (char_length(email) <= 254),
  role public.app_role not null check (role <> 'owner'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one open invitation per clinic + email.
create unique index invitations_open_unique
  on public.invitations (clinic_id, email)
  where accepted_at is null and revoked_at is null;

-- Append-only: clients can only read (owner) and write through log_audit().
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  actor_type text not null default 'user' check (actor_type in ('user', 'mcp', 'ai', 'system')),
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  entity text not null check (char_length(entity) between 1 and 80),
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index audit_log_clinic_at_idx on public.audit_log (clinic_id, at desc);

create trigger clinics_set_updated_at before update on public.clinics
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();
create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policy helpers (SECURITY DEFINER so policies on memberships cannot recurse)
-- ---------------------------------------------------------------------------
create function private.is_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.clinic_id = p_clinic_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.has_role(p_clinic_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.clinic_id = p_clinic_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create function private.shares_clinic(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.clinic_id = mine.clinic_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

revoke execute on function private.is_member(uuid) from public, anon;
revoke execute on function private.has_role(uuid, public.app_role[]) from public, anon;
revoke execute on function private.shares_clinic(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.shares_clinic(uuid) to authenticated;

-- A clinic must always keep at least one owner.
create function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- Allow the cascade when the clinic itself is being deleted.
     and exists (select 1 from public.clinics c where c.id = old.clinic_id)
     and not exists (
       select 1
       from public.memberships m
       where m.clinic_id = old.clinic_id and m.role = 'owner' and m.id <> old.id
     )
  then
    raise exception 'A clinic must keep at least one owner' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_protect_last_owner
  before update of role or delete on public.memberships
  for each row execute function private.protect_last_owner();

-- Profile row for every new auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

-- clinics: members read, owners update. Creation only via create_clinic().
create policy clinics_select on public.clinics
  for select to authenticated
  using (private.is_member(id));
create policy clinics_update on public.clinics
  for update to authenticated
  using (private.has_role(id, array['owner']::public.app_role[]))
  with check (private.has_role(id, array['owner']::public.app_role[]));

-- profiles: own row and co-members.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_clinic(id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: members read; owners change roles / remove; anyone may leave.
create policy memberships_select on public.memberships
  for select to authenticated
  using (private.is_member(clinic_id));
create policy memberships_update on public.memberships
  for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    private.has_role(clinic_id, array['owner']::public.app_role[])
    or user_id = (select auth.uid())
  );

-- invitations: owners only.
create policy invitations_select on public.invitations
  for select to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner']::public.app_role[])
    and invited_by = (select auth.uid())
  );
create policy invitations_update on public.invitations
  for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy invitations_delete on public.invitations
  for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

-- audit_log: owners read. No client writes.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Table privileges (least privilege; Supabase grants broad defaults, so revoke first)
-- ---------------------------------------------------------------------------
revoke all on public.clinics, public.profiles, public.memberships,
              public.invitations, public.audit_log
  from anon, authenticated;

grant select on public.clinics to authenticated;
grant update (name, address, phone, email, timezone, assistant_settings, onboarding_completed_at)
  on public.clinics to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;

grant select, delete on public.invitations to authenticated;
grant insert (clinic_id, email, role, invited_by) on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

grant select on public.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a clinic and make the caller its owner. Requires a confirmed email.
create function public.create_clinic(
  p_name text,
  p_address text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clinic_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null
  ) then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  insert into public.clinics (name, address, phone, email)
  values (btrim(p_name), nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''))
  returning id into v_clinic_id;

  insert into public.memberships (clinic_id, user_id, role)
  values (v_clinic_id, v_uid, 'owner');

  insert into public.audit_log (clinic_id, actor_type, actor_id, action, entity, entity_id)
  values (v_clinic_id, 'user', v_uid, 'clinic.created', 'clinic', v_clinic_id);

  return v_clinic_id;
end;
$$;

-- Turn pending invitations for the caller's CONFIRMED email into memberships.
create function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for r in
    select i.id, i.clinic_id, i.role
    from public.invitations i
    where i.email = v_email
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
    for update
  loop
    insert into public.memberships (clinic_id, user_id, role)
    values (r.clinic_id, v_uid, r.role)
    on conflict (clinic_id, user_id) do nothing;

    update public.invitations set accepted_at = now() where id = r.id;

    insert into public.audit_log (clinic_id, actor_type, actor_id, action, entity, meta)
    values (r.clinic_id, 'user', v_uid, 'membership.joined', 'membership',
            jsonb_build_object('via', 'invitation', 'role', r.role));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Append an audit entry as the calling member. Never put patient names or
-- contact details in p_meta.
create function public.log_audit(
  p_clinic_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_clinic_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_log (clinic_id, actor_type, actor_id, action, entity, entity_id, meta)
  values (p_clinic_id, 'user', (select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke execute on function public.create_clinic(text, text, text, text) from public, anon;
revoke execute on function public.accept_pending_invitations() from public, anon;
revoke execute on function public.log_audit(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_clinic(text, text, text, text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.log_audit(uuid, text, text, uuid, jsonb) to authenticated;
