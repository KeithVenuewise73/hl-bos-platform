create type dma.confidence as enum ('low','medium','high');
create type dma.segment_status as enum ('hypothesis','researching','supported','weak','rejected','prioritized');
create type dma.alternative_kind as enum ('direct_product','adjacent_product','substitute_tool','manual_behavior');
create type dma.signal_type as enum ('supporting','weakening','neutral');
create type dma.source_type as enum ('web','industry_report','survey','interview','internal_data','model_reasoning');
create type dma.research_method as enum ('web_search','web_fetch','analyst_review','model_inference','internal_query','customer_interview');
create type dma.opportunity_recommendation as enum ('test','research_further','deprioritize');

create table dma.research_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  title text not null, url text, publisher text,
  source_type dma.source_type not null default 'web',
  method dma.research_method not null default 'web_search',
  published_on date, accessed_on date,
  credibility dma.confidence not null default 'medium', summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.research_sources (tenant_id);
create index on dma.research_sources (client_id, offering_id);

create table dma.market_segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  parent_segment_id uuid references dma.market_segments(id) on delete set null,
  name text not null, definition text, rationale text,
  status dma.segment_status not null default 'hypothesis',
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.market_segments (tenant_id);
create index on dma.market_segments (client_id, offering_id);

create table dma.customer_problems (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid references dma.market_segments(id) on delete set null,
  problem text not null, description text,
  severity dma.threat_level not null default 'medium', frequency text,
  source_id uuid references dma.research_sources(id) on delete set null,
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.customer_problems (tenant_id);
create index on dma.customer_problems (client_id, offering_id, segment_id);

create table dma.market_alternatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  name text not null,
  alternative_kind dma.alternative_kind not null default 'direct_product',
  url text, notes text,
  strengths text[] not null default '{}', weaknesses text[] not null default '{}',
  source_id uuid references dma.research_sources(id) on delete set null,
  confidence dma.confidence not null default 'medium',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.market_alternatives (tenant_id);
create index on dma.market_alternatives (client_id, offering_id);

create table dma.market_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid references dma.market_segments(id) on delete set null,
  claim text not null, evidence text,
  signal_type dma.signal_type not null default 'supporting',
  source_id uuid references dma.research_sources(id) on delete set null,
  method dma.research_method not null default 'web_search',
  confidence dma.confidence not null default 'low', observed_on date,
  provenance dma.provenance not null default 'imported',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.market_signals (tenant_id);
create index on dma.market_signals (client_id, offering_id, segment_id);

create table dma.opportunity_factors (
  key text primary key, label text not null, weight numeric not null default 1,
  direction text not null default 'positive', description text, sort_order int not null default 0
);
comment on table dma.opportunity_factors is 'Weights + orientation for the segment opportunity score. Rows, not code.';
insert into dma.opportunity_factors (key,label,weight,direction,description,sort_order) values
  ('product_fit','Product fit',18,'positive','How well HomeHuddle solves this segment''s problem',1),
  ('problem_severity','Problem severity',14,'positive','How painful the problem is',2),
  ('audience_size','Audience size',12,'positive','How large/addressable the segment is',3),
  ('reachability','Reachability',12,'positive','How efficiently the audience can be reached',4),
  ('problem_frequency','Problem frequency',10,'positive','How often the pain recurs',5),
  ('competitive_intensity','Competitive intensity',10,'inverse','How crowded/entrenched the competition is (higher = worse)',6),
  ('willingness_to_adopt','Willingness to adopt',8,'positive','Likelihood to try a new tool',7),
  ('conversion_potential','Conversion potential',8,'positive','Likelihood to convert to paid',8),
  ('retention_potential','Retention potential',4,'positive','Likelihood to renew/retain',9),
  ('acquisition_cost','Acquisition cost',4,'inverse','Expected cost to acquire (higher = worse)',10)
on conflict (key) do nothing;

create table dma.opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid not null references dma.market_segments(id) on delete cascade,
  factor_scores jsonb not null default '{}'::jsonb, weighted_score int,
  confidence dma.confidence not null default 'low',
  recommendation dma.opportunity_recommendation not null default 'research_further',
  rationale text, evidence_count int not null default 0,
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  scored_by uuid, scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  unique (segment_id)
);
create index on dma.opportunity_scores (tenant_id);
create index on dma.opportunity_scores (client_id, offering_id);

create or replace function dma.compute_opportunity_score(p_factor_scores jsonb)
returns jsonb language sql immutable set search_path = 'dma','public' as $$
  with f as (
    select fct.key, fct.label, fct.weight, fct.direction, fct.sort_order,
           coalesce((p_factor_scores ->> fct.key)::numeric, null) as raw
    from dma.opportunity_factors fct
  ),
  oriented as (
    select key, label, weight, sort_order, raw,
           case when raw is null then null when direction='inverse' then 100 - raw else raw end as adj
    from f
  )
  select jsonb_build_object(
    'weighted_score', coalesce(round(sum(adj*weight) filter (where adj is not null)
                                   / nullif(sum(weight) filter (where adj is not null),0))::int, 0),
    'breakdown', coalesce(jsonb_agg(jsonb_build_object('factor',key,'label',label,'weight',weight,'raw',raw,'adjusted',adj) order by sort_order), '[]'::jsonb),
    'factors_scored', count(*) filter (where raw is not null)
  ) from oriented;
$$;

create or replace function dma.rescore_segment(p_segment uuid)
returns int language plpgsql security definer set search_path = 'dma','identity','public' as $$
declare v_tenant uuid; v_scores jsonb; v_result jsonb;
begin
  select tenant_id, factor_scores into v_tenant, v_scores from dma.opportunity_scores where segment_id=p_segment;
  if v_tenant is null then raise exception 'no opportunity_score for segment %', p_segment using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.market.manage'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  v_result := dma.compute_opportunity_score(v_scores);
  update dma.opportunity_scores set weighted_score = (v_result->>'weighted_score')::int, updated_by = auth.uid() where segment_id = p_segment;
  return (v_result->>'weighted_score')::int;
end $$;
grant execute on function dma.compute_opportunity_score(jsonb) to authenticated;
grant execute on function dma.rescore_segment(uuid) to authenticated;

create or replace function dma.market_opportunity_map(p_offering uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public' as $$
declare v_tenant uuid; v_result jsonb;
begin
  select tenant_id into v_tenant from dma.offerings where id = p_offering;
  if v_tenant is null then raise exception 'offering % not found', p_offering using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.market.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  select jsonb_build_object(
    'offering', (select jsonb_build_object('id',id,'name',name) from dma.offerings where id=p_offering),
    'generated_at', now(),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', row_number() over (order by os.weighted_score desc nulls last),
        'segment', s.name, 'definition', s.definition, 'status', s.status,
        'opportunity_score', os.weighted_score, 'confidence', os.confidence,
        'recommendation', os.recommendation, 'rationale', os.rationale, 'evidence_count', os.evidence_count,
        'primary_problem', (select cp.problem from dma.customer_problems cp where cp.segment_id=s.id order by cp.severity desc limit 1),
        'provenance', os.provenance, 'verification', os.verification
      ) order by os.weighted_score desc nulls last)
      from dma.market_segments s join dma.opportunity_scores os on os.segment_id = s.id
      where s.offering_id = p_offering), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
grant execute on function dma.market_opportunity_map(uuid) to authenticated;

select dma._attach_triggers('dma.research_sources');
select dma._attach_triggers('dma.market_segments');
select dma._attach_triggers('dma.customer_problems');
select dma._attach_triggers('dma.market_alternatives');
select dma._attach_triggers('dma.market_signals');
select dma._attach_triggers('dma.opportunity_scores');

insert into identity.permissions (key, scope, description) values
  ('dma.market.read','tenant','Read market intelligence (segments, problems, alternatives, signals, sources, opportunity scores).'),
  ('dma.market.manage','tenant','Create and update market intelligence and opportunity scores.')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.market.read' from (values ('tenant_owner'),('tenant_admin'),('manager'),('staff'),('viewer')) as r(role_key) on conflict do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.market.manage' from (values ('tenant_owner'),('tenant_admin'),('manager')) as r(role_key) on conflict do nothing;

grant select, insert, update, delete on
  dma.research_sources, dma.market_segments, dma.customer_problems,
  dma.market_alternatives, dma.market_signals, dma.opportunity_scores to authenticated;
grant select on dma.opportunity_factors to authenticated;

do $$
declare r text;
begin
  foreach r in array array['research_sources','market_segments','customer_problems','market_alternatives','market_signals','opportunity_scores']
  loop
    execute format('alter table dma.%I enable row level security', r);
    execute format('alter table dma.%I force row level security', r);
    execute format($f$create policy %I on dma.%I for select using (identity.has_permission(tenant_id, 'dma.market.read'))$f$, r||'_select', r);
    execute format($f$create policy %I on dma.%I for insert with check (identity.has_permission(tenant_id, 'dma.market.manage'))$f$, r||'_insert', r);
    execute format($f$create policy %I on dma.%I for update using (identity.has_permission(tenant_id, 'dma.market.manage')) with check (identity.has_permission(tenant_id, 'dma.market.manage'))$f$, r||'_update', r);
    execute format($f$create policy %I on dma.%I for delete using (identity.has_permission(tenant_id, 'dma.market.manage'))$f$, r||'_delete', r);
  end loop;
end $$;
alter table dma.opportunity_factors enable row level security;
alter table dma.opportunity_factors force row level security;
create policy opportunity_factors_select on dma.opportunity_factors for select using (true);