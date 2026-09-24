# HomeHuddle — sync reports

**Database:** Venuewise Platform (`urwnbskrtoplgnkkxuvl`), not HL-BOS Core.
**Applied:** 2026-09-24 00:27 UTC, with Keith's explicit approval.
**Migration name in that project's history:** `homehuddle_sync_reports`.

## Why

HomeHuddle pulls each family's team calendars (TeamSnap, GameChanger,
LeagueApps) every 30 minutes with the `sync-schedules` Edge Function. The
function returns a report of what each feed contained, but nothing kept it:

1. The cron job (`sync-schedules-every-30min`, job 6) called the function with
   pg_net's default **5-second** timeout. The sync takes longer, so every
   response was recorded as a timeout and the report was lost.
2. Even a captured response is deleted by pg_net after **6 hours**.

So "was my new TeamSnap event in the feed?" had no answer on record.

## What changed

| Change                                                                                                        | Reversible by                             |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Job 6 waits up to 120 s for the report (`timeout_milliseconds := 120000`)                                     | removing that argument                    |
| Job 6 records each run's request id: `insert into public.sync_reports (request_id) select net.http_post(...)` | removing the `insert ... ` prefix         |
| New table `public.sync_reports` — one row per run, with the function's JSON report                            | `drop table public.sync_reports`          |
| New function `public.capture_sync_reports()` — copies each finished response into its row                     | `drop function`                           |
| New cron job `capture-sync-reports`, every 5 minutes                                                          | `cron.unschedule('capture-sync-reports')` |

Job 6 was edited in place with `replace()` so the service key stored in it
never left the database. The sync itself — `sync-schedules` — is unchanged.

`sync_reports` has row-level security on and no policies: no app user can read
it. The Control Center reads it through the Management API's read-only user.

Outcomes: `running` (waiting for the response), `ok`, `http_error`,
`timed_out`, `failed`, `lost` (response expired before it was captured).

## Reading it

```sql
select started_at, outcome,
       f->>'team' as team, f->'fetched' as fetched, f->'errors' as errors
from public.sync_reports, jsonb_array_elements(report->'feeds') f
order by started_at desc
limit 20;
```

## Migration SQL (as applied)

```sql
create table public.sync_reports (
  id          bigint generated always as identity primary key,
  request_id  bigint not null unique,
  started_at  timestamptz not null default now(),
  captured_at timestamptz,
  outcome     text not null default 'running'
              check (outcome in ('running','ok','http_error','timed_out','failed','lost')),
  status_code int,
  error       text,
  report      jsonb,
  raw_body    text
);
create index sync_reports_started_at_idx on public.sync_reports (started_at desc);
alter table public.sync_reports enable row level security;
revoke all on public.sync_reports from anon, authenticated;

create or replace function public.capture_sync_reports()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; j jsonb; n integer := 0;
begin
  for r in
    select s.id, h.status_code, h.timed_out, h.error_msg, h.content
      from public.sync_reports s
      join net._http_response h on h.id = s.request_id
     where s.outcome = 'running'
  loop
    begin j := r.content::jsonb; exception when others then j := null; end;
    update public.sync_reports set
      captured_at = now(), status_code = r.status_code, error = r.error_msg,
      report = j, raw_body = case when j is null then left(r.content, 4000) end,
      outcome = case
                  when r.timed_out then 'timed_out'
                  when r.error_msg is not null then 'failed'
                  when r.status_code between 200 and 299 then 'ok'
                  else 'http_error'
                end
     where id = r.id;
    n := n + 1;
  end loop;
  update public.sync_reports set outcome = 'lost', captured_at = now()
   where outcome = 'running' and started_at < now() - interval '6 hours';
  return n;
end $$;
revoke all on function public.capture_sync_reports() from public, anon, authenticated;

select cron.alter_job(6, command := replace(command,
  'select net.http_post(',
  'insert into public.sync_reports (request_id) select net.http_post('))
from cron.job where jobid = 6 and command not like '%sync_reports%';

select cron.schedule('capture-sync-reports', '*/5 * * * *',
  'select public.capture_sync_reports();');
```

The timeout change to job 6 was made just before this migration:

```sql
select cron.alter_job(6, command := replace(command,
  'body := ''{}''::jsonb',
  'body := ''{}''::jsonb,' || E'\r\n    timeout_milliseconds := 120000'))
from cron.job where jobid = 6 and command not like '%timeout_milliseconds%';
```
