alter table public.clinics
  add column website_url text
  constraint clinics_website_url_is_web check (
    char_length(website_url) <= 2048
    and website_url ~* '^https?://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$'
  );

-- The existing clinics update policy limits this grant to the clinic's owners.
grant update (website_url) on public.clinics to authenticated;
