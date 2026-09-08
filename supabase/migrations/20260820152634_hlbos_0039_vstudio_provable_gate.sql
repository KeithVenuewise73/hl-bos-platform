-- hlbos_0039: make the intelligence gate provable
--
-- Every vstudio intelligence control is gated on vstudio.intelligence.manage,
-- with an escape hatch for direct connections:
--
--     if session_user not in ('postgres', 'supabase_admin') and not <permission>
--
-- The escape hatch is necessary. identity.has_platform_permission() resolves
-- the caller through auth.uid(), which is NULL on a direct psql or MCP
-- connection, so without it the admin tooling that BUILDS these rankings would
-- be locked out of running them.
--
-- But it was too wide, and the cost was not theoretical: the pgTAP suite also
-- connects as `postgres`, so every one of these guards short-circuited under
-- test and the refusal path was unreachable. Nine controls claimed to refuse
-- unauthorised callers and not one of them had ever been observed doing it.
-- A gate nobody can test is a gate nobody should trust.
--
-- The hatch now also requires the ABSENCE of a request context. A direct
-- connection has no request.jwt.claims; anything arriving through PostgREST
-- does. So:
--
--   * PostgREST caller       -> session_user is `authenticator`  -> gated (unchanged)
--   * direct psql / MCP      -> postgres, no JWT claims          -> allowed (unchanged)
--   * pgTAP impersonating    -> postgres, JWT claims present     -> gated (now reachable)
--
-- This is strictly tighter than what it replaces: every caller allowed after
-- this migration was allowed before it. The function bodies below are
-- otherwise byte-identical to 0034-0038 -- only the guard changed.
--
-- rollback:
--   Restore the previous inline guard by re-running the function definitions
--   from migrations 0034-0038, then:
--     drop function if exists vstudio.assert_intelligence_manage();
--   No data is touched by this migration and none is touched by its rollback.

create or replace function vstudio.assert_intelligence_manage()
returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  -- A direct maintenance connection: no request context to authorise against,
  -- and no PostgREST path that could reach here.
  if session_user in ('postgres', 'supabase_admin')
     and coalesce(pg_catalog.current_setting('request.jwt.claims', true), '') = '' then
    return;
  end if;
  if not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;
revoke all on function vstudio.assert_intelligence_manage() from public, anon;
grant execute on function vstudio.assert_intelligence_manage() to authenticated;
comment on function vstudio.assert_intelligence_manage() is
  'Single gate for the vstudio intelligence controls. Allows an unauthenticated direct connection (psql/MCP, which has no auth.uid() to check) and requires vstudio.intelligence.manage from everyone else -- including a test impersonating a user, which is what makes the refusal observable.';

create or replace function vstudio.score_level1(p_category text)
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  -- Running the analysis is a privilege distinct from reading its results.
  --
  -- Two callers are legitimate, and SESSION_USER is what separates them:
  -- inside a SECURITY DEFINER function CURRENT_USER is the owner, so it would
  -- wave everyone through. A request arriving through the API always has
  -- session_user = authenticator and must therefore hold the permission; a
  -- direct maintenance connection (the platform operating on itself, to run a
  -- scheduled or Control-Center-triggered rescore) logs in as postgres and is
  -- not reachable from any browser session.
  perform vstudio.assert_intelligence_manage();

insert into vstudio.opportunity_scores (
  opportunity_id, scoring_version, analysis_level,
  popularity_score, popularity_status, popularity_components,
  suitability_score, suitability_status, suitability_components,
  evidence, method, computed_at
)
with base as (
  select
    o.id, o.category, o.search_pattern, o.stars, o.forks, o.open_issues,
    o.pushed_at, o.archived, o.topics, o.license, o.language,
    -- One lowercased haystack per row: name, description and declared topics.
    -- Separators are flattened to spaces so "route/planner" and "route_planner"
    -- match the same vocabulary a human would read them as.
    regexp_replace(
      lower(coalesce(o.title,'') || ' ' || coalesce(o.summary,'') || ' ' ||
            array_to_string(coalesce(o.topics,'{}'::text[]), ' ')),
      '[_/\\]+', ' ', 'g') as haystack,
    (select count(*) from unnest(coalesce(o.topics,'{}'::text[])) t
      where lower(t) = any(array['saas','self-hosted','selfhosted','crm','erp','billing','invoicing','subscription','payments','booking','scheduling','marketplace','analytics','dashboard','automation','workflow','api','b2b','multi-tenant','multitenant','enterprise','no-code','low-code'])) as money_hits
  from vstudio.opportunities o
  -- IS NOT DISTINCT FROM, so the NULL-category partition is selectable too.
  where o.category is not distinct from p_category
),
ranked as (
  select b.*,
    -- Rank WITHIN the discovery category. cume_dist rather than percent_rank so
    -- the only row in a small category scores 1 instead of 0 — being the whole
    -- of a category is not the same as being the bottom of one.
    -- Cast to numeric: cume_dist() returns double precision, and letting that
    -- leak into the score arithmetic silently promotes every downstream
    -- expression to floating point.
    case when b.stars is null then null
         else cume_dist() over (partition by b.category order by b.stars)::numeric end as stars_pct,
    case when b.forks is null then null
         else cume_dist() over (partition by b.category order by b.forks)::numeric end as forks_pct
  from base b
),
matched as (
  select b.*,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(logistics-management|workforce management|delivery management|route optimization|fleet management|stock management|field operations|transportation|route planning|field service|supply chain|supply-chain|middle mile|warehousing|dispatching|procurement|final mile|telematics|logistics|last mile|last-mile|warehouse|inventory|dispatch|shipment|shipping|supplier|freight|routing|courier|driver|fleet|wms|3pl|dsp)\M', 'g') m) as logistics_core,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(operational analytics|operations|scheduling|purchasing|workforce|tracking|delivery|vendor|crew|erp)\M', 'g') m) as logistics_sup,
    (b.category = any(array['logistics','fleet-management','inventory','manufacturing','agriculture','construction'])) as logistics_cat,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(customer communication|business intelligence|professional services|marketing automation|workflow automation|business process|customer service|lead generation|email marketing|website builder|small business|field service|home services|vertical saas|site builder|appointment|reputation|onboarding|ticketing|invoicing|ai agent|helpdesk|estimate|chatbot|invoice|billing|quoting|booking|quote|saas|crm|bpm|rpa|smb|lms|erp)\M', 'g') m) as transformation_core,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(landing page|scheduling|analytics|dashboard|reporting|payments|workflow|coaching|reviews|agents|course|lead)\M', 'g') m) as transformation_sup,
    (b.category = any(array['crm','erp','marketing-automation','email-marketing','business-intelligence','analytics-bi','automation-workflow','workflow-engine','rpa','no-code','customer-support','chat-messaging','ecommerce','point-of-sale','accounting','invoicing-billing','subscription-billing','saas-platforms','hr-recruiting','payroll','project-management','booking-appointments','scheduling-calendars','integration-ipaas'])) as transformation_cat,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(performance tracking|player development|league management|sports analytics|team management|video analysis|fan engagement|field booking|court booking|youth sports|tournament|recruiting|highlights|basketball|volleyball|gymnastics|game film|highlight|wrestling|scouting|football|baseball|lacrosse|softball|swimming|bracket|fixture|athlete|sports|roster|league|soccer|hockey|sport)\M', 'g') m) as sports_core,
    (select coalesce(array_agg(distinct m[1]), '{}'::text[])
       from regexp_matches(b.haystack, '\m(broadcasting|sponsorship|statistics|broadcast|streaming|schedule|facility|stats|venue|track|film|fan)\M', 'g') m) as sports_sup,
    (b.category = any(array['sports-technology','sports-analytics','esports','fitness'])) as sports_cat
  from ranked b
),
valued as (
  select m.*,
    case
      when m.logistics_cat then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(cardinality(m.logistics_core),0)::numeric + 0.5 * coalesce(cardinality(m.logistics_sup),0)::numeric) / 4))
      when coalesce(cardinality(m.logistics_core),0) >= 2 then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(cardinality(m.logistics_core),0)::numeric + 0.5 * coalesce(cardinality(m.logistics_sup),0)::numeric) / 4))
      else 0::numeric
    end as logistics_value,
    case
      when m.transformation_cat then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(cardinality(m.transformation_core),0)::numeric + 0.5 * coalesce(cardinality(m.transformation_sup),0)::numeric) / 4))
      when coalesce(cardinality(m.transformation_core),0) >= 2 then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(cardinality(m.transformation_core),0)::numeric + 0.5 * coalesce(cardinality(m.transformation_sup),0)::numeric) / 4))
      else 0::numeric
    end as transformation_value,
    case
      when m.sports_cat then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(cardinality(m.sports_core),0)::numeric + 0.5 * coalesce(cardinality(m.sports_sup),0)::numeric) / 4))
      when coalesce(cardinality(m.sports_core),0) >= 2 then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(cardinality(m.sports_core),0)::numeric + 0.5 * coalesce(cardinality(m.sports_sup),0)::numeric) / 4))
      else 0::numeric
    end as sports_value
  from matched m
),
computed as (
  select v.*,
    -- --- popularity components (each 0-1) ---
    greatest(0::numeric, least(1::numeric, 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 500000::numeric + 1))) + 0.5 * coalesce(v.stars_pct, greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 500000::numeric + 1)))))) as p_stars,
    greatest(0::numeric, least(1::numeric, 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.forks,0))::numeric + 1) / log(10::numeric, 100000::numeric + 1))) + 0.5 * coalesce(v.forks_pct, greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.forks,0))::numeric + 1) / log(10::numeric, 100000::numeric + 1)))))) as p_forks,
    greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.open_issues,0))::numeric + 1) / log(10::numeric, 10000::numeric + 1))) as p_issues,
    case when v.pushed_at is null then 0::numeric
         else greatest(0::numeric, least(1::numeric, 1 - (greatest(0, extract(epoch from (now() - v.pushed_at)) / 86400))::numeric / 1095)) end as p_recency,
    greatest(0::numeric, least(1::numeric, coalesce(cardinality(v.topics),0)::numeric / 10)) as p_topics,

    -- --- suitability components (each 0-1) ---
    greatest(v.logistics_value, v.transformation_value, v.sports_value) as s_domain,
    case when v.language is null then 0.30::numeric
         when v.language = any(array['TypeScript','JavaScript','SQL','PLpgSQL','Python','Shell','HTML','CSS']) then 1::numeric
         else 0.35::numeric end as s_stack,
    case when v.license is null or v.license = 'NOASSERTION' then 0.25::numeric
         when v.license = any(array['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','Unlicense','MPL-2.0','Zlib','BSL-1.0','PostgreSQL','Artistic-2.0','CC0-1.0']) then 1::numeric
         when v.license = any(array['GPL-2.0','GPL-3.0','AGPL-3.0','LGPL-2.1','LGPL-3.0','EUPL-1.2','OSL-3.0','CC-BY-SA-4.0']) then 0.30::numeric
         else 0.50::numeric end as s_licence,
    case when v.stars is null then 0.30::numeric
         else greatest(0::numeric, least(1::numeric, 1 - 0.7 * (abs(log(10::numeric, v.stars::numeric + 1) - log(10::numeric, 3000::numeric + 1)) / log(10::numeric, 3000::numeric + 1)))) end as s_build,
    case when v.archived then greatest(0::numeric, least(1::numeric, 0.6 + 0.4 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 20000::numeric + 1)))))
         when v.search_pattern = 'ABANDONED' then greatest(0::numeric, least(1::numeric, 0.5 + 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 20000::numeric + 1)))))
         when v.search_pattern = 'UNDERDEVELOPED' then greatest(0::numeric, least(1::numeric, 0.35 + 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 20000::numeric + 1)))))
         when v.search_pattern = 'ALTERNATIVES' then greatest(0::numeric, least(1::numeric, 0.3 + 0.4 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 20000::numeric + 1)))))
         else greatest(0::numeric, least(1::numeric, 0.15 * (1 + greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 20000::numeric + 1)))))) end as s_maintenance,
    greatest(0::numeric, least(1::numeric, v.money_hits::numeric / 4 + case when v.search_pattern in ('SELF-HOSTED','ALTERNATIVES') then 0.3 else 0 end)) as s_money,
    case when greatest(v.logistics_value, v.transformation_value, v.sports_value) < 0.35 then null
         else case when v.logistics_value = greatest(v.logistics_value, v.transformation_value, v.sports_value) then 'logistics'
              when v.transformation_value = greatest(v.logistics_value, v.transformation_value, v.sports_value) then 'transformation'
              when v.sports_value = greatest(v.logistics_value, v.transformation_value, v.sports_value) then 'sports'
              else null end
    end as best_core,
    greatest(v.logistics_value, v.transformation_value, v.sports_value) as best_core_value,
    (v.stars is not null or v.forks is not null or v.open_issues is not null) as measurable
  from valued v
)
select
  c.id,
  '2026-08-20-v1',
  1,
  -- POPULARITY. Null where no repository metric exists at all: a research note
  -- captured before discovery ran is not an unpopular repository, and scoring
  -- it zero would rank it below genuinely dead projects on evidence we never had.
  case when c.measurable then round(
    (c.p_stars * 35 + c.p_forks * 20 + c.p_issues * 10
     + c.p_recency * 30 + c.p_topics * 5) / 100 * 100)::int
  end,
  case when c.measurable then 'measured'::vstudio.metric_status else 'unknown'::vstudio.metric_status end,
  case when c.measurable then jsonb_build_array(
    jsonb_build_object('c','stars','v',round(c.p_stars,4),'w',35),
    jsonb_build_object('c','forks','v',round(c.p_forks,4),'w',20),
    jsonb_build_object('c','issue_activity','v',round(c.p_issues,4),'w',10),
    jsonb_build_object('c','recency','v',round(c.p_recency,4),'w',30),
    jsonb_build_object('c','topic_breadth','v',round(c.p_topics,4),'w',5)
  ) else '[]'::jsonb end,
  -- HLG SUITABILITY. Always ESTIMATED — a structured inference from observable
  -- properties, never a measurement. The CHECK on the table makes the honest
  -- label the only storable one.
  round((c.s_domain * 35 + c.s_stack * 15
       + c.s_licence * 15 + c.s_build * 10
       + c.s_maintenance * 10 + c.s_money * 15) / 100 * 100)::int,
  'estimated'::vstudio.metric_status,
  jsonb_build_array(
    jsonb_build_object('c','domain_overlap','v',round(c.s_domain,4),'w',35),
    jsonb_build_object('c','stack_reuse','v',round(c.s_stack,4),'w',15),
    jsonb_build_object('c','licence_commercial','v',round(c.s_licence,4),'w',15),
    jsonb_build_object('c','buildability','v',round(c.s_build,4),'w',10),
    jsonb_build_object('c','maintenance_opening','v',round(c.s_maintenance,4),'w',10),
    jsonb_build_object('c','monetization_surface','v',round(c.s_money,4),'w',15)
  ),
  -- Evidence: only what is NOT already on the corpus row. Stars, forks, licence
  -- and the rest stay where they are; duplicating them would create a second
  -- copy that can disagree with the first.
  jsonb_build_object(
    'stars_pct', round(coalesce(c.stars_pct,0),4),
    'forks_pct', round(coalesce(c.forks_pct,0),4),
    'best_core', c.best_core,
    'best_core_value', round(c.best_core_value,4),
    'qualification_threshold', 0.35,
    'matched', jsonb_build_object(
      'logistics', jsonb_build_object('core', to_jsonb(c.logistics_core), 'sup', to_jsonb(c.logistics_sup)),
      'transformation', jsonb_build_object('core', to_jsonb(c.transformation_core), 'sup', to_jsonb(c.transformation_sup)),
      'sports', jsonb_build_object('core', to_jsonb(c.sports_core), 'sup', to_jsonb(c.sports_sup))
    )
  ),
  'Level-1 deterministic triage, generated from packages/venture-studio/src/scoring.ts (2026-08-20-v1). Popularity measured from repository metrics; HLG suitability estimated from domain vocabulary, stack, licence, scale, discovery pattern and commercial-shape topics. No external research, no model, no invented figures.',
  now()
from computed c
on conflict (opportunity_id, scoring_version) do update set
  analysis_level         = excluded.analysis_level,
  popularity_score       = excluded.popularity_score,
  popularity_status      = excluded.popularity_status,
  popularity_components  = excluded.popularity_components,
  suitability_score      = excluded.suitability_score,
  suitability_status     = excluded.suitability_status,
  suitability_components = excluded.suitability_components,
  evidence               = excluded.evidence,
  method                 = excluded.method,
  computed_at            = excluded.computed_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

create or replace function vstudio.build_portfolio(p_key text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_def       vstudio.portfolios%rowtype;
  v_snapshot  uuid;
  v_corpus    integer;
  v_eligible  integer;
  v_members   integer;
  v_version   text := '2026-08-20-v1';
begin
  -- Recomputing a ranking is a privilege distinct from reading one. session_user
  -- rather than current_user: inside a definer function current_user is the
  -- owner and would admit everybody. A direct maintenance connection is the
  -- platform operating on itself and is not reachable from a browser.
  perform vstudio.assert_intelligence_manage();

  select * into v_def from vstudio.portfolios where key = p_key;
  if not found then
    raise exception 'unknown portfolio: %', p_key using errcode = 'no_data_found';
  end if;
  if v_def.rank_by = 'pain' then
    raise exception 'the pain portfolio ranks clusters, not repositories — use vstudio.build_pain_portfolio()'
      using errcode = 'feature_not_supported';
  end if;

  select count(*) into v_corpus from vstudio.opportunities;
  select count(*) into v_eligible from vstudio.portfolio_candidates(p_key);

  insert into vstudio.portfolio_snapshots
    (portfolio_key, scoring_version, corpus_size, eligible_count, member_count, method, is_current)
  values (p_key, v_version, v_corpus, v_eligible, 0,
    'Ranked on ' || v_def.rank_by || ' over ' || v_eligible || ' eligible of ' || v_corpus ||
    ' corpus records, scoring version ' || v_version ||
    '. Eligibility: ' || case when p_key = 'outside-core'
      then 'no core-domain match reached ' || 0.35 || ' and popularity is measured'
      else 'domain match >= ' || 0.35 end || '.',
    false)
  returning id into v_snapshot;

  -- The ranked selection. Ordering is fully deterministic: the ranking score,
  -- then the OTHER score as tiebreak, then the id. Without the final key a
  -- rebuild could reshuffle equal-scoring rows and the list would look
  -- unstable for no reason.
  insert into vstudio.portfolio_members (
    snapshot_id, opportunity_id, rank,
    popularity_score, popularity_status, suitability_score, suitability_status, rising_score,
    ranking_basis, ranking_score, qualification
  )
  select
    v_snapshot, e.opportunity_id, e.rn,
    e.popularity_score, e.popularity_status, e.suitability_score, e.suitability_status, e.rising_score,
    v_def.rank_by, e.rank_score,
    jsonb_build_object(
      'domain_value', round(e.domain_value, 4),
      'best_core_value', round(coalesce(e.best_core_value, 0), 4),
      'matched_terms', coalesce(e.matched_terms, '[]'::jsonb),
      'category', e.category,
      'threshold', 0.35,
      'basis', case when p_key = 'outside-core'
        then 'no core-domain match reached the threshold; ranked on measured popularity'
        else 'domain match ' || round(e.domain_value, 2) || ' from category and vocabulary evidence' end
    )
  from (
    select c.*, row_number() over (
      order by c.rank_score desc nulls last, c.tie_score desc nulls last, c.opportunity_id
    ) as rn
    from vstudio.portfolio_candidates(p_key) c
  ) e
  where e.rn <= v_def.target_size;

  get diagnostics v_members = row_count;

  update vstudio.portfolio_snapshots set member_count = v_members where id = v_snapshot;

  -- Flip current LAST, so a failed build never leaves the CEO looking at a
  -- half-written ranking.
  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = p_key and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;

  return v_snapshot;
end;
$fn$;

create or replace function vstudio.seed_metric_baseline()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_run uuid; v_rows integer;
begin
  perform vstudio.assert_intelligence_manage();

  insert into vstudio.observation_runs (source, scope, materiality, method, observed_count, finished_at)
  select 'github',
         'Every opportunity carrying repository metrics, promoted from the discovery capture itself.',
         'None — the baseline records every row, because there is nothing yet to compare it against.',
         'Copied from vstudio.opportunities as captured at discovery time. No new API call was made.',
         count(*), now()
  from vstudio.opportunities where stars is not null or forks is not null
  returning id into v_run;

  insert into vstudio.metric_observations
    (opportunity_id, observed_at, source, is_baseline, stars, forks, open_issues, pushed_at, archived, run_id, raw)
  select o.id,
         coalesce(o.discovered_at, o.created_at),
         coalesce(o.source_type, 'github'),
         true,
         o.stars, o.forks, o.open_issues, o.pushed_at, o.archived,
         v_run,
         jsonb_build_object('origin', 'discovery-capture')
  from vstudio.opportunities o
  where (o.stars is not null or o.forks is not null)
  on conflict (opportunity_id, observed_at) do nothing;

  get diagnostics v_rows = row_count;
  update vstudio.observation_runs set recorded_count = v_rows where id = v_run;
  return v_rows;
end;
$fn$;

create or replace function vstudio.score_rising()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer; v_version text := '2026-08-20-v1';
begin
  perform vstudio.assert_intelligence_manage();

  with pairs as (
    select
      o.opportunity_id,
      min(o.observed_at) as first_at,
      max(o.observed_at) as last_at,
      count(*) as observations,
      (array_agg(o.stars       order by o.observed_at))[1]                as first_stars,
      (array_agg(o.stars       order by o.observed_at desc))[1]           as last_stars,
      (array_agg(o.forks       order by o.observed_at desc))[1]           as last_forks,
      (array_agg(o.forks       order by o.observed_at))[1]                as first_forks,
      (array_agg(o.open_issues order by o.observed_at desc))[1]           as last_issues,
      (array_agg(o.open_issues order by o.observed_at))[1]                as first_issues
    from vstudio.metric_observations o
    group by o.opportunity_id
    -- TWO readings. This is the whole point: one reading is a photograph.
    having count(*) >= 2
  ),
  measured as (
    select p.*,
      greatest(extract(epoch from (p.last_at - p.first_at)) / 86400.0, 0)::numeric as days,
      coalesce(p.last_stars,0) - coalesce(p.first_stars,0)   as star_delta,
      coalesce(p.last_forks,0) - coalesce(p.first_forks,0)   as fork_delta,
      coalesce(p.last_issues,0) - coalesce(p.first_issues,0) as issue_delta
    from pairs p
    -- A window shorter than half a day cannot distinguish growth from noise.
    where extract(epoch from (p.last_at - p.first_at)) / 86400.0 >= 0.5
  ),
  scored as (
    select m.*,
      -- Absolute velocity: stars per day, log-normalized. A project adding 50
      -- stars a day is extraordinary; the log keeps 5/day from disappearing.
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.star_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 51))) as v_abs,
      -- Relative growth: a project going 40 -> 80 doubled, and that matters
      -- more than a 500,000-star project adding 400. Rising is about
      -- acceleration, not size — size is what the popularity score is for.
      greatest(0::numeric, least(1::numeric,
        (greatest(0, m.star_delta)::numeric / greatest(coalesce(m.first_stars,0), 1)) / 0.10)) as v_rel,
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.fork_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 11))) as v_forks,
      greatest(0::numeric, least(1::numeric,
        log(10::numeric, greatest(0, m.issue_delta)::numeric / greatest(m.days, 0.5) + 1) / log(10::numeric, 11))) as v_issues
    from measured m
  )
  update vstudio.opportunity_scores s
     set rising_score = round((z.v_abs * 40 + z.v_rel * 35 + z.v_forks * 15 + z.v_issues * 10) / 100 * 100)::int,
         rising_status = 'measured',
         rising_components = jsonb_build_array(
           jsonb_build_object('c','star_velocity','v',round(z.v_abs,4),'w',40),
           jsonb_build_object('c','relative_growth','v',round(z.v_rel,4),'w',35),
           jsonb_build_object('c','fork_velocity','v',round(z.v_forks,4),'w',15),
           jsonb_build_object('c','issue_velocity','v',round(z.v_issues,4),'w',10)
         ),
         evidence = s.evidence || jsonb_build_object('rising', jsonb_build_object(
           'observations', z.observations,
           'window_days', round(z.days, 2),
           'first_observed', z.first_at,
           'last_observed', z.last_at,
           'stars_from', z.first_stars, 'stars_to', z.last_stars, 'star_delta', z.star_delta,
           'fork_delta', z.fork_delta, 'issue_delta', z.issue_delta
         ))
    from scored z
   where s.opportunity_id = z.opportunity_id
     and s.scoring_version = v_version;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

create or replace function vstudio.build_rising_portfolio()
returns uuid
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_def vstudio.portfolios%rowtype;
  v_snapshot uuid; v_corpus integer; v_eligible integer; v_members integer;
  v_version text := '2026-08-20-v1';
begin
  perform vstudio.assert_intelligence_manage();

  select * into v_def from vstudio.portfolios where key = 'rising';
  select count(*) into v_corpus from vstudio.opportunities;
  select count(*) into v_eligible from vstudio.opportunity_scores
   where scoring_version = v_version and rising_score is not null and rising_score > 0;

  insert into vstudio.portfolio_snapshots
    (portfolio_key, scoring_version, corpus_size, eligible_count, member_count, method, is_current)
  values ('rising', v_version, v_corpus, v_eligible, 0,
    'Ranked on measured growth between two observations. ' || v_eligible ||
    ' of ' || v_corpus || ' corpus records had two readings far enough apart to measure and showed growth; ' ||
    'the rest keep an unknown rising score rather than an assumed flat one.',
    false)
  returning id into v_snapshot;

  insert into vstudio.portfolio_members (
    snapshot_id, opportunity_id, rank,
    popularity_score, popularity_status, suitability_score, suitability_status, rising_score,
    ranking_basis, ranking_score, qualification
  )
  select v_snapshot, e.opportunity_id, e.rn,
         e.popularity_score, e.popularity_status, e.suitability_score, e.suitability_status, e.rising_score,
         'rising', e.rising_score,
         jsonb_build_object(
           'basis', 'measured growth between two observations',
           'rising', e.evidence->'rising'
         )
  from (
    select s.*, row_number() over (
      order by s.rising_score desc, s.popularity_score desc nulls last, s.opportunity_id
    ) as rn
    from vstudio.opportunity_scores s
    where s.scoring_version = v_version and s.rising_score is not null and s.rising_score > 0
  ) e
  where e.rn <= v_def.target_size;

  get diagnostics v_members = row_count;
  update vstudio.portfolio_snapshots set member_count = v_members where id = v_snapshot;
  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = 'rising' and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;
  return v_snapshot;
end;
$fn$;

create or replace function vstudio.link_pain_signals()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  perform vstudio.assert_intelligence_manage();

  -- matched_phrases carries the theme key the deterministic assigner chose,
  -- prefixed so it cannot be confused with one of the CEO's phrasings.
  update vstudio.pain_signals s
     set cluster_id = c.id
    from vstudio.pain_clusters c
   where c.theme_key is not null
     and ('theme:' || c.theme_key) = any(s.matched_phrases)
     and s.cluster_id is distinct from c.id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

create or replace function vstudio.recount_pain_clusters()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  perform vstudio.assert_intelligence_manage();

  update vstudio.pain_clusters c
     set signal_count      = coalesce(a.n, 0),
         source_count      = coalesce(a.sources, 0),
         first_observed_at = a.first_at,
         last_observed_at  = a.last_at,
         computed_at       = now()
    from (
      select cl.id,
             count(s.id)                          as n,
             count(distinct s.source)             as sources,
             min(s.created_at_source)             as first_at,
             max(s.created_at_source)             as last_at
      from vstudio.pain_clusters cl
      left join vstudio.pain_signals s on s.cluster_id = cl.id
      group by cl.id
    ) a
   where a.id = c.id;

  get diagnostics v_rows = row_count;

  -- Momentum needs two collection runs to compare, exactly as growth needs two
  -- observations. Until then it stays unknown rather than being read off a
  -- single snapshot of issue dates.
  update vstudio.pain_clusters
     set momentum_score = null, momentum_status = 'unknown'
   where momentum_status <> 'unknown' and momentum_score is null;

  return v_rows;
end;
$fn$;

create or replace function vstudio.build_pain_portfolio(p_min_signals integer default 5)
returns uuid
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_def vstudio.portfolios%rowtype;
  v_snapshot uuid; v_universe integer; v_eligible integer; v_members integer;
  v_max integer;
  v_version text := '2026-08-20-v1';
begin
  perform vstudio.assert_intelligence_manage();

  select * into v_def from vstudio.portfolios where key = 'pain';

  -- The universe here is the pain evidence, not the repository corpus: this is
  -- the one portfolio that does not rank vstudio.opportunities.
  select count(*) into v_universe from vstudio.pain_signals;
  select count(*) into v_eligible from vstudio.pain_clusters where signal_count >= p_min_signals;
  select coalesce(max(signal_count), 0) into v_max from vstudio.pain_clusters;

  insert into vstudio.portfolio_snapshots
    (portfolio_key, scoring_version, corpus_size, eligible_count, member_count, method, is_current)
  values ('pain', v_version, v_universe, v_eligible, 0,
    'Ranked on evidence weight across ' || v_universe || ' collected public signals. ' ||
    'A theme is presented as a pain point only once at least ' || p_min_signals ||
    ' separate public complaints support it — one complaint is a person having a bad day, ' ||
    'and the premise is recurrence. Themes below the bar are kept and counted, not deleted.',
    false)
  returning id into v_snapshot;

  insert into vstudio.portfolio_members (
    snapshot_id, pain_cluster_id, rank, ranking_basis, ranking_score, qualification
  )
  select v_snapshot, e.id, e.rn, 'pain',
         -- Normalized against the strongest cluster in this run, so the score
         -- is a position within the evidence we actually hold and never
         -- implies an absolute measure of how many people are affected.
         greatest(0, least(100, round(100.0 * e.signal_count / greatest(v_max, 1))::int)),
         jsonb_build_object(
           'basis', 'assembled from ' || e.signal_count || ' public complaints across ' ||
                    e.source_count || ' source type(s)',
           'signal_count', e.signal_count,
           'source_count', e.source_count,
           'min_signals_required', p_min_signals,
           'first_observed', e.first_observed_at,
           'last_observed', e.last_observed_at,
           'not_yet_researched', jsonb_build_array(
             'market_size','affected_audience_size','willingness_to_pay',
             'existing_solution_pricing','competitive_landscape','revenue_potential')
         )
  from (
    select c.*, row_number() over (order by c.signal_count desc, c.theme_key) as rn
    from vstudio.pain_clusters c
    where c.signal_count >= p_min_signals
  ) e
  where e.rn <= v_def.target_size;

  get diagnostics v_members = row_count;
  update vstudio.portfolio_snapshots set member_count = v_members where id = v_snapshot;
  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = 'pain' and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;
  return v_snapshot;
end;
$fn$;

create or replace function vstudio.set_analysis_levels()
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer; v_version text := '2026-08-20-v1';
begin
  perform vstudio.assert_intelligence_manage();

  with in_portfolio as (
    select distinct m.opportunity_id
    from vstudio.portfolio_members m
    join vstudio.portfolio_snapshots s on s.id = m.snapshot_id and s.is_current
    where m.opportunity_id is not null
  )
  update vstudio.opportunity_scores s
     set analysis_level = case when p.opportunity_id is not null then 2 else 1 end
    from (select s2.id, ip.opportunity_id
            from vstudio.opportunity_scores s2
            left join in_portfolio ip on ip.opportunity_id = s2.opportunity_id
           where s2.scoring_version = v_version
             -- Never demote human work.
             and s2.analysis_level < 3) p
   where s.id = p.id
     and s.analysis_level <> case when p.opportunity_id is not null then 2 else 1 end;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;
