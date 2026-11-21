create schema if not exists disco;
comment on schema disco is 'HLVS Opportunity Discovery ingestion + scoring. Extends vstudio; never replaces it.';

create type disco.event_kind as enum ('price_disruption','product_disruption','customer_pain','market_gap','business_disruption');
create type disco.collector_kind as enum ('web_event_research','github','hacker_news','product_hunt','apple_itunes','manual');
create type disco.magnitude as enum ('unknown','very_low','low','medium','high','very_high');
create type disco.factor_status as enum ('measured','estimated','unknown');

create table disco.harvest_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  collector disco.collector_kind not null,
  run_id uuid,
  source_name text not null,
  source_url text,
  title text,
  excerpt text,
  raw jsonb not null default '{}'::jsonb,
  event_kind disco.event_kind,
  event_date date,
  retrieved_at timestamptz not null default now(),
  dedupe_hash text not null,
  created_at timestamptz not null default now()
);
create unique index harvest_items_dedupe_uq on disco.harvest_items (tenant_id, dedupe_hash);
create index harvest_items_event_idx on disco.harvest_items (tenant_id, event_kind, event_date desc);
create index harvest_items_collector_idx on disco.harvest_items (tenant_id, collector, retrieved_at desc);
comment on table disco.harvest_items is 'Immutable raw collector output. Provenance preserved permanently; rows are never mutated.';

create table disco.opportunity_factors (
  key text primary key,
  label text not null,
  weight numeric(5,2) not null check (weight > 0),
  direction text not null default 'positive' check (direction in ('positive','inverse')),
  sort_order int not null,
  guidance text
);

insert into disco.opportunity_factors (key,label,weight,direction,sort_order,guidance) values
 ('market_demand','Market Demand',20,'positive',1,'Evidence customers want this. Prefer dated events and measured counts over sentiment.'),
 ('monetization','Monetization',15,'positive',2,'Evidence customers will pay. Paid competitors are the strongest signal.'),
 ('competitive_weakness','Competitive Weakness',15,'positive',3,'Ability to outperform incumbents: pricing, ratings, abandonment, missing features.'),
 ('build_simplicity','Build Simplicity',15,'positive',4,'How fast a real MVP ships. Backend/integration/regulatory load reduces this.'),
 ('acquisition','Acquisition Accessibility',15,'positive',5,'Can we reach the first 100? If no channel is identified this MUST score 0.'),
 ('recurring_revenue','Recurring Revenue Potential',10,'positive',6,'Likelihood of subscription or repeat purchase.'),
 ('low_touch','Low-Touch Operation',5,'positive',7,'Operable with minimal human labour.'),
 ('strategic_reuse','Strategic Reuse',5,'positive',8,'Reuse of registered hlvs.capabilities. Scores 0 when nothing matches.');

create or replace function disco.assert_weights_total() returns trigger
language plpgsql as $fn$
declare t numeric;
begin
  select sum(weight) into t from disco.opportunity_factors;
  if t is not null and t <> 100 then
    raise exception 'disco.opportunity_factors weights must total 100, got %', t;
  end if;
  return null;
end $fn$;

create constraint trigger opportunity_factors_total_trg
  after insert or update or delete on disco.opportunity_factors
  deferrable initially deferred
  for each row execute function disco.assert_weights_total();

create table disco.evidence_against (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  opportunity_id uuid not null references vstudio.opportunities(id) on delete cascade,
  failure_mode text not null check (failure_mode in ('wont_pay','api_economics','regulatory_load','platform_risk','acquisition_cost','weak_monetization','internal_duplicate','incumbent_strength','source_quality')),
  statement text not null,
  severity int not null check (severity between 1 and 10),
  source_url text,
  source_name text,
  captured_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index evidence_against_opp_idx on disco.evidence_against (opportunity_id);
comment on table disco.evidence_against is 'Reasons NOT to build. Feeds the score penalty. Zero rows means UNASSESSED, not risk-free.';

create table disco.assessments (
  opportunity_id uuid primary key references vstudio.opportunities(id) on delete cascade,
  tenant_id uuid not null,
  category text,
  event_kind disco.event_kind,
  trigger_event text,
  build_difficulty disco.magnitude not null default 'unknown',
  acquisition_difficulty disco.magnitude not null default 'unknown',
  recurring_potential disco.magnitude not null default 'unknown',
  low_touch_potential disco.magnitude not null default 'unknown',
  suggested_price_low numeric(10,2),
  suggested_price_high numeric(10,2),
  price_model text check (price_model in ('monthly','annual','lifetime','one_time','freemium','b2b_seat','usage')),
  mvp_scope text,
  acquisition_channels text[],
  competitors text[],
  product_gap text,
  risks text[],
  builder_recommendation text check (builder_recommendation in ('wron_candidate','claude_custom','hlvs_platform','requires_investigation','reject')),
  score_gross numeric(5,1),
  score_penalty numeric(5,1),
  score_net numeric(5,1),
  confidence text,
  rank_rationale text,
  updated_at timestamptz not null default now()
);

create or replace function disco.compute_opportunity_score(factor_scores jsonb, penalty numeric default 0)
returns table (gross numeric, penalty_applied numeric, net numeric, scored_weight numeric, status disco.factor_status, detail jsonb)
language plpgsql stable as $fn$
declare f record; v numeric; total_pts numeric := 0; total_weight numeric := 0; unknowns int := 0; det jsonb := '[]'::jsonb;
begin
  for f in select * from disco.opportunity_factors order by sort_order loop
    v := nullif(factor_scores ->> f.key, '')::numeric;
    if v is null then
      unknowns := unknowns + 1;
      det := det || jsonb_build_object('key',f.key,'label',f.label,'weight',f.weight,'awarded',null,'status','unknown');
      continue;
    end if;
    v := least(greatest(v,0), f.weight);
    if f.direction = 'inverse' then v := f.weight - v; end if;
    total_pts := total_pts + v;
    total_weight := total_weight + f.weight;
    det := det || jsonb_build_object('key',f.key,'label',f.label,'weight',f.weight,'awarded',v,'status','measured');
  end loop;
  if total_weight = 0 then
    return query select 0::numeric,0::numeric,0::numeric,0::numeric,'unknown'::disco.factor_status,det;
    return;
  end if;
  gross := round((total_pts/total_weight)*100,1);
  penalty_applied := round(least(greatest(coalesce(penalty,0),0),25),1);
  net := greatest(gross - penalty_applied, 0);
  scored_weight := total_weight;
  status := case when unknowns = 0 then 'measured'::disco.factor_status else 'estimated'::disco.factor_status end;
  detail := det;
  return next;
end $fn$;

comment on function disco.compute_opportunity_score is 'Weighted 0-100 score. Unknown factors are EXCLUDED from the denominator, never defaulted. Penalty capped at 25.';

create or replace function disco.counter_evidence_penalty(p_opportunity_id uuid)
returns numeric language sql stable as $fn$
  select least(coalesce(sum(severity),0)*1.0, 25)::numeric
  from disco.evidence_against where opportunity_id = p_opportunity_id;
$fn$;

create or replace view disco.v_opportunity_board as
select o.id, o.tenant_id, o.title, o.problem_statement, o.proposed_customer, o.status,
  o.source_url, o.discovery_date, o.is_demonstration,
  a.category, a.event_kind, a.trigger_event, a.build_difficulty, a.acquisition_difficulty,
  a.recurring_potential, a.low_touch_potential, a.suggested_price_low, a.suggested_price_high,
  a.price_model, a.builder_recommendation, a.competitors, a.product_gap, a.risks,
  a.score_gross, a.score_penalty, a.score_net, a.confidence, a.rank_rationale,
  (select count(*) from vstudio.evidence ev where ev.opportunity_id = o.id) as evidence_for_count,
  (select count(*) from disco.evidence_against ea where ea.opportunity_id = o.id) as evidence_against_count,
  disco.counter_evidence_penalty(o.id) as penalty,
  (a.build_difficulty in ('very_low','low','medium')
   and a.acquisition_difficulty in ('very_low','low')
   and a.recurring_potential in ('medium','high','very_high')
   and a.low_touch_potential in ('medium','high','very_high')) as quick_cash_flow
from vstudio.opportunities o
left join disco.assessments a on a.opportunity_id = o.id;

comment on view disco.v_opportunity_board is 'Single read surface for the /HLVS dashboard. vstudio remains the canonical record.';

alter table disco.harvest_items enable row level security;
alter table disco.evidence_against enable row level security;
alter table disco.assessments enable row level security;
alter table disco.opportunity_factors enable row level security;

do $pol$
declare t text;
begin
  foreach t in array array['harvest_items','evidence_against','assessments','opportunity_factors'] loop
    execute format('create policy %I_read on disco.%I for select using (identity.has_platform_permission(''vstudio.opportunity.read''::extensions.citext));', t, t);
    execute format('create policy %I_write on disco.%I for all using (identity.has_platform_permission(''vstudio.opportunity.manage''::extensions.citext)) with check (identity.has_platform_permission(''vstudio.opportunity.manage''::extensions.citext));', t, t);
  end loop;
end $pol$;