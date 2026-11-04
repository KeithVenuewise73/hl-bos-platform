create or replace function vstudio.extract_capabilities(p_category text)
returns integer
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_rows integer;
begin
  perform vstudio.assert_intelligence_manage();
  with base as (
    select
      o.id, o.license,
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(o.summary,'')), '[_/\\.-]+', ' ', 'g') as descr,
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.array_to_string(coalesce(o.topics,'{}'::text[]), ' ')), '[_/\\.-]+', ' ', 'g') as topics,
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.regexp_replace(coalesce(o.repository_url, o.title), '^https?://github[.]com/', '')), '[_/\\.-]+', ' ', 'g') as nm
    from vstudio.opportunities o
    where o.category is not distinct from p_category
  ),
  vocab (slug, strong_re, weak_re) as (values
    ('route-optimization', '\m(dispatch optimization|travelling salesman|route optimization|route optimisation|traveling salesman|route sequencing|vehicle routing|route planning|last mile|last-mile|vrp)\M', '\m(logistics|dispatch|delivery|routing|fleet|eta)\M'),
    ('fleet-management', '\m(fleet management|vehicle tracking|driver tracking|fleet tracking|asset tracking|gps tracking|telematics)\M', '\m(tracking|vehicle|driver|fleet|gps)\M'),
    ('inventory-warehouse', '\m(inventory management|warehouse management|order fulfillment|stock management|order fulfilment|barcode scanning|stock control|wms)\M', '\m(fulfillment|fulfilment|inventory|warehouse|stock|sku)\M'),
    ('scheduling-dispatch', '\m(appointment booking|resource scheduling|shift scheduling|calendar booking|field service|dispatching|scheduling|work order|rostering)\M', '\m(appointment|schedule|calendar|booking|roster|shift)\M'),
    ('crm-customer', '\m(customer relationship management|contact management|lead management|sales pipeline|deal tracking|crm)\M', '\m(customer|pipeline|contact|sales|lead)\M'),
    ('billing-payments', '\m(subscription billing|payment processing|recurring billing|payment gateway|point of sale|invoicing|checkout|billing)\M', '\m(subscription|payments|invoice|payment|pricing|stripe)\M'),
    ('workflow-automation', '\m(workflow automation|process automation|no-code automation|business process|workflow engine|task automation|orchestration|rpa)\M', '\m(automation|workflow|automate|pipeline|trigger)\M'),
    ('system-integration', '\m(data integration|api integration|synchronization|message queue|middleware|connector|data sync|webhook|ipaas|etl)\M', '\m(integration|connect|import|export|sync|api)\M'),
    ('analytics-reporting', '\m(business intelligence|data visualization|data visualisation|analytics platform|dashboard|reporting|metrics|olap)\M', '\m(analytics|insights|report|chart|kpi)\M'),
    ('ai-agents', '\m(large language model|retrieval augmented|prompt engineering|vector database|fine-tuning|embeddings|ai agent|agentic|llm|rag)\M', '\m(inference|chatbot|openai|model|gpt|ai)\M'),
    ('document-processing', '\m(document extraction|document management|document parsing|text extraction|pdf generation|e-signature|esignature|ocr)\M', '\m(document|extract|parse|scan|pdf)\M'),
    ('communications-messaging', '\m(notification service|video conferencing|messaging platform|push notification|chat application|email marketing|sms gateway|voip)\M', '\m(notification|messaging|email|chat|sms)\M'),
    ('sports-team-management', '\m(player development|tournament bracket|league management|roster management|sports analytics|athlete tracking|team management|youth sports|fixture)\M', '\m(tournament|athlete|sports|league|player|team)\M'),
    ('identity-access', '\m(identity provider|authentication|single sign-on|access control|authorization|multi-tenant|oauth|rbac|sso)\M', '\m(permission|identity|session|login|auth)\M'),
    ('search-discovery', '\m(full-text search|semantic search|faceted search|search engine|elasticsearch|web scraping|indexing|crawler)\M', '\m(scraper|search|crawl|index|query)\M'),
    ('monitoring-observability', '\m(incident management|uptime monitoring|log aggregation|observability|monitoring|alerting|tracing|apm)\M', '\m(monitor|metrics|uptime|alert|logs)\M'),
    ('content-management', '\m(static site generator|content management|blogging platform|website builder|headless cms|page builder|cms)\M', '\m(content|website|publish|blog|cms)\M'),
    ('project-collaboration', '\m(project management|team collaboration|task management|issue tracking|knowledge base|kanban|wiki)\M', '\m(collaboration|project|kanban|notes|task)\M')
  ),
  hits as (
    select b.id, v.slug,
      case
        when b.descr  ~ v.strong_re then 'description'
        when b.topics ~ v.strong_re then 'topics'
        when b.nm     ~ v.strong_re then 'name'
      end as evidence_kind,
      case
        when b.descr  ~ v.strong_re then (pg_catalog.regexp_match(b.descr,  v.strong_re))[1]
        when b.topics ~ v.strong_re then (pg_catalog.regexp_match(b.topics, v.strong_re))[1]
        when b.nm     ~ v.strong_re then (pg_catalog.regexp_match(b.nm,     v.strong_re))[1]
      end as excerpt,
      (select count(distinct m[1]) from pg_catalog.regexp_matches(b.descr || ' ' || b.topics, v.weak_re, 'g') m) as weak_hits
    from base b join vocab v
      on b.descr ~ v.strong_re or b.topics ~ v.strong_re or b.nm ~ v.strong_re
  ),
  scored as (
    select h.id, h.slug, h.evidence_kind, h.excerpt,
      pg_catalog.round(
        (case h.evidence_kind
           when 'description' then 0.9::numeric
           when 'topics'      then 0.8::numeric
           else                    0.35::numeric end)
        * (0.7 + 0.3 * least(1::numeric, h.weak_hits::numeric / 3)) * 100)::int as confidence
    from hits h
  ),
  ranked as (
    select s.*, row_number() over (
      partition by s.id order by s.confidence desc, s.slug) as rn
    from scored s
    where s.confidence >= 30
  )
  insert into vstudio.opportunity_capabilities
    (opportunity_id, capability_slug, is_primary, evidence_kind, evidence_excerpt,
     evidence_locator, confidence, confidence_status, extraction_level, engine_version, extracted_at)
  select r.id, r.slug, r.rn = 1, r.evidence_kind,
         pg_catalog.left(coalesce(r.excerpt,''), 400),
         case r.evidence_kind
           when 'description' then 'repository description'
           when 'topics'      then 'repository topics'
           else 'repository name' end,
         r.confidence, 'estimated', 1, '2026-08-20-v1', pg_catalog.now()
  from ranked r
  where r.rn <= 4
  on conflict (opportunity_id, capability_slug) do update set
    is_primary = excluded.is_primary,
    evidence_kind = excluded.evidence_kind,
    evidence_excerpt = excluded.evidence_excerpt,
    evidence_locator = excluded.evidence_locator,
    confidence = excluded.confidence,
    extraction_level = excluded.extraction_level,
    engine_version = excluded.engine_version,
    extracted_at = excluded.extracted_at;
  get diagnostics v_rows = row_count;
  with base as (
    select o.id, o.license,
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(o.summary,'')), '[_/\\.-]+', ' ', 'g') as descr,
      pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.array_to_string(coalesce(o.topics,'{}'::text[]), ' ')), '[_/\\.-]+', ' ', 'g') as topics
    from vstudio.opportunities o
    where o.category is not distinct from p_category
  ),
  rules (kind, label, term_re) as (values
    ('algorithm', 'Optimization Engine', '\m(constraint programming|genetic algorithm|optimization|optimisation|heuristic|solver)\M'),
    ('algorithm', 'Scheduling Algorithm', '\m(scheduling algorithm|bin packing|job shop)\M'),
    ('api_integration', 'Third-party API Integration', '\m(graphql client|api wrapper|rest client|api client|sdk)\M'),
    ('api_integration', 'Maps Integration', '\m(openstreetmap|google maps|geocoding|leaflet|mapbox)\M'),
    ('api_integration', 'Payment Integration', '\m(payment gateway|stripe|paypal|adyen)\M'),
    ('backend_service', 'Backend Service', '\m(microservice|graphql api|rest api|backend|grpc)\M'),
    ('ui_component', 'UI Component Library', '\m(component library|react components|design system|widgets|ui kit)\M'),
    ('ui_component', 'Reference UI', '\m(dashboard ui|admin panel|frontend|web ui)\M'),
    ('data_model', 'Domain Data Model', '\m(database schema|entity model|data model|migrations|schema)\M'),
    ('reference_architecture', 'Reference Architecture', '\m(reference implementation|boilerplate|starter kit|example app|template|scaffold)\M'),
    ('sdk_client', 'Client SDK', '\m(client library|javascript sdk|typescript sdk|python sdk)\M'),
    ('pipeline', 'Data Pipeline', '\m(stream processing|batch processing|data pipeline|airflow|etl)\M'),
    ('ruleset', 'Rules / Policy Set', '\m(validation rules|detection rules|policy engine|ruleset)\M'),
    ('dataset', 'Dataset', '\m(training data|benchmark|dataset|corpus)\M'),
    ('protocol_implementation', 'Protocol Implementation', '\m(protocol implementation|ethercat|modbus|opc ua|webrtc|mqtt)\M')
  ),
  found as (
    select b.id, r.kind, r.label, b.license,
      case when b.descr ~ r.term_re then 'description' else 'topics' end as evidence_kind,
      case when b.descr ~ r.term_re then (pg_catalog.regexp_match(b.descr, r.term_re))[1]
           else (pg_catalog.regexp_match(b.topics, r.term_re))[1] end as excerpt,
      case when b.descr ~ r.term_re then 90
           else 80 end as confidence
    from base b join rules r on b.descr ~ r.term_re or b.topics ~ r.term_re
  ),
  ranked_assets as (
    select f.*, row_number() over (
      partition by f.id order by f.confidence desc, f.label) as rn
    from found f
  )
  insert into vstudio.opportunity_reusable_assets
    (opportunity_id, asset_kind, label, evidence_kind, evidence_excerpt, licence,
     licence_permits_commercial, confidence, confidence_status, extraction_level,
     engine_version, extracted_at)
  select a.id, a.kind, a.label, a.evidence_kind,
         pg_catalog.left(coalesce(a.excerpt,''), 400),
         a.license,
         case
           when a.license is null or a.license = 'NOASSERTION' then null
           when a.license = any(array['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','Unlicense','MPL-2.0','Zlib','BSL-1.0','PostgreSQL','Artistic-2.0','CC0-1.0']) then true
           when a.license = any(array['GPL-2.0','GPL-3.0','AGPL-3.0','LGPL-2.1','LGPL-3.0','EUPL-1.2','OSL-3.0']) then false
           else null end,
         a.confidence, 'estimated', 1, '2026-08-20-v1', pg_catalog.now()
  from ranked_assets a
  where a.rn <= 5
  on conflict (opportunity_id, asset_kind, label) do update set
    evidence_kind = excluded.evidence_kind,
    evidence_excerpt = excluded.evidence_excerpt,
    licence = excluded.licence,
    licence_permits_commercial = excluded.licence_permits_commercial,
    confidence = excluded.confidence,
    engine_version = excluded.engine_version,
    extracted_at = excluded.extracted_at;
  return v_rows;
end;
$fn$;
revoke all on function vstudio.extract_capabilities(text) from public, anon;
grant execute on function vstudio.extract_capabilities(text) to authenticated;
comment on function vstudio.extract_capabilities(text) is
  'Level-1 capability extraction for one discovery category. Deterministic, metadata-only, evidence-backed. Generated from packages/venture-studio/src/capability.ts -- edit the TypeScript, not this.';