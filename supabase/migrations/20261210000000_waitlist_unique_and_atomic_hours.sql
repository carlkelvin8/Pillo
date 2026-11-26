-- 1. One active waitlist entry per patient. Older duplicates (if any) are marked removed first.
with ranked as (
  select id, row_number() over (partition by clinic_id, patient_id order by created_at, id) as n
  from public.waitlist_entries
  where status in ('waiting', 'offered')
)
update public.waitlist_entries w
set status = 'removed'
from ranked
where w.id = ranked.id and ranked.n > 1;

create unique index waitlist_one_active_per_patient
  on public.waitlist_entries (clinic_id, patient_id)
  where status in ('waiting', 'offered');

-- 2. Remember that a branch's hours were saved, so "closed all week" is not mistaken for "never set up".
alter table public.branches add column hours_saved_at timestamptz;
grant update (hours_saved_at) on public.branches to authenticated;

-- 3. Save a branch's weekly hours atomically (runs with the caller's rights, so RLS still decides who may).
--    A per-branch advisory lock serialises overlapping saves, so two saves can never leave both weeks.
create function public.save_branch_hours(p_clinic_id uuid, p_branch_id uuid, p_hours jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'hours must be an array' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('branch-hours:' || p_branch_id::text, 0));
  delete from public.clinic_hours where clinic_id = p_clinic_id and branch_id = p_branch_id;
  insert into public.clinic_hours (clinic_id, branch_id, weekday, opens_at, closes_at)
  select p_clinic_id, p_branch_id, (h ->> 'weekday')::smallint, (h ->> 'opens_at')::time, (h ->> 'closes_at')::time
  from jsonb_array_elements(p_hours) as h;
  update public.branches set hours_saved_at = now() where clinic_id = p_clinic_id and id = p_branch_id;
end;
$$;
revoke all on function public.save_branch_hours(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_branch_hours(uuid, uuid, jsonb) to authenticated;
