-- ---------------------------------------------------------------------------
-- LOCAL TEST HARNESS ONLY. NOT A MIGRATION. NEVER APPLIED TO ANY SUPABASE
-- PROJECT.
--
-- Extra Supabase surface used by the production fleet / scorecard SQL that
-- supabase-shim.sql does not already emulate. Load after supabase-shim.sql.
-- ---------------------------------------------------------------------------

-- auth.jwt(): the request claims, as Supabase defines it.
create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- auth.sessions: fleet.api refuses a JWT whose session_id has been revoked.
create table if not exists auth.sessions (
  id       uuid primary key default pg_catalog.gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on auth.sessions to authenticated, service_role;

-- Real storage.objects carries owner_id (text) alongside the legacy owner uuid.
alter table storage.objects add column if not exists owner_id text;
