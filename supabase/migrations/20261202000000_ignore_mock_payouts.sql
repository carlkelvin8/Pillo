-- Exclude historical simulated payouts from the displayed available balance.
create or replace function private.available_balance(p_clinic_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select sum(p.amount_centavos) from public.payments p
           where p.clinic_id = p_clinic_id
             and p.status = 'succeeded'
             and p.provider <> 'manual'
         ), 0)
       - coalesce((
           select sum(po.amount_centavos) from public.payouts po
           where po.clinic_id = p_clinic_id
             and po.status <> 'cancelled'
             and po.is_mock = false
         ), 0);
$$;

-- This helper is SECURITY DEFINER and must only be called by trusted database code.
revoke execute on function private.available_balance(uuid) from public, anon, authenticated;

-- A real payout provider is not available, so remove the mock withdrawal RPC.
drop function public.request_payout(uuid, bigint, text, date);
