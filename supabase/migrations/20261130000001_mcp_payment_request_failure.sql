-- Record a failed link creation after a staff member has claimed approval.
-- This keeps retries from issuing duplicate provider links and stores no provider error details.
create function public.fail_mcp_payment_request(p_action_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id
  from public.agent_actions
  where id = p_action_id
    and kind = 'mcp_request_payment'
    and status = 'approved'
  for update;

  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.has_role(v_clinic_id, array['owner', 'receptionist']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.agent_actions
  set status = 'failed'::public.agent_action_status,
      decided_by = (select auth.uid()),
      outcome = 'Payment link creation failed after staff approval.'
  where id = p_action_id
    and clinic_id = v_clinic_id
    and kind = 'mcp_request_payment'
    and status = 'approved';
  return found;
end;
$$;

revoke all on function public.fail_mcp_payment_request(uuid) from public, anon, authenticated;
grant execute on function public.fail_mcp_payment_request(uuid) to authenticated;
