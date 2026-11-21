-- Postings from job-alert emails.
--
-- The crawler is employer-first: pick companies, watch their boards. Alerts are
-- query-first: pick titles, and the employer is an OUTPUT. That is why they
-- surface companies discovery has never seen — which makes them a source of
-- EMPLOYERS, not just postings.
--
-- So an alert employer becomes a real companies row. Discovery can then try to
-- resolve its ATS, and if it has a readable board the crawler starts pulling
-- EVERY posting from it, not just the ones matching an alert query. The target
-- list grows itself.

alter table jobscout.jobs
  add column if not exists source text not null default 'ats';

comment on column jobscout.jobs.source is
  'ats = crawled from an employer board; indeed/linkedin = parsed from a job-alert email.';

create index if not exists jobs_source_idx on jobscout.jobs (source, first_seen desc);

-- How a company got here. An alert-sourced employer is a lead, not a vetted
-- target, and the dashboard should be able to tell them apart.
alter table jobscout.companies
  add column if not exists origin text not null default 'seed';

comment on column jobscout.companies.origin is
  'seed = on the hand-built target list; alert = first seen in a job-alert email.';

-- Employers arrive from alerts as free text, so the same name must not create
-- two rows on a stray space or a case change.
create unique index if not exists companies_name_norm_idx
  on jobscout.companies (lower(btrim(name)));

-- Find-or-create an employer by name.
--
-- Alert postings name their employer and nothing else — no website, no ATS. A
-- new row is deliberately left with website null so jobscout-discover will NOT
-- pick it up (it requires a website); adding one is a separate, deliberate
-- step. The row still earns its place: it is a real employer hiring for a role
-- Keith wants, which is more than most of the seed list has demonstrated.
create or replace function jobscout.upsert_company_by_name(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   bigint;
  v_name text := btrim(p_name);
begin
  if v_name is null or v_name = '' then
    raise exception 'upsert_company_by_name: empty company name';
  end if;

  select id into v_id from jobscout.companies
   where lower(btrim(name)) = lower(v_name);
  if found then
    return v_id;
  end if;

  insert into jobscout.companies (name, origin, active, priority, notes)
  values (v_name, 'alert', true, 3, 'first seen in a job-alert email')
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from jobscout.companies
   where lower(btrim(name)) = lower(v_name);
  return v_id;
end;
$$;

revoke all on function jobscout.upsert_company_by_name(text) from public;

-- The shortlist should say where a posting came from. Column order changes, so
-- this is a drop-and-recreate rather than a replace.
drop view if exists jobscout.v_shortlist;

create view jobscout.v_shortlist as
select
  s.fit_score, s.verdict, s.why_fits, s.why_not, s.resume_angle,
  j.id as job_id, j.title, j.location, j.url, j.comp_text,
  j.posted_at, j.first_seen, j.source,
  c.name as company, c.city, c.owner_type, c.size_band, c.origin,
  coalesce(a.status, 'new') as status
from jobscout.scores s
join jobscout.jobs j       on j.id = s.job_id
join jobscout.companies c  on c.id = j.company_id
left join jobscout.applications a on a.job_id = j.id
where j.is_open
order by s.fit_score desc, j.first_seen desc;

grant select on jobscout.v_shortlist to anon;