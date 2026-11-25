-- Phase 4B: Chair-Filler. When a slot frees up (cancel or no-show), Dr. Pill proposes it to waitlist
-- patients who agreed to be contacted. A person approves each offer. The patient accepts through a
-- private link (token). "Recovered" is an ESTIMATE: kept (completed) filled appointments x the typical
-- visit value the owner entered. No figure is invented.

alter table public.agent_rules drop constraint agent_rules_kind_check;
alter table public.agent_rules add constraint agent_rules_kind_check check (kind in ('reply', 'book_appointment', 'chair_filler'));

-- Owner-entered typical value of one visit, in centavos.
alter table public.clinics add column avg_visit_value_centavos bigint check (avg_visit_value_centavos between 0 and 100000000);
grant update (avg_visit_value_centavos) on public.clinics to authenticated;

create type public.offer_status as enum ('proposed', 'sent', 'accepted', 'declined', 'expired', 'skipped');

create table public.slot_offers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  source_appointment_id uuid references public.appointments (id) on delete set null,
  branch_id uuid not null,
  doctor_id uuid not null,
  patient_id uuid not null,
  waitlist_entry_id uuid references public.waitlist_entries (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.offer_status not null default 'proposed',
  -- SHA-256 of the private link token. Write-only for clients: the column is not selectable.
  token_hash text,
  expires_at timestamptz,
  sent_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  filled_appointment_id uuid references public.appointments (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (clinic_id, doctor_id, starts_at, patient_id),
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);
create index slot_offers_clinic_status_idx on public.slot_offers (clinic_id, status, created_at desc);
create unique index slot_offers_token_idx on public.slot_offers (token_hash) where token_hash is not null;
create trigger slot_offers_set_updated_at before update on public.slot_offers for each row execute function private.set_updated_at();

alter table public.slot_offers enable row level security;

create policy slot_offers_select on public.slot_offers for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));
create policy slot_offers_insert on public.slot_offers for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));
-- Staff may approve (sent) or skip an offer. Accepting, declining, expiring and filling are server-only.
create policy slot_offers_update on public.slot_offers for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]) and status in ('proposed', 'sent'))
  with check (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]) and status in ('proposed', 'sent', 'skipped'));

revoke all on public.slot_offers from anon, authenticated;
grant select (id, clinic_id, source_appointment_id, branch_id, doctor_id, patient_id, waitlist_entry_id, starts_at, ends_at, status, expires_at, sent_at, decided_by, filled_appointment_id, created_at, updated_at)
  on public.slot_offers to authenticated;
grant insert (clinic_id, source_appointment_id, branch_id, doctor_id, patient_id, waitlist_entry_id, starts_at, ends_at)
  on public.slot_offers to authenticated;
grant update (status, token_hash, expires_at, sent_at, decided_by) on public.slot_offers to authenticated;
