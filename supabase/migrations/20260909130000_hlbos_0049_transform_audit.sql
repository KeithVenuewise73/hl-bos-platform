-- ===========================================================================
-- hlbos_0049_transform_audit — the Business Transformation Analysis Tool
--
-- Herman Legacy Digital's pre-sale instrument: audit a shop's actual digital
-- presence, score it across four dimensions, and turn the gaps into a
-- recommended BarberOS bundle. Phase 1 of the spec, plus the Phase 5 link back
-- to 0048's capability catalog.
--
-- ---------------------------------------------------------------------------
-- WHAT THE SPEC ASKED FOR, AND WHERE THIS DELIBERATELY DIFFERS
--
-- The spec proposed a tenant-agnostic `audit_shops` table holding shop
-- identity. Two problems, both corrected here:
--
--   1. `visibility.prospects` (migration 0017) ALREADY IS "a business the
--      agency tenant is selling to", with business_name, phone, city,
--      website_url, industry, a stage lifecycle, and `converted_tenant_id` --
--      which is precisely the Tool -> BarberOS handoff the spec's Phase 5
--      describes. `audit_shops` would have been a second prospect table with a
--      second lifecycle. So there is no audit_shops here. There is
--      `transform_audit.shop_profiles`: a satellite on visibility.prospects
--      carrying only what a LOCAL business audit needs and prospects lacks --
--      street address, Google place id, social URLs, the hosting platform, and
--      the prospect-list row it came from.
--
--   2. "Tenant-agnostic" is not available to this platform. Non-negotiable #1:
--      every tenant-owned record carries an enforceable tenant_id. The spec's
--      instinct was right -- this data is not the SHOP's -- but the conclusion
--      was wrong. It is Herman Legacy Digital's own sales data, so it is
--      scoped to the HLD AGENCY tenant, exactly as visibility.prospects
--      already is. That also means VisibilityAI can run audits for a second
--      agency later without a rewrite.
--
-- ---------------------------------------------------------------------------
-- THE HONESTY DISCIPLINE, ENFORCED IN THE SCHEMA
--
-- The spec says every claim must trace to something actually fetched. A
-- document cannot enforce that; these constraints can:
--
--   * A dimension scored 'verified' MUST have at least one finding carrying a
--     real evidence_url. Trigger-enforced. "No dimension reaches high
--     confidence without a directly verified source" is now impossible to
--     violate, not merely discouraged.
--
--   * A dimension whose confidence is 'unknown' MUST have a NULL score, and a
--     scored dimension must NOT be 'unknown'. You cannot score what you could
--     not reach. A gap stays a gap and appears in the report as one.
--
--   * The composite is DERIVED, never written. A trigger rejects any direct
--     write to composite_score or dimensions_scored. It is a weighted mean
--     over the dimensions that ACTUALLY have a score, and the run records how
--     many of the possible dimensions that was -- so a report can say
--     "composite over 2 of 4 dimensions" instead of quietly implying four.
--
--   * Findings are append-only. Once written, a finding is immutable evidence
--     of what was observed. Same discipline as social.publish_attempts.
--
--   * FINDINGS AND RECOMMENDATIONS ARE DIFFERENT TABLES. The spec requires the
--     report to separate "what we found" from "what we recommend". Structure
--     is the only version of that separation that survives contact with a
--     deadline.
--
--   * A recommendation's capability_key is a FOREIGN KEY into
--     barberos.capabilities. A report cannot recommend a module that does not
--     exist in the catalog -- and because 0048 seeds every module as 'planned',
--     `transform_audit.recommended_bundle()` reports each one's real shipping
--     status. Today that is: none of them have shipped. The report says so.
--
--   * The one-line outreach hook must reference a finding OF THIS RUN. A hook
--     that is not traceable to an observation cannot be stored.
--
--   * Dimension weights are snapshotted onto the run at start. Re-weighting a
--     campaign later cannot silently restate a report that was already sent.
--
-- NO DATA IS SEEDED. The 50-shop WNY prospect list is not in this repository
-- and is not invented here: `import_shop` is the ingest path, and until it is
-- run against the real file, `audit_shops`-equivalent content is zero rows.
--
-- NOT APPLIED TO ANY ENVIRONMENT. Additive: one new schema, nothing altered.
--
-- rollback:
--   DROP SCHEMA IF EXISTS transform_audit CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'transform_audit.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'transform_audit.%';
--   (Additive migration: it creates a new schema and touches no existing
--    table, so dropping the schema restores the prior state exactly.)
-- ===========================================================================

create schema if not exists transform_audit;
comment on schema transform_audit is
  'HL-BOS: Business Transformation Analysis Tool -- pre-sale digital-presence audits. Agency-tenant scoped. NOT exposed via PostgREST.';
revoke all on schema transform_audit from public, anon, authenticated;
grant usage on schema transform_audit to authenticated;
alter default privileges in schema transform_audit revoke all on tables from public;
alter default privileges in schema transform_audit revoke all on functions from public;

-- --- Types ------------------------------------------------------------------
-- Exactly the four dimensions in the spec. Adding a fifth is a migration, on
-- purpose: a dimension that can appear without review would make two reports
-- incomparable while looking identical.
do $$ begin create type transform_audit.dimension as enum
  ('website','google_business','social','competitor');
  exception when duplicate_object then null; end $$;

-- The spec's three confidence labels, as a closed vocabulary.
--   verified — fetched and directly observed (requires evidence, see below)
--   inferred — a reasonable read of available signals
--   unknown  — not reachable; stated as a gap, never guessed
do $$ begin create type transform_audit.confidence as enum
  ('verified','inferred','unknown');
  exception when duplicate_object then null; end $$;

do $$ begin create type transform_audit.run_status as enum
  ('running','completed','partially_completed','failed');
  exception when duplicate_object then null; end $$;

do $$ begin create type transform_audit.severity as enum
  ('critical','high','medium','info');
  exception when duplicate_object then null; end $$;

-- The spec's prioritization: quick wins vs structural changes.
do $$ begin create type transform_audit.priority as enum
  ('quick_win','structural');
  exception when duplicate_object then null; end $$;

do $$ begin create type transform_audit.campaign_status as enum
  ('draft','active','closed');
  exception when duplicate_object then null; end $$;

-- --- Campaigns --------------------------------------------------------------
create table if not exists transform_audit.campaigns (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  key         extensions.citext not null,
  name        text not null,
  status      transform_audit.campaign_status not null default 'draft',
  notes       text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campaigns_key_unique unique (tenant_id, key),
  constraint campaigns_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table transform_audit.campaigns is
  'A named audit push, e.g. the 50-shop WNY barbershop list. Owns its own dimension weighting.';

-- --- Per-campaign dimension weights -----------------------------------------
-- The spec: "weighting is configurable per campaign, not hardcoded". A
-- dimension the campaign does not audit simply has no row, which is also how
-- Phase 1 runs website-only before the Places API question is settled.
create table if not exists transform_audit.campaign_weights (
  campaign_id uuid not null references transform_audit.campaigns(id) on delete cascade,
  dimension   transform_audit.dimension not null,
  weight      integer not null,
  primary key (campaign_id, dimension),
  constraint campaign_weights_positive check (weight > 0)
);
comment on table transform_audit.campaign_weights is
  'Composite weighting, per campaign. A dimension with no row is not audited by this campaign at all.';

-- --- Shop profile (satellite on visibility.prospects) -----------------------
create table if not exists transform_audit.shop_profiles (
  prospect_id     uuid primary key references visibility.prospects(id) on delete cascade,
  -- Denormalized for RLS and for the (tenant, dedupe_key) uniqueness below.
  -- A trigger keeps it identical to the prospect's own tenant.
  tenant_id       uuid not null references platform.tenants(id) on delete cascade,
  address_line1   text,
  locality        text,
  region          text,
  postal_code     text,
  -- The spec's "platform type" check. Several WNY prospects are known to run a
  -- booking-platform-hosted page rather than an owned site; that is a finding,
  -- and it is also the direct hook for the owned_website capability.
  website_platform extensions.citext,
  gbp_place_id    text,
  gbp_url         text,
  instagram_url   text,
  facebook_url    text,
  -- Provenance. Which file, which row. An audit whose subject cannot be traced
  -- back to a source row is an audit of something nobody can verify.
  source_file     text,
  source_row      integer,
  -- Idempotency for repeated imports of the same list.
  dedupe_key      extensions.citext not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint shop_profiles_dedupe_unique unique (tenant_id, dedupe_key),
  constraint shop_profiles_source_row_pos check (source_row is null or source_row > 0)
);
comment on table transform_audit.shop_profiles is
  'Local-business facts a presence audit needs and visibility.prospects lacks. Deliberately NOT a second prospect table.';
comment on column transform_audit.shop_profiles.dedupe_key is
  'Normalized name+postal. Re-importing the same prospect list updates rather than duplicating.';

create index if not exists shop_profiles_tenant_idx on transform_audit.shop_profiles (tenant_id);

-- The satellite's tenant must be the prospect's tenant. Without this, a row
-- could be readable by a tenant that cannot see the prospect it describes.
create or replace function transform_audit.enforce_profile_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select p.tenant_id into v_tenant from visibility.prospects p where p.id = new.prospect_id;
  if v_tenant is null then
    raise exception 'prospect % does not exist', new.prospect_id using errcode = 'no_data_found';
  end if;
  if v_tenant <> new.tenant_id then
    raise exception 'shop profile tenant % does not match prospect tenant %',
      new.tenant_id, v_tenant using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger shop_profiles_tenant_match
  before insert or update on transform_audit.shop_profiles
  for each row execute function transform_audit.enforce_profile_tenant();

-- --- Runs -------------------------------------------------------------------
create table if not exists transform_audit.runs (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id     uuid not null references platform.tenants(id) on delete cascade,
  campaign_id   uuid not null references transform_audit.campaigns(id) on delete cascade,
  prospect_id   uuid not null references visibility.prospects(id) on delete cascade,
  status        transform_audit.run_status not null default 'running',
  -- Snapshot of campaign_weights at the moment the run started. A report that
  -- was sent stays reproducible even after the campaign is re-weighted.
  weights       jsonb not null,
  -- DERIVED. Written only by transform_audit.recompute_composite().
  composite_score    integer,
  dimensions_scored  integer not null default 0,
  dimensions_possible integer not null,
  -- The spec's one-line outreach hook, and the finding it came from.
  outreach_hook            text,
  outreach_hook_finding_id bigint,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error         text,
  constraint runs_composite_range
    check (composite_score is null or composite_score between 0 and 100),
  constraint runs_dimensions_sane
    check (dimensions_scored >= 0 and dimensions_scored <= dimensions_possible),
  constraint runs_weights_not_empty check (jsonb_typeof(weights) = 'object' and weights <> '{}'::jsonb),
  -- A hook without its source finding is a claim without evidence.
  constraint runs_hook_needs_evidence
    check ((outreach_hook is null) = (outreach_hook_finding_id is null))
);
comment on table transform_audit.runs is
  'One audit execution. Re-auditing a shop later creates a NEW run -- history is kept, so improvement over time is measurable (spec open question 2, answered by keeping the option open rather than by choosing for the CEO).';
comment on column transform_audit.runs.composite_score is
  'DERIVED, weighted over the dimensions that actually have a score. A trigger rejects any direct write.';
comment on column transform_audit.runs.dimensions_possible is
  'How many dimensions this campaign weights. With dimensions_scored, lets a report state its own coverage honestly.';

create index if not exists runs_campaign_idx on transform_audit.runs (campaign_id, started_at desc);
create index if not exists runs_prospect_idx on transform_audit.runs (prospect_id, started_at desc);

-- --- Findings (append-only evidence) ----------------------------------------
create table if not exists transform_audit.findings (
  id           bigint generated always as identity primary key,
  run_id       uuid not null references transform_audit.runs(id) on delete cascade,
  dimension    transform_audit.dimension not null,
  -- Machine key, so findings are comparable across shops and over time.
  code         extensions.citext not null,
  -- Plain English, as the spec requires: "no online booking found on site or GBP".
  statement    text not null,
  -- The actual source. NULL means "observed but not linkable" -- and a NULL
  -- here is what stops the dimension from ever being called 'verified'.
  evidence_url text,
  observed     jsonb not null default '{}'::jsonb,
  confidence   transform_audit.confidence not null,
  severity     transform_audit.severity not null default 'info',
  -- Which detector produced it, and at what rubric version.
  detector     extensions.citext not null,
  created_at   timestamptz not null default now(),
  constraint findings_code_format check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint findings_statement_present check (length(btrim(statement)) > 0),
  -- An 'unknown' finding is a statement that we could NOT observe something.
  -- It cannot carry an evidence URL, because there was nothing to link to.
  constraint findings_unknown_has_no_evidence
    check (confidence <> 'unknown' or evidence_url is null)
);
comment on table transform_audit.findings is
  'What was observed. APPEND-ONLY: immutable once written, so a report cannot be quietly rewritten after it was sent.';

create index if not exists findings_run_idx on transform_audit.findings (run_id, dimension);

alter table transform_audit.runs
  add constraint runs_hook_finding_fk
  foreign key (outreach_hook_finding_id)
  references transform_audit.findings(id) on delete set null;

-- --- Dimension scores -------------------------------------------------------
create table if not exists transform_audit.dimension_scores (
  run_id         uuid not null references transform_audit.runs(id) on delete cascade,
  dimension      transform_audit.dimension not null,
  score          integer,
  confidence     transform_audit.confidence not null,
  rubric_version extensions.citext not null,
  note           text not null default '',
  scored_at      timestamptz not null default now(),
  primary key (run_id, dimension),
  constraint dimension_scores_range check (score is null or score between 0 and 100),
  -- The core discipline, as a constraint: unknown means unscored, and scored
  -- means not unknown. There is no third state where a guess wears a number.
  constraint dimension_scores_unknown_is_unscored
    check ((confidence = 'unknown') = (score is null))
);
comment on table transform_audit.dimension_scores is
  'Per-dimension score with a confidence label. ''verified'' is trigger-gated on real evidence; ''unknown'' is structurally unscoreable.';

-- The rule the spec states in prose, enforced: no dimension reaches 'verified'
-- without a directly verified source. Findings are recorded first, then the
-- dimension is scored from them -- so by the time this fires, the evidence
-- either exists or the claim is refused.
create or replace function transform_audit.enforce_verified_has_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.confidence = 'verified'
     and not exists (
       select 1 from transform_audit.findings f
        where f.run_id = new.run_id
          and f.dimension = new.dimension
          and f.evidence_url is not null) then
    raise exception
      'dimension % cannot be scored ''verified'': no finding on this run carries an evidence URL',
      new.dimension using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger dimension_scores_verified_needs_evidence
  before insert or update on transform_audit.dimension_scores
  for each row execute function transform_audit.enforce_verified_has_evidence();

-- --- Recommendations (what we ADVISE -- deliberately a separate table) -------
create table if not exists transform_audit.recommendations (
  id             bigint generated always as identity primary key,
  run_id         uuid not null references transform_audit.runs(id) on delete cascade,
  priority       transform_audit.priority not null,
  rank           integer not null default 1,
  title          text not null,
  detail         text not null default '',
  -- FK into the BarberOS catalog: a recommendation cannot name a module that
  -- does not exist. Nullable, because not every recommendation is a module
  -- ("claim your Google Business Profile" is advice, not software).
  capability_key extensions.citext references barberos.capabilities(key) on delete restrict,
  -- Which observation this answers. Nullable for the same reason.
  addresses_finding_id bigint references transform_audit.findings(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint recommendations_rank_pos check (rank > 0),
  constraint recommendations_title_present check (length(btrim(title)) > 0)
);
comment on table transform_audit.recommendations is
  'What we advise. Separate from findings so the report''s evidence/judgment boundary is structural, not editorial.';

create index if not exists recommendations_run_idx
  on transform_audit.recommendations (run_id, priority, rank);

-- --- Competitors ------------------------------------------------------------
create table if not exists transform_audit.run_competitors (
  run_id                 uuid not null references transform_audit.runs(id) on delete cascade,
  competitor_prospect_id uuid not null references visibility.prospects(id) on delete cascade,
  -- Auto-suggested by geography, then confirmed by a human. Until confirmed,
  -- a comparison is a suggestion, and the report must be able to say which.
  confirmed_by  uuid references auth.users(id) on delete set null,
  confirmed_at  timestamptz,
  note          text not null default '',
  primary key (run_id, competitor_prospect_id),
  constraint run_competitors_confirmation_consistent
    check ((confirmed_by is null) = (confirmed_at is null))
);
comment on table transform_audit.run_competitors is
  'The 2-3 nearby shops this run compares against. Unconfirmed rows are suggestions, and the report labels them as such.';

-- A shop is not its own competitor.
create or replace function transform_audit.enforce_competitor_distinct()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_subject uuid;
begin
  select r.prospect_id into v_subject from transform_audit.runs r where r.id = new.run_id;
  if v_subject = new.competitor_prospect_id then
    raise exception 'a shop cannot be its own competitor' using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger run_competitors_distinct
  before insert or update on transform_audit.run_competitors
  for each row execute function transform_audit.enforce_competitor_distinct();

-- ===========================================================================
-- Append-only + derived-field guards
-- ===========================================================================

-- Findings are evidence. Evidence that can be edited is not evidence.
create or replace function transform_audit.deny_finding_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'transform_audit.findings is append-only: a recorded observation cannot be % after the fact',
    lower(tg_op) using errcode = 'insufficient_privilege';
end; $$;

create trigger findings_append_only
  before update or delete on transform_audit.findings
  for each row execute function transform_audit.deny_finding_mutation();

-- composite_score and dimensions_scored are computed, never asserted. The GUC
-- is set only inside recompute_composite(), so any other path -- including a
-- direct UPDATE by an owner -- is refused.
create or replace function transform_audit.deny_derived_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.current_setting('transform_audit.deriving', true) = 'on' then
    return new;
  end if;
  if new.composite_score is distinct from old.composite_score
     or new.dimensions_scored is distinct from old.dimensions_scored then
    raise exception
      'composite_score and dimensions_scored are derived from dimension_scores and cannot be written directly'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end; $$;

create trigger runs_deny_derived_write
  before update on transform_audit.runs
  for each row execute function transform_audit.deny_derived_write();

-- The outreach hook must cite a finding belonging to THIS run.
create or replace function transform_audit.enforce_hook_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_run uuid;
begin
  if new.outreach_hook_finding_id is null then return new; end if;
  select f.run_id into v_run from transform_audit.findings f
   where f.id = new.outreach_hook_finding_id;
  if v_run is distinct from new.id then
    raise exception 'the outreach hook must cite a finding from this run'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger runs_hook_provenance
  before insert or update on transform_audit.runs
  for each row execute function transform_audit.enforce_hook_provenance();

-- --- updated_at + audit -----------------------------------------------------
create trigger campaigns_set_updated_at before update on transform_audit.campaigns
  for each row execute function platform.set_updated_at();
create trigger shop_profiles_set_updated_at before update on transform_audit.shop_profiles
  for each row execute function platform.set_updated_at();
create trigger campaigns_audit after insert or update or delete on transform_audit.campaigns
  for each row execute function audit.emit();
create trigger shop_profiles_audit after insert or update or delete on transform_audit.shop_profiles
  for each row execute function audit.emit();
create trigger runs_audit after insert or update or delete on transform_audit.runs
  for each row execute function audit.emit();

-- ===========================================================================
-- RLS -- agency-tenant scoped, SELECT only
-- ===========================================================================
alter table transform_audit.campaigns        enable row level security;
alter table transform_audit.campaigns        force  row level security;
alter table transform_audit.campaign_weights enable row level security;
alter table transform_audit.campaign_weights force  row level security;
alter table transform_audit.shop_profiles    enable row level security;
alter table transform_audit.shop_profiles    force  row level security;
alter table transform_audit.runs             enable row level security;
alter table transform_audit.runs             force  row level security;
alter table transform_audit.findings         enable row level security;
alter table transform_audit.findings         force  row level security;
alter table transform_audit.dimension_scores enable row level security;
alter table transform_audit.dimension_scores force  row level security;
alter table transform_audit.recommendations  enable row level security;
alter table transform_audit.recommendations  force  row level security;
alter table transform_audit.run_competitors  enable row level security;
alter table transform_audit.run_competitors  force  row level security;

drop policy if exists campaigns_select on transform_audit.campaigns;
create policy campaigns_select on transform_audit.campaigns for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read')
         or identity.is_platform_admin());

drop policy if exists shop_profiles_select on transform_audit.shop_profiles;
create policy shop_profiles_select on transform_audit.shop_profiles for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read')
         or identity.is_platform_admin());

drop policy if exists runs_select on transform_audit.runs;
create policy runs_select on transform_audit.runs for select to authenticated
  using (identity.has_permission(tenant_id, 'transform_audit.audit.read')
         or identity.is_platform_admin());

-- The child tables carry no tenant_id of their own on purpose: a second copy
-- of the tenant is a second thing that can disagree. They inherit visibility
-- from the run (or campaign) they belong to, via an EXISTS against a table
-- whose own RLS is already in force.
drop policy if exists campaign_weights_select on transform_audit.campaign_weights;
create policy campaign_weights_select on transform_audit.campaign_weights for select to authenticated
  using (exists (select 1 from transform_audit.campaigns c where c.id = campaign_id));

drop policy if exists findings_select on transform_audit.findings;
create policy findings_select on transform_audit.findings for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = run_id));

drop policy if exists dimension_scores_select on transform_audit.dimension_scores;
create policy dimension_scores_select on transform_audit.dimension_scores for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = run_id));

drop policy if exists recommendations_select on transform_audit.recommendations;
create policy recommendations_select on transform_audit.recommendations for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = run_id));

drop policy if exists run_competitors_select on transform_audit.run_competitors;
create policy run_competitors_select on transform_audit.run_competitors for select to authenticated
  using (exists (select 1 from transform_audit.runs r where r.id = run_id));

grant select on transform_audit.campaigns, transform_audit.campaign_weights,
                transform_audit.shop_profiles, transform_audit.runs,
                transform_audit.findings, transform_audit.dimension_scores,
                transform_audit.recommendations, transform_audit.run_competitors
  to authenticated;

-- ===========================================================================
-- Write paths (permission-gated SECURITY DEFINER)
-- ===========================================================================

create or replace function transform_audit.upsert_campaign(
  p_tenant uuid, p_key extensions.citext, p_name text,
  p_weights jsonb default '{"website": 100}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_dim text; v_weight integer;
begin
  if not identity.has_permission(p_tenant, 'transform_audit.campaign.manage') then
    raise exception 'insufficient privilege to manage an audit campaign'
      using errcode = 'insufficient_privilege';
  end if;
  if p_weights is null or pg_catalog.jsonb_typeof(p_weights) <> 'object'
     or p_weights = '{}'::jsonb then
    raise exception 'a campaign must weight at least one dimension'
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.campaigns (tenant_id, key, name, created_by)
  values (p_tenant, p_key, p_name, auth.uid())
  on conflict (tenant_id, key) do update set name = excluded.name, updated_at = now()
  returning id into v_id;

  -- Weights are replaced wholesale: a partial update would leave a dimension
  -- weighted by a value nobody chose this time.
  delete from transform_audit.campaign_weights w where w.campaign_id = v_id;
  for v_dim, v_weight in select k, v::text::integer from pg_catalog.jsonb_each_text(p_weights) as t(k, v)
  loop
    insert into transform_audit.campaign_weights (campaign_id, dimension, weight)
    values (v_id, v_dim::transform_audit.dimension, v_weight);
  end loop;
  return v_id;
end; $$;
revoke all on function transform_audit.upsert_campaign(uuid, extensions.citext, text, jsonb) from public, anon;
grant execute on function transform_audit.upsert_campaign(uuid, extensions.citext, text, jsonb) to authenticated;

-- --- Prospect-list ingest ---------------------------------------------------
-- One row of the source list -> one visibility.prospects row + its shop
-- profile. Idempotent on (tenant, normalized name + postal), so re-importing
-- the file updates rather than duplicating. This is the ONLY way shop data
-- enters the tool; nothing is seeded.
create or replace function transform_audit.import_shop(
  p_tenant uuid, p_row jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_row->>'business_name', ''));
  v_postal text := pg_catalog.btrim(coalesce(p_row->>'postal_code', ''));
  v_dedupe extensions.citext;
  v_prospect uuid;
begin
  if not identity.has_permission(p_tenant, 'transform_audit.shop.manage') then
    raise exception 'insufficient privilege to import a shop'
      using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' then
    raise exception 'a shop row must carry a business_name' using errcode = 'check_violation';
  end if;
  v_dedupe := (pg_catalog.lower(v_name) || '|' || pg_catalog.lower(v_postal))::extensions.citext;

  select sp.prospect_id into v_prospect
    from transform_audit.shop_profiles sp
   where sp.tenant_id = p_tenant and sp.dedupe_key = v_dedupe;

  if v_prospect is null then
    insert into visibility.prospects
      (tenant_id, business_name, phone, industry, city, website_url, created_by)
    values (p_tenant, v_name, p_row->>'phone',
            coalesce(p_row->>'industry', 'barbershop')::extensions.citext,
            p_row->>'locality', p_row->>'website_url', auth.uid())
    returning id into v_prospect;
  else
    update visibility.prospects p
       set business_name = v_name,
           phone         = coalesce(p_row->>'phone', p.phone),
           city          = coalesce(p_row->>'locality', p.city),
           website_url   = coalesce(p_row->>'website_url', p.website_url),
           updated_at    = now()
     where p.id = v_prospect;
  end if;

  insert into transform_audit.shop_profiles
    (prospect_id, tenant_id, address_line1, locality, region, postal_code,
     website_platform, gbp_place_id, gbp_url, instagram_url, facebook_url,
     source_file, source_row, dedupe_key)
  values (v_prospect, p_tenant, p_row->>'address_line1', p_row->>'locality',
          p_row->>'region', nullif(v_postal, ''),
          (p_row->>'website_platform')::extensions.citext,
          p_row->>'gbp_place_id', p_row->>'gbp_url',
          p_row->>'instagram_url', p_row->>'facebook_url',
          p_row->>'source_file', (p_row->>'source_row')::integer, v_dedupe)
  on conflict (prospect_id) do update
    set address_line1    = coalesce(excluded.address_line1, transform_audit.shop_profiles.address_line1),
        locality         = coalesce(excluded.locality, transform_audit.shop_profiles.locality),
        region           = coalesce(excluded.region, transform_audit.shop_profiles.region),
        postal_code      = coalesce(excluded.postal_code, transform_audit.shop_profiles.postal_code),
        website_platform = coalesce(excluded.website_platform, transform_audit.shop_profiles.website_platform),
        gbp_place_id     = coalesce(excluded.gbp_place_id, transform_audit.shop_profiles.gbp_place_id),
        gbp_url          = coalesce(excluded.gbp_url, transform_audit.shop_profiles.gbp_url),
        instagram_url    = coalesce(excluded.instagram_url, transform_audit.shop_profiles.instagram_url),
        facebook_url     = coalesce(excluded.facebook_url, transform_audit.shop_profiles.facebook_url),
        source_file      = coalesce(excluded.source_file, transform_audit.shop_profiles.source_file),
        source_row       = coalesce(excluded.source_row, transform_audit.shop_profiles.source_row),
        updated_at       = now();
  return v_prospect;
end; $$;
revoke all on function transform_audit.import_shop(uuid, jsonb) from public, anon;
grant execute on function transform_audit.import_shop(uuid, jsonb) to authenticated;

-- --- Run lifecycle ----------------------------------------------------------
create or replace function transform_audit.start_run(
  p_campaign uuid, p_prospect uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_weights jsonb; v_count integer; v_id uuid;
begin
  select c.tenant_id into v_tenant from transform_audit.campaigns c where c.id = p_campaign;
  if v_tenant is null then
    raise exception 'campaign % not found', p_campaign using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to run an audit'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from visibility.prospects p
                  where p.id = p_prospect and p.tenant_id = v_tenant) then
    raise exception 'prospect % does not belong to this campaign''s tenant', p_prospect
      using errcode = 'check_violation';
  end if;

  select pg_catalog.jsonb_object_agg(w.dimension::text, w.weight), pg_catalog.count(*)
    into v_weights, v_count
    from transform_audit.campaign_weights w where w.campaign_id = p_campaign;
  if v_count is null or v_count = 0 then
    raise exception 'campaign % weights no dimensions, so a run could not be scored', p_campaign
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.runs
    (tenant_id, campaign_id, prospect_id, weights, dimensions_possible)
  values (v_tenant, p_campaign, p_prospect, v_weights, v_count)
  returning id into v_id;

  perform events.emit('transform_audit.run.started', v_tenant,
    jsonb_build_object('run', v_id, 'campaign', p_campaign, 'prospect', p_prospect));
  return v_id;
end; $$;
revoke all on function transform_audit.start_run(uuid, uuid) from public, anon;
grant execute on function transform_audit.start_run(uuid, uuid) to authenticated;

create or replace function transform_audit.record_finding(
  p_run uuid, p_dimension transform_audit.dimension, p_code extensions.citext,
  p_statement text, p_confidence transform_audit.confidence,
  p_severity transform_audit.severity default 'info',
  p_evidence_url text default null, p_observed jsonb default '{}'::jsonb,
  p_detector extensions.citext default 'manual')
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status transform_audit.run_status; v_id bigint;
begin
  select r.tenant_id, r.status into v_tenant, v_status
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to record a finding'
      using errcode = 'insufficient_privilege';
  end if;
  -- A finished run's evidence is closed. Adding to it later would let a report
  -- change after it was sent, which append-only findings exist to prevent.
  if v_status <> 'running' then
    raise exception 'run % is % and no longer accepts findings', p_run, v_status
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.findings
    (run_id, dimension, code, statement, evidence_url, observed, confidence, severity, detector)
  values (p_run, p_dimension, p_code, p_statement, p_evidence_url,
          coalesce(p_observed, '{}'::jsonb), p_confidence, p_severity, p_detector)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function transform_audit.record_finding(uuid, transform_audit.dimension, extensions.citext, text, transform_audit.confidence, transform_audit.severity, text, jsonb, extensions.citext) from public, anon;
grant execute on function transform_audit.record_finding(uuid, transform_audit.dimension, extensions.citext, text, transform_audit.confidence, transform_audit.severity, text, jsonb, extensions.citext) to authenticated;

-- The composite. Weighted mean over the dimensions that HAVE a score, using
-- the run's own weight snapshot. Dimensions scored 'unknown' contribute
-- nothing and are not counted -- they are reported as gaps instead of being
-- silently averaged in as zeros, which would understate a shop we simply
-- could not reach.
create or replace function transform_audit.recompute_composite(p_run uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_weights jsonb; v_num numeric := 0; v_den numeric := 0; v_n integer := 0;
        v_composite integer; r record;
begin
  select r2.weights into v_weights from transform_audit.runs r2 where r2.id = p_run;
  if v_weights is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;

  for r in
    select ds.dimension, ds.score from transform_audit.dimension_scores ds
     where ds.run_id = p_run and ds.score is not null
  loop
    -- A dimension the campaign does not weight cannot influence the composite,
    -- even if something scored it.
    if v_weights ? r.dimension::text then
      v_num := v_num + (r.score * (v_weights->>r.dimension::text)::numeric);
      v_den := v_den + (v_weights->>r.dimension::text)::numeric;
      v_n := v_n + 1;
    end if;
  end loop;

  v_composite := case when v_den > 0 then pg_catalog.round(v_num / v_den)::integer else null end;

  perform pg_catalog.set_config('transform_audit.deriving', 'on', true);
  update transform_audit.runs r3
     set composite_score = v_composite, dimensions_scored = v_n
   where r3.id = p_run;
  perform pg_catalog.set_config('transform_audit.deriving', 'off', true);
  return v_composite;
end; $$;
revoke all on function transform_audit.recompute_composite(uuid) from public, anon, authenticated;

create or replace function transform_audit.record_dimension(
  p_run uuid, p_dimension transform_audit.dimension, p_score integer,
  p_confidence transform_audit.confidence, p_rubric_version extensions.citext,
  p_note text default '')
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status transform_audit.run_status;
begin
  select r.tenant_id, r.status into v_tenant, v_status
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to score a dimension'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'running' then
    raise exception 'run % is % and can no longer be scored', p_run, v_status
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version, note)
  values (p_run, p_dimension, p_score, p_confidence, p_rubric_version, coalesce(p_note, ''))
  on conflict (run_id, dimension) do update
    set score = excluded.score, confidence = excluded.confidence,
        rubric_version = excluded.rubric_version, note = excluded.note,
        scored_at = now();

  return transform_audit.recompute_composite(p_run);
end; $$;
revoke all on function transform_audit.record_dimension(uuid, transform_audit.dimension, integer, transform_audit.confidence, extensions.citext, text) from public, anon;
grant execute on function transform_audit.record_dimension(uuid, transform_audit.dimension, integer, transform_audit.confidence, extensions.citext, text) to authenticated;

create or replace function transform_audit.add_recommendation(
  p_run uuid, p_priority transform_audit.priority, p_title text,
  p_detail text default '', p_capability extensions.citext default null,
  p_addresses bigint default null, p_rank integer default 1)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint;
begin
  select r.tenant_id into v_tenant from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to add a recommendation'
      using errcode = 'insufficient_privilege';
  end if;
  -- A recommendation that answers a finding must answer one from THIS run.
  if p_addresses is not null
     and not exists (select 1 from transform_audit.findings f
                      where f.id = p_addresses and f.run_id = p_run) then
    raise exception 'finding % does not belong to run %', p_addresses, p_run
      using errcode = 'check_violation';
  end if;

  insert into transform_audit.recommendations
    (run_id, priority, rank, title, detail, capability_key, addresses_finding_id)
  values (p_run, p_priority, coalesce(p_rank, 1), p_title, coalesce(p_detail, ''),
          p_capability, p_addresses)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function transform_audit.add_recommendation(uuid, transform_audit.priority, text, text, extensions.citext, bigint, integer) from public, anon;
grant execute on function transform_audit.add_recommendation(uuid, transform_audit.priority, text, text, extensions.citext, bigint, integer) to authenticated;

create or replace function transform_audit.set_outreach_hook(
  p_run uuid, p_finding bigint, p_hook text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select r.tenant_id into v_tenant from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to set the outreach hook'
      using errcode = 'insufficient_privilege';
  end if;
  update transform_audit.runs r2
     set outreach_hook = p_hook, outreach_hook_finding_id = p_finding
   where r2.id = p_run;
end; $$;
revoke all on function transform_audit.set_outreach_hook(uuid, bigint, text) from public, anon;
grant execute on function transform_audit.set_outreach_hook(uuid, bigint, text) to authenticated;

-- Closing a run. A run cannot be called 'completed' while a weighted dimension
-- has no verdict at all: silence on a dimension reads, in a report, as
-- "nothing wrong there". Every weighted dimension must have been scored or
-- explicitly marked unknown; otherwise the run closes 'partially_completed'
-- and the report says which dimensions were never reached.
create or replace function transform_audit.finish_run(p_run uuid, p_error text default null)
returns transform_audit.run_status language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_weights jsonb; v_missing integer; v_status transform_audit.run_status;
begin
  select r.tenant_id, r.weights into v_tenant, v_weights
    from transform_audit.runs r where r.id = p_run;
  if v_tenant is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'transform_audit.audit.create') then
    raise exception 'insufficient privilege to finish an audit'
      using errcode = 'insufficient_privilege';
  end if;

  select pg_catalog.count(*) into v_missing
    from pg_catalog.jsonb_object_keys(v_weights) as k(dim)
   where not exists (select 1 from transform_audit.dimension_scores ds
                      where ds.run_id = p_run and ds.dimension::text = k.dim);

  if p_error is not null then
    v_status := 'failed';
  elsif v_missing > 0 then
    v_status := 'partially_completed';
  else
    v_status := 'completed';
  end if;

  update transform_audit.runs r2
     set status = v_status, finished_at = now(), error = p_error
   where r2.id = p_run;

  perform events.emit('transform_audit.run.finished', v_tenant,
    jsonb_build_object('run', p_run, 'status', v_status, 'unscored_dimensions', v_missing));
  return v_status;
end; $$;
revoke all on function transform_audit.finish_run(uuid, text) from public, anon;
grant execute on function transform_audit.finish_run(uuid, text) to authenticated;

-- ===========================================================================
-- Read paths
-- ===========================================================================

-- Phase 5: the recommended starter bundle for a run, WITH each capability's
-- real shipping status. It does not enable anything and it does not claim
-- anything has shipped -- 0048 seeds every module 'planned', so today this
-- returns "recommended, not yet shipped" for every row, which is the truth.
create or replace function transform_audit.recommended_bundle(p_run uuid)
returns table (
  capability_key extensions.citext,
  capability_name text,
  status barberos.capability_status,
  is_shipped boolean,
  priority transform_audit.priority,
  rank integer
) language sql stable security definer set search_path = '' as $$
  select distinct on (r.capability_key)
         r.capability_key, c.name, c.status, (c.status = 'available'),
         r.priority, r.rank
    from transform_audit.recommendations r
    join barberos.capabilities c on c.key = r.capability_key
    join transform_audit.runs run on run.id = r.run_id
   where r.run_id = p_run
     and r.capability_key is not null
     and (identity.has_permission(run.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin())
   order by r.capability_key, r.priority, r.rank;
$$;
comment on function transform_audit.recommended_bundle(uuid) is
  'The BarberOS bundle an audit points to, each row carrying whether that module has actually shipped. Enables nothing.';
revoke all on function transform_audit.recommended_bundle(uuid) from public, anon;
grant execute on function transform_audit.recommended_bundle(uuid) to authenticated;

-- The report, assembled from what is actually stored. Every number here has a
-- row behind it; there is no branch that fills a gap with a plausible value.
create or replace function transform_audit.report(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_run transform_audit.runs%rowtype; v_result jsonb;
begin
  select * into v_run from transform_audit.runs where id = p_run;
  if v_run.id is null then
    raise exception 'run % not found', p_run using errcode = 'no_data_found';
  end if;
  if not (identity.has_permission(v_run.tenant_id, 'transform_audit.audit.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this audit'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'run_id', v_run.id,
    'status', v_run.status,
    'shop', (select jsonb_build_object('business_name', p.business_name,
                                       'website_url', p.website_url,
                                       'city', p.city)
               from visibility.prospects p where p.id = v_run.prospect_id),
    'weights', v_run.weights,
    -- Coverage, stated rather than implied.
    'coverage', jsonb_build_object('scored', v_run.dimensions_scored,
                                   'possible', v_run.dimensions_possible),
    'composite_score', v_run.composite_score,
    'scorecard', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dimension', ds.dimension, 'score', ds.score,
               'confidence', ds.confidence, 'rubric_version', ds.rubric_version,
               'note', ds.note) order by ds.dimension)
        from transform_audit.dimension_scores ds where ds.run_id = p_run), '[]'::jsonb),
    -- Weighted dimensions with no verdict at all. Named, not omitted.
    'unscored_dimensions', coalesce((
      select jsonb_agg(k.dim order by k.dim)
        from pg_catalog.jsonb_object_keys(v_run.weights) as k(dim)
       where not exists (select 1 from transform_audit.dimension_scores ds
                          where ds.run_id = p_run and ds.dimension::text = k.dim)), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'dimension', f.dimension, 'statement', f.statement,
               'evidence_url', f.evidence_url, 'confidence', f.confidence,
               'severity', f.severity, 'detector', f.detector) order by f.id)
        from transform_audit.findings f where f.run_id = p_run), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'priority', rc.priority, 'rank', rc.rank, 'title', rc.title,
               'detail', rc.detail, 'capability_key', rc.capability_key,
               'addresses_finding_id', rc.addresses_finding_id)
             order by rc.priority, rc.rank, rc.id)
        from transform_audit.recommendations rc where rc.run_id = p_run), '[]'::jsonb),
    'outreach_hook', v_run.outreach_hook
  ) into v_result;
  return v_result;
end; $$;
comment on function transform_audit.report(uuid) is
  'The full audit report as stored data. Reports coverage and unscored dimensions explicitly -- an empty section says so rather than being omitted.';
revoke all on function transform_audit.report(uuid) from public, anon;
grant execute on function transform_audit.report(uuid) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('transform_audit.audit.read',      'Read shop audits, findings and recommendations.', 'tenant'),
  ('transform_audit.audit.create',    'Run an audit and record its findings and scores.', 'tenant'),
  ('transform_audit.campaign.manage', 'Create audit campaigns and set their dimension weighting.', 'tenant'),
  ('transform_audit.shop.manage',     'Import and edit the shops being audited.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','transform_audit.audit.read'),   ('tenant_owner','transform_audit.audit.create'),
  ('tenant_owner','transform_audit.campaign.manage'), ('tenant_owner','transform_audit.shop.manage'),
  ('tenant_admin','transform_audit.audit.read'),   ('tenant_admin','transform_audit.audit.create'),
  ('tenant_admin','transform_audit.campaign.manage'), ('tenant_admin','transform_audit.shop.manage'),
  ('manager','transform_audit.audit.read'),        ('manager','transform_audit.audit.create'),
  ('manager','transform_audit.shop.manage'),
  ('staff','transform_audit.audit.read'),
  ('viewer','transform_audit.audit.read')
on conflict do nothing;
-- Deliberate: a `manager` may run audits and import shops, but not re-weight a
-- campaign. Changing the weighting restates every future report in the campaign.
