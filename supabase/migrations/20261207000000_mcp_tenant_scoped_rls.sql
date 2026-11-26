-- Replace the application-only tenant boundary with a database-enforced request scope.
-- Each MCP operation sets app.mcp_clinic_id transaction-locally after authenticating its token.
-- Token lookup is scoped by the request token hash until that token's clinic is known.

-- Appointment reason and any future columns are not needed by the MCP tools.
revoke select on public.appointments from pillo_mcp;
grant select (id, clinic_id, patient_id, doctor_id, branch_id, starts_at, ends_at, status)
  on public.appointments to pillo_mcp;

do $policies$
declare
  t text;
begin
  foreach t in array array[
    'mcp_tokens', 'clinics', 'clinic_hours', 'doctor_hours', 'appointments', 'patients',
    'invoices', 'invoice_items', 'payments', 'agent_actions', 'audit_log'
  ] loop
    execute format('drop policy if exists pillo_mcp_all on public.%I', t);

    if t = 'clinics' then
      execute $policy$
        create policy pillo_mcp_clinic_scope on public.clinics
        for all to pillo_mcp
        using (id = nullif(current_setting('app.mcp_clinic_id', true), '')::uuid)
        with check (id = nullif(current_setting('app.mcp_clinic_id', true), '')::uuid)
      $policy$;
    elsif t = 'mcp_tokens' then
      execute $policy$
        create policy pillo_mcp_token_scope on public.mcp_tokens
        for select to pillo_mcp
        using (
          token_hash = nullif(current_setting('app.mcp_token_hash', true), '')
          or clinic_id = nullif(current_setting('app.mcp_clinic_id', true), '')::uuid
        )
      $policy$;
      execute $policy$
        create policy pillo_mcp_token_update on public.mcp_tokens
        for update to pillo_mcp
        using (clinic_id = nullif(current_setting('app.mcp_clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.mcp_clinic_id', true), '')::uuid)
      $policy$;
    else
      execute format(
        'create policy pillo_mcp_clinic_scope on public.%I for all to pillo_mcp using (clinic_id = nullif(current_setting(''app.mcp_clinic_id'', true), '''')::uuid) with check (clinic_id = nullif(current_setting(''app.mcp_clinic_id'', true), '''')::uuid)',
        t
      );
    end if;
  end loop;
end
$policies$;
