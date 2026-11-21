create or replace function vstudio.score_level1(p_category text)
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  if session_user not in ('postgres', 'supabase_admin')
     and not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;

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
    regexp_replace(
      lower(coalesce(o.title,'') || ' ' || coalesce(o.summary,'') || ' ' ||
            array_to_string(coalesce(o.topics,'{}'::text[]), ' ')),
      '[_/\\]+', ' ', 'g') as haystack,
    (select count(*) from unnest(coalesce(o.topics,'{}'::text[])) t
      where lower(t) = any(array['saas','self-hosted','selfhosted','crm','erp','billing','invoicing','subscription','payments','booking','scheduling','marketplace','analytics','dashboard','automation','workflow','api','b2b','multi-tenant','multitenant','enterprise','no-code','low-code'])) as money_hits
  from vstudio.opportunities o
  where o.category is not distinct from p_category
),
ranked as (
  select b.*,
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
    greatest(0::numeric, least(1::numeric, 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 500000::numeric + 1))) + 0.5 * coalesce(v.stars_pct, greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.stars,0))::numeric + 1) / log(10::numeric, 500000::numeric + 1)))))) as p_stars,
    greatest(0::numeric, least(1::numeric, 0.5 * greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.forks,0))::numeric + 1) / log(10::numeric, 100000::numeric + 1))) + 0.5 * coalesce(v.forks_pct, greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.forks,0))::numeric + 1) / log(10::numeric, 100000::numeric + 1)))))) as p_forks,
    greatest(0::numeric, least(1::numeric, log(10::numeric, (coalesce(v.open_issues,0))::numeric + 1) / log(10::numeric, 10000::numeric + 1))) as p_issues,
    case when v.pushed_at is null then 0::numeric
         else greatest(0::numeric, least(1::numeric, 1 - (greatest(0, extract(epoch from (now() - v.pushed_at)) / 86400))::numeric / 1095)) end as p_recency,
    greatest(0::numeric, least(1::numeric, coalesce(cardinality(v.topics),0)::numeric / 10)) as p_topics,
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

create or replace function vstudio.portfolio_domain_value(
  p_key text, p_category text, p_matched jsonb
) returns numeric
language sql immutable as $fn$
  select case p_key
    when 'logistics' then
      case
        when p_category = any(array['logistics','fleet-management','inventory','manufacturing','agriculture','construction'])
          then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'logistics'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'logistics'->'sup'), 0)::numeric) / 4))
        when coalesce(jsonb_array_length(p_matched->'logistics'->'core'), 0) >= 2
          then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'logistics'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'logistics'->'sup'), 0)::numeric) / 4))
        else 0::numeric
      end
    when 'transformation' then
      case
        when p_category = any(array['crm','erp','marketing-automation','email-marketing','business-intelligence','analytics-bi','automation-workflow','workflow-engine','rpa','no-code','customer-support','chat-messaging','ecommerce','point-of-sale','accounting','invoicing-billing','subscription-billing','saas-platforms','hr-recruiting','payroll','project-management','booking-appointments','scheduling-calendars','integration-ipaas'])
          then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'transformation'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'transformation'->'sup'), 0)::numeric) / 4))
        when coalesce(jsonb_array_length(p_matched->'transformation'->'core'), 0) >= 2
          then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'transformation'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'transformation'->'sup'), 0)::numeric) / 4))
        else 0::numeric
      end
    when 'sports' then
      case
        when p_category = any(array['sports-technology','sports-analytics','esports','fitness'])
          then least(1::numeric, 0.6 + 0.4 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'sports'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'sports'->'sup'), 0)::numeric) / 4))
        when coalesce(jsonb_array_length(p_matched->'sports'->'core'), 0) >= 2
          then least(1::numeric, 0.35 + 0.65 * (least(4::numeric, coalesce(jsonb_array_length(p_matched->'sports'->'core'), 0)::numeric + 0.5 * coalesce(jsonb_array_length(p_matched->'sports'->'sup'), 0)::numeric) / 4))
        else 0::numeric
      end
    else 0::numeric
  end;
$fn$;