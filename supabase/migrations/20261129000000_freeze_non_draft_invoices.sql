-- Once an invoice is sent or paid, its identifying and billing fields are immutable.
-- Status transitions remain governed by the existing lifecycle rules below.
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

-- Draft editing includes reassignment to another patient in the same clinic.
-- The composite foreign key and the trigger above preserve tenant and lifecycle guards.
grant update (patient_id) on public.invoices to authenticated;
