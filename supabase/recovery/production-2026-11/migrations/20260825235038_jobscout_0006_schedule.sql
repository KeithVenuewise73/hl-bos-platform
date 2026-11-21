create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto with schema extensions;

create table if not exists jobscout.runtime (
  id            boolean primary key default true check (id),
  functions_url text not null,
  anon_key      text not null,
  cron_token    text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at    timestamptz not null default now()
);

alter table jobscout.runtime enable row level security;
revoke all on jobscout.runtime from public;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on jobscout.runtime from %I', r);
    end if;
  end loop;
end $$;

create or replace function jobscout.kick(fn text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg jobscout.runtime%rowtype;
begin
  select * into cfg from jobscout.runtime where id;
  if not found then
    raise exception 'jobscout.kick: jobscout.runtime is empty — nothing is configured';
  end if;

  return net.http_post(
    url     := cfg.functions_url || '/' || fn,
    headers := jsonb_build_object(
                 'Content-Type',      'application/json',
                 'Authorization',     'Bearer ' || cfg.anon_key,
                 'x-jobscout-token',  cfg.cron_token),
    body    := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;

revoke all on function jobscout.kick(text) from public;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function jobscout.kick(text) from %I', r);
    end if;
  end loop;
end $$;

select cron.unschedule(jobname) from cron.job where jobname like 'jobscout-%';

select cron.schedule('jobscout-ingest-am', '10 10 * * *', $$select jobscout.kick('jobscout-ingest')$$);
select cron.schedule('jobscout-ingest-pm', '10 22 * * *', $$select jobscout.kick('jobscout-ingest')$$);
select cron.schedule('jobscout-score-am',  '35 10 * * *', $$select jobscout.kick('jobscout-score')$$);
select cron.schedule('jobscout-score-pm',  '35 22 * * *', $$select jobscout.kick('jobscout-score')$$);
select cron.schedule('jobscout-discover',  '0 8 * * *',   $$select jobscout.kick('jobscout-discover')$$);