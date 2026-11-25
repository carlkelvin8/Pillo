-- Replace all editable draft fields and items in one transaction. Caller rights keep
-- the existing RLS policies, per-column grants, and invoice/item triggers in force.
create function public.update_draft_invoice(
  p_clinic_id uuid,
  p_invoice_id uuid,
  p_patient_id uuid,
  p_due_on date,
  p_items jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status public.invoice_status;
  v_issued_on date;
  v_item jsonb;
  v_position integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many items' using errcode = '22023';
  end if;

  select i.status, i.issued_on into v_status, v_issued_on
  from public.invoices i
  where i.id = p_invoice_id and i.clinic_id = p_clinic_id
  for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if v_status <> 'draft' then raise exception 'Only draft invoices can be edited' using errcode = 'P0001'; end if;
  if p_due_on < v_issued_on then raise exception 'Due date cannot be before invoice date' using errcode = '22023'; end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.clinic_id = p_clinic_id) then
    raise exception 'Patient not found' using errcode = '23503';
  end if;

  update public.invoices set patient_id = p_patient_id, due_on = p_due_on
  where id = p_invoice_id and clinic_id = p_clinic_id and status = 'draft';
  delete from public.invoice_items where invoice_id = p_invoice_id and clinic_id = p_clinic_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
    values (p_clinic_id, p_invoice_id, v_position, v_item ->> 'description',
            (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price_centavos')::bigint);
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke execute on function public.update_draft_invoice(uuid, uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.update_draft_invoice(uuid, uuid, uuid, date, jsonb) to authenticated;
