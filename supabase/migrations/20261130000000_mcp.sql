-- Phase 5: clinic-scoped MCP bearer tokens. Only hashes are persisted.
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (cardinality(scopes) <= 6),
  check (scopes <@ array[
    'appointments:read', 'patients:read', 'daily_summary:read',
    'appointments:write', 'invoices:write', 'payments:request'
  ]::text[]),
  unique (clinic_id, id)
);
create index mcp_tokens_clinic_idx on public.mcp_tokens (clinic_id, created_at desc);

alter table public.mcp_tokens enable row level security;
create policy mcp_tokens_select on public.mcp_tokens for select to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy mcp_tokens_insert on public.mcp_tokens for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner']::public.app_role[])
    and created_by = (select auth.uid())
  );
create policy mcp_tokens_revoke on public.mcp_tokens for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]) and revoked_at is null)
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]) and revoked_at is not null);

revoke all on public.mcp_tokens from anon, authenticated;
grant select (id, clinic_id, name, scopes, created_by, created_at, last_used_at, revoked_at)
  on public.mcp_tokens to authenticated;
grant insert (clinic_id, name, token_hash, scopes, created_by) on public.mcp_tokens to authenticated;
grant update (revoked_at) on public.mcp_tokens to authenticated;

-- A narrow RPC preserves append-only client access to agent_actions.
create function public.decide_mcp_payment_request(p_action_id uuid, p_approved boolean)
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
  where id = p_action_id and kind = 'mcp_request_payment' and status = 'proposed'
  for update;
  -- Keep unknown and cross-clinic IDs indistinguishable to callers.
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.has_role(v_clinic_id, array['owner', 'receptionist']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.agent_actions
  set status = case when p_approved then 'approved'::public.agent_action_status else 'rejected'::public.agent_action_status end,
      decided_by = (select auth.uid()),
      outcome = case when p_approved then 'Staff approved payment link' else 'Staff rejected payment request' end
  where id = p_action_id and clinic_id = v_clinic_id and status = 'proposed';
  return found;
end;
$$;
revoke all on function public.decide_mcp_payment_request(uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_mcp_payment_request(uuid, boolean) to authenticated;
