-- ===========================================================================
-- v0_commerce_provisioning — Proposal, Selection, Agreement, Billing-Setup,
-- Provisioning Request, Work Order & Software Factory Authorization (CP7)
--
-- The commercial + operational HANDOFF from an approved Business Transformation
-- Blueprint into the HL-BOS Software Factory — WITHOUT executing any live
-- deployment. Two new schemas built on the reusable spine:
--   * sales       — proposals, structured line items, a versioned price model,
--                   customer selections, agreements + acceptances, billing-setup
--                   requests.
--   * provisioning— provisioning requests, versioned entitlement plans, a
--                   configurable workstream catalog, work orders + tasks, and
--                   Software Factory authorization packages with a DETERMINISTIC
--                   readiness engine + audited readiness exceptions.
--
-- Reuses (never duplicates): discovery blueprint/recommendations/service_catalog/
-- module_catalog (CP6), billing.* + entitlements.* (activation NOT called),
-- platform.provision_tenant (NOT called), workflows approvals, events + the CP5
-- shared dispatcher, comms/storage_meta by reference, audit/identity/tenancy.
--
-- Local development only. No remote apply, no deploy, no billing-provider
-- activation, no payment data, no entitlement activation, no tenant creation,
-- no signatures, no customer communication. The provisioning lifecycle stops at
-- 'ready'. Prices are placeholders until CEO-approved; a line item cannot be
-- customer-approved while its price is provisional/missing/pending. No enum
-- value is added to an existing type.
--
-- rollback:
--   -- (destructive; requires approval)
--   DROP SCHEMA IF EXISTS provisioning CASCADE;
--   DROP SCHEMA IF EXISTS sales CASCADE;
--   DELETE FROM events.handlers WHERE subscription_key = 'commerce_worker';
--   DELETE FROM events.subscriptions WHERE key = 'commerce_worker';
-- ===========================================================================

create schema if not exists sales;
comment on schema sales is 'HL-BOS: commercial handoff (proposals, pricing, selection, agreements, billing setup). NOT exposed via PostgREST directly; definer RPCs only.';
revoke all on schema sales from public, anon, authenticated;
grant usage on schema sales to authenticated;
alter default privileges in schema sales revoke all on tables from public;
alter default privileges in schema sales revoke all on functions from public;

create schema if not exists provisioning;
comment on schema provisioning is 'HL-BOS: operational handoff (provisioning requests, entitlement plans, work orders, factory authorization). Authorization packages only — never executes production changes.';
revoke all on schema provisioning from public, anon, authenticated;
grant usage on schema provisioning to authenticated;
alter default privileges in schema provisioning revoke all on tables from public;
alter default privileges in schema provisioning revoke all on functions from public;

-- ===========================================================================
-- Enums
-- ===========================================================================
do $$ begin create type sales.proposal_status as enum
  ('draft','pricing_review','internal_review','changes_requested','approved_for_customer',
   'ready_for_customer','customer_reviewing','customer_changes_requested','customer_accepted',
   'customer_declined','expired','superseded','billing_setup_pending','provisioning_pending',
   'converted','cancelled','archived'); exception when duplicate_object then null; end $$;

do $$ begin create type sales.line_item_type as enum ('service','module','bundle','custom'); exception when duplicate_object then null; end $$;

do $$ begin create type sales.price_kind as enum
  ('setup_fee','monthly','annual','per_location','per_user','per_message','per_appointment',
   'per_vehicle','per_assessment','usage_tier','base_platform','module_addon','managed_service',
   'hosting','support_tier','custom_implementation','discount','promo','trial','minimum_commitment',
   'override','customer_specific'); exception when duplicate_object then null; end $$;

do $$ begin create type sales.price_visibility as enum ('public','internal','provisional','customer_specific'); exception when duplicate_object then null; end $$;
do $$ begin create type sales.approval_state as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;

do $$ begin create type sales.agreement_type as enum
  ('msa','sow','subscription','dpa','aup','service_terms','implementation_authorization','change_order');
  exception when duplicate_object then null; end $$;
do $$ begin create type sales.attorney_status as enum ('unreviewed','in_review','approved'); exception when duplicate_object then null; end $$;
do $$ begin create type sales.acceptance_method as enum ('click','esign_placeholder','manual'); exception when duplicate_object then null; end $$;
do $$ begin create type sales.billing_setup_status as enum ('draft','pending_approval','approved','rejected','activated'); exception when duplicate_object then null; end $$;

do $$ begin create type provisioning.request_status as enum
  ('draft','validating','awaiting_approval','approved','blocked','ready','queued','in_progress',
   'partially_completed','completed','failed','cancelled','rolled_back'); exception when duplicate_object then null; end $$;
do $$ begin create type provisioning.readiness as enum ('ready','not_ready','blocked'); exception when duplicate_object then null; end $$;
do $$ begin create type provisioning.work_order_status as enum ('draft','ready','in_progress','blocked','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type provisioning.task_status as enum ('pending','in_progress','blocked','done','cancelled'); exception when duplicate_object then null; end $$;

-- ===========================================================================
-- sales.prices — versioned pricing model linked to the CP6 catalogs
-- ===========================================================================
create table if not exists sales.prices (
  id               bigint generated always as identity primary key,
  service_key      extensions.citext references discovery.service_catalog(key) on delete cascade,
  module_key       extensions.citext references discovery.module_catalog(key) on delete cascade,
  price_kind       sales.price_kind not null,
  currency         text not null default 'USD',
  amount_cents     integer,                                  -- NULL = provisional / not yet priced
  recurring_interval text,                                   -- month | year | null (one-time)
  visibility       sales.price_visibility not null default 'provisional',
  approval_status  sales.approval_state not null default 'pending',
  approved_by      uuid references auth.users(id) on delete set null,
  approved_at      timestamptz,
  price_version    text not null default 'price-0.1.0',
  effective_from   timestamptz not null default now(),
  effective_to     timestamptz,
  source           text,                                     -- ceo | placeholder | customer
  tenant_id        uuid references platform.tenants(id) on delete cascade,  -- set for customer_specific
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint prices_amount_nonneg check (amount_cents is null or amount_cents >= 0),
  constraint prices_currency check (currency ~ '^[A-Z]{3}$')
);
create index if not exists prices_service_idx on sales.prices (service_key);
create index if not exists prices_module_idx on sales.prices (module_key);

-- A price is "sellable" (usable on a customer-approvable line) only when it is
-- approved, has a concrete amount, is not provisional, and is not expired.
create or replace function sales.price_is_sellable(p_price bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from sales.prices p
    where p.id = p_price
      and p.approval_status = 'approved'
      and p.amount_cents is not null
      and p.visibility <> 'provisional'
      and (p.effective_to is null or p.effective_to > now()));
$$;
revoke all on function sales.price_is_sellable(bigint) from public, anon;
grant execute on function sales.price_is_sellable(bigint) to authenticated;

-- ===========================================================================
-- sales.proposals — versioned; a reviewed/customer-viewed version is preserved
-- ===========================================================================
create table if not exists sales.proposals (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  profile_id       uuid references discovery.profiles(id) on delete set null,
  blueprint_id     uuid not null references discovery.blueprints(id) on delete restrict,
  blueprint_version integer,
  version          integer not null default 1,
  status           sales.proposal_status not null default 'draft',
  currency         text not null default 'USD',
  valid_through    date,
  prepared_by      uuid references auth.users(id) on delete set null,
  reviewed_by      uuid references auth.users(id) on delete set null,
  customer_org     text,
  prospect_id      uuid,
  customer_contact jsonb not null default '{}'::jsonb,
  executive_summary text,
  content          jsonb not null default '{}'::jsonb,       -- objectives/assumptions/responsibilities/dependencies/risks/timeline/payment_terms
  internal_approval_status sales.approval_state not null default 'pending',
  customer_selection_status text not null default 'none',    -- none | in_progress | finalized
  agreement_status text not null default 'none',             -- none | partial | complete
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  superseded_by    uuid references sales.proposals(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint proposals_currency check (currency ~ '^[A-Z]{3}$'),
  constraint proposals_version_unique unique (blueprint_id, version)
);
create index if not exists proposals_tenant_idx on sales.proposals (tenant_id, status);

create table if not exists sales.proposal_line_items (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references platform.tenants(id) on delete cascade,
  proposal_id       uuid not null references sales.proposals(id) on delete cascade,
  recommendation_id bigint references discovery.recommendations(id) on delete set null,
  item_type         sales.line_item_type not null default 'service',
  service_key       extensions.citext references discovery.service_catalog(key) on delete set null,
  module_key        extensions.citext references discovery.module_catalog(key) on delete set null,
  description       text not null default '',
  quantity          numeric(12,2) not null default 1,
  unit              text,
  price_id          bigint references sales.prices(id) on delete set null,
  one_time_cents    integer,
  recurring_cents   integer,
  recurring_interval text,
  usage_pricing_ref text,
  setup_fee_cents   integer,
  discount_cents    integer,
  credit_cents      integer,
  est_effort        discovery.effort_band,
  est_duration      text,
  dependencies      jsonb not null default '[]'::jsonb,
  is_optional       boolean not null default false,
  is_selected       boolean not null default true,
  customer_visible  boolean not null default true,
  price_source      text,
  price_version     text,
  pricing_approval_status sales.approval_state not null default 'pending',
  availability_status extensions.citext,
  requires_human_review boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists line_items_proposal_idx on sales.proposal_line_items (proposal_id);

create table if not exists sales.customer_selections (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  proposal_id      uuid not null references sales.proposals(id) on delete cascade,
  proposal_version integer not null,
  accepted_whole   boolean not null default false,
  selections       jsonb not null default '[]'::jsonb,       -- [{line_item_id, decision, phase, interval, tier, notes}]
  business_info_confirmed boolean not null default false,
  primary_contact  jsonb,
  billing_contact  jsonb,
  implementation_contact jsonb,
  authorized_signer jsonb,
  acknowledged_dependencies boolean not null default false,
  acknowledged_responsibilities boolean not null default false,
  acknowledged_assumptions boolean not null default false,
  finalized        boolean not null default false,
  snapshot         jsonb not null default '{}'::jsonb,       -- exact proposal version reviewed
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists selections_proposal_idx on sales.customer_selections (proposal_id);

create table if not exists sales.agreements (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  agreement_type   sales.agreement_type not null,
  version          text not null,
  title            text not null,
  body_ref         uuid references storage_meta.files(id) on delete set null,
  attorney_review_status sales.attorney_status not null default 'unreviewed',
  is_placeholder   boolean not null default true,
  is_required      boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint agreements_unique unique (agreement_type, version)
);

create table if not exists sales.agreement_acceptances (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  proposal_id      uuid not null references sales.proposals(id) on delete cascade,
  agreement_id     uuid not null references sales.agreements(id) on delete restrict,
  agreement_type   sales.agreement_type not null,
  agreement_version text not null,
  proposal_version integer not null,
  signer_name      text not null,
  signer_role      text,
  accepted_at      timestamptz not null default now(),
  acceptance_method sales.acceptance_method not null default 'click',
  ip               inet,
  device           text,
  artifact_ref     uuid references storage_meta.files(id) on delete set null,
  accepted_by      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists acceptances_proposal_idx on sales.agreement_acceptances (proposal_id);

create table if not exists sales.billing_setup_requests (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  proposal_id      uuid not null references sales.proposals(id) on delete cascade,
  currency         text not null default 'USD',
  one_time_cents   integer not null default 0,
  recurring_cents  integer not null default 0,
  billing_interval text,
  trial_terms      text,
  discount_terms   text,
  start_date_instructions text,
  payment_pref     text not null default 'invoice',          -- invoice | auto
  billing_contact  jsonb,
  tax_placeholder  jsonb not null default '{}'::jsonb,
  provider_customer_ref text,                                -- MOCK reference only
  subscription_ref text,                                     -- MOCK reference only
  approval_status  sales.billing_setup_status not null default 'draft',
  activation_status text not null default 'inactive',
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint billing_setup_currency check (currency ~ '^[A-Z]{3}$')
);
create index if not exists billing_setup_proposal_idx on sales.billing_setup_requests (proposal_id);

-- ===========================================================================
-- provisioning tables
-- ===========================================================================
create table if not exists provisioning.workstream_catalog (
  key              extensions.citext primary key,
  name             text not null,
  default_sequence integer not null,
  is_active        boolean not null default true,
  version          text not null default 'ws-0.1.0',
  created_at       timestamptz not null default now(),
  constraint workstream_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists provisioning.requests (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  proposal_id      uuid not null references sales.proposals(id) on delete restrict,
  blueprint_id     uuid references discovery.blueprints(id) on delete set null,
  target_tenant    uuid references platform.tenants(id) on delete set null,
  customer_org     text,
  requested_modules jsonb not null default '[]'::jsonb,
  requested_services jsonb not null default '[]'::jsonb,
  subscription_tier text,
  usage_limits     jsonb not null default '{}'::jsonb,
  locations        jsonb not null default '[]'::jsonb,
  users            jsonb not null default '[]'::jsonb,
  roles            jsonb not null default '[]'::jsonb,
  domains          jsonb not null default '[]'::jsonb,
  branding         jsonb not null default '{}'::jsonb,
  comms_config     jsonb not null default '{}'::jsonb,
  storage_requirements jsonb not null default '{}'::jsonb,
  integration_requirements jsonb not null default '[]'::jsonb,
  data_migration   jsonb not null default '{}'::jsonb,
  vertical_os      text,
  environment_target text not null default 'none',           -- none | staging | production (never production here)
  dependencies     jsonb not null default '[]'::jsonb,
  required_secrets jsonb not null default '[]'::jsonb,
  required_credentials jsonb not null default '[]'::jsonb,
  required_human_actions jsonb not null default '[]'::jsonb,
  implementation_notes text,
  requested_launch_date date,
  status           provisioning.request_status not null default 'draft',
  approval_status  sales.approval_state not null default 'pending',
  execution_status text not null default 'inert',
  failure_details  text,
  rollback_status  text not null default 'none',
  workflow_instance_id uuid references workflows.instances(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint requests_env_not_production check (environment_target <> 'production')
);
create index if not exists requests_proposal_idx on provisioning.requests (proposal_id);

create table if not exists provisioning.entitlement_plan (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  request_id       uuid not null references provisioning.requests(id) on delete cascade,
  line_item_id     bigint references sales.proposal_line_items(id) on delete set null,
  module_key       extensions.citext references discovery.module_catalog(key) on delete set null,
  entitlement_key  extensions.citext not null,
  enabled          boolean not null default false,
  usage_limit      integer,
  effective_from   timestamptz,
  expires_at       timestamptz,
  trial            boolean not null default false,
  dependency_status text not null default 'pending',
  approval_status  sales.approval_state not null default 'pending',
  provisioning_status text not null default 'planned',
  plan_version     text not null default 'entplan-0.1.0',
  created_at       timestamptz not null default now()
);
create index if not exists entplan_request_idx on provisioning.entitlement_plan (request_id);

create table if not exists provisioning.work_orders (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  proposal_id      uuid references sales.proposals(id) on delete set null,
  blueprint_id     uuid references discovery.blueprints(id) on delete set null,
  request_id       uuid references provisioning.requests(id) on delete cascade,
  work_order_number text not null,
  status           provisioning.work_order_status not null default 'draft',
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint work_orders_number_unique unique (work_order_number)
);

create table if not exists provisioning.work_order_tasks (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  work_order_id    uuid not null references provisioning.work_orders(id) on delete cascade,
  workstream_key   extensions.citext not null references provisioning.workstream_catalog(key) on delete restrict,
  phase_key        extensions.citext,
  sequence         integer not null,
  task             text not null,
  owner_role       extensions.citext,                         -- herman_legacy | customer | shared
  depends_on       jsonb not null default '[]'::jsonb,
  priority         integer not null default 3,
  status           provisioning.task_status not null default 'pending',
  est_effort       discovery.effort_band,
  target_date      date,
  customer_responsibility text,
  hl_responsibility text,
  required_credential text,
  required_content text,
  required_approval text,
  blocker          text,
  completion_evidence jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  constraint work_order_tasks_seq_unique unique (work_order_id, sequence)
);
create index if not exists wo_tasks_order_idx on provisioning.work_order_tasks (work_order_id, sequence);

create table if not exists provisioning.factory_authorizations (
  id               uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  request_id       uuid not null references provisioning.requests(id) on delete cascade,
  proposal_id      uuid references sales.proposals(id) on delete set null,
  work_order_id    uuid references provisioning.work_orders(id) on delete set null,
  package          jsonb not null default '{}'::jsonb,
  readiness        provisioning.readiness not null default 'not_ready',
  blocking_reasons jsonb not null default '[]'::jsonb,
  risk_flags       jsonb not null default '[]'::jsonb,
  rollback_requirements jsonb not null default '[]'::jsonb,
  launch_criteria  jsonb not null default '[]'::jsonb,
  evaluated_at     timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint factory_auth_request_unique unique (request_id)
);

create table if not exists provisioning.readiness_exceptions (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  authorization_id uuid not null references provisioning.factory_authorizations(id) on delete cascade,
  rule_key         text not null,
  reason           text not null,
  approver         uuid references auth.users(id) on delete set null,
  scope            text,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists readiness_exc_auth_idx on provisioning.readiness_exceptions (authorization_id);

-- ===========================================================================
-- triggers: updated_at + audit
-- ===========================================================================
create or replace trigger prices_set_updated_at before update on sales.prices for each row execute function platform.set_updated_at();
create or replace trigger proposals_set_updated_at before update on sales.proposals for each row execute function platform.set_updated_at();
create or replace trigger billing_setup_set_updated_at before update on sales.billing_setup_requests for each row execute function platform.set_updated_at();
create or replace trigger requests_set_updated_at before update on provisioning.requests for each row execute function platform.set_updated_at();
create or replace trigger work_orders_set_updated_at before update on provisioning.work_orders for each row execute function platform.set_updated_at();
create or replace trigger factory_auth_set_updated_at before update on provisioning.factory_authorizations for each row execute function platform.set_updated_at();

create or replace trigger proposals_audit after insert or update or delete on sales.proposals for each row execute function audit.emit();
create or replace trigger line_items_audit after insert or update or delete on sales.proposal_line_items for each row execute function audit.emit();
create or replace trigger selections_audit after insert or update or delete on sales.customer_selections for each row execute function audit.emit();
create or replace trigger acceptances_audit after insert or update or delete on sales.agreement_acceptances for each row execute function audit.emit();
create or replace trigger billing_setup_audit after insert or update or delete on sales.billing_setup_requests for each row execute function audit.emit();
create or replace trigger requests_audit after insert or update or delete on provisioning.requests for each row execute function audit.emit();
create or replace trigger work_orders_audit after insert or update or delete on provisioning.work_orders for each row execute function audit.emit();
create or replace trigger factory_auth_audit after insert or update or delete on provisioning.factory_authorizations for each row execute function audit.emit();
create or replace trigger readiness_exc_audit after insert or update or delete on provisioning.readiness_exceptions for each row execute function audit.emit();

-- ===========================================================================
-- RLS + FORCE + policies + grants
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select 'sales' as s, unnest(array['prices','proposals','proposal_line_items','customer_selections','agreements','agreement_acceptances','billing_setup_requests']) as t
    union all
    select 'provisioning', unnest(array['workstream_catalog','requests','entitlement_plan','work_orders','work_order_tasks','factory_authorizations','readiness_exceptions'])
  loop
    execute format('alter table %I.%I enable row level security', r.s, r.t);
    execute format('alter table %I.%I force row level security', r.s, r.t);
  end loop;
end $$;

-- prices, agreements, workstream_catalog: configuration readable by authenticated
drop policy if exists prices_select on sales.prices;
create policy prices_select on sales.prices for select to authenticated
  using (visibility <> 'internal' or identity.has_permission(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), 'sales.pricing.manage') or tenant_id is null);
drop policy if exists agreements_select on sales.agreements;
create policy agreements_select on sales.agreements for select to authenticated using (true);
drop policy if exists workstream_select on provisioning.workstream_catalog;
create policy workstream_select on provisioning.workstream_catalog for select to authenticated using (true);

-- tenant-scoped rows: read by the matching sales/provisioning read permission
drop policy if exists proposals_select on sales.proposals;
create policy proposals_select on sales.proposals for select to authenticated using (identity.has_permission(tenant_id, 'sales.proposal.read'));
drop policy if exists line_items_select on sales.proposal_line_items;
create policy line_items_select on sales.proposal_line_items for select to authenticated using (identity.has_permission(tenant_id, 'sales.proposal.read'));
drop policy if exists selections_select on sales.customer_selections;
create policy selections_select on sales.customer_selections for select to authenticated using (identity.has_permission(tenant_id, 'sales.proposal.read'));
drop policy if exists acceptances_select on sales.agreement_acceptances;
create policy acceptances_select on sales.agreement_acceptances for select to authenticated using (identity.has_permission(tenant_id, 'sales.proposal.read'));
drop policy if exists billing_setup_select on sales.billing_setup_requests;
create policy billing_setup_select on sales.billing_setup_requests for select to authenticated using (identity.has_permission(tenant_id, 'sales.proposal.read'));
drop policy if exists requests_select on provisioning.requests;
create policy requests_select on provisioning.requests for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));
drop policy if exists entplan_select on provisioning.entitlement_plan;
create policy entplan_select on provisioning.entitlement_plan for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));
drop policy if exists work_orders_select on provisioning.work_orders;
create policy work_orders_select on provisioning.work_orders for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));
drop policy if exists wo_tasks_select on provisioning.work_order_tasks;
create policy wo_tasks_select on provisioning.work_order_tasks for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));
drop policy if exists factory_auth_select on provisioning.factory_authorizations;
create policy factory_auth_select on provisioning.factory_authorizations for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));
drop policy if exists readiness_exc_select on provisioning.readiness_exceptions;
create policy readiness_exc_select on provisioning.readiness_exceptions for select to authenticated using (identity.has_permission(tenant_id, 'provisioning.request.read'));

grant select on sales.prices, sales.proposals, sales.proposal_line_items, sales.customer_selections,
                sales.agreements, sales.agreement_acceptances, sales.billing_setup_requests to authenticated;
grant select on provisioning.workstream_catalog, provisioning.requests, provisioning.entitlement_plan,
                provisioning.work_orders, provisioning.work_order_tasks, provisioning.factory_authorizations,
                provisioning.readiness_exceptions to authenticated;

-- ===========================================================================
-- Permissions
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('sales.proposal.read',   'Read proposals, line items, selections, agreements, billing setup.', 'tenant'),
  ('sales.proposal.create', 'Create and populate proposals and customer selections.', 'tenant'),
  ('sales.proposal.manage', 'Approve, advance, accept, and version proposals; approve billing setup.', 'tenant'),
  ('sales.pricing.manage',  'Set and approve prices.', 'tenant'),
  ('provisioning.request.read',   'Read provisioning requests, entitlement plans, work orders, authorizations.', 'tenant'),
  ('provisioning.request.create', 'Create provisioning requests, entitlement plans, and work orders.', 'tenant'),
  ('provisioning.request.manage', 'Approve provisioning, build factory authorization, grant readiness exceptions.', 'tenant'),
  ('provisioning.catalog.manage', 'Manage the workstream and agreement catalogs (platform).', 'platform')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','sales.proposal.read'),('tenant_owner','sales.proposal.create'),('tenant_owner','sales.proposal.manage'),('tenant_owner','sales.pricing.manage'),
  ('tenant_owner','provisioning.request.read'),('tenant_owner','provisioning.request.create'),('tenant_owner','provisioning.request.manage'),
  ('tenant_admin','sales.proposal.read'),('tenant_admin','sales.proposal.create'),('tenant_admin','sales.proposal.manage'),('tenant_admin','sales.pricing.manage'),
  ('tenant_admin','provisioning.request.read'),('tenant_admin','provisioning.request.create'),('tenant_admin','provisioning.request.manage'),
  ('manager','sales.proposal.read'),('manager','sales.proposal.create'),('manager','provisioning.request.read'),('manager','provisioning.request.create'),
  ('staff','sales.proposal.read'),('staff','provisioning.request.read'),
  ('viewer','sales.proposal.read'),('viewer','provisioning.request.read'),
  ('platform_owner','provisioning.catalog.manage'),
  ('platform_admin','provisioning.catalog.manage')
on conflict do nothing;

-- ===========================================================================
-- Internal guard: proposal is writable + caller holds create for its tenant
-- ===========================================================================
create or replace function sales._proposal_writable(p_proposal uuid, out o_tenant uuid, out o_blueprint uuid, out o_version integer)
language plpgsql volatile security definer set search_path = '' as $$
declare v_status sales.proposal_status;
begin
  select tenant_id, blueprint_id, version, status into o_tenant, o_blueprint, o_version, v_status
    from sales.proposals where id = p_proposal;
  if o_tenant is null then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(o_tenant, 'sales.proposal.create') then
    raise exception 'insufficient privilege to modify a proposal' using errcode = 'insufficient_privilege';
  end if;
  if v_status in ('superseded','cancelled','archived','customer_declined','expired') then
    raise exception 'proposal % is not writable (%).', p_proposal, v_status using errcode = 'invalid_parameter_value';
  end if;
end; $$;
revoke all on function sales._proposal_writable(uuid) from public, anon, authenticated;

-- ===========================================================================
-- Pricing RPCs
-- ===========================================================================
create or replace function sales.set_price(
  p_kind sales.price_kind, p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint; v_tenant uuid;
begin
  if not identity.has_platform_permission('provisioning.catalog.manage')
     and not (p_attrs ? 'tenant_id' and identity.has_permission((p_attrs->>'tenant_id')::uuid, 'sales.pricing.manage')) then
    raise exception 'insufficient privilege to set a price' using errcode = 'insufficient_privilege';
  end if;
  v_tenant := nullif(p_attrs->>'tenant_id','')::uuid;
  insert into sales.prices (service_key, module_key, price_kind, currency, amount_cents, recurring_interval,
     visibility, price_version, effective_from, effective_to, source, tenant_id, notes)
  values (nullif(p_attrs->>'service_key','')::extensions.citext, nullif(p_attrs->>'module_key','')::extensions.citext, p_kind,
     coalesce(p_attrs->>'currency','USD'), nullif(p_attrs->>'amount_cents','')::integer, p_attrs->>'recurring_interval',
     coalesce((p_attrs->>'visibility')::sales.price_visibility,'provisional'), coalesce(p_attrs->>'price_version','price-0.1.0'),
     coalesce((p_attrs->>'effective_from')::timestamptz, now()), (p_attrs->>'effective_to')::timestamptz,
     coalesce(p_attrs->>'source','placeholder'), v_tenant, p_attrs->>'notes')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function sales.set_price(sales.price_kind, jsonb) from public, anon;
grant execute on function sales.set_price(sales.price_kind, jsonb) to authenticated;

-- Approving a price is a human decision (never AI): requires sales.pricing.manage.
create or replace function sales.approve_price(p_price bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_amount integer;
begin
  select coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), amount_cents into v_tenant, v_amount
    from sales.prices where id = p_price;
  if not found then raise exception 'price % not found', p_price using errcode = 'no_data_found'; end if;
  -- platform pricing manager OR tenant pricing manager for customer-specific prices
  if not (identity.is_platform_admin() or identity.has_permission(v_tenant, 'sales.pricing.manage')) then
    raise exception 'insufficient privilege to approve a price' using errcode = 'insufficient_privilege';
  end if;
  if v_amount is null then
    raise exception 'cannot approve a price with no amount (still provisional)' using errcode = 'invalid_parameter_value';
  end if;
  update sales.prices set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(),
     visibility = case when visibility = 'provisional' then 'public' else visibility end
   where id = p_price;
end; $$;
revoke all on function sales.approve_price(bigint) from public, anon;
grant execute on function sales.approve_price(bigint) to authenticated;

-- ===========================================================================
-- Proposal lifecycle RPCs
-- ===========================================================================
-- Request a proposal for an APPROVED blueprint. Versioned; prior preserved.
create or replace function sales.request_proposal(p_blueprint uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_life discovery.blueprint_status; v_bpver integer; v_ver integer; v_id uuid;
begin
  select tenant_id, profile_id, lifecycle, version into v_tenant, v_profile, v_life, v_bpver
    from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.create') then
    raise exception 'insufficient privilege to request a proposal' using errcode = 'insufficient_privilege';
  end if;
  if v_life not in ('approved','ready_for_proposal') then
    raise exception 'a proposal requires an approved blueprint (is %)', v_life using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(max(version),0)+1 into v_ver from sales.proposals where blueprint_id = p_blueprint;
  insert into sales.proposals (tenant_id, profile_id, blueprint_id, blueprint_version, version, status, prepared_by, created_by)
  values (v_tenant, v_profile, p_blueprint, v_bpver, v_ver, 'draft', auth.uid(), auth.uid())
  returning id into v_id;
  perform events.emit('proposal.requested', v_tenant, jsonb_build_object('proposal', v_id, 'blueprint', p_blueprint, 'version', v_ver));
  perform events.emit('proposal.created', v_tenant, jsonb_build_object('proposal', v_id));
  return v_id;
end; $$;
revoke all on function sales.request_proposal(uuid) from public, anon;
grant execute on function sales.request_proposal(uuid) to authenticated;

-- Add a structured line item; traceable to a recommendation + service/module.
-- Inactive services/modules are excluded.
create or replace function sales.add_line_item(p_proposal uuid, p_attrs jsonb default '{}'::jsonb)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_bp uuid; v_ver integer; v_id bigint;
        v_service extensions.citext; v_module extensions.citext; v_avail discovery.availability_status;
        v_price bigint; v_pstatus sales.approval_state := 'pending'; v_avail_txt extensions.citext;
begin
  select o_tenant, o_blueprint, o_version into v_tenant, v_bp, v_ver from sales._proposal_writable(p_proposal);
  v_service := nullif(p_attrs->>'service_key','')::extensions.citext;
  v_module  := nullif(p_attrs->>'module_key','')::extensions.citext;
  v_price   := nullif(p_attrs->>'price_id','')::bigint;
  if v_service is not null then
    select availability into v_avail from discovery.service_catalog where key = v_service;
    if not found then raise exception 'unknown service %', v_service using errcode = 'foreign_key_violation'; end if;
    if v_avail in ('unavailable','deprecated') then
      raise exception 'service % is not available', v_service using errcode = 'invalid_parameter_value'; end if;
    v_avail_txt := v_avail::text::extensions.citext;
  end if;
  if v_module is not null then
    select availability into v_avail from discovery.module_catalog where key = v_module;
    if not found then raise exception 'unknown module %', v_module using errcode = 'foreign_key_violation'; end if;
    if v_avail in ('unavailable','deprecated') then
      raise exception 'module % is not available', v_module using errcode = 'invalid_parameter_value'; end if;
    v_avail_txt := v_avail::text::extensions.citext;
  end if;
  if v_price is not null and sales.price_is_sellable(v_price) then v_pstatus := 'approved'; end if;

  insert into sales.proposal_line_items (tenant_id, proposal_id, recommendation_id, item_type, service_key, module_key,
     description, quantity, unit, price_id, one_time_cents, recurring_cents, recurring_interval, usage_pricing_ref,
     setup_fee_cents, discount_cents, credit_cents, est_effort, est_duration, dependencies, is_optional, is_selected,
     customer_visible, price_source, price_version, pricing_approval_status, availability_status, requires_human_review, notes)
  values (v_tenant, p_proposal, nullif(p_attrs->>'recommendation_id','')::bigint,
     coalesce((p_attrs->>'item_type')::sales.line_item_type, (case when v_module is not null then 'module' else 'service' end)::sales.line_item_type),
     v_service, v_module, coalesce(p_attrs->>'description',''), coalesce((p_attrs->>'quantity')::numeric,1), p_attrs->>'unit',
     v_price, nullif(p_attrs->>'one_time_cents','')::integer, nullif(p_attrs->>'recurring_cents','')::integer, p_attrs->>'recurring_interval',
     p_attrs->>'usage_pricing_ref', nullif(p_attrs->>'setup_fee_cents','')::integer, nullif(p_attrs->>'discount_cents','')::integer,
     nullif(p_attrs->>'credit_cents','')::integer, (p_attrs->>'est_effort')::discovery.effort_band, p_attrs->>'est_duration',
     coalesce(p_attrs->'dependencies','[]'::jsonb), coalesce((p_attrs->>'is_optional')::boolean,false),
     coalesce((p_attrs->>'is_selected')::boolean,true), coalesce((p_attrs->>'customer_visible')::boolean,true),
     p_attrs->>'price_source', p_attrs->>'price_version', v_pstatus, v_avail_txt,
     coalesce((p_attrs->>'requires_human_review')::boolean,false), p_attrs->>'notes')
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function sales.add_line_item(uuid, jsonb) from public, anon;
grant execute on function sales.add_line_item(uuid, jsonb) to authenticated;

create or replace function sales.request_pricing_review(p_proposal uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_bp uuid; v_ver integer;
begin
  select o_tenant into v_tenant from sales._proposal_writable(p_proposal);
  update sales.proposals set status = 'pricing_review' where id = p_proposal;
  perform events.emit('proposal.pricing_review_requested', v_tenant, jsonb_build_object('proposal', p_proposal));
end; $$;
revoke all on function sales.request_pricing_review(uuid) from public, anon;
grant execute on function sales.request_pricing_review(uuid) to authenticated;

create or replace function sales.submit_proposal_internal_review(p_proposal uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_bp uuid; v_ver integer; v_instance uuid;
begin
  select o_tenant into v_tenant from sales._proposal_writable(p_proposal);
  v_instance := workflows.request_approval(v_tenant, 'sales.proposal.review', 'sales.proposal', p_proposal::text, 'tenant_admin');
  update sales.proposals set status = 'internal_review', workflow_instance_id = v_instance where id = p_proposal;
  return v_instance;
end; $$;
revoke all on function sales.submit_proposal_internal_review(uuid) from public, anon;
grant execute on function sales.submit_proposal_internal_review(uuid) to authenticated;

-- Internal approval: requires manage + an approved workflow instance. AI cannot.
create or replace function sales.approve_proposal_internal(p_proposal uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, workflow_instance_id into v_tenant, v_instance from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege to approve a proposal' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'proposal cannot be internally approved without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  update sales.proposals set status = 'approved_for_customer', internal_approval_status = 'approved', reviewed_by = auth.uid()
   where id = p_proposal;
  perform events.emit('proposal.internally_approved', v_tenant, jsonb_build_object('proposal', p_proposal));
end; $$;
revoke all on function sales.approve_proposal_internal(uuid) from public, anon;
grant execute on function sales.approve_proposal_internal(uuid) to authenticated;

-- Ready-for-customer: blocked unless internally approved AND every customer-visible
-- line item has a SELLABLE (approved, concrete, non-expired) price.
create or replace function sales.mark_ready_for_customer(p_proposal uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_internal sales.approval_state; v_bad integer;
begin
  select tenant_id, internal_approval_status into v_tenant, v_internal from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_internal <> 'approved' then
    raise exception 'proposal must be internally approved before customer delivery' using errcode = 'invalid_parameter_value';
  end if;
  select count(*) into v_bad from sales.proposal_line_items li
   where li.proposal_id = p_proposal and li.customer_visible
     and (li.price_id is null or not sales.price_is_sellable(li.price_id));
  if v_bad > 0 then
    raise exception 'proposal has % customer-visible line item(s) with a provisional/missing/pending price', v_bad using errcode = 'invalid_parameter_value';
  end if;
  update sales.proposals set status = 'ready_for_customer' where id = p_proposal;
  perform events.emit('proposal.ready_for_customer', v_tenant, jsonb_build_object('proposal', p_proposal));
end; $$;
revoke all on function sales.mark_ready_for_customer(uuid) from public, anon;
grant execute on function sales.mark_ready_for_customer(uuid) to authenticated;

create or replace function sales.record_customer_view(p_proposal uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select o_tenant into v_tenant from sales._proposal_writable(p_proposal);
  update sales.proposals set status = 'customer_reviewing' where id = p_proposal and status = 'ready_for_customer';
  perform events.emit('proposal.customer_viewed', v_tenant, jsonb_build_object('proposal', p_proposal));
end; $$;
revoke all on function sales.record_customer_view(uuid) from public, anon;
grant execute on function sales.record_customer_view(uuid) to authenticated;

-- Record a customer selection snapshot, tied to the exact proposal version. A
-- superseded proposal cannot be selected against.
create or replace function sales.submit_customer_selection(p_proposal uuid, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_ver integer; v_status sales.proposal_status; v_id uuid; v_final boolean;
begin
  select tenant_id, version, status into v_tenant, v_ver, v_status from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_status in ('superseded','expired','cancelled','archived') then
    raise exception 'cannot select against a % proposal', v_status using errcode = 'invalid_parameter_value';
  end if;
  v_final := coalesce((p_attrs->>'finalized')::boolean,false);
  insert into sales.customer_selections (tenant_id, proposal_id, proposal_version, accepted_whole, selections,
     business_info_confirmed, primary_contact, billing_contact, implementation_contact, authorized_signer,
     acknowledged_dependencies, acknowledged_responsibilities, acknowledged_assumptions, finalized, snapshot, created_by)
  values (v_tenant, p_proposal, v_ver, coalesce((p_attrs->>'accepted_whole')::boolean,false),
     coalesce(p_attrs->'selections','[]'::jsonb), coalesce((p_attrs->>'business_info_confirmed')::boolean,false),
     p_attrs->'primary_contact', p_attrs->'billing_contact', p_attrs->'implementation_contact', p_attrs->'authorized_signer',
     coalesce((p_attrs->>'acknowledged_dependencies')::boolean,false), coalesce((p_attrs->>'acknowledged_responsibilities')::boolean,false),
     coalesce((p_attrs->>'acknowledged_assumptions')::boolean,false), v_final,
     jsonb_build_object('proposal', p_proposal, 'version', v_ver), auth.uid())
  returning id into v_id;
  update sales.proposals set customer_selection_status = case when v_final then 'finalized' else 'in_progress' end
   where id = p_proposal;
  return v_id;
end; $$;
revoke all on function sales.submit_customer_selection(uuid, jsonb) from public, anon;
grant execute on function sales.submit_customer_selection(uuid, jsonb) to authenticated;

create or replace function sales.customer_request_changes(p_proposal uuid, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select o_tenant into v_tenant from sales._proposal_writable(p_proposal);
  update sales.proposals set status = 'customer_changes_requested' where id = p_proposal;
  perform events.emit('proposal.customer_changes_requested', v_tenant, jsonb_build_object('proposal', p_proposal, 'note', p_note));
end; $$;
revoke all on function sales.customer_request_changes(uuid, text) from public, anon;
grant execute on function sales.customer_request_changes(uuid, text) to authenticated;

-- Register an agreement template (platform). Legal templates are placeholders
-- flagged for attorney review; they are NOT legally sufficient.
create or replace function sales.register_agreement(p_type sales.agreement_type, p_version text, p_title text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_platform_permission('provisioning.catalog.manage') then
    raise exception 'only a platform administrator may register an agreement template' using errcode = 'insufficient_privilege';
  end if;
  insert into sales.agreements (agreement_type, version, title, attorney_review_status, is_placeholder, is_required)
  values (p_type, p_version, p_title, coalesce((p_attrs->>'attorney_review_status')::sales.attorney_status,'unreviewed'),
     coalesce((p_attrs->>'is_placeholder')::boolean,true), coalesce((p_attrs->>'is_required')::boolean,true))
  on conflict (agreement_type, version) do update set title = excluded.title,
     attorney_review_status = excluded.attorney_review_status, is_required = excluded.is_required
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function sales.register_agreement(sales.agreement_type, text, text, jsonb) from public, anon, authenticated;
grant execute on function sales.register_agreement(sales.agreement_type, text, text, jsonb) to authenticated;

-- Accept an agreement. A human action (requires sales.proposal.manage); an AI
-- run has no auth.uid() with that permission, so AI can never accept.
create or replace function sales.accept_agreement(p_proposal uuid, p_agreement uuid, p_signer_name text, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_pver integer; v_type sales.agreement_type; v_ver text; v_id uuid; v_reqcnt integer; v_acccnt integer;
begin
  select tenant_id, version into v_tenant, v_pver from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege to accept an agreement' using errcode = 'insufficient_privilege';
  end if;
  select agreement_type, version into v_type, v_ver from sales.agreements where id = p_agreement;
  if not found then raise exception 'agreement % not found', p_agreement using errcode = 'no_data_found'; end if;
  insert into sales.agreement_acceptances (tenant_id, proposal_id, agreement_id, agreement_type, agreement_version,
     proposal_version, signer_name, signer_role, acceptance_method, artifact_ref, accepted_by)
  values (v_tenant, p_proposal, p_agreement, v_type, v_ver, v_pver, p_signer_name, p_attrs->>'signer_role',
     coalesce((p_attrs->>'acceptance_method')::sales.acceptance_method,'click'), nullif(p_attrs->>'artifact_ref','')::uuid, auth.uid())
  returning id into v_id;
  -- update agreement_status: complete when every required agreement has an acceptance for this version
  select count(*) into v_reqcnt from sales.agreements where is_required;
  select count(distinct agreement_id) into v_acccnt from sales.agreement_acceptances aa
    join sales.agreements a on a.id = aa.agreement_id
    where aa.proposal_id = p_proposal and a.is_required;
  update sales.proposals set agreement_status = case when v_acccnt >= v_reqcnt then 'complete' else 'partial' end
   where id = p_proposal;
  perform events.emit('agreement.accepted', v_tenant, jsonb_build_object('proposal', p_proposal, 'agreement', p_agreement, 'type', v_type));
  return v_id;
end; $$;
revoke all on function sales.accept_agreement(uuid, uuid, text, jsonb) from public, anon;
grant execute on function sales.accept_agreement(uuid, uuid, text, jsonb) to authenticated;

-- Customer acceptance. Requires all required agreements complete + selections
-- finalized. Does NOT trigger provisioning.
create or replace function sales.customer_accept(p_proposal uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status sales.proposal_status; v_agree text; v_sel text;
begin
  select tenant_id, status, agreement_status, customer_selection_status
    into v_tenant, v_status, v_agree, v_sel from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('ready_for_customer','customer_reviewing','customer_changes_requested') then
    raise exception 'proposal is not in a customer-acceptable state (%).', v_status using errcode = 'invalid_parameter_value';
  end if;
  if v_agree <> 'complete' then
    raise exception 'all required agreements must be accepted first' using errcode = 'invalid_parameter_value';
  end if;
  if v_sel <> 'finalized' then
    raise exception 'customer selections must be finalized first' using errcode = 'invalid_parameter_value';
  end if;
  update sales.proposals set status = 'customer_accepted' where id = p_proposal;
  perform events.emit('proposal.customer_accepted', v_tenant, jsonb_build_object('proposal', p_proposal));
end; $$;
revoke all on function sales.customer_accept(uuid) from public, anon;
grant execute on function sales.customer_accept(uuid) to authenticated;

create or replace function sales.customer_decline(p_proposal uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  update sales.proposals set status = 'customer_declined' where id = p_proposal;
  perform events.emit('proposal.customer_declined', v_tenant, jsonb_build_object('proposal', p_proposal, 'reason', p_reason));
end; $$;
revoke all on function sales.customer_decline(uuid, text) from public, anon;
grant execute on function sales.customer_decline(uuid, text) to authenticated;

create or replace function sales.new_proposal_version(p_blueprint uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_profile uuid; v_bpver integer; v_prev uuid; v_ver integer; v_id uuid;
begin
  select tenant_id, profile_id, version into v_tenant, v_profile, v_bpver from discovery.blueprints where id = p_blueprint;
  if not found then raise exception 'blueprint % not found', p_blueprint using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  select id, version into v_prev, v_ver from sales.proposals where blueprint_id = p_blueprint order by version desc limit 1;
  v_ver := coalesce(v_ver,0)+1;
  insert into sales.proposals (tenant_id, profile_id, blueprint_id, blueprint_version, version, status, prepared_by, created_by)
  values (v_tenant, v_profile, p_blueprint, v_bpver, v_ver, 'draft', auth.uid(), auth.uid()) returning id into v_id;
  if v_prev is not null then
    update sales.proposals set status = 'superseded', superseded_by = v_id where id = v_prev and status <> 'superseded';
  end if;
  perform events.emit('proposal.requested', v_tenant, jsonb_build_object('proposal', v_id, 'blueprint', p_blueprint, 'version', v_ver, 'supersedes', v_prev));
  return v_id;
end; $$;
revoke all on function sales.new_proposal_version(uuid) from public, anon;
grant execute on function sales.new_proposal_version(uuid) to authenticated;

-- ===========================================================================
-- Billing setup request (reuses billing.* by REFERENCE; never activates)
-- ===========================================================================
create or replace function sales.request_billing_setup(p_proposal uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status sales.proposal_status; v_agree text; v_sel text; v_bad integer; v_id uuid;
        v_onetime integer; v_recurring integer;
begin
  select tenant_id, status, agreement_status, customer_selection_status
    into v_tenant, v_status, v_agree, v_sel from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('customer_accepted','billing_setup_pending') then
    raise exception 'billing setup requires an accepted proposal (is %)', v_status using errcode = 'invalid_parameter_value';
  end if;
  if v_agree <> 'complete' or v_sel <> 'finalized' then
    raise exception 'agreements and selections must be complete before billing setup' using errcode = 'invalid_parameter_value';
  end if;
  -- every selected customer-visible line must have a sellable (approved) price
  select count(*) into v_bad from sales.proposal_line_items li
   where li.proposal_id = p_proposal and li.customer_visible and li.is_selected
     and (li.price_id is null or not sales.price_is_sellable(li.price_id));
  if v_bad > 0 then
    raise exception 'billing setup blocked: % selected line item(s) have an unapproved price', v_bad using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(sum(case when p.recurring_interval is null then p.amount_cents else 0 end),0),
         coalesce(sum(case when p.recurring_interval is not null then p.amount_cents else 0 end),0)
    into v_onetime, v_recurring
    from sales.proposal_line_items li join sales.prices p on p.id = li.price_id
   where li.proposal_id = p_proposal and li.is_selected;
  insert into sales.billing_setup_requests (tenant_id, proposal_id, currency, one_time_cents, recurring_cents,
     provider_customer_ref, subscription_ref, approval_status, created_by)
  values (v_tenant, p_proposal, 'USD', v_onetime, v_recurring, 'mock_cus_'||left(replace(p_proposal::text,'-',''),12),
     'mock_sub_'||left(replace(p_proposal::text,'-',''),12), 'draft', auth.uid())
  returning id into v_id;
  update sales.proposals set status = 'billing_setup_pending' where id = p_proposal;
  perform events.emit('billing_setup.requested', v_tenant, jsonb_build_object('proposal', p_proposal, 'billing_setup', v_id));
  return v_id;
end; $$;
revoke all on function sales.request_billing_setup(uuid) from public, anon;
grant execute on function sales.request_billing_setup(uuid) to authenticated;

create or replace function sales.approve_billing_setup(p_request uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from sales.billing_setup_requests where id = p_request;
  if not found then raise exception 'billing setup % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'sales.proposal.manage') then
    raise exception 'insufficient privilege to approve billing setup' using errcode = 'insufficient_privilege';
  end if;
  update sales.billing_setup_requests set approval_status = 'approved' where id = p_request;
  perform events.emit('billing_setup.approved', v_tenant, jsonb_build_object('billing_setup', p_request));
end; $$;
revoke all on function sales.approve_billing_setup(uuid) from public, anon;
grant execute on function sales.approve_billing_setup(uuid) to authenticated;

-- ===========================================================================
-- Provisioning request + entitlement plan + work order + factory authorization
-- ===========================================================================
create or replace function provisioning.request_provisioning(p_proposal uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_bp uuid; v_status sales.proposal_status; v_id uuid; v_modules jsonb; v_services jsonb;
begin
  select tenant_id, blueprint_id, status into v_tenant, v_bp, v_status from sales.proposals where id = p_proposal;
  if not found then raise exception 'proposal % not found', p_proposal using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.create') then
    raise exception 'insufficient privilege to request provisioning' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('customer_accepted','billing_setup_pending','provisioning_pending') then
    raise exception 'provisioning requires an accepted proposal (is %)', v_status using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(jsonb_agg(distinct li.module_key) filter (where li.module_key is not null), '[]'::jsonb),
         coalesce(jsonb_agg(distinct li.service_key) filter (where li.service_key is not null), '[]'::jsonb)
    into v_modules, v_services
    from sales.proposal_line_items li where li.proposal_id = p_proposal and li.is_selected;
  insert into provisioning.requests (tenant_id, proposal_id, blueprint_id, requested_modules, requested_services, status, created_by)
  values (v_tenant, p_proposal, v_bp, v_modules, v_services, 'draft', auth.uid())
  returning id into v_id;
  update sales.proposals set status = 'provisioning_pending' where id = p_proposal and status <> 'provisioning_pending';
  perform events.emit('provisioning.requested', v_tenant, jsonb_build_object('request', v_id, 'proposal', p_proposal));
  return v_id;
end; $$;
revoke all on function provisioning.request_provisioning(uuid) from public, anon;
grant execute on function provisioning.request_provisioning(uuid) to authenticated;

-- Entitlement plan from selected line items: module -> entitlement_key.
create or replace function provisioning.generate_entitlement_plan(p_request uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_proposal uuid; v_count integer;
begin
  select tenant_id, proposal_id into v_tenant, v_proposal from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into provisioning.entitlement_plan (tenant_id, request_id, line_item_id, module_key, entitlement_key, enabled, dependency_status, approval_status)
  select v_tenant, p_request, li.id, li.module_key, mc.entitlement_key, false,
         case when mc.required_dependencies = '[]'::jsonb then 'resolved' else 'pending' end, 'pending'
    from sales.proposal_line_items li
    join discovery.module_catalog mc on mc.key = li.module_key
   where li.proposal_id = v_proposal and li.is_selected and li.module_key is not null and mc.entitlement_key is not null;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function provisioning.generate_entitlement_plan(uuid) from public, anon;
grant execute on function provisioning.generate_entitlement_plan(uuid) to authenticated;

create or replace function provisioning.validate_request(p_request uuid)
returns provisioning.request_status language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_new provisioning.request_status;
begin
  select tenant_id into v_tenant from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  -- deterministic: a request must have at least one requested service or module
  if (select requested_modules = '[]'::jsonb and requested_services = '[]'::jsonb from provisioning.requests where id = p_request) then
    update provisioning.requests set status = 'blocked', failure_details = 'no services or modules requested' where id = p_request;
    perform events.emit('provisioning.validation_failed', v_tenant, jsonb_build_object('request', p_request, 'reason', 'empty'));
    return 'blocked';
  end if;
  update provisioning.requests set status = 'awaiting_approval' where id = p_request;
  v_new := 'awaiting_approval';
  return v_new;
end; $$;
revoke all on function provisioning.validate_request(uuid) from public, anon;
grant execute on function provisioning.validate_request(uuid) to authenticated;

-- Open a human approval for the provisioning request (reused workflow engine).
create or replace function provisioning.submit_provisioning_for_approval(p_request uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id into v_tenant from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'provisioning.request.review', 'provisioning.request', p_request::text, 'tenant_admin');
  update provisioning.requests set workflow_instance_id = v_instance where id = p_request;
  return v_instance;
end; $$;
revoke all on function provisioning.submit_provisioning_for_approval(uuid) from public, anon;
grant execute on function provisioning.submit_provisioning_for_approval(uuid) to authenticated;

-- Approve — requires manage AND an approved workflow instance. AI cannot: it
-- holds no manage permission and cannot decide a workflow task.
create or replace function provisioning.approve_provisioning(p_request uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id, workflow_instance_id into v_tenant, v_instance from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.manage') then
    raise exception 'insufficient privilege to approve provisioning' using errcode = 'insufficient_privilege';
  end if;
  if v_instance is null or not workflows.is_approved(v_instance) then
    raise exception 'provisioning cannot be approved without an approved human review' using errcode = 'insufficient_privilege';
  end if;
  update provisioning.requests set approval_status = 'approved', status = 'approved' where id = p_request;
  perform events.emit('provisioning.approved', v_tenant, jsonb_build_object('request', p_request));
end; $$;
revoke all on function provisioning.approve_provisioning(uuid) from public, anon;
grant execute on function provisioning.approve_provisioning(uuid) to authenticated;

-- Mark ready — the lifecycle STOPS here in this checkpoint (no execution).
create or replace function provisioning.mark_ready(p_request uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_appr sales.approval_state;
begin
  select tenant_id, approval_status into v_tenant, v_appr from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.manage') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  if v_appr <> 'approved' then
    raise exception 'provisioning must be approved before it is ready' using errcode = 'invalid_parameter_value';
  end if;
  update provisioning.requests set status = 'ready' where id = p_request;
  perform events.emit('provisioning.ready', v_tenant, jsonb_build_object('request', p_request));
end; $$;
revoke all on function provisioning.mark_ready(uuid) from public, anon;
grant execute on function provisioning.mark_ready(uuid) to authenticated;

-- Work order from selected line items, mapped to workstreams by service/module.
create or replace function provisioning.generate_work_order(p_request uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_proposal uuid; v_bp uuid; v_id uuid; v_seq integer := 0; li record;
begin
  select tenant_id, proposal_id, blueprint_id into v_tenant, v_proposal, v_bp from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.create') then
    raise exception 'insufficient privilege' using errcode = 'insufficient_privilege';
  end if;
  insert into provisioning.work_orders (tenant_id, proposal_id, blueprint_id, request_id, work_order_number, status, created_by)
  values (v_tenant, v_proposal, v_bp, p_request, 'WO-'||left(replace(p_request::text,'-',''),10), 'draft', auth.uid())
  returning id into v_id;
  -- one onboarding task, then one task per selected line item on a mapped workstream
  v_seq := v_seq + 1;
  insert into provisioning.work_order_tasks (tenant_id, work_order_id, workstream_key, sequence, task, owner_role, hl_responsibility, customer_responsibility)
  values (v_tenant, v_id, 'customer_onboarding', v_seq, 'Kick off onboarding and gather business information', 'shared',
          'Coordinate onboarding', 'Provide business information');
  for li in
    select pli.id, pli.service_key, pli.module_key, pli.description, pli.est_effort,
           coalesce(pli.service_key, pli.module_key)::text as label
      from sales.proposal_line_items pli where pli.proposal_id = v_proposal and pli.is_selected
      order by pli.id
  loop
    v_seq := v_seq + 1;
    insert into provisioning.work_order_tasks (tenant_id, work_order_id, workstream_key, sequence, task, owner_role,
       est_effort, depends_on, hl_responsibility, customer_responsibility, required_content, required_credential)
    values (v_tenant, v_id,
       (case
          when li.label ~ 'website|modern' then 'website'
          when li.label ~ 'seo|search' then 'search_visibility'
          when li.label ~ 'comm|missed_call|follow_up' then 'communications'
          when li.label ~ 'crm' then 'crm'
          when li.label ~ 'sched|appoint' then 'scheduling'
          when li.label ~ 'pay' then 'payments'
          when li.label ~ 'review|reputation' then 'reviews'
          when li.label ~ 'ai_recept' then 'ai_receptionist'
          when li.label ~ 'analytic|dashboard|report' then 'analytics'
          when li.label ~ 'integrat' then 'integrations'
          else 'launch' end)::extensions.citext,
       v_seq, coalesce(nullif(li.description,''), 'Implement '||li.label), 'herman_legacy',
       li.est_effort, jsonb_build_array(1),
       'Implement '||li.label, 'Provide required content and approvals',
       'Business content for '||li.label, null);
  end loop;
  update provisioning.work_orders set status = 'ready' where id = v_id;
  perform events.emit('work_order.created', v_tenant, jsonb_build_object('work_order', v_id, 'request', p_request));
  return v_id;
end; $$;
revoke all on function provisioning.generate_work_order(uuid) from public, anon;
grant execute on function provisioning.generate_work_order(uuid) to authenticated;

-- DETERMINISTIC readiness engine. Returns the reason codes that block readiness.
-- Reason codes cleared by an active, non-prohibited exception are removed.
create or replace function provisioning.evaluate_readiness(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid; v_proposal uuid; v_bp uuid; reasons jsonb := '[]'::jsonb;
        v_pstatus sales.proposal_status; v_internal sales.approval_state; v_agree text; v_sel text; v_bpstatus discovery.blueprint_status;
        v_bad integer; v_billing sales.billing_setup_status; v_reqappr sales.approval_state; v_wo integer; v_ent integer; v_reqleg integer;
        v_authid uuid;
begin
  select tenant_id, proposal_id, blueprint_id into v_tenant, v_proposal, v_bp from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  select status, internal_approval_status, agreement_status, customer_selection_status
    into v_pstatus, v_internal, v_agree, v_sel from sales.proposals where id = v_proposal;
  select lifecycle into v_bpstatus from discovery.blueprints where id = v_bp;
  select approval_status into v_reqappr from provisioning.requests where id = p_request;

  if v_bpstatus not in ('approved','ready_for_proposal') then reasons := reasons || '["blueprint_not_approved"]'::jsonb; end if;
  if v_internal <> 'approved' then reasons := reasons || '["proposal_not_internally_approved"]'::jsonb; end if;
  if v_pstatus not in ('customer_accepted','billing_setup_pending','provisioning_pending') then
    reasons := reasons || '["proposal_not_accepted"]'::jsonb; end if;
  if exists (select 1 from sales.proposals where id = v_proposal and status = 'superseded') then
    reasons := reasons || '["proposal_superseded"]'::jsonb; end if;
  if v_sel <> 'finalized' then reasons := reasons || '["selection_not_finalized"]'::jsonb; end if;

  -- required agreements complete + attorney-reviewed
  select count(*) into v_reqleg from sales.agreements where is_required;
  if v_agree <> 'complete' and v_reqleg > 0 then reasons := reasons || '["agreement_missing"]'::jsonb; end if;
  if exists (
    select 1 from sales.agreement_acceptances aa join sales.agreements a on a.id = aa.agreement_id
    where aa.proposal_id = v_proposal and a.is_required and a.attorney_review_status <> 'approved')
  then reasons := reasons || '["agreement_unreviewed_legal"]'::jsonb; end if;

  -- pricing approved on every selected customer-visible line
  select count(*) into v_bad from sales.proposal_line_items li
   where li.proposal_id = v_proposal and li.customer_visible and li.is_selected
     and (li.price_id is null or not sales.price_is_sellable(li.price_id));
  if v_bad > 0 then reasons := reasons || '["price_not_approved"]'::jsonb; end if;

  -- billing setup approved
  select approval_status into v_billing from sales.billing_setup_requests where proposal_id = v_proposal order by created_at desc limit 1;
  if v_billing is distinct from 'approved' then reasons := reasons || '["billing_setup_not_approved"]'::jsonb; end if;

  -- provisioning request approved
  if v_reqappr <> 'approved' then reasons := reasons || '["provisioning_not_approved"]'::jsonb; end if;

  -- services + modules active
  if exists (select 1 from sales.proposal_line_items li join discovery.service_catalog sc on sc.key = li.service_key
             where li.proposal_id = v_proposal and li.is_selected and sc.availability in ('unavailable','deprecated'))
  then reasons := reasons || '["service_inactive"]'::jsonb; end if;
  if exists (select 1 from sales.proposal_line_items li join discovery.module_catalog mc on mc.key = li.module_key
             where li.proposal_id = v_proposal and li.is_selected and mc.availability in ('unavailable','deprecated'))
  then reasons := reasons || '["module_inactive"]'::jsonb; end if;

  -- entitlement plan present + no unresolved dependency
  select count(*) into v_ent from provisioning.entitlement_plan where request_id = p_request;
  if exists (select 1 from provisioning.entitlement_plan where request_id = p_request and dependency_status = 'pending' and enabled = false and module_key is not null
             and (select required_dependencies from discovery.module_catalog mc where mc.key = module_key) <> '[]'::jsonb)
  then reasons := reasons || '["dependency_unresolved"]'::jsonb; end if;

  -- work order generated
  select count(*) into v_wo from provisioning.work_orders where request_id = p_request;
  if v_wo = 0 then reasons := reasons || '["work_order_missing"]'::jsonb; end if;

  -- remove reasons cleared by an active, non-prohibited exception
  select id into v_authid from provisioning.factory_authorizations where request_id = p_request;
  if v_authid is not null then
    reasons := (
      select coalesce(jsonb_agg(r.val), '[]'::jsonb)
      from jsonb_array_elements_text(reasons) as r(val)
      where r.val not in (
        select rule_key from provisioning.readiness_exceptions
        where authorization_id = v_authid and (expires_at is null or expires_at > now())
          and rule_key not in ('proposal_not_accepted','agreement_missing','agreement_unreviewed_legal')));
  end if;

  return reasons;
end; $$;
revoke all on function provisioning.evaluate_readiness(uuid) from public, anon;
grant execute on function provisioning.evaluate_readiness(uuid) to authenticated;

-- Build (or refresh) the Software Factory authorization package + readiness.
create or replace function provisioning.build_factory_authorization(p_request uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_proposal uuid; v_wo uuid; v_id uuid; reasons jsonb; v_ready provisioning.readiness; v_pkg jsonb;
begin
  select tenant_id, proposal_id into v_tenant, v_proposal from provisioning.requests where id = p_request;
  if not found then raise exception 'request % not found', p_request using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.manage') then
    raise exception 'insufficient privilege to build a factory authorization' using errcode = 'insufficient_privilege';
  end if;
  select id into v_wo from provisioning.work_orders where request_id = p_request order by created_at desc limit 1;
  -- ensure a row exists first so exceptions can attach + evaluate can see it
  insert into provisioning.factory_authorizations (tenant_id, request_id, proposal_id, work_order_id, created_by)
  values (v_tenant, p_request, v_proposal, v_wo, auth.uid())
  on conflict (request_id) do update set work_order_id = excluded.work_order_id
  returning id into v_id;

  reasons := provisioning.evaluate_readiness(p_request);
  v_ready := case when jsonb_array_length(reasons) = 0 then 'ready' else 'blocked' end;
  v_pkg := jsonb_build_object(
    'proposal', v_proposal, 'request', p_request, 'work_order', v_wo,
    'modules', (select requested_modules from provisioning.requests where id = p_request),
    'services', (select requested_services from provisioning.requests where id = p_request),
    'entitlement_plan_count', (select count(*) from provisioning.entitlement_plan where request_id = p_request));

  update provisioning.factory_authorizations set
     package = v_pkg, readiness = v_ready, blocking_reasons = reasons, evaluated_at = now()
   where id = v_id;

  if v_ready = 'ready' then
    perform events.emit('factory_authorization.ready', v_tenant, jsonb_build_object('authorization', v_id, 'request', p_request));
  else
    perform events.emit('factory_authorization.blocked', v_tenant, jsonb_build_object('authorization', v_id, 'reasons', reasons));
  end if;
  return v_id;
end; $$;
revoke all on function provisioning.build_factory_authorization(uuid) from public, anon;
grant execute on function provisioning.build_factory_authorization(uuid) to authenticated;

-- Grant a readiness exception. Prohibited rules (missing customer acceptance /
-- missing legal authorization) can NEVER be excepted.
create or replace function provisioning.grant_readiness_exception(
  p_authorization uuid, p_rule text, p_reason text, p_scope text default null, p_expires timestamptz default null)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id bigint;
begin
  select tenant_id into v_tenant from provisioning.factory_authorizations where id = p_authorization;
  if not found then raise exception 'authorization % not found', p_authorization using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'provisioning.request.manage') then
    raise exception 'insufficient privilege to grant a readiness exception' using errcode = 'insufficient_privilege';
  end if;
  if p_rule in ('proposal_not_accepted','agreement_missing','agreement_unreviewed_legal') then
    raise exception 'exceptions are not permitted for missing customer acceptance or legal authorization' using errcode = 'invalid_parameter_value';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'an exception requires a reason' using errcode = 'invalid_parameter_value';
  end if;
  insert into provisioning.readiness_exceptions (tenant_id, authorization_id, rule_key, reason, approver, scope, expires_at)
  values (v_tenant, p_authorization, p_rule, p_reason, auth.uid(), p_scope, p_expires)
  returning id into v_id;
  perform audit.log_security_event('provisioning.readiness_exception','allowed','warning',
    v_tenant,'provisioning.factory_authorizations',p_authorization::text, jsonb_build_object('rule', p_rule, 'scope', p_scope));
  return v_id;
end; $$;
revoke all on function provisioning.grant_readiness_exception(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function provisioning.grant_readiness_exception(uuid, text, text, text, timestamptz) to authenticated;

-- ===========================================================================
-- Wire the inert commerce worker on the CP5 shared dispatcher (no new queue)
-- ===========================================================================
insert into events.subscriptions (key, topic, consumer_module, active) values
  ('commerce_worker', 'proposal.requested', 'sales', true)
on conflict (key) do nothing;
insert into events.handlers (subscription_key, handler_ref, max_attempts, backoff_seconds, timeout_seconds) values
  ('commerce_worker', 'commerce-worker', 3, 60, 120)
on conflict (subscription_key) do nothing;

-- ===========================================================================
-- Seeds: configurable workstream catalog + placeholder agreement templates
-- ===========================================================================
insert into provisioning.workstream_catalog (key, name, default_sequence) values
  ('customer_onboarding','Customer Onboarding',1),
  ('business_information','Business Information',2),
  ('branding','Branding',3),
  ('website','Website',4),
  ('search_visibility','Search Visibility',5),
  ('communications','Communications',6),
  ('crm','CRM',7),
  ('scheduling','Scheduling',8),
  ('payments','Payments',9),
  ('reviews','Reviews',10),
  ('reputation_recovery','Reputation Recovery',11),
  ('ai_receptionist','AI Receptionist',12),
  ('analytics','Analytics',13),
  ('integrations','Integrations',14),
  ('data_migration','Data Migration',15),
  ('training','Training',16),
  ('quality_assurance','Quality Assurance',17),
  ('launch','Launch',18),
  ('ongoing_support','Ongoing Support',19)
on conflict (key) do nothing;

-- Placeholder legal templates — NOT legally sufficient; flagged for attorney review.
insert into sales.agreements (agreement_type, version, title, attorney_review_status, is_placeholder, is_required) values
  ('msa','v0-placeholder','Master Services Agreement (PLACEHOLDER — attorney review required)','unreviewed',true,true),
  ('subscription','v0-placeholder','Subscription Agreement (PLACEHOLDER — attorney review required)','unreviewed',true,true),
  ('sow','v0-placeholder','Statement of Work (PLACEHOLDER — attorney review required)','unreviewed',true,false),
  ('dpa','v0-placeholder','Data Processing Agreement (PLACEHOLDER — attorney review required)','unreviewed',true,false),
  ('aup','v0-placeholder','Acceptable Use Policy (PLACEHOLDER — attorney review required)','unreviewed',true,false)
on conflict (agreement_type, version) do nothing;
