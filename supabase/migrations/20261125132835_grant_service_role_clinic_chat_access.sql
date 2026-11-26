-- The service-role key is server-only and bypasses RLS, but still needs SQL privileges.
-- Public patient chat uses server routes to read clinics and clinic data and to write
-- conversations, messages and agent activity. Do not grant these permissions to anon.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
