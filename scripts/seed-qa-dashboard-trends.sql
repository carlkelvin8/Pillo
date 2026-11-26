-- Development-only fixture for the QA Dental Clinic dashboard.
-- Creates synthetic patient, completed appointment, invoice, and manual cash payment rows.
-- Idempotent by the QA Trend Test patient names and invoice notes. Never run in production.
-- Run through psql only, with: psql -v allow_qa_trend_seed=on -f scripts/seed-qa-dashboard-trends.sql
\if :{?allow_qa_trend_seed}
\else
\echo 'Refusing to seed: pass -v allow_qa_trend_seed=on for the QA database.'
\quit 3
\endif

begin;

do $seed$
declare
  v_clinic_id uuid;
  v_clinic_count integer;
  v_branch_id uuid;
  v_doctor_id uuid;
  v_patient_id uuid;
  v_invoice_id uuid;
  v_patient_number integer;
  v_invoice_number integer;
  v_month date;
  v_month_index integer;
  v_desired_appointments integer;
  v_existing_appointments integer;
  v_candidate_day integer;
  v_start timestamptz;
  v_end timestamptz;
  v_note text;
  v_created integer;
begin
  select count(*) into v_clinic_count
  from public.clinics
  where name = 'Dental Clinic';

  if v_clinic_count <> 1 then
    raise exception 'Expected exactly one development clinic named Dental Clinic; found %', v_clinic_count;
  end if;

  select id into v_clinic_id from public.clinics where name = 'Dental Clinic';
  select id into v_branch_id
  from public.branches
  where clinic_id = v_clinic_id
  order by created_at, id
  limit 1;
  select id into v_doctor_id
  from public.doctors
  where clinic_id = v_clinic_id and active
  order by created_at, id
  limit 1;

  if v_branch_id is null or v_doctor_id is null then
    raise exception 'QA trend seed needs one branch and one active doctor';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic_id::text, 0));

  select coalesce(max(patient_number), 0) + 1 into v_patient_number
  from public.patients where clinic_id = v_clinic_id;
  select coalesce(max(invoice_number), 0) + 1 into v_invoice_number
  from public.invoices where clinic_id = v_clinic_id;

  -- December 2025 through November 2026: a steady 1..12 appointments and ₱500..₱6,000.
  for v_month_index in 0..11 loop
    v_month := date '2025-12-01' + (v_month_index * interval '1 month');
    v_desired_appointments := v_month_index + 1;

    select id into v_patient_id
    from public.patients
    where clinic_id = v_clinic_id
      and full_name = format('QA Trend Test %s', to_char(v_month, 'YYYY-MM'));

    if v_patient_id is null then
      insert into public.patients (clinic_id, patient_number, full_name, created_at)
      values (
        v_clinic_id,
        v_patient_number,
        format('QA Trend Test %s', to_char(v_month, 'YYYY-MM')),
        (v_month + 1)::timestamp at time zone 'Asia/Manila'
      ) returning id into v_patient_id;
      v_patient_number := v_patient_number + 1;
    end if;

    select count(*) into v_existing_appointments
    from public.appointments
    where clinic_id = v_clinic_id
      and patient_id = v_patient_id
      and starts_at >= (v_month::timestamp at time zone 'Asia/Manila')
      and starts_at < ((v_month + interval '1 month')::timestamp at time zone 'Asia/Manila')
      and status <> 'cancelled';

    while v_existing_appointments < v_desired_appointments loop
      v_created := 0;
      for v_candidate_day in 2..28 loop
        v_start := ((v_month + v_candidate_day - 1) + time '10:00') at time zone 'Asia/Manila';
        v_end := v_start + interval '30 minutes';
        if not exists (
          select 1 from public.appointments a
          where a.doctor_id = v_doctor_id
            and a.status in ('scheduled', 'confirmed', 'completed')
            and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        ) then
          insert into public.appointments (
            clinic_id, branch_id, patient_id, doctor_id, starts_at, ends_at,
            reason, status, source, send_reminder, created_at
          ) values (
            v_clinic_id, v_branch_id, v_patient_id, v_doctor_id, v_start, v_end,
            'QA trend test visit', 'completed', 'staff', false, v_start
          );
          v_existing_appointments := v_existing_appointments + 1;
          v_created := 1;
          exit;
        end if;
      end loop;
      if v_created = 0 then
        raise exception 'Could not find a free appointment slot for QA trend fixture %', v_month;
      end if;
    end loop;

    v_note := format('QA dashboard trend test · %s', to_char(v_month, 'YYYY-MM'));
    select id into v_invoice_id
    from public.invoices
    where clinic_id = v_clinic_id and patient_id = v_patient_id and note = v_note;

    if v_invoice_id is null then
      insert into public.invoices (
        clinic_id, invoice_number, patient_id, doctor_id, branch_id,
        issued_on, due_on, note, created_at
      ) values (
        v_clinic_id, v_invoice_number, v_patient_id, v_doctor_id, v_branch_id,
        v_month + 1, v_month + 31, v_note,
        (v_month + 1)::timestamp at time zone 'Asia/Manila'
      ) returning id into v_invoice_id;
      v_invoice_number := v_invoice_number + 1;

      insert into public.invoice_items (
        clinic_id, invoice_id, position, description, quantity, unit_price_centavos
      ) values (
        v_clinic_id, v_invoice_id, 0, 'QA trend test visit', 1, (v_month_index + 1) * 50000
      );

      update public.invoices set status = 'sent'
      where id = v_invoice_id and clinic_id = v_clinic_id;

      insert into public.payments (
        clinic_id, invoice_id, method, amount_centavos, status, provider,
        reference, paid_at, created_at
      ) values (
        v_clinic_id, v_invoice_id, 'cash', (v_month_index + 1) * 50000,
        'succeeded', 'manual', format('QA Trend Test %s', to_char(v_month, 'YYYY-MM')),
        ((v_month + 1)::timestamp + time '11:00') at time zone 'Asia/Manila',
        ((v_month + 1)::timestamp + time '11:00') at time zone 'Asia/Manila'
      );

      perform set_config('app.allow_paid', '1', true);
      update public.invoices set status = 'paid'
      where id = v_invoice_id and clinic_id = v_clinic_id;
    end if;

    -- The invoice guard stamps paid_at at transition time. Restore the QA fixture's
    -- historical payment date so invoice summaries and collections share the same month.
    update public.invoices i
    set sent_at = (
      select p.created_at - interval '1 hour' from public.payments p
      where p.invoice_id = i.id and p.status = 'succeeded'
      order by p.paid_at desc
      limit 1
    ),
    paid_at = (
      select p.paid_at from public.payments p
      where p.invoice_id = i.id and p.status = 'succeeded'
      order by p.paid_at desc
      limit 1
    )
    where i.id = v_invoice_id and i.clinic_id = v_clinic_id and i.status = 'paid';
  end loop;
end;
$seed$;

commit;
