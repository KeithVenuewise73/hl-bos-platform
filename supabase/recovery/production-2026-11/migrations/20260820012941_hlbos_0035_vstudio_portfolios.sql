create or replace function vstudio.portfolio_domain_value(
  p_key text, p_category text, p_matched jsonb
) returns numeric
language sql immutable as $fn$
  select case p_key
    when 'logistics' then
      case when p_category = any(array['logistics','fleet-management','inventory','manufacturing','agriculture','construction'])
           then least(1::numeric, 0.6 + 0.4 * (least(4, coalesce(jsonb_array_length(p_matched->'logistics'), 0))::numeric / 4))
           else 0.7 * (least(4, coalesce(jsonb_array_length(p_matched->'logistics'), 0))::numeric / 4)
      end
    when 'transformation' then
      case when p_category = any(array['crm','erp','marketing-automation','email-marketing','business-intelligence','analytics-bi','automation-workflow','workflow-engine','rpa','no-code','customer-support','chat-messaging','ecommerce','point-of-sale','accounting','invoicing-billing','subscription-billing','saas-platforms','hr-recruiting','payroll','project-management','booking-appointments','scheduling-calendars','integration-ipaas'])
           then least(1::numeric, 0.6 + 0.4 * (least(4, coalesce(jsonb_array_length(p_matched->'transformation'), 0))::numeric / 4))
           else 0.7 * (least(4, coalesce(jsonb_array_length(p_matched->'transformation'), 0))::numeric / 4)
      end
    when 'sports' then
      case when p_category = any(array['sports-technology','sports-analytics','esports','fitness'])
           then least(1::numeric, 0.6 + 0.4 * (least(4, coalesce(jsonb_array_length(p_matched->'sports'), 0))::numeric / 4))
           else 0.7 * (least(4, coalesce(jsonb_array_length(p_matched->'sports'), 0))::numeric / 4)
      end
    else 0::numeric
  end;
$fn$;
comment on function vstudio.portfolio_domain_value(text, text, jsonb) is
  'Domain match strength 0-1, mirroring matchPortfolio() in packages/venture-studio/src/portfolios.ts. A discovery-category hit is provenance and outweighs vocabulary; term hits saturate at four.';

create or replace function vstudio.portfolio_candidates(p_key text)
returns table (
  opportunity_id uuid,
  popularity_score integer,
  popularity_status vstudio.metric_status,
  suitability_score integer,
  suitability_status vstudio.metric_status,
  rising_score integer,
  domain_value numeric,
  best_core_value numeric,
  matched_terms jsonb,
  category text,
  rank_score integer,
  tie_score integer
)
language sql stable security definer set search_path = '' as $fn$
  select
    o.id,
    s.popularity_score, s.popularity_status,
    s.suitability_score, s.suitability_status,
    s.rising_score,
    vstudio.portfolio_domain_value(p_key, o.category, s.evidence->'matched'),
    (s.evidence->>'best_core_value')::numeric,
    s.evidence->'matched'->p_key,
    o.category,
    case when p.rank_by = 'popularity' then s.popularity_score else s.suitability_score end,
    case when p.rank_by = 'popularity' then s.suitability_score else s.popularity_score end
  from vstudio.opportunities o
  join vstudio.opportunity_scores s
    on s.opportunity_id = o.id and s.scoring_version = '2026-08-20-v1'
  join vstudio.portfolios p on p.key = p_key
  where case
    when p_key = 'outside-core'
      then (s.evidence->>'best_core_value')::numeric < 0.35
           and s.popularity_score is not null
    else vstudio.portfolio_domain_value(p_key, o.category, s.evidence->'matched') >= 0.35
         and s.suitability_score is not null
  end;
$fn$;
revoke all on function vstudio.portfolio_candidates(text) from public, anon;
grant execute on function vstudio.portfolio_candidates(text) to authenticated;

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
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

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

  update vstudio.portfolio_snapshots set is_current = false
   where portfolio_key = p_key and is_current and id <> v_snapshot;
  update vstudio.portfolio_snapshots set is_current = true where id = v_snapshot;

  return v_snapshot;
end;
$fn$;
revoke all on function vstudio.build_portfolio(text) from public, anon;
grant execute on function vstudio.build_portfolio(text) to authenticated;
comment on function vstudio.build_portfolio(text) is
  'Rebuild one Top-100 as a new immutable snapshot. Selects and ranks over vstudio.opportunities without modifying it. Records corpus_size, eligible_count and member_count so a short list is never presented as a full hundred.';