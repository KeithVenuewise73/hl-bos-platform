-- ===========================================================================
-- v0_visibility_assessments — the client assessment workflow (extends visibility)
--
-- The front door to Herman Legacy Group. A prospect is assessed across 16
-- weighted categories, a Business Growth Score (0-100) is computed from real
-- scored inputs, recommendations are attached, and the whole thing persists as
-- STRUCTURED DATA inside HL-BOS — not a throwaway PDF. The same assessment
-- record becomes the baseline for monthly reporting when the prospect converts.
--
-- This is NOT a new module: it extends the existing `visibility` schema (0014,
-- deliberately built as a minimal boundary) and reuses the spine + V0:
--   identity/permissions  — who may run assessments (tenant-scoped)
--   audit                 — every write is audited
--   events                — lifecycle emits (visibility.prospect.*, .assessment.*)
--   billing               — conversion emits an event billing/software consume
--
-- Multi-tenant from the start: prospects belong to the AGENCY tenant running
-- the assessment, so VisibilityAI can later serve many agencies as SaaS. When a
-- prospect converts, converted_tenant_id links to the provisioned client tenant.
--
-- rollback:
--   DROP TABLE IF EXISTS visibility.recommendations, visibility.assessment_scores,
--     visibility.assessments, visibility.assessment_categories,
--     visibility.prospects CASCADE;
--   DROP TYPE IF EXISTS visibility.prospect_stage, visibility.assessment_status,
--     visibility.recommendation_kind;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'visibility.prospect.%'
--     OR permission_key LIKE 'visibility.assessment.%';
--   DELETE FROM identity.permissions WHERE key LIKE 'visibility.prospect.%'
--     OR key LIKE 'visibility.assessment.%';
-- ===========================================================================

do $$ begin create type visibility.prospect_stage as enum ('prospect','assessed','proposed','client','lost'); exception when duplicate_object then null; end $$;
do $$ begin create type visibility.assessment_status as enum ('draft','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type visibility.recommendation_kind as enum ('strength','weakness','quick_win','action_90d','service','software'); exception when duplicate_object then null; end $$;

-- --- Prospects (owned by the agency tenant) ---------------------------------
create table if not exists visibility.prospects (
  id                  uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  business_name       text not null,
  contact_name        text,
  email               extensions.citext,
  phone               text,
  industry            extensions.citext,
  city                text,
  website_url         text,
  stage               visibility.prospect_stage not null default 'prospect',
  converted_tenant_id uuid references platform.tenants(id) on delete set null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists prospects_tenant_idx on visibility.prospects (tenant_id, stage);

-- --- Category reference catalog (the 16 weighted dimensions) -----------------
create table if not exists visibility.assessment_categories (
  key           extensions.citext primary key,
  name          text not null,
  weight        integer not null default 5,
  display_order integer not null default 0,
  guidance      text not null default '',
  constraint assessment_categories_weight_pos check (weight > 0),
  constraint assessment_categories_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table visibility.assessment_categories is 'The 16 assessment dimensions and their revenue-impact weights. Seeded by migration.';

-- --- Assessments (the baseline record, reused for monthly reporting) ---------
create table if not exists visibility.assessments (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  prospect_id   uuid not null references visibility.prospects(id) on delete cascade,
  status        visibility.assessment_status not null default 'draft',
  period_label  text,                          -- null = baseline; e.g. '2026-08' for monthly
  overall_score numeric(4,2),                  -- 0.00-5.00 weighted mean
  growth_score  integer,                       -- 0-100 (overall/5*100)
  assessed_by   uuid references auth.users(id) on delete set null,
  assessed_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint assessments_growth_range check (growth_score is null or growth_score between 0 and 100),
  constraint assessments_overall_range check (overall_score is null or (overall_score >= 0 and overall_score <= 5))
);
create index if not exists assessments_prospect_idx on visibility.assessments (prospect_id, created_at desc);

-- --- Per-category scores -----------------------------------------------------
create table if not exists visibility.assessment_scores (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references visibility.assessments(id) on delete cascade,
  category_key  extensions.citext not null references visibility.assessment_categories(key) on delete restrict,
  score         integer not null,              -- 0-5
  note          text,
  constraint assessment_scores_unique unique (assessment_id, category_key),
  constraint assessment_scores_range check (score between 0 and 5)
);

-- --- Recommendations (strengths/weaknesses/quick wins/90-day/service/software)
create table if not exists visibility.recommendations (
  id            bigint generated always as identity primary key,
  assessment_id uuid not null references visibility.assessments(id) on delete cascade,
  category_key  extensions.citext references visibility.assessment_categories(key) on delete set null,
  kind          visibility.recommendation_kind not null,
  title         text not null,
  detail        text not null default '',
  impact        text,                          -- estimated business impact, plain language
  recommended_service text,                    -- an HLD service or HL-BOS software key
  priority      integer not null default 3,
  created_at    timestamptz not null default now()
);
create index if not exists recommendations_assessment_idx on visibility.recommendations (assessment_id, kind);

-- --- audit + updated_at triggers --------------------------------------------
create trigger prospects_set_updated_at before update on visibility.prospects for each row execute function platform.set_updated_at();
create trigger prospects_audit   after insert or update or delete on visibility.prospects   for each row execute function audit.emit();
create trigger assessments_set_updated_at before update on visibility.assessments for each row execute function platform.set_updated_at();
create trigger assessments_audit after insert or update or delete on visibility.assessments for each row execute function audit.emit();

-- --- RLS: agency-tenant members read their own; writes via definer fns -------
alter table visibility.prospects              enable row level security; alter table visibility.prospects              force row level security;
alter table visibility.assessments            enable row level security; alter table visibility.assessments            force row level security;
alter table visibility.assessment_scores      enable row level security; alter table visibility.assessment_scores      force row level security;
alter table visibility.recommendations        enable row level security; alter table visibility.recommendations        force row level security;
alter table visibility.assessment_categories  enable row level security; alter table visibility.assessment_categories  force row level security;

-- category catalog is world-readable to any authenticated context
drop policy if exists assessment_categories_select on visibility.assessment_categories;
create policy assessment_categories_select on visibility.assessment_categories for select to authenticated using (true);

drop policy if exists prospects_select on visibility.prospects;
create policy prospects_select on visibility.prospects for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.prospect.read'));
drop policy if exists assessments_select on visibility.assessments;
create policy assessments_select on visibility.assessments for select to authenticated
  using (identity.has_permission(tenant_id, 'visibility.assessment.read'));
-- child rows: readable when the parent assessment is (definer fns do the writes)
drop policy if exists assessment_scores_select on visibility.assessment_scores;
create policy assessment_scores_select on visibility.assessment_scores for select to authenticated
  using (exists (select 1 from visibility.assessments a
                 where a.id = assessment_id and identity.has_permission(a.tenant_id, 'visibility.assessment.read')));
drop policy if exists recommendations_select on visibility.recommendations;
create policy recommendations_select on visibility.recommendations for select to authenticated
  using (exists (select 1 from visibility.assessments a
                 where a.id = assessment_id and identity.has_permission(a.tenant_id, 'visibility.assessment.read')));

grant select on visibility.prospects, visibility.assessments, visibility.assessment_scores,
                visibility.recommendations, visibility.assessment_categories to authenticated;

-- ===========================================================================
-- Workflow functions (tenant, permission-gated, SECURITY DEFINER)
-- ===========================================================================
create or replace function visibility.create_prospect(
  p_tenant uuid, p_business text, p_contact text default null, p_email extensions.citext default null,
  p_phone text default null, p_industry extensions.citext default null, p_city text default null, p_website text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege to create a prospect' using errcode = 'insufficient_privilege';
  end if;
  insert into visibility.prospects (tenant_id, business_name, contact_name, email, phone, industry, city, website_url, created_by)
  values (p_tenant, p_business, p_contact, p_email, p_phone, p_industry, p_city, p_website, auth.uid())
  returning id into v_id;
  perform events.emit('visibility.prospect.created', p_tenant, jsonb_build_object('prospect', v_id, 'business', p_business));
  return v_id;
end; $$;
revoke all on function visibility.create_prospect(uuid, text, text, extensions.citext, text, extensions.citext, text, text) from public, anon;
grant execute on function visibility.create_prospect(uuid, text, text, extensions.citext, text, extensions.citext, text, text) to authenticated;

create or replace function visibility.start_assessment(p_prospect uuid, p_period text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from visibility.prospects where id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.assessment.manage') then
    raise exception 'insufficient privilege to run an assessment' using errcode = 'insufficient_privilege';
  end if;
  insert into visibility.assessments (tenant_id, prospect_id, status, period_label)
  values (v_tenant, p_prospect, 'draft', p_period)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function visibility.start_assessment(uuid, text) from public, anon;
grant execute on function visibility.start_assessment(uuid, text) to authenticated;

create or replace function visibility.score_category(p_assessment uuid, p_category extensions.citext, p_score integer, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from visibility.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.assessment.manage') then
    raise exception 'insufficient privilege to score an assessment' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from visibility.assessment_categories where key = p_category) then
    raise exception 'unknown category %', p_category using errcode = 'foreign_key_violation';
  end if;
  insert into visibility.assessment_scores (assessment_id, category_key, score, note)
  values (p_assessment, p_category, p_score, p_note)
  on conflict (assessment_id, category_key) do update set score = excluded.score, note = excluded.note;
end; $$;
revoke all on function visibility.score_category(uuid, extensions.citext, integer, text) from public, anon;
grant execute on function visibility.score_category(uuid, extensions.citext, integer, text) to authenticated;

create or replace function visibility.add_recommendation(
  p_assessment uuid, p_kind visibility.recommendation_kind, p_title text, p_detail text default '',
  p_impact text default null, p_service text default null, p_category extensions.citext default null, p_priority integer default 3)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint;
begin
  select tenant_id into v_tenant from visibility.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.assessment.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into visibility.recommendations (assessment_id, category_key, kind, title, detail, impact, recommended_service, priority)
  values (p_assessment, p_category, p_kind, p_title, coalesce(p_detail,''), p_impact, p_service, p_priority)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function visibility.add_recommendation(uuid, visibility.recommendation_kind, text, text, text, text, extensions.citext, integer) from public, anon;
grant execute on function visibility.add_recommendation(uuid, visibility.recommendation_kind, text, text, text, text, extensions.citext, integer) to authenticated;

-- Compute the Business Growth Score from the scored categories (weighted mean),
-- mark the assessment completed, advance the prospect, and emit the event that
-- the report/proposal/monthly-reporting steps all key off. Honest: the score is
-- derived only from real scored inputs — an unscored assessment cannot complete.
create or replace function visibility.complete_assessment(p_assessment uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_prospect uuid; v_overall numeric(4,2); v_growth integer; v_n integer;
begin
  select tenant_id, prospect_id into v_tenant, v_prospect from visibility.assessments where id = p_assessment;
  if not found then raise exception 'assessment % not found', p_assessment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.assessment.manage') then
    raise exception 'insufficient privilege to complete an assessment' using errcode = 'insufficient_privilege';
  end if;

  select count(*),
         round(sum(s.score::numeric * c.weight) / nullif(sum(c.weight),0), 2)
    into v_n, v_overall
  from visibility.assessment_scores s
  join visibility.assessment_categories c on c.key = s.category_key
  where s.assessment_id = p_assessment;

  if v_n = 0 or v_overall is null then
    raise exception 'cannot complete an assessment with no scored categories' using errcode = 'no_data_found';
  end if;
  v_growth := round(v_overall / 5 * 100);

  update visibility.assessments
     set status = 'completed', overall_score = v_overall, growth_score = v_growth,
         assessed_by = auth.uid(), assessed_at = now()
   where id = p_assessment;

  -- baseline assessments advance the prospect; monthly re-assessments do not regress it
  update visibility.prospects set stage = 'assessed'
    where id = v_prospect and stage = 'prospect';

  perform events.emit('visibility.assessment.completed', v_tenant,
    jsonb_build_object('assessment', p_assessment, 'prospect', v_prospect, 'growth_score', v_growth, 'categories', v_n));
  perform audit.log_security_event('visibility.assessment.complete','allowed','info',
    v_tenant,'visibility.assessments',p_assessment::text, jsonb_build_object('growth_score', v_growth));
  return v_growth;
end; $$;
revoke all on function visibility.complete_assessment(uuid) from public, anon;
grant execute on function visibility.complete_assessment(uuid) to authenticated;

-- Advance a prospect to proposed / client / lost. Converting to a client emits
-- the event that billing + provisioning consume — billing is reused, not rebuilt.
create or replace function visibility.set_prospect_stage(p_prospect uuid, p_stage visibility.prospect_stage, p_converted_tenant uuid default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from visibility.prospects where id = p_prospect;
  if not found then raise exception 'prospect % not found', p_prospect using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'visibility.prospect.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update visibility.prospects set stage = p_stage, converted_tenant_id = coalesce(p_converted_tenant, converted_tenant_id)
    where id = p_prospect;
  perform events.emit(('visibility.prospect.' || p_stage::text)::extensions.citext, v_tenant,
    jsonb_build_object('prospect', p_prospect, 'converted_tenant', p_converted_tenant));
end; $$;
revoke all on function visibility.set_prospect_stage(uuid, visibility.prospect_stage, uuid) from public, anon;
grant execute on function visibility.set_prospect_stage(uuid, visibility.prospect_stage, uuid) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('visibility.prospect.read',   'Read the agency''s prospects.', 'tenant'),
  ('visibility.prospect.manage', 'Create and advance prospects.', 'tenant'),
  ('visibility.assessment.read', 'Read assessments, scores, and recommendations.', 'tenant'),
  ('visibility.assessment.manage','Run and complete assessments.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','visibility.prospect.read'),('tenant_owner','visibility.prospect.manage'),
  ('tenant_owner','visibility.assessment.read'),('tenant_owner','visibility.assessment.manage'),
  ('tenant_admin','visibility.prospect.read'),('tenant_admin','visibility.prospect.manage'),
  ('tenant_admin','visibility.assessment.read'),('tenant_admin','visibility.assessment.manage'),
  ('manager','visibility.prospect.read'),('manager','visibility.prospect.manage'),
  ('manager','visibility.assessment.read'),('manager','visibility.assessment.manage'),
  ('staff','visibility.prospect.read'),('staff','visibility.assessment.read')
on conflict do nothing;

-- --- Seed the 16 weighted assessment categories -----------------------------
insert into visibility.assessment_categories (key, name, weight, display_order, guidance) values
  ('website',              'Website',               8, 1,  'Modern, fast, mobile, conversion-focused site.'),
  ('seo',                  'SEO',                   8, 2,  'Ranking for the searches customers actually use.'),
  ('google_business',      'Google Business Profile',10,3, 'Claimed, complete, active GBP — the #1 local lever.'),
  ('reviews',              'Reviews',               9, 4,  'Volume, recency, and rating of customer reviews.'),
  ('reputation',           'Reputation Management', 7, 5,  'Monitoring and responding across the web.'),
  ('branding',             'Branding',              5, 6,  'Consistent, trustworthy identity and messaging.'),
  ('lead_generation',      'Lead Generation',       9, 7,  'Systems that turn attention into inbound leads.'),
  ('calls_to_action',      'Calls to Action',       6, 8,  'Clear next steps that convert visitors.'),
  ('ai_readiness',         'AI Readiness',          5, 9,  'Ability to adopt AI chat, phone, and automation.'),
  ('marketing_automation', 'Marketing Automation',  7, 10, 'Automated follow-up, nurture, and reactivation.'),
  ('analytics',            'Analytics',             5, 11, 'Visibility into what drives revenue.'),
  ('communications',       'Communications',        7, 12, 'Missed-call text-back, speed-to-lead, SMS/email.'),
  ('social_presence',      'Social Presence',       5, 13, 'Active, on-brand presence where customers are.'),
  ('competitive_position', 'Competitive Position',  6, 14, 'Standing versus local competitors.'),
  ('business_operations',  'Business Operations',   5, 15, 'CRM, scheduling, and back-office efficiency.'),
  ('growth_opportunities', 'Growth Opportunities',  6, 16, 'Untapped services, locations, or segments.')
on conflict (key) do nothing;
