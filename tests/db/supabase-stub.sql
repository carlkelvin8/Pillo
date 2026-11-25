-- Minimal stand-in for the parts of Supabase that migrations and RLS depend on.
-- Used ONLY by `pnpm test:db` on a throwaway Postgres. Real Supabase provides these.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
-- Supabase keeps extensions in their own schema and puts it on the search_path.
create schema extensions;
alter database postgres set search_path = "$user", public, extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub', '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants broad default privileges on public; emulate so our REVOKEs are exercised.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
