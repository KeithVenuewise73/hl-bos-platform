create type dma.search_intent as enum ('informational','problem_aware','solution_aware','comparison','transactional','navigational');
create type dma.magnitude as enum ('unknown','low','medium','high');
create type dma.content_type as enum ('product_page','landing_page','article','comparison_page','guide','faq','editorial_story','video','social','local_page','structured_data');
create type dma.execution_arm as enum ('homehuddle_website','homehuddle_social','five_star_media','five_star_social','video','comparison_page','landing_page','paid_later');
create type dma.build_decision as enum ('build','combine','defer','reject');

create table dma.search_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid references dma.market_segments(id) on delete set null,
  intent_id uuid references dma.discovery_intents(id) on delete set null,
  query_or_topic text not null,
  search_intent dma.search_intent not null default 'problem_aware',
  demand_level dma.magnitude not null default 'unknown', demand_evidence text,
  difficulty_level dma.magnitude not null default 'unknown',
  commercial_relevance dma.magnitude not null default 'medium',
  content_type dma.content_type, execution_arm dma.execution_arm, priority int,
  source_id uuid references dma.research_sources(id) on delete set null,
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.search_opportunities (tenant_id);
create index on dma.search_opportunities (client_id, offering_id, segment_id);

create table dma.website_specs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid references dma.market_segments(id) on delete set null,
  opportunity_id uuid references dma.search_opportunities(id) on delete set null,
  page_type dma.content_type, title text not null, target_segment text,
  search_intent dma.search_intent, primary_problem text, value_proposition text,
  primary_cta text, seo_target text, tracking_objective text, execution_arm dma.execution_arm,
  decision dma.build_decision not null default 'defer', rationale text,
  source_id uuid references dma.research_sources(id) on delete set null,
  status dma.record_status not null default 'active',
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.website_specs (tenant_id);
create index on dma.website_specs (client_id, offering_id);

create table dma.media_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  producer_client_id uuid references dma.clients(id) on delete set null,
  offering_id uuid references dma.offerings(id) on delete set null,
  topic text not null, search_intent dma.search_intent,
  audience_value text, product_relevance text, content_format dma.content_type, cta_context text,
  source_id uuid references dma.research_sources(id) on delete set null,
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.media_opportunities (tenant_id);
create index on dma.media_opportunities (client_id, offering_id);

create or replace function dma.magnitude_num(p dma.magnitude, p_inverse boolean default false)
returns int language sql immutable set search_path = '' as $$
  select case
    when p_inverse then case p when 'unknown' then 50 when 'low' then 90 when 'medium' then 55 when 'high' then 20 end
    else case p when 'unknown' then 40 when 'low' then 25 when 'medium' then 65 when 'high' then 90 end
  end;
$$;
create or replace function dma.compute_search_priority(p_commercial dma.magnitude, p_demand dma.magnitude, p_difficulty dma.magnitude)
returns int language sql immutable set search_path = 'dma','public' as $$
  select round(0.45*dma.magnitude_num(p_commercial) + 0.30*dma.magnitude_num(p_demand) + 0.25*dma.magnitude_num(p_difficulty, true))::int;
$$;
grant execute on function dma.magnitude_num(dma.magnitude, boolean) to authenticated;
grant execute on function dma.compute_search_priority(dma.magnitude, dma.magnitude, dma.magnitude) to authenticated;

create or replace function dma.search_opportunity_map(p_offering uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public' as $$
declare v_tenant uuid; v_result jsonb;
begin
  select tenant_id into v_tenant from dma.offerings where id = p_offering;
  if v_tenant is null then raise exception 'offering % not found', p_offering using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.search.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  select jsonb_build_object(
    'offering', (select jsonb_build_object('id',id,'name',name) from dma.offerings where id=p_offering),
    'generated_at', now(),
    'opportunities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'query_or_topic', so.query_or_topic, 'segment', (select name from dma.market_segments s where s.id=so.segment_id),
        'search_intent', so.search_intent, 'demand', so.demand_level, 'difficulty', so.difficulty_level,
        'commercial_relevance', so.commercial_relevance, 'content_type', so.content_type,
        'execution_arm', so.execution_arm, 'priority', so.priority, 'confidence', so.confidence,
        'demand_evidence', so.demand_evidence, 'verification', so.verification)
        order by so.priority desc nulls last)
      from dma.search_opportunities so where so.offering_id=p_offering), '[]'::jsonb),
    'website_decisions', coalesce((
      select jsonb_agg(jsonb_build_object('title',ws.title,'page_type',ws.page_type,'decision',ws.decision,
        'execution_arm',ws.execution_arm,'seo_target',ws.seo_target,'primary_cta',ws.primary_cta,'rationale',ws.rationale)
        order by ws.decision)
      from dma.website_specs ws where ws.offering_id=p_offering), '[]'::jsonb),
    'five_star_media', coalesce((
      select jsonb_agg(jsonb_build_object('topic',mo.topic,'search_intent',mo.search_intent,
        'audience_value',mo.audience_value,'product_relevance',mo.product_relevance,'content_format',mo.content_format)
        order by mo.topic)
      from dma.media_opportunities mo where mo.offering_id=p_offering), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
grant execute on function dma.search_opportunity_map(uuid) to authenticated;

select dma._attach_triggers('dma.search_opportunities');
select dma._attach_triggers('dma.website_specs');
select dma._attach_triggers('dma.media_opportunities');

insert into identity.permissions (key, scope, description) values
  ('dma.search.read','tenant','Read search/SEO intelligence (opportunities, website specs, media opportunities).'),
  ('dma.search.manage','tenant','Create and update search/SEO intelligence.')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.search.read' from (values ('tenant_owner'),('tenant_admin'),('manager'),('staff'),('viewer')) as r(role_key) on conflict do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.search.manage' from (values ('tenant_owner'),('tenant_admin'),('manager')) as r(role_key) on conflict do nothing;

grant select, insert, update, delete on dma.search_opportunities, dma.website_specs, dma.media_opportunities to authenticated;

do $$
declare r text;
begin
  foreach r in array array['search_opportunities','website_specs','media_opportunities']
  loop
    execute format('alter table dma.%I enable row level security', r);
    execute format('alter table dma.%I force row level security', r);
    execute format($f$create policy %I on dma.%I for select using (identity.has_permission(tenant_id, 'dma.search.read'))$f$, r||'_select', r);
    execute format($f$create policy %I on dma.%I for insert with check (identity.has_permission(tenant_id, 'dma.search.manage'))$f$, r||'_insert', r);
    execute format($f$create policy %I on dma.%I for update using (identity.has_permission(tenant_id, 'dma.search.manage')) with check (identity.has_permission(tenant_id, 'dma.search.manage'))$f$, r||'_update', r);
    execute format($f$create policy %I on dma.%I for delete using (identity.has_permission(tenant_id, 'dma.search.manage'))$f$, r||'_delete', r);
  end loop;
end $$;