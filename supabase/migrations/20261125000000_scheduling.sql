-- Phase 2: branches, patients, doctors, hours, appointments, visits, prescriptions, waitlist.
--
-- Access model (matches the role matrix):
--   directory  (patients, appointments, waitlist): owner, doctor, receptionist read; billing reads patients/appointments
--   front desk (book, edit patients, waitlist):    owner, doctor, receptionist
--   clinical   (visits, prescriptions):            owner, doctor ONLY
--   setup      (branches, hours, doctors):         owner
-- Cross-tenant integrity: child rows reference parents through (clinic_id, id) composite
-- foreign keys, so an appointment can never point at another clinic's patient or doctor.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.appointment_source as enum ('staff', 'ai', 'portal');
create type public.patient_sex as enum ('female', 'male', 'other');
create type public.waitlist_status as enum ('waiting', 'offered', 'booked', 'removed');

-- Composite-FK targets on an existing table.
alter table public.memberships add constraint memberships_clinic_id_id_key unique (clinic_id, id);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 40),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id)
);

-- Weekly opening hours per branch. weekday: 0 = Sunday ... 6 = Saturday. Times are clinic-local.
create table public.clinic_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at),
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id) on delete cascade
);
create index clinic_hours_branch_idx on public.clinic_hours (branch_id, weekday);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  -- Optional: visiting doctors may not have a login.
  membership_id uuid unique references public.memberships (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  specialty text check (char_length(specialty) <= 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id)
);

-- Optional per-doctor availability. If a doctor has NO rows for a branch they are available
-- whenever that branch is open; if they have rows, only those windows (inside branch hours).
create table public.doctor_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  doctor_id uuid not null,
  branch_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id) on delete cascade,
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id) on delete cascade
);
create index doctor_hours_doctor_idx on public.doctor_hours (doctor_id, branch_id, weekday);

-- Demographics only. Clinical notes live in visits (owner/doctor only), not here.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_number integer not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  birthdate date check (birthdate between date '1900-01-01' and current_date),
  sex public.patient_sex,
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  -- When the patient agreed to data processing. Needed before any outreach (RA 10173).
  consent_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, patient_number)
);
create index patients_name_idx on public.patients (clinic_id, lower(full_name) text_pattern_ops);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  branch_id uuid not null,
  patient_id uuid not null,
  doctor_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  status public.appointment_status not null default 'scheduled',
  source public.appointment_source not null default 'staff',
  send_reminder boolean not null default true,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id),
  -- A doctor can never be double-booked. Cancelled and no-show appointments free the slot.
  constraint appointments_no_double_booking exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('scheduled', 'confirmed', 'completed'))
);
create index appointments_clinic_starts_idx on public.appointments (clinic_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at desc);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  doctor_id uuid,
  appointment_id uuid references public.appointments (id) on delete set null,
  visited_at timestamptz not null default now(),
  title text check (char_length(title) <= 120),
  notes text check (char_length(notes) <= 4000),
  -- e.g. {"bp_systolic":118,"bp_diastolic":76,"heart_rate":72,"weight_kg":58.4,"temp_c":36.6}. Validated with Zod.
  vitals jsonb not null default '{}'::jsonb check (jsonb_typeof(vitals) = 'object'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade,
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id)
);
create index visits_patient_idx on public.visits (patient_id, visited_at desc);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  visit_id uuid references public.visits (id) on delete set null,
  medication text not null check (char_length(btrim(medication)) between 1 and 120),
  dosage text check (char_length(dosage) <= 120),
  active boolean not null default true,
  prescribed_at date not null default current_date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade
);
create index prescriptions_patient_idx on public.prescriptions (patient_id, active);

-- Used later by the Chair-Filler agent to offer freed slots.
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  branch_id uuid,
  doctor_id uuid,
  reason text check (char_length(reason) <= 200),
  preferred_weekdays smallint[] not null default '{}',
  earliest_time time,
  latest_time time,
  -- Explicit OK to be messaged when a slot opens. Required before any outreach.
  outreach_ok boolean not null default false,
  status public.waitlist_status not null default 'waiting',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latest_time is null or earliest_time is null or latest_time > earliest_time),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id) on delete cascade,
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id) on delete cascade,
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id) on delete cascade
);
create index waitlist_clinic_status_idx on public.waitlist_entries (clinic_id, status);

-- updated_at
create trigger branches_set_updated_at before update on public.branches for each row execute function private.set_updated_at();
create trigger clinic_hours_set_updated_at before update on public.clinic_hours for each row execute function private.set_updated_at();
create trigger doctors_set_updated_at before update on public.doctors for each row execute function private.set_updated_at();
create trigger doctor_hours_set_updated_at before update on public.doctor_hours for each row execute function private.set_updated_at();
create trigger patients_set_updated_at before update on public.patients for each row execute function private.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function private.set_updated_at();
create trigger visits_set_updated_at before update on public.visits for each row execute function private.set_updated_at();
create trigger prescriptions_set_updated_at before update on public.prescriptions for each row execute function private.set_updated_at();
create trigger waitlist_entries_set_updated_at before update on public.waitlist_entries for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers and helpers
-- ---------------------------------------------------------------------------

-- Per-clinic patient number (ID 00482 in the design). Serialized per clinic.
create function private.assign_patient_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.clinic_id::text, 0));
  select coalesce(max(p.patient_number), 0) + 1 into new.patient_number
  from public.patients p where p.clinic_id = new.clinic_id;
  return new;
end;
$$;
create trigger patients_assign_number before insert on public.patients
  for each row execute function private.assign_patient_number();

-- The patient number is immutable.
create function private.keep_patient_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.patient_number := old.patient_number;
  return new;
end;
$$;
create trigger patients_keep_number before update on public.patients
  for each row execute function private.keep_patient_number();

-- Stamp cancellation time; clear it if an appointment is reinstated.
create function private.stamp_appointment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
    new.cancel_reason := null;
  end if;
  return new;
end;
$$;
create trigger appointments_stamp_status before update on public.appointments
  for each row execute function private.stamp_appointment_status();

create function private.membership_in_clinic(p_membership_id uuid, p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m where m.id = p_membership_id and m.clinic_id = p_clinic_id
  );
$$;
revoke execute on function private.membership_in_clinic(uuid, uuid) from public, anon;
grant execute on function private.membership_in_clinic(uuid, uuid) to authenticated;

-- Members with the doctor role automatically become bookable practitioners.
create function private.sync_doctor_for_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.role = 'doctor' then
    select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Doctor') into v_name
    from public.profiles p where p.id = new.user_id;
    insert into public.doctors (clinic_id, membership_id, display_name)
    values (new.clinic_id, new.id, coalesce(v_name, 'Doctor'))
    on conflict (membership_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger memberships_sync_doctor after insert or update of role on public.memberships
  for each row execute function private.sync_doctor_for_membership();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.clinic_hours enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_hours enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.visits enable row level security;
alter table public.prescriptions enable row level security;
alter table public.waitlist_entries enable row level security;

-- Setup tables: every member reads, owners write.
create policy branches_select on public.branches for select to authenticated using (private.is_member(clinic_id));
create policy branches_insert on public.branches for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy branches_update on public.branches for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy branches_delete on public.branches for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

create policy clinic_hours_select on public.clinic_hours for select to authenticated using (private.is_member(clinic_id));
create policy clinic_hours_insert on public.clinic_hours for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy clinic_hours_update on public.clinic_hours for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy clinic_hours_delete on public.clinic_hours for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

create policy doctors_select on public.doctors for select to authenticated using (private.is_member(clinic_id));
create policy doctors_insert on public.doctors for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner']::public.app_role[])
    and (membership_id is null or private.membership_in_clinic(membership_id, clinic_id))
  );
create policy doctors_update on public.doctors for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (
    private.has_role(clinic_id, array['owner']::public.app_role[])
    and (membership_id is null or private.membership_in_clinic(membership_id, clinic_id))
  );
create policy doctors_delete on public.doctors for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

create policy doctor_hours_select on public.doctor_hours for select to authenticated using (private.is_member(clinic_id));
create policy doctor_hours_insert on public.doctor_hours for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy doctor_hours_update on public.doctor_hours for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy doctor_hours_delete on public.doctor_hours for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

-- Patients: every member reads the directory; front desk writes; owners delete.
create policy patients_select on public.patients for select to authenticated using (private.is_member(clinic_id));
create policy patients_insert on public.patients for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));
create policy patients_update on public.patients for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));
create policy patients_delete on public.patients for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));

-- Appointments: everyone reads; front desk books and edits; clients may only create staff-sourced,
-- scheduled/confirmed appointments (AI and portal bookings come from server code).
create policy appointments_select on public.appointments for select to authenticated using (private.is_member(clinic_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[])
    and source = 'staff'
    and status in ('scheduled', 'confirmed')
  );
create policy appointments_update on public.appointments for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));

-- Clinical data: owner and doctor only.
create policy visits_select on public.visits for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));
create policy visits_insert on public.visits for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));
create policy visits_update on public.visits for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));

create policy prescriptions_select on public.prescriptions for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));
create policy prescriptions_insert on public.prescriptions for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));
create policy prescriptions_update on public.prescriptions for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'doctor']::public.app_role[]));

-- Waitlist: front desk.
create policy waitlist_select on public.waitlist_entries for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));
create policy waitlist_insert on public.waitlist_entries for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));
create policy waitlist_update on public.waitlist_entries for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));
create policy waitlist_delete on public.waitlist_entries for delete to authenticated
  using (private.has_role(clinic_id, array['owner', 'doctor', 'receptionist']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Privileges (least privilege, per column)
-- ---------------------------------------------------------------------------
revoke all on public.branches, public.clinic_hours, public.doctors, public.doctor_hours,
              public.patients, public.appointments, public.visits, public.prescriptions,
              public.waitlist_entries
  from anon, authenticated;

grant select, delete on public.branches, public.clinic_hours, public.doctors, public.doctor_hours to authenticated;
grant insert (clinic_id, name, address, phone, latitude, longitude) on public.branches to authenticated;
grant update (name, address, phone, latitude, longitude) on public.branches to authenticated;
grant insert (clinic_id, branch_id, weekday, opens_at, closes_at) on public.clinic_hours to authenticated;
grant update (weekday, opens_at, closes_at) on public.clinic_hours to authenticated;
grant insert (clinic_id, membership_id, display_name, specialty, active) on public.doctors to authenticated;
grant update (membership_id, display_name, specialty, active) on public.doctors to authenticated;
grant insert (clinic_id, doctor_id, branch_id, weekday, starts_at, ends_at) on public.doctor_hours to authenticated;
grant update (weekday, starts_at, ends_at) on public.doctor_hours to authenticated;

grant select, delete on public.patients to authenticated;
grant insert (clinic_id, full_name, birthdate, sex, phone, email, consent_at) on public.patients to authenticated;
grant update (full_name, birthdate, sex, phone, email, consent_at) on public.patients to authenticated;

grant select on public.appointments to authenticated;
grant insert (clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at, reason, status, source, send_reminder)
  on public.appointments to authenticated;
grant update (branch_id, doctor_id, starts_at, ends_at, reason, status, send_reminder, cancel_reason)
  on public.appointments to authenticated;

grant select on public.visits, public.prescriptions to authenticated;
grant insert (clinic_id, patient_id, doctor_id, appointment_id, visited_at, title, notes, vitals)
  on public.visits to authenticated;
grant update (doctor_id, visited_at, title, notes, vitals) on public.visits to authenticated;
grant insert (clinic_id, patient_id, visit_id, medication, dosage, active, prescribed_at)
  on public.prescriptions to authenticated;
grant update (medication, dosage, active) on public.prescriptions to authenticated;

grant select, delete on public.waitlist_entries to authenticated;
grant insert (clinic_id, patient_id, branch_id, doctor_id, reason, preferred_weekdays, earliest_time, latest_time, outreach_ok)
  on public.waitlist_entries to authenticated;
grant update (branch_id, doctor_id, reason, preferred_weekdays, earliest_time, latest_time, outreach_ok, status)
  on public.waitlist_entries to authenticated;

-- ---------------------------------------------------------------------------
-- New clinics get a default branch (replaces the Phase 1 function; privileges are kept)
-- ---------------------------------------------------------------------------
create or replace function public.create_clinic(
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

  insert into public.branches (clinic_id, name, address, phone)
  values (v_clinic_id, 'Main branch', nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''));

  insert into public.audit_log (clinic_id, actor_type, actor_id, action, entity, entity_id)
  values (v_clinic_id, 'user', v_uid, 'clinic.created', 'clinic', v_clinic_id);

  return v_clinic_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill for clinics and doctor members created in Phase 1
-- ---------------------------------------------------------------------------
insert into public.branches (clinic_id, name, address, phone)
select c.id, 'Main branch', c.address, c.phone
from public.clinics c
where not exists (select 1 from public.branches b where b.clinic_id = c.id);

insert into public.doctors (clinic_id, membership_id, display_name)
select m.clinic_id, m.id, coalesce(nullif(btrim(p.full_name), ''), p.email, 'Doctor')
from public.memberships m
left join public.profiles p on p.id = m.user_id
where m.role = 'doctor'
on conflict (membership_id) do nothing;
