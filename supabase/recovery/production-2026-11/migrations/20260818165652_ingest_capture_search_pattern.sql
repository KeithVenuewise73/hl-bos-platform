-- Derives the search pattern from the query text. Verified lossless against
-- all 139 matrix queries (0 mismatches). Avoids changing discovery-run.
create or replace function disco.derive_search_pattern(p_query text)
returns text language sql immutable as $$
  select case
    when p_query is null then null
    when position('archived:true'   in p_query) > 0 then 'ABANDONED'
    when position('stars:200..2000' in p_query) > 0 then 'UNDERDEVELOPED'
    when position('"alternative to"' in p_query) > 0 then 'ALTERNATIVES'
    when position('topic:self-hosted' in p_query) > 0 then 'SELF-HOSTED'
    when position('pushed:>2026-03-01' in p_query) > 0 then 'PAIN SIGNALS'
    else 'POPULAR'
  end;
$$;

-- Only change to ingest_github_batch: populate search_pattern on insert.
create or replace function disco.ingest_github_batch(p_run uuid, p_tenant uuid, p_rows jsonb)
 returns integer language plpgsql security definer set search_path to ''
as $function$
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
       discovered_in_run, source_query, source_area, search_pattern,
       repo_stars, repo_forks, repo_open_issues, repo_language, repo_topics,
       repo_pushed_at, repo_license, repo_archived,
       confidence, rank_rationale)
    values (v_opp, p_tenant, r->>'source_area', 'market_gap',
            format('GitHub query: %s', r->>'source_query'),
            p_run, r->>'source_query', r->>'source_area',
            disco.derive_search_pattern(r->>'source_query'),
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
end $function$;