create type dma.visibility_level as enum ('none','low','medium','high');

create table dma.discovery_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  segment_id uuid references dma.market_segments(id) on delete set null,
  intent_phrase text not null, description text,
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  confidence dma.confidence not null default 'low',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.discovery_intents (tenant_id);
create index on dma.discovery_intents (client_id, offering_id, segment_id);

create table dma.visibility_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  title text not null, method dma.research_method not null default 'web_search',
  overall_visibility dma.visibility_level, visibility_score int, summary text, assessed_on date,
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.visibility_assessments (tenant_id);
create index on dma.visibility_assessments (client_id, offering_id);

create table dma.visibility_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  offering_id uuid references dma.offerings(id) on delete set null,
  assessment_id uuid references dma.visibility_assessments(id) on delete cascade,
  segment_id uuid references dma.market_segments(id) on delete set null,
  intent_id uuid references dma.discovery_intents(id) on delete set null,
  dimension extensions.citext not null references visibility.assessment_categories(key),
  current_visibility dma.visibility_level not null default 'none',
  competitor_visibility dma.visibility_level not null default 'medium',
  top_competitors text[] not null default '{}',
  gap text, opportunity text, recommended_action text,
  website_build_required boolean not null default false,
  source_id uuid references dma.research_sources(id) on delete set null,
  confidence dma.confidence not null default 'low',
  provenance dma.provenance not null default 'ai_inferred',
  verification dma.verification not null default 'needs_review',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.visibility_findings (tenant_id);
create index on dma.visibility_findings (client_id, offering_id, segment_id);
create index on dma.visibility_findings (assessment_id);

create or replace function dma.level_to_number(p dma.visibility_level)
returns int language sql immutable set search_path = '' as $$
  select case p when 'none' then 0 when 'low' then 33 when 'medium' then 66 when 'high' then 100 end;
$$;
create or replace function dma.compute_visibility_score(p_assessment uuid)
returns int language sql stable security definer set search_path = 'dma','visibility','public' as $$
  select coalesce(round(
           sum(dma.level_to_number(vf.current_visibility) * ac.weight)
           / nullif(sum(ac.weight),0))::int, 0)
  from (
    select dimension, max(current_visibility) as current_visibility
    from dma.visibility_findings where assessment_id = p_assessment group by dimension
  ) vf
  join visibility.assessment_categories ac on ac.key = vf.dimension;
$$;
grant execute on function dma.level_to_number(dma.visibility_level) to authenticated;
grant execute on function dma.compute_visibility_score(uuid) to authenticated;

create or replace function dma.visibility_opportunity_map(p_offering uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','visibility','public' as $$
declare v_tenant uuid; v_result jsonb; v_assessment uuid;
begin
  select tenant_id into v_tenant from dma.offerings where id = p_offering;
  if v_tenant is null then raise exception 'offering % not found', p_offering using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.visibility.read'::extensions.citext) then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  select id into v_assessment from dma.visibility_assessments where offering_id=p_offering order by assessed_on desc nulls last limit 1;
  select jsonb_build_object(
    'offering', (select jsonb_build_object('id',id,'name',name) from dma.offerings where id=p_offering),
    'assessment', (select jsonb_build_object('title',title,'overall_visibility',overall_visibility,'visibility_score',visibility_score,'summary',summary,'verification',verification)
                   from dma.visibility_assessments where id=v_assessment),
    'generated_at', now(),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dimension', vf.dimension,
        'segment', (select name from dma.market_segments s where s.id=vf.segment_id),
        'intent', (select intent_phrase from dma.discovery_intents di where di.id=vf.intent_id),
        'current_visibility', vf.current_visibility, 'competitor_visibility', vf.competitor_visibility,
        'top_competitors', vf.top_competitors, 'gap', vf.gap, 'opportunity', vf.opportunity,
        'recommended_action', vf.recommended_action, 'website_build_required', vf.website_build_required,
        'confidence', vf.confidence, 'verification', vf.verification)
        order by dma.level_to_number(vf.competitor_visibility) - dma.level_to_number(vf.current_visibility) desc)
      from dma.visibility_findings vf where vf.offering_id=p_offering), '[]'::jsonb),
    'website_build_required', coalesce((
      select jsonb_agg(distinct vf.recommended_action)
      from dma.visibility_findings vf where vf.offering_id=p_offering and vf.website_build_required), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
grant execute on function dma.visibility_opportunity_map(uuid) to authenticated;

select dma._attach_triggers('dma.discovery_intents');
select dma._attach_triggers('dma.visibility_assessments');
select dma._attach_triggers('dma.visibility_findings');

insert into identity.permissions (key, scope, description) values
  ('dma.visibility.read','tenant','Read visibility intelligence (assessments, findings, discovery intents).'),
  ('dma.visibility.manage','tenant','Create and update visibility intelligence.')
on conflict (key) do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.visibility.read' from (values ('tenant_owner'),('tenant_admin'),('manager'),('staff'),('viewer')) as r(role_key) on conflict do nothing;
insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.visibility.manage' from (values ('tenant_owner'),('tenant_admin'),('manager')) as r(role_key) on conflict do nothing;

grant select, insert, update, delete on dma.discovery_intents, dma.visibility_assessments, dma.visibility_findings to authenticated;

do $$
declare r text;
begin
  foreach r in array array['discovery_intents','visibility_assessments','visibility_findings']
  loop
    execute format('alter table dma.%I enable row level security', r);
    execute format('alter table dma.%I force row level security', r);
    execute format($f$create policy %I on dma.%I for select using (identity.has_permission(tenant_id, 'dma.visibility.read'))$f$, r||'_select', r);
    execute format($f$create policy %I on dma.%I for insert with check (identity.has_permission(tenant_id, 'dma.visibility.manage'))$f$, r||'_insert', r);
    execute format($f$create policy %I on dma.%I for update using (identity.has_permission(tenant_id, 'dma.visibility.manage')) with check (identity.has_permission(tenant_id, 'dma.visibility.manage'))$f$, r||'_update', r);
    execute format($f$create policy %I on dma.%I for delete using (identity.has_permission(tenant_id, 'dma.visibility.manage'))$f$, r||'_delete', r);
  end loop;
end $$;