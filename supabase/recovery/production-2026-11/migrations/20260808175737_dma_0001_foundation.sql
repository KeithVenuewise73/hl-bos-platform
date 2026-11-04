create schema if not exists dma;
comment on schema dma is
  'DMA-OS — Herman Legacy Digital Digital Marketing Agency OS. DMA-01 Client Intelligence foundation. Tenant = the operating agency (platform.tenants, first_party). Reuses identity/ai/audit/workflows; adds no parallel auth, audit, or approval system.';
grant usage on schema dma to authenticated;

create type dma.provenance as enum ('human_entered','ai_inferred','imported','seed_demo');
create type dma.verification as enum ('unverified','human_verified','needs_review','disputed');
create type dma.recommendation_status as enum ('draft','recommended','pending_approval','approved','rejected','executed','failed');
create type dma.objective_priority as enum ('primary','secondary');
create type dma.objective_status   as enum ('proposed','active','achieved','paused','abandoned');
create type dma.objective_type as enum ('lead_generation','consultations','subscriptions','local_visibility','website_traffic','appointments','authority','brand_awareness','retention','other');
create type dma.offering_kind as enum ('product','service');
create type dma.market_type as enum ('industry','vertical','geography','segment');
create type dma.channel_kind as enum ('website','google','linkedin','facebook','instagram','tiktok','youtube','email','sms','x_twitter','podcast','pinterest','other');
create type dma.campaign_status as enum ('planned','active','paused','completed','archived');
create type dma.asset_kind as enum ('article','blog_post','social_post','video','image','advertisement','landing_page','email','case_study','whitepaper','other');
create type dma.asset_status as enum ('draft','in_review','approved','published','archived');
create type dma.lead_stage as enum ('new','qualified','opportunity','customer','disqualified');
create type dma.threat_level as enum ('low','medium','high');
create type dma.record_status as enum ('active','archived');

create or replace function dma._attach_triggers(p_table regclass)
returns void language plpgsql as $$
declare v_name text := split_part(p_table::text, '.', 2);
begin
  execute format('drop trigger if exists %I on %s', v_name || '_set_updated_at', p_table);
  execute format('create trigger %I before update on %s for each row execute function platform.set_updated_at()', v_name || '_set_updated_at', p_table);
  execute format('drop trigger if exists %I on %s', v_name || '_audit', p_table);
  execute format('create trigger %I after insert or update or delete on %s for each row execute function audit.emit()', v_name || '_audit', p_table);
end $$;

create table dma.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  platform_tenant_id uuid references platform.tenants(id) on delete set null,
  slug text not null, name text not null, legal_name text, website_url text,
  hq_location text, founded_year int, one_liner text, description text,
  is_internal boolean not null default true,
  needs_profile_completion boolean not null default true,
  profile_notes text,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid,
  unique (tenant_id, slug)
);
comment on table dma.clients is 'A business receiving marketing services from the agency. tenant_id = the agency (platform.tenants). platform_tenant_id links to the client''s own Herman tenant when one exists.';
create index on dma.clients (tenant_id);
create index on dma.clients (platform_tenant_id);

create table dma.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  name text not null, tagline text, positioning_statement text, differentiator text,
  value_proposition text, brand_voice_traits text[] not null default '{}', brand_voice_notes text,
  tone text, messaging_pillars text[] not null default '{}', do_not_say text[] not null default '{}',
  is_primary boolean not null default true,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.brands (tenant_id);
create index on dma.brands (client_id);

create table dma.offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  kind dma.offering_kind not null, name text not null, summary text, description text,
  category text, price_model text, is_core boolean not null default false,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.offerings (tenant_id);
create index on dma.offerings (client_id);

create table dma.markets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  name text not null, market_type dma.market_type not null default 'industry', description text,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.markets (tenant_id);
create index on dma.markets (client_id);

create table dma.personas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  market_id uuid references dma.markets(id) on delete set null,
  name text not null, role_titles text[] not null default '{}', description text,
  goals text[] not null default '{}', pains text[] not null default '{}',
  objections text[] not null default '{}', watering_holes text[] not null default '{}',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.personas (tenant_id);
create index on dma.personas (client_id);

create table dma.competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  market_id uuid references dma.markets(id) on delete set null,
  name text not null, website_url text, positioning text,
  strengths text[] not null default '{}', weaknesses text[] not null default '{}',
  threat_level dma.threat_level not null default 'medium',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.competitors (tenant_id);
create index on dma.competitors (client_id);

create table dma.objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  title text not null, objective_type dma.objective_type not null default 'other', description text,
  priority dma.objective_priority not null default 'primary',
  target_metric text, target_value numeric, target_date date,
  primary_persona_id uuid references dma.personas(id) on delete set null,
  status dma.objective_status not null default 'active',
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.objectives (tenant_id);
create index on dma.objectives (client_id);

create table dma.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  kind dma.channel_kind not null, handle_or_url text, is_active boolean not null default true, notes text,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  status dma.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.channels (tenant_id);
create index on dma.channels (client_id);

create table dma.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  objective_id uuid references dma.objectives(id) on delete set null,
  name text not null, description text, status dma.campaign_status not null default 'planned',
  start_date date, end_date date, budget_amount numeric,
  primary_channel_id uuid references dma.channels(id) on delete set null,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.campaigns (tenant_id);
create index on dma.campaigns (client_id);

create table dma.campaign_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  campaign_id uuid not null references dma.campaigns(id) on delete cascade,
  channel_id uuid not null references dma.channels(id) on delete cascade,
  created_at timestamptz not null default now(), created_by uuid,
  unique (campaign_id, channel_id)
);
create index on dma.campaign_channels (tenant_id);

create table dma.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  campaign_id uuid references dma.campaigns(id) on delete set null,
  channel_id uuid references dma.channels(id) on delete set null,
  kind dma.asset_kind not null, title text not null, summary text, body_ref text,
  status dma.asset_status not null default 'draft', published_url text, published_at timestamptz,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.assets (tenant_id);
create index on dma.assets (client_id);

create table dma.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  source_campaign_id uuid references dma.campaigns(id) on delete set null,
  source_asset_id uuid references dma.assets(id) on delete set null,
  source_channel_id uuid references dma.channels(id) on delete set null,
  name text, organization text, email text, phone text,
  stage dma.lead_stage not null default 'new', value_estimate numeric, notes text,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.leads (tenant_id);
create index on dma.leads (client_id);

create table dma.metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  subject_type text not null, subject_id uuid, metric_key text not null,
  metric_value numeric, unit text, period_start date, period_end date, source text,
  provenance dma.provenance not null default 'imported',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
create index on dma.metrics (tenant_id);
create index on dma.metrics (client_id, subject_type, subject_id);

create table dma.recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  client_id uuid not null references dma.clients(id) on delete cascade,
  objective_id uuid references dma.objectives(id) on delete set null,
  title text not null, rationale text, recommended_action text,
  status dma.recommendation_status not null default 'draft',
  approval_instance_id uuid, ai_run_id bigint,
  provenance dma.provenance not null default 'human_entered',
  verification dma.verification not null default 'unverified',
  decided_by uuid, decided_at timestamptz, executed_at timestamptz, result_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);
comment on table dma.recommendations is 'AI-generated or analyst recommended actions. Consequential transitions to executed are gated: status may not reach ''executed'' unless it passed ''approved'' (enforced by trigger). The human gate itself is workflows.request_approval / workflows.is_approved — not re-implemented here.';
create index on dma.recommendations (tenant_id);
create index on dma.recommendations (client_id, status);

create or replace function dma.enforce_recommendation_gate()
returns trigger language plpgsql as $$
begin
  if new.status = 'executed' and coalesce(old.status,'draft') <> 'approved' and old.status is distinct from 'executed' then
    raise exception 'a recommendation must be approved before it can be executed (was %)', coalesce(old.status,'draft') using errcode = 'check_violation';
  end if;
  if new.status in ('approved','rejected') and new.decided_at is null then
    new.decided_at := now(); new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;
  if new.status = 'executed' and new.executed_at is null then new.executed_at := now(); end if;
  return new;
end $$;
create trigger recommendations_gate before update on dma.recommendations for each row execute function dma.enforce_recommendation_gate();

create table dma.completeness_dimensions (
  key text primary key, label text not null, weight numeric not null default 1,
  description text, sort_order int not null default 0
);
comment on table dma.completeness_dimensions is 'Weights for the Client Intelligence completeness score. Rows, not code — adjusting the model is data, not a migration.';
insert into dma.completeness_dimensions (key,label,weight,description,sort_order) values
  ('business_identity','Business Identity',15,'Name, one-liner, description, website, location, founded year',1),
  ('brand','Brand',15,'Positioning, differentiator, value proposition, brand voice',2),
  ('offerings','Products/Services',12,'At least one described core offering',3),
  ('markets','Markets',10,'Industries, verticals, and geographies served',4),
  ('personas','Personas',12,'Buyer personas with goals and pains',5),
  ('competitors','Competitors',8,'Known market competitors',6),
  ('objectives','Objectives',15,'Business objectives with a primary objective',7),
  ('channels','Channels',13,'Active marketing channels',8)
on conflict (key) do nothing;

select dma._attach_triggers('dma.clients');
select dma._attach_triggers('dma.brands');
select dma._attach_triggers('dma.offerings');
select dma._attach_triggers('dma.markets');
select dma._attach_triggers('dma.personas');
select dma._attach_triggers('dma.competitors');
select dma._attach_triggers('dma.objectives');
select dma._attach_triggers('dma.channels');
select dma._attach_triggers('dma.campaigns');
select dma._attach_triggers('dma.assets');
select dma._attach_triggers('dma.leads');
select dma._attach_triggers('dma.metrics');
select dma._attach_triggers('dma.recommendations');

insert into identity.permissions (key, scope, description) values
  ('dma.client.read','tenant','Read the agency''s marketing clients and client intelligence.'),
  ('dma.client.manage','tenant','Create and update marketing clients.'),
  ('dma.intelligence.read','tenant','Read client intelligence (brand, offerings, markets, personas, competitors, objectives, channels, campaigns, assets, metrics).'),
  ('dma.intelligence.manage','tenant','Create and update client intelligence records.'),
  ('dma.lead.read','tenant','Read marketing leads.'),
  ('dma.lead.manage','tenant','Create and update marketing leads.'),
  ('dma.recommendation.read','tenant','Read marketing recommendations.'),
  ('dma.recommendation.create','tenant','Create marketing recommendations (advisory; never self-executing).'),
  ('dma.recommendation.manage','tenant','Approve, reject, or mark executed a marketing recommendation (the human gate).')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r.role_key, p.perm
from (values ('dma.client.read'),('dma.intelligence.read'),('dma.lead.read'),('dma.recommendation.read')) as p(perm)
cross join (values ('tenant_owner'),('tenant_admin'),('manager'),('staff'),('viewer')) as r(role_key)
on conflict do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r.role_key, p.perm
from (values ('dma.client.manage'),('dma.intelligence.manage'),('dma.lead.manage'),('dma.recommendation.create')) as p(perm)
cross join (values ('tenant_owner'),('tenant_admin'),('manager')) as r(role_key)
on conflict do nothing;

insert into identity.role_permissions (role_key, permission_key)
select r.role_key, 'dma.recommendation.manage'
from (values ('tenant_owner'),('tenant_admin')) as r(role_key)
on conflict do nothing;

grant select, insert, update, delete on all tables in schema dma to authenticated;
revoke insert, update, delete on dma.completeness_dimensions from authenticated;

do $$
declare r record; read_perm text; write_perm text;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='dma' and c.relkind='r' and c.relname <> 'completeness_dimensions'
  loop
    execute format('alter table dma.%I enable row level security', r.relname);
    execute format('alter table dma.%I force row level security', r.relname);
    if r.relname = 'clients' then read_perm := 'dma.client.read'; write_perm := 'dma.client.manage';
    elsif r.relname = 'leads' then read_perm := 'dma.lead.read'; write_perm := 'dma.lead.manage';
    elsif r.relname = 'recommendations' then read_perm := 'dma.recommendation.read'; write_perm := 'dma.recommendation.create';
    else read_perm := 'dma.intelligence.read'; write_perm := 'dma.intelligence.manage';
    end if;
    execute format($f$create policy %I on dma.%I for select using (identity.has_permission(tenant_id, %L))$f$, r.relname||'_select', r.relname, read_perm);
    execute format($f$create policy %I on dma.%I for insert with check (identity.has_permission(tenant_id, %L))$f$, r.relname||'_insert', r.relname, write_perm);
    if r.relname <> 'recommendations' then
      execute format($f$create policy %I on dma.%I for update using (identity.has_permission(tenant_id, %L)) with check (identity.has_permission(tenant_id, %L))$f$, r.relname||'_update', r.relname, write_perm, write_perm);
    end if;
    execute format($f$create policy %I on dma.%I for delete using (identity.has_permission(tenant_id, %L))$f$, r.relname||'_delete', r.relname, write_perm);
  end loop;
end $$;

alter table dma.completeness_dimensions enable row level security;
alter table dma.completeness_dimensions force row level security;
create policy completeness_dimensions_select on dma.completeness_dimensions for select using (true);

create policy recommendations_decide on dma.recommendations for update
  using (identity.has_permission(tenant_id, 'dma.recommendation.read'))
  with check (
    case when status in ('approved','rejected','executed')
      then identity.has_permission(tenant_id, 'dma.recommendation.manage')
      else identity.has_permission(tenant_id, 'dma.recommendation.create') end
  );

create or replace function dma.client_completeness(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public'
as $$
declare v_tenant uuid; v_result jsonb;
begin
  select tenant_id into v_tenant from dma.clients where id = p_client;
  if v_tenant is null then raise exception 'client % not found', p_client using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.client.read') then raise exception 'insufficient privilege' using errcode = 'insufficient_privilege'; end if;
  with c as (select * from dma.clients where id = p_client),
  dims as (
    select 'business_identity'::text as key,
           (case when (select name from c) is not null then 1 else 0 end
          + case when (select one_liner from c) is not null then 1 else 0 end
          + case when (select description from c) is not null then 1 else 0 end
          + case when (select website_url from c) is not null then 1 else 0 end
          + case when (select hq_location from c) is not null then 1 else 0 end
          + case when (select founded_year from c) is not null then 1 else 0 end)::numeric / 6 * 100 as score
    union all
    select 'brand', coalesce((
        select (case when positioning_statement is not null then 1 else 0 end
              + case when differentiator is not null then 1 else 0 end
              + case when value_proposition is not null then 1 else 0 end
              + case when array_length(brand_voice_traits,1) is not null then 1 else 0 end)::numeric / 4 * 100
        from dma.brands b where b.client_id = p_client and b.status='active' order by b.is_primary desc limit 1), 0)
    union all
    select 'offerings', case when exists(select 1 from dma.offerings o where o.client_id=p_client and o.status='active')
        then least(100, (select count(*) from dma.offerings o where o.client_id=p_client and o.status='active' and o.is_core)*60
                        + (select count(*) from dma.offerings o where o.client_id=p_client and o.status='active')*10) else 0 end
    union all
    select 'markets', case when exists(select 1 from dma.markets m where m.client_id=p_client and m.status='active')
        then least(100, (select count(*) from dma.markets m where m.client_id=p_client and m.status='active')*40) else 0 end
    union all
    select 'personas', coalesce((select least(100, count(*) * 50
        + sum(case when array_length(pains,1) is not null and array_length(goals,1) is not null then 20 else 0 end))
        from dma.personas p where p.client_id=p_client and p.status='active'), 0)
    union all
    select 'competitors', case when exists(select 1 from dma.competitors k where k.client_id=p_client and k.status='active')
        then least(100, (select count(*) from dma.competitors k where k.client_id=p_client and k.status='active')*35) else 0 end
    union all
    select 'objectives', case when exists(select 1 from dma.objectives o where o.client_id=p_client and o.priority='primary' and o.status in ('active','proposed','achieved'))
        then least(100, 60 + (select count(*) from dma.objectives o where o.client_id=p_client and o.status in ('active','proposed','achieved'))*20)
        else case when exists(select 1 from dma.objectives o where o.client_id=p_client) then 40 else 0 end end
    union all
    select 'channels', case when exists(select 1 from dma.channels ch where ch.client_id=p_client and ch.is_active and ch.status='active')
        then least(100, (select count(*) from dma.channels ch where ch.client_id=p_client and ch.is_active and ch.status='active')*25) else 0 end
  ),
  scored as (
    select d.key, cd.label, cd.weight, round(least(100, greatest(0, d.score)))::int as score, cd.sort_order
    from dims d join dma.completeness_dimensions cd on cd.key = d.key
  )
  select jsonb_build_object(
    'overall', coalesce(round(sum(score*weight)/nullif(sum(weight),0))::int, 0),
    'dimensions', coalesce(jsonb_agg(jsonb_build_object('key',key,'label',label,'weight',weight,'score',score,'known',(score>0)) order by sort_order), '[]'::jsonb)
  ) into v_result from scored;
  return v_result;
end $$;
comment on function dma.client_completeness is 'Deterministic Client Intelligence completeness (§16). Overall = weighted mean of per-dimension scores. Tells Claude whether enough is known to act.';

create view dma.v_client_completeness with (security_invoker = true) as
  select c.id as client_id, c.tenant_id, c.name,
         (dma.client_completeness(c.id) ->> 'overall')::int as overall_score,
         dma.client_completeness(c.id) -> 'dimensions' as dimensions
  from dma.clients c;
grant select on dma.v_client_completeness to authenticated;

create or replace function dma.get_client_context(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public'
as $$
declare v_tenant uuid; v_client dma.clients; v_result jsonb; v_completeness jsonb; v_missing text[] := '{}';
begin
  select * into v_client from dma.clients where id = p_client;
  if not found then raise exception 'client % not found', p_client using errcode = 'no_data_found'; end if;
  v_tenant := v_client.tenant_id;
  if not identity.has_permission(v_tenant, 'dma.client.read') then raise exception 'insufficient privilege to read client context' using errcode = 'insufficient_privilege'; end if;
  v_completeness := dma.client_completeness(p_client);
  if v_client.one_liner is null and v_client.description is null then v_missing := v_missing || 'business_description'; end if;
  if not exists(select 1 from dma.brands where client_id=p_client and status='active') then v_missing := v_missing || 'brand'; end if;
  if not exists(select 1 from dma.offerings where client_id=p_client and status='active') then v_missing := v_missing || 'offerings'; end if;
  if not exists(select 1 from dma.markets where client_id=p_client and status='active') then v_missing := v_missing || 'markets'; end if;
  if not exists(select 1 from dma.personas where client_id=p_client and status='active') then v_missing := v_missing || 'personas'; end if;
  if not exists(select 1 from dma.competitors where client_id=p_client and status='active') then v_missing := v_missing || 'competitors'; end if;
  if not exists(select 1 from dma.objectives where client_id=p_client) then v_missing := v_missing || 'objectives'; end if;
  if not exists(select 1 from dma.channels where client_id=p_client and status='active') then v_missing := v_missing || 'channels'; end if;
  select jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'slug', v_client.slug, 'name', v_client.name,
      'legal_name', v_client.legal_name, 'website_url', v_client.website_url, 'hq_location', v_client.hq_location,
      'founded_year', v_client.founded_year, 'one_liner', v_client.one_liner, 'description', v_client.description,
      'is_internal', v_client.is_internal, 'needs_profile_completion', v_client.needs_profile_completion,
      'provenance', v_client.provenance, 'verification', v_client.verification, 'linked_platform_tenant_id', v_client.platform_tenant_id),
    'brand', (select jsonb_build_object('name', name, 'tagline', tagline, 'positioning_statement', positioning_statement,
        'differentiator', differentiator, 'value_proposition', value_proposition, 'brand_voice_traits', brand_voice_traits,
        'brand_voice_notes', brand_voice_notes, 'messaging_pillars', messaging_pillars, 'do_not_say', do_not_say,
        'provenance', provenance, 'verification', verification)
      from dma.brands where client_id=p_client and status='active' order by is_primary desc limit 1),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',name,'summary',summary,'is_core',is_core,'category',category,'provenance',provenance,'verification',verification) order by is_core desc, name) from dma.offerings where client_id=p_client and status='active'), '[]'::jsonb),
    'markets', coalesce((select jsonb_agg(jsonb_build_object('name',name,'market_type',market_type,'description',description,'provenance',provenance,'verification',verification) order by name) from dma.markets where client_id=p_client and status='active'), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(jsonb_build_object('name',name,'role_titles',role_titles,'goals',goals,'pains',pains,'objections',objections,'watering_holes',watering_holes,'provenance',provenance,'verification',verification) order by name) from dma.personas where client_id=p_client and status='active'), '[]'::jsonb),
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('name',name,'website_url',website_url,'positioning',positioning,'strengths',strengths,'weaknesses',weaknesses,'threat_level',threat_level,'provenance',provenance,'verification',verification) order by threat_level desc, name) from dma.competitors where client_id=p_client and status='active'), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('title',title,'objective_type',objective_type,'priority',priority,'status',status,'target_metric',target_metric,'target_value',target_value,'target_date',target_date,'provenance',provenance,'verification',verification) order by priority, title) from dma.objectives where client_id=p_client and status <> 'abandoned'), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'handle_or_url',handle_or_url,'is_active',is_active,'provenance',provenance,'verification',verification) order by kind) from dma.channels where client_id=p_client and status='active'), '[]'::jsonb),
    'active_campaigns', coalesce((select jsonb_agg(jsonb_build_object('name',name,'status',status,'start_date',start_date,'end_date',end_date) order by start_date desc nulls last) from dma.campaigns where client_id=p_client and status='active'), '[]'::jsonb),
    'recent_recommendations', coalesce((select jsonb_agg(jsonb_build_object('title',title,'status',status,'recommended_action',recommended_action,'requires_approval', status in ('recommended','pending_approval')) order by created_at desc) from (select * from dma.recommendations where client_id=p_client order by created_at desc limit 10) rr), '[]'::jsonb),
    'recent_metrics', coalesce((select jsonb_agg(jsonb_build_object('metric_key',metric_key,'metric_value',metric_value,'unit',unit,'period_end',period_end,'subject_type',subject_type) order by period_end desc nulls last) from (select * from dma.metrics where client_id=p_client order by period_end desc nulls last limit 20) mm), '[]'::jsonb),
    'restrictions', jsonb_build_object(
      'ai_may_not', jsonb_build_array('spend advertising money','launch campaigns','publish externally','send external communications','make contractual commitments'),
      'approval_required_for', jsonb_build_array('executing any recommendation','publishing any asset','sending any lead outreach'),
      'note', 'AI drafts and recommends only. Execution requires an approved recommendation (workflows human gate).'),
    'completeness', v_completeness,
    'missing', to_jsonb(v_missing),
    'generated_at', now()
  ) into v_result;
  return v_result;
end $$;
comment on function dma.get_client_context is 'AI Context Layer (§11). Structured Client Intelligence Profile for future Claude/DMA agents: identity, brand, offerings, markets, personas, competitors, objectives, channels, active campaigns, recent recommendations & metrics, restrictions, completeness and the still-missing list. Permission-checked; never fabricates.';

create or replace function dma.get_client_context_by_slug(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public'
as $$
declare v_id uuid;
begin
  select id into v_id from dma.clients c where c.slug = p_slug and identity.has_permission(c.tenant_id, 'dma.client.read') limit 1;
  if v_id is null then raise exception 'client "%" not found or not permitted', p_slug using errcode='no_data_found'; end if;
  return dma.get_client_context(v_id);
end $$;

grant execute on function dma.client_completeness(uuid) to authenticated;
grant execute on function dma.get_client_context(uuid) to authenticated;
grant execute on function dma.get_client_context_by_slug(text) to authenticated;

create or replace function dma.request_recommendation_approval(p_recommendation uuid)
returns uuid language plpgsql security definer set search_path = 'dma','identity','workflows','public'
as $$
declare v_rec dma.recommendations; v_instance uuid;
begin
  select * into v_rec from dma.recommendations where id = p_recommendation;
  if not found then raise exception 'recommendation % not found', p_recommendation using errcode='no_data_found'; end if;
  if not identity.has_permission(v_rec.tenant_id, 'dma.recommendation.read') then raise exception 'insufficient privilege' using errcode='insufficient_privilege'; end if;
  v_instance := workflows.request_approval(v_rec.tenant_id, 'dma.recommendation'::citext, 'dma.recommendations', p_recommendation::text, 'tenant_admin'::citext);
  update dma.recommendations set status = 'pending_approval', approval_instance_id = v_instance, updated_by = auth.uid() where id = p_recommendation;
  return v_instance;
end $$;
grant execute on function dma.request_recommendation_approval(uuid) to authenticated;