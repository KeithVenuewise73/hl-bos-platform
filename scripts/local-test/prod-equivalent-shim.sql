-- LOCAL DEVELOPMENT ONLY. Stand-ins for Supabase-provided extensions that are
-- not available on a plain PostgreSQL, so the RECOVERED production migrations
-- (PR #113) can be replayed into a disposable database. Applied after
-- scripts/local-test/supabase-shim.sql. Never applied to a hosted project.
--
-- Divergences, stated plainly:
--   pg_net 0.20.3  -> schema "net" with http_post() that makes NO network call
--   pg_cron 1.6.4  -> schema "cron" with a job table; nothing is ever run
--   supabase_vault -> schema "vault" only (no secrets exist locally)
--   pgtap 1.3.3    -> not installed; its CREATE EXTENSION line is skipped
--   pg_stat_statements -> not installed (no migration depends on it)
create schema if not exists net;
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select null::bigint $$;
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default false);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid $$;
create or replace function cron.unschedule(job_name text)
returns boolean language sql as $$ delete from cron.job where jobname = job_name returning true $$;
create schema if not exists vault;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
-- dma_0002_seed (production 20260808180126) hard-codes the production owner's
-- auth user id as created_by. Replaying it into an empty database needs that
-- user to exist, so a PLACEHOLDER row with the same id is created here.
-- It is not the real account and has no credentials.
insert into auth.users (id, email, email_confirmed_at)
values ('c9827bd9-1614-4c51-bd25-762d3ae0cac0', 'production-owner-placeholder@local.test', now())
on conflict (id) do nothing;
-- Supabase storage has objects.owner_id (text) as well as owner (uuid); the
-- fleet medical-card policies (production 20261017210755) use it.
alter table storage.objects add column if not exists owner_id text;
-- Supabase Auth's session table; fleet.medical_api checks session revocation.
create table if not exists auth.sessions (id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now());
