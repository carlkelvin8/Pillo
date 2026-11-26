-- Voiding a sent invoice must also cancel its open payment links, and the provider webhook must
-- never turn a cancelled or otherwise non-pending payment into a succeeded one.
-- Before this, a link left open on a voided invoice could still be paid and counted in the balance.

-- Same body as 20261129000000_freeze_non_draft_invoices.sql, plus: sent -> void cancels pending payments.
-- Runs with the caller's rights, so RLS, the column grant on payments.status and guard_payment_update apply.
create or replace function private.guard_invoice()
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
       new.patient_id is distinct from old.patient_id
       or new.doctor_id is distinct from old.doctor_id
       or new.branch_id is distinct from old.branch_id
       or new.issued_on is distinct from old.issued_on
       or new.due_on is distinct from old.due_on
       or new.note is distinct from old.note
       or new.discount_centavos is distinct from old.discount_centavos
       or new.tax_centavos is distinct from old.tax_centavos
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
      -- Open links must not stay payable on a void invoice.
      update public.payments
         set status = 'cancelled'
       where invoice_id = old.id and clinic_id = old.clinic_id and status = 'pending';
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

-- Same as the original, plus: only a PENDING payment can be applied. A cancelled link that still gets
-- paid at the provider is flagged ('not_pending') for a human instead of silently counted.
-- CREATE OR REPLACE keeps the existing grants (service role only).
create or replace function public.apply_provider_payment(
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
  elsif v_payment.status <> 'pending' then
    v_outcome := 'not_pending';
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
