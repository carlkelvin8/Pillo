-- 1. MCP token expiry. Existing tokens get 30 more days; new tokens default to 90 days (max 366).
alter table public.mcp_tokens add column expires_at timestamptz;
update public.mcp_tokens set expires_at = now() + interval '30 days' where expires_at is null;
alter table public.mcp_tokens
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '90 days'),
  add constraint mcp_tokens_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '366 days'
  );
grant select (expires_at) on public.mcp_tokens to authenticated;
grant insert (expires_at) on public.mcp_tokens to authenticated;

-- 2. Least-privilege role for the MCP route (DATABASE_URL_MCP). It is NOLOGIN here on purpose:
--    an operator enables it with `alter role pillo_mcp login password '...'` outside version control.
--    It can only run the statements src/features/mcp/ issues: no DELETE, no DDL, no access to
--    clinical records, memberships, auth, storage or any table not listed below.
do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'pillo_mcp') then
    create role pillo_mcp nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$role$;

-- Older Postgres defaults let every role create objects in public; the MCP role must not.
revoke create on schema public from public;
grant usage on schema public to pillo_mcp;

grant select (id, clinic_id, scopes, token_hash, expires_at, revoked_at) on public.mcp_tokens to pillo_mcp;
grant update (last_used_at) on public.mcp_tokens to pillo_mcp;
grant select (id, timezone) on public.clinics to pillo_mcp;
grant select on public.clinic_hours, public.doctor_hours to pillo_mcp;
grant select on public.appointments to pillo_mcp;
grant insert (clinic_id, patient_id, doctor_id, branch_id, starts_at, ends_at, status, source)
  on public.appointments to pillo_mcp;
grant update (starts_at, ends_at) on public.appointments to pillo_mcp;
grant select (id, clinic_id, patient_number, full_name, birthdate, sex, phone, email)
  on public.patients to pillo_mcp;
grant select (id, clinic_id, invoice_number, total_centavos, status, created_at)
  on public.invoices to pillo_mcp;
grant insert (clinic_id, patient_id, due_on) on public.invoices to pillo_mcp;
grant insert (clinic_id, invoice_id, position, description, quantity, unit_price_centavos)
  on public.invoice_items to pillo_mcp;
grant select (clinic_id, invoice_id, amount_centavos, status, paid_at) on public.payments to pillo_mcp;
grant insert (clinic_id, kind, status, autonomy, payload, outcome) on public.agent_actions to pillo_mcp;
grant insert (clinic_id, actor_type, action, entity, entity_id, meta) on public.audit_log to pillo_mcp;

-- Row level security still applies to this role: the explicit clinic_id filter in every MCP query is
-- the tenant boundary (no user session exists), and these policies only open the rows those queries use.
do $policies$
declare
  t text;
begin
  foreach t in array array[
    'mcp_tokens', 'clinics', 'clinic_hours', 'doctor_hours', 'appointments', 'patients',
    'invoices', 'invoice_items', 'payments', 'agent_actions', 'audit_log'
  ] loop
    execute format('drop policy if exists pillo_mcp_all on public.%I', t);
    execute format('create policy pillo_mcp_all on public.%I for all to pillo_mcp using (true) with check (true)', t);
  end loop;
end
$policies$;
