-- request_payment inserts into agent_actions with RETURNING id, status: PostgreSQL requires SELECT
-- on the returned columns (and clinic_id for the RLS check). Grant only those columns; the
-- tenant-scoped pillo_mcp_clinic_scope policy (20261207) still limits the rows to one clinic.
grant select (id, clinic_id, status) on public.agent_actions to pillo_mcp;
