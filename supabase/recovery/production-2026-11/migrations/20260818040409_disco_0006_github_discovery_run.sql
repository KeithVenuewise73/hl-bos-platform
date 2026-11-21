-- Restores the ORIGINAL HLVS-V1 discovery behaviour: capture everything the
-- six GitHub queries return, create an opportunity record for each, filter
-- nothing before display. Additive only.

create table if not exists disco.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  method text not null,
  queries jsonb not null default '[]'::jsonb,
  raw_results int,
  deduped_results int,
  opportunities_created int,
  filtered_out int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text
);
alter table disco.discovery_runs enable row level security;
create policy discovery_runs_read on disco.discovery_runs for select
  using (identity.has_platform_permission('vstudio.opportunity.read'::extensions.citext));
create policy discovery_runs_write on disco.discovery_runs for all
  using (identity.has_platform_permission('vstudio.opportunity.manage'::extensions.citext))
  with check (identity.has_platform_permission('vstudio.opportunity.manage'::extensions.citext));

-- Link each opportunity back to the run + the exact query that surfaced it.
alter table disco.assessments add column if not exists discovered_in_run uuid;
alter table disco.assessments add column if not exists source_query text;
alter table disco.assessments add column if not exists source_area text;
alter table disco.assessments add column if not exists repo_stars int;
alter table disco.assessments add column if not exists repo_forks int;
alter table disco.assessments add column if not exists repo_open_issues int;
alter table disco.assessments add column if not exists repo_language text;
alter table disco.assessments add column if not exists repo_topics text[];
alter table disco.assessments add column if not exists repo_pushed_at date;
alter table disco.assessments add column if not exists repo_license text;
alter table disco.assessments add column if not exists repo_archived boolean;

-- Bulk ingest. No score gate, no curation: every deduped row becomes a record.
create or replace function disco.ingest_github_batch(p_run uuid, p_tenant uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path to '' as $fn$
declare r jsonb; v_opp uuid; n int := 0;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if exists (select 1 from vstudio.opportunities o
               where o.tenant_id = p_tenant and o.source_url = r->>'url') then
      continue;  -- dedupe by repository URL only
    end if;

    insert into vstudio.opportunities
      (tenant_id, title, summary, problem_statement, proposed_customer, industry,
       opportunity_type, source_type, source_url, tags, created_by)
    values (p_tenant, r->>'name', coalesce(r->>'description',''), '', '',
            coalesce(r->>'source_area',''), 'open_source_leverage', 'github',
            r->>'url',
            coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(r->'topics','[]'::jsonb))),'{}'),
            auth.uid())
    returning id into v_opp;

    insert into vstudio.evidence
      (opportunity_id, evidence_type, title, source_url, source_name, captured_date, created_by)
    values (v_opp, 'verified_fact',
            format('%s — %s stars, %s forks, %s open issues, language %s, last push %s, license %s%s',
                   r->>'name', r->>'stars', r->>'forks', r->>'open_issues',
                   coalesce(r->>'language','n/a'), left(coalesce(r->>'pushed_at',''),10),
                   coalesce(r->>'license','none'),
                   case when (r->>'archived')::boolean then ', ARCHIVED' else '' end),
            r->>'url', 'GitHub Search API (measured)', current_date, auth.uid());

    insert into disco.assessments
      (opportunity_id, tenant_id, category, event_kind, trigger_event,
       discovered_in_run, source_query, source_area,
       repo_stars, repo_forks, repo_open_issues, repo_language, repo_topics,
       repo_pushed_at, repo_license, repo_archived,
       confidence, rank_rationale)
    values (v_opp, p_tenant, r->>'source_area', 'market_gap',
            format('GitHub query: %s', r->>'source_query'),
            p_run, r->>'source_query', r->>'source_area',
            (r->>'stars')::int, (r->>'forks')::int, (r->>'open_issues')::int,
            r->>'language',
            coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(r->'topics','[]'::jsonb))),'{}'),
            nullif(left(coalesce(r->>'pushed_at',''),10),'')::date,
            r->>'license', (r->>'archived')::boolean,
            'unscored',
            'Captured by the restored HLVS-V1 GitHub discovery pass. Unscored and uncurated by design.');

    perform vstudio.set_opportunity_status(v_opp, 'inbox');
    n := n + 1;
  end loop;
  return n;
end $fn$;

revoke execute on function disco.ingest_github_batch(uuid,uuid,jsonb) from anon, public;