-- ---------------------------------------------------------------------------
-- LOCAL TEST HARNESS ONLY. NOT A MIGRATION. NEVER APPLIED TO ANY SUPABASE
-- PROJECT. Load after supabase-shim.sql.
--
-- Supabase surface that supabase-shim.sql does not emulate but production SQL
-- uses: auth.jwt(), auth.sessions (session revocation checks), the
-- storage.objects.owner_id column, and password sign-in for the isolated
-- environment's apps (crypt() over auth.users.encrypted_password, which is
-- how GoTrue stores bcrypt hashes).
-- ---------------------------------------------------------------------------
create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create table if not exists auth.sessions (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on auth.sessions to authenticated, service_role;

alter table storage.objects add column if not exists owner_id text;
