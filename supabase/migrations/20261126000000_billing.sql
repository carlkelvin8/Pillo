-- Phase 3: invoices, items, payments, provider events, payouts (mock).
--
-- Money rules
--  * All amounts are integer centavos (bigint). Clients never write totals: invoices.subtotal/total are
--    maintained by triggers, and a CHECK constraint proves total = subtotal - discount + tax.
--  * Only draft invoices can be edited. Status "paid" is set only by the payment trigger.
--  * Provider (PayMongo) payments become "succeeded" ONLY through apply_provider_payment(), which is
--    callable by the service role alone, is idempotent per provider event, and refuses amount mismatches.
--  * Payouts are a MOCK (is_mock = true): no real money moves. Withdrawals go through request_payout(),
--    which checks the available balance atomically.

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.payment_method as enum ('gcash', 'maya', 'card', 'cash', 'bank');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.payout_status as enum ('processing', 'paid', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  invoice_number integer not null,
  patient_id uuid not null,
  doctor_id uuid,
  branch_id uuid,
  status public.invoice_status not null default 'draft',
  issued_on date not null default current_date,
  due_on date not null,
  note text check (char_length(note) <= 500),
  subtotal_centavos bigint not null default 0 check (subtotal_centavos >= 0),
  discount_centavos bigint not null default 0 check (discount_centavos >= 0),
  tax_centavos bigint not null default 0 check (tax_centavos >= 0),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id),
  unique (clinic_id, invoice_number),
  check (due_on >= issued_on),
  -- The total always matches its parts (discount can never push it below zero).
  constraint invoices_total_matches check (
    total_centavos = subtotal_centavos - least(discount_centavos, subtotal_centavos) + tax_centavos
  ),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id),
  foreign key (clinic_id, doctor_id) references public.doctors (clinic_id, id),
  foreign key (clinic_id, branch_id) references public.branches (clinic_id, id)
);
create index invoices_clinic_status_idx on public.invoices (clinic_id, status, due_on);
create index invoices_patient_idx on public.invoices (patient_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  invoice_id uuid not null,
  position integer not null default 0,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price_centavos bigint not null check (unit_price_centavos >= 0 and unit_price_centavos <= 100000000),
  amount_centavos bigint generated always as (quantity::bigint * unit_price_centavos) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (clinic_id, invoice_id) references public.invoices (clinic_id, id) on delete cascade
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  invoice_id uuid not null,
  -- Unknown until the patient chooses GCash, Maya or card on a payment link.
  method public.payment_method,
  amount_centavos bigint not null check (amount_centavos > 0),
  status public.payment_status not null default 'pending',
  provider text not null check (provider in ('manual', 'paymongo', 'mock')),
  provider_ref text,
  checkout_url text check (char_length(checkout_url) <= 500),
  reference text check (char_length(reference) <= 80),
  paid_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref),
  check ((status = 'succeeded') = (paid_at is not null)),
  check (status <> 'succeeded' or method is not null),
  foreign key (clinic_id, invoice_id) references public.invoices (clinic_id, id)
);
create index payments_clinic_idx on public.payments (clinic_id, created_at desc);
create index payments_invoice_idx on public.payments (invoice_id, status);

-- Idempotency ledger for provider webhooks. Minimal data only: ids, type and outcome (no payer details).
create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  outcome text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  amount_centavos bigint not null check (amount_centavos > 0),
  -- A label such as "BDO ••1920". Never store a full account number.
  destination text not null check (char_length(btrim(destination)) between 1 and 60),
  status public.payout_status not null default 'processing',
  arrives_on date not null,
  is_mock boolean not null default true,
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_clinic_idx on public.payouts (clinic_id, created_at desc);

create trigger invoices_set_updated_at before update on public.invoices for each row execute function private.set_updated_at();
create trigger invoice_items_set_updated_at before update on public.invoice_items for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function private.set_updated_at();
create trigger payouts_set_updated_at before update on public.payouts for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Per-clinic invoice number (INV-0001). Serialized per clinic.
create function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('invoice:' || new.clinic_id::text, 0));
  select coalesce(max(i.invoice_number), 0) + 1 into new.invoice_number
  from public.invoices i where i.clinic_id = new.clinic_id;
  return new;
end;
$$;
create trigger invoices_assign_number before insert on public.invoices
  for each row execute function private.assign_invoice_number();

-- Derive totals, guard status changes, and freeze financial fields once an invoice leaves draft.
create function private.guard_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- New invoices always start as drafts with computed totals.
    new.status := 'draft';
    new.subtotal_centavos := 0;
    new.total_centavos := new.tax_centavos;
    new.sent_at := null; new.paid_at := null; new.voided_at := null;
    return new;
  end if;

  new.invoice_number := old.invoice_number;
  new.clinic_id := old.clinic_id;

  if old.status <> 'draft' and (
       new.patient_id <> old.patient_id
       or new.discount_centavos <> old.discount_centavos
       or new.tax_centavos <> old.tax_centavos
       or new.issued_on <> old.issued_on
     ) then
    raise exception 'Only draft invoices can be edited' using errcode = 'P0001';
  end if;

  if new.status <> old.status then
    if old.status = 'draft' and new.status = 'sent' then
      new.sent_at := now();
    elsif old.status = 'draft' and new.status = 'void' then
      new.voided_at := now();
    elsif old.status = 'sent' and new.status = 'void' then
      if exists (select 1 from public.payments p where p.invoice_id = old.id and p.status = 'succeeded') then
        raise exception 'An invoice with payments cannot be voided' using errcode = 'P0001';
      end if;
      new.voided_at := now();
    elsif new.status = 'paid' and current_setting('app.allow_paid', true) = '1' then
      new.paid_at := now();
    elsif old.status = 'paid' and new.status = 'sent' and current_setting('app.allow_paid', true) = '1' then
      new.paid_at := null;
    else
      raise exception 'Invalid invoice status change: % to %', old.status, new.status using errcode = 'P0001';
    end if;
  end if;

  -- Totals are always derived; clients cannot set them.
  new.total_centavos := new.subtotal_centavos - least(new.discount_centavos, new.subtotal_centavos) + new.tax_centavos;
  return new;
end;
$$;
create trigger invoices_guard before insert or update on public.invoices
  for each row execute function private.guard_invoice();

-- Keep invoices.subtotal equal to the sum of its items.
create function private.refresh_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_sum bigint;
begin
  select coalesce(sum(it.amount_centavos), 0) into v_sum from public.invoice_items it where it.invoice_id = v_invoice;
  update public.invoices set subtotal_centavos = v_sum where id = v_invoice;
  return null;
end;
$$;
create trigger invoice_items_refresh_subtotal after insert or update or delete on public.invoice_items
  for each row execute function private.refresh_invoice_subtotal();

-- Items can only change while the invoice is a draft.
create function private.guard_invoice_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_status public.invoice_status;
begin
  select i.status into v_status from public.invoices i where i.id = v_invoice;
  -- A cascade from deleting the invoice itself finds no row and is allowed.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Only draft invoices can be edited' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function private.guard_invoice_items();

-- Payments only against sent invoices, for at most what is still owed, one open link at a time.
create function private.guard_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invoice_status;
  v_total bigint;
  v_paid bigint;
begin
  select i.status, i.total_centavos into v_status, v_total from public.invoices i where i.id = new.invoice_id for update;
  if v_status is distinct from 'sent' then
    raise exception 'Payments can only be recorded against a sent invoice' using errcode = 'P0001';
  end if;
  if new.status in ('pending', 'succeeded') then
    select coalesce(sum(p.amount_centavos), 0) into v_paid
    from public.payments p where p.invoice_id = new.invoice_id and p.status in ('pending', 'succeeded');
    if v_paid + new.amount_centavos > v_total then
      raise exception 'Payment is more than the amount due' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_guard before insert on public.payments
  for each row execute function private.guard_payment();

-- When succeeded payments cover the total the invoice becomes paid (and reverts if that stops being true).
create function private.refresh_invoice_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid bigint;
  v_total bigint;
  v_status public.invoice_status;
begin
  select coalesce(sum(p.amount_centavos), 0) into v_paid
  from public.payments p where p.invoice_id = new.invoice_id and p.status = 'succeeded';
  select i.total_centavos, i.status into v_total, v_status from public.invoices i where i.id = new.invoice_id for update;

  perform set_config('app.allow_paid', '1', true);
  if v_status = 'sent' and v_total > 0 and v_paid >= v_total then
    update public.invoices set status = 'paid' where id = new.invoice_id;
  elsif v_status = 'paid' and v_paid < v_total then
    update public.invoices set status = 'sent' where id = new.invoice_id;
  end if;
  perform set_config('app.allow_paid', '0', true);
  return null;
end;
$$;
create trigger payments_refresh_invoice after insert or update on public.payments
  for each row execute function private.refresh_invoice_payment_state();

-- Clients may only cancel a pending payment; every other field is immutable once written.
create function private.guard_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.status <> 'pending' or new.status not in ('pending', 'cancelled') then
      raise exception 'Only a pending payment can be cancelled' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_guard_update before update on public.payments
  for each row execute function private.guard_payment_update();

-- ---------------------------------------------------------------------------
-- Balance, payouts and provider payments
-- ---------------------------------------------------------------------------

-- Online money that reached the clinic (cash and bank transfers recorded by hand are not in the balance).
create function private.available_balance(p_clinic_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select sum(p.amount_centavos) from public.payments p
           where p.clinic_id = p_clinic_id and p.status = 'succeeded' and p.provider <> 'manual'
         ), 0)
       - coalesce((
           select sum(po.amount_centavos) from public.payouts po
           where po.clinic_id = p_clinic_id and po.status <> 'cancelled'
         ), 0);
$$;

create function public.clinic_balance(p_clinic_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_clinic_id, array['owner', 'billing']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.available_balance(p_clinic_id);
end;
$$;

-- MOCK payout: records a withdrawal request. No real money moves.
create function public.request_payout(p_clinic_id uuid, p_amount_centavos bigint, p_destination text, p_arrives_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role(p_clinic_id, array['owner', 'billing']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'Enter an amount to withdraw' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payout:' || p_clinic_id::text, 0));
  if p_amount_centavos > private.available_balance(p_clinic_id) then
    raise exception 'That is more than the available balance' using errcode = 'P0001';
  end if;
  insert into public.payouts (clinic_id, amount_centavos, destination, arrives_on, is_mock)
  values (p_clinic_id, p_amount_centavos, btrim(p_destination), p_arrives_on, true)
  returning id into v_id;
  insert into public.audit_log (clinic_id, actor_type, actor_id, action, entity, entity_id, meta)
  values (p_clinic_id, 'user', (select auth.uid()), 'payout.requested', 'payout', v_id, jsonb_build_object('mock', true));
  return v_id;
end;
$$;

-- Webhook entry point. Service role only. Idempotent per (provider, event_id).
create function public.apply_provider_payment(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_provider_ref text,
  p_method public.payment_method,
  p_amount_centavos bigint,
  p_reference text,
  p_paid_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_payment public.payments%rowtype;
  v_outcome text;
begin
  insert into public.provider_events (provider, event_id, event_type)
  values (p_provider, p_event_id, p_event_type)
  on conflict (provider, event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  select * into v_payment from public.payments p
  where p.provider = p_provider and p.provider_ref = p_provider_ref
  for update;

  if not found then
    v_outcome := 'unknown_reference';
  elsif v_payment.status = 'succeeded' then
    v_outcome := 'already_paid';
  elsif v_payment.amount_centavos <> p_amount_centavos then
    v_outcome := 'amount_mismatch';
  else
    update public.payments
    set status = 'succeeded', method = p_method, reference = left(p_reference, 80), paid_at = coalesce(p_paid_at, now())
    where id = v_payment.id;
    insert into public.audit_log (clinic_id, actor_type, action, entity, entity_id, meta)
    values (v_payment.clinic_id, 'system', 'payment.succeeded', 'payment', v_payment.id,
            jsonb_build_object('provider', p_provider, 'method', p_method));
    v_outcome := 'applied';
  end if;

  update public.provider_events set outcome = v_outcome where provider = p_provider and event_id = p_event_id;
  return v_outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.provider_events enable row level security;
alter table public.payouts enable row level security;

-- Invoices: owner, receptionist and billing (the "Create invoices" capability).
create policy invoices_select on public.invoices for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy invoices_update on public.invoices for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));

create policy invoice_items_select on public.invoice_items for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy invoice_items_insert on public.invoice_items for insert to authenticated
  with check (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy invoice_items_update on public.invoice_items for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy invoice_items_delete on public.invoice_items for delete to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));

-- Payments: read by the same roles. Clients may record manual cash/bank payments and open provider links.
create policy payments_select on public.payments for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[])
    and (
      (provider = 'manual' and status = 'succeeded' and method in ('cash', 'bank'))
      or (provider in ('paymongo', 'mock') and status = 'pending' and method is null)
    )
  );
create policy payments_update on public.payments for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist', 'billing']::public.app_role[]))
  with check (status in ('pending', 'cancelled'));

-- provider_events: no policies = no client access at all.

-- Payouts: owner and billing read. Creation only through request_payout().
create policy payouts_select on public.payouts for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'billing']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.invoices, public.invoice_items, public.payments, public.provider_events, public.payouts
  from anon, authenticated;

grant select on public.invoices to authenticated;
grant insert (clinic_id, patient_id, doctor_id, branch_id, issued_on, due_on, note, discount_centavos, tax_centavos)
  on public.invoices to authenticated;
grant update (doctor_id, branch_id, issued_on, due_on, note, discount_centavos, tax_centavos, status)
  on public.invoices to authenticated;

grant select, delete on public.invoice_items to authenticated;
grant insert (clinic_id, invoice_id, position, description, quantity, unit_price_centavos) on public.invoice_items to authenticated;
grant update (position, description, quantity, unit_price_centavos) on public.invoice_items to authenticated;

grant select on public.payments to authenticated;
grant insert (clinic_id, invoice_id, method, amount_centavos, status, provider, provider_ref, checkout_url, reference, paid_at)
  on public.payments to authenticated;
grant update (status) on public.payments to authenticated;

grant select on public.payouts to authenticated;

revoke execute on function public.clinic_balance(uuid) from public, anon;
revoke execute on function public.request_payout(uuid, bigint, text, date) from public, anon;
grant execute on function public.clinic_balance(uuid) to authenticated;
grant execute on function public.request_payout(uuid, bigint, text, date) to authenticated;

-- Service role only: the webhook handler.
revoke execute on function public.apply_provider_payment(text, text, text, text, public.payment_method, bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_provider_payment(text, text, text, text, public.payment_method, bigint, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Atomic invoice creation. Runs with the CALLER's rights (no SECURITY DEFINER), so Row Level Security,
-- column grants and every trigger above still apply. One transaction: an invalid item rolls back the invoice.
-- ---------------------------------------------------------------------------
create function public.create_invoice(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_branch_id uuid,
  p_issued_on date,
  p_due_on date,
  p_note text,
  p_discount_centavos bigint,
  p_tax_centavos bigint,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_pos integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many items' using errcode = '22023';
  end if;

  insert into public.invoices (clinic_id, patient_id, doctor_id, branch_id, issued_on, due_on, note, discount_centavos, tax_centavos)
  values (p_clinic_id, p_patient_id, p_doctor_id, p_branch_id, p_issued_on, p_due_on, nullif(btrim(p_note), ''),
          coalesce(p_discount_centavos, 0), coalesce(p_tax_centavos, 0))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
    values (p_clinic_id, v_id, v_pos, v_item ->> 'description', (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price_centavos')::bigint);
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.create_invoice(uuid, uuid, uuid, uuid, date, date, text, bigint, bigint, jsonb) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, uuid, uuid, date, date, text, bigint, bigint, jsonb) to authenticated;
