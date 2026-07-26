-- ===========================================================================
-- v0_billing_core — the reusable subscription catalog (HL-BOS shared capability)
--
-- Billing is a Factory module, not product code: one engine, many products.
-- This migration is the CATALOG half — what can be sold:
--   * providers   — payment providers (stripe/manual/mock); credential is a
--                   Vault reference, never a secret value (mirrors ai.providers)
--   * products    — a sellable thing, tagged with the consuming module
--   * plans       — a recurring offering; plan.key IS the entitlements.plan_features
--                   plan_key, so a purchase grants features WITHOUT billing
--                   re-implementing entitlement logic
--   * plan_prices — money: currency + unit amount + the provider's external price
--                   id (an id, not a secret)
--
-- The subscription LIFECYCLE (subscriptions, invoices, payments, entitlement
-- sync, events) is 0016. This half stands alone: catalog + provider registry.
--
-- Reuses the spine (identity/permissions/audit) and V0 (events/entitlements).
-- No duplicate customer, org, or identity records — a "customer" is a
-- platform.tenants row; a "user" is auth.users. Billing adds none of its own.
--
-- rollback:
--   DROP SCHEMA IF EXISTS billing CASCADE;
--   DELETE FROM entitlements.plan_features WHERE plan_key IN ('salonai_pro','homehuddle_family');
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'billing.%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'billing.%';
-- ===========================================================================

create schema if not exists billing;
comment on schema billing is 'HL-BOS: reusable subscription platform. NOT exposed via PostgREST.';
revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to authenticated;
alter default privileges in schema billing revoke all on tables from public;
alter default privileges in schema billing revoke all on functions from public;

do $$ begin create type billing.provider_kind as enum ('stripe','manual','mock'); exception when duplicate_object then null; end $$;
do $$ begin create type billing.plan_interval as enum ('month','year'); exception when duplicate_object then null; end $$;

-- --- Providers: credential is a Vault reference, never a secret ---------------
create table if not exists billing.providers (
  key            extensions.citext primary key,
  kind           billing.provider_kind not null,
  is_active      boolean not null default false,
  credential_ref extensions.citext,
  webhook_secret_ref extensions.citext,
  created_at     timestamptz not null default now(),
  constraint providers_credential_is_vault_ref
    check (credential_ref is null or credential_ref ~ '^vault:[a-z0-9_./-]{1,120}$'),
  constraint providers_webhook_secret_is_vault_ref
    check (webhook_secret_ref is null or webhook_secret_ref ~ '^vault:[a-z0-9_./-]{1,120}$')
);
comment on table billing.providers is 'Payment providers. Credentials are Vault references only; stripe seeded INACTIVE until a key is granted at deploy.';

create table if not exists billing.products (
  key         extensions.citext primary key,
  name        text not null,
  module      extensions.citext not null,   -- consuming product/module, e.g. salonai, homehuddle
  description text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint products_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$')
);
comment on table billing.products is 'A sellable product, tagged with the module that consumes it. Seeded by migration; new products add rows, not code.';

create table if not exists billing.plans (
  key         extensions.citext primary key,        -- == entitlements.plan_features.plan_key
  product_key extensions.citext not null references billing.products(key) on delete cascade,
  name        text not null,
  interval    billing.plan_interval not null default 'month',
  trial_days  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint plans_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint plans_trial_nonneg check (trial_days >= 0)
);
comment on table billing.plans is 'A recurring offering. plan.key is the entitlements.plan_features plan_key — subscribing grants those features, no duplicate entitlement logic.';

create table if not exists billing.plan_prices (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  plan_key           extensions.citext not null references billing.plans(key) on delete cascade,
  provider_key       extensions.citext not null references billing.providers(key) on delete restrict,
  currency           extensions.citext not null default 'usd',
  unit_amount        integer not null,               -- minor units (cents). No floats for money.
  provider_price_ref extensions.citext,              -- external price id (NOT a secret)
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  constraint plan_prices_unique unique (plan_key, provider_key, currency),
  constraint plan_prices_amount_nonneg check (unit_amount >= 0),
  constraint plan_prices_currency_format check (currency ~ '^[a-z]{3}$')
);
comment on table billing.plan_prices is 'Money for a plan per provider/currency. unit_amount is minor units (cents); provider_price_ref is an external id, never a secret.';

-- --- RLS: catalog is world-readable to members; writes via definer fns only ---
alter table billing.providers   enable row level security; alter table billing.providers   force row level security;
alter table billing.products    enable row level security; alter table billing.products    force row level security;
alter table billing.plans       enable row level security; alter table billing.plans       force row level security;
alter table billing.plan_prices enable row level security; alter table billing.plan_prices force row level security;

-- providers: platform-only read (they carry credential_refs, even if just refs)
drop policy if exists providers_select on billing.providers;
create policy providers_select on billing.providers for select to authenticated
  using (identity.has_platform_permission('billing.provider.manage'));
-- products/plans/prices: any authenticated context may read the catalog (pricing page)
drop policy if exists products_select on billing.products;
create policy products_select on billing.products for select to authenticated using (true);
drop policy if exists plans_select on billing.plans;
create policy plans_select on billing.plans for select to authenticated using (true);
drop policy if exists plan_prices_select on billing.plan_prices;
create policy plan_prices_select on billing.plan_prices for select to authenticated using (true);

grant select on billing.products, billing.plans, billing.plan_prices to authenticated;
grant select on billing.providers to authenticated;  -- filtered to platform admins by policy

-- --- Catalog management (platform-gated) ------------------------------------
create or replace function billing.upsert_plan(
  p_plan extensions.citext, p_product extensions.citext, p_name text,
  p_interval billing.plan_interval default 'month', p_trial_days integer default 0)
returns extensions.citext language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_platform_permission('billing.plan.manage') then
    raise exception 'only a platform administrator may manage the plan catalog'
      using errcode = 'insufficient_privilege';
  end if;
  insert into billing.plans (key, product_key, name, interval, trial_days)
  values (p_plan, p_product, p_name, p_interval, greatest(p_trial_days,0))
  on conflict (key) do update
    set product_key = excluded.product_key, name = excluded.name,
        interval = excluded.interval, trial_days = excluded.trial_days;
  return p_plan;
end; $$;
revoke all on function billing.upsert_plan(extensions.citext, extensions.citext, text, billing.plan_interval, integer) from public, anon;
grant execute on function billing.upsert_plan(extensions.citext, extensions.citext, text, billing.plan_interval, integer) to authenticated;

-- --- Permissions ------------------------------------------------------------
insert into identity.permissions (key, description, scope) values
  ('billing.plan.read',         'Read the sellable product/plan catalog.', 'tenant'),
  ('billing.plan.manage',       'Manage the product/plan/price catalog (platform).', 'platform'),
  ('billing.provider.manage',   'Manage payment providers and their credentials (platform).', 'platform'),
  ('billing.subscription.read', 'Read a tenant''s subscriptions.', 'tenant'),
  ('billing.subscription.manage','Subscribe, change, or cancel a tenant''s subscription.', 'tenant'),
  ('billing.invoice.read',      'Read a tenant''s invoices and payments.', 'tenant'),
  ('billing.refund.manage',     'Request/approve a refund (gated by the human approval workflow).', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','billing.plan.read'),('tenant_owner','billing.subscription.read'),
  ('tenant_owner','billing.subscription.manage'),('tenant_owner','billing.invoice.read'),
  ('tenant_owner','billing.refund.manage'),
  ('tenant_admin','billing.plan.read'),('tenant_admin','billing.subscription.read'),
  ('tenant_admin','billing.subscription.manage'),('tenant_admin','billing.invoice.read'),
  ('manager','billing.plan.read'),('manager','billing.subscription.read'),('manager','billing.invoice.read'),
  ('staff','billing.plan.read'),('viewer','billing.plan.read'),
  ('platform_owner','billing.plan.manage'),('platform_owner','billing.provider.manage'),
  ('platform_admin','billing.plan.manage'),('platform_admin','billing.provider.manage')
on conflict do nothing;

-- --- Provider seeds: manual+mock active, stripe INACTIVE (no secret stored) --
insert into billing.providers (key, kind, is_active, credential_ref, webhook_secret_ref) values
  ('manual', 'manual', true,  null, null),
  ('mock',   'mock',   true,  null, null),
  ('stripe', 'stripe', false, 'vault:stripe_secret_key', 'vault:stripe_webhook_secret')
on conflict (key) do nothing;

-- Example catalog so the entitlement seam is exercised by tests. These are plan
-- DEFINITIONS (configuration), not customers/subscriptions/payments. A plan
-- maps to entitlements.features via entitlements.plan_features below.
insert into billing.products (key, name, module, description) values
  ('salonai',    'SalonAI',    'salonai',    'AI growth platform for salons.'),
  ('homehuddle', 'HomeHuddle', 'homehuddle', 'Recurring subscription home-services product.')
on conflict (key) do nothing;

insert into billing.plans (key, product_key, name, interval, trial_days) values
  ('salonai_pro',      'salonai',    'SalonAI Pro (monthly)',      'month', 14),
  ('homehuddle_family','homehuddle', 'HomeHuddle Family (monthly)','month', 0)
on conflict (key) do nothing;

insert into billing.plan_prices (plan_key, provider_key, currency, unit_amount) values
  ('salonai_pro',       'stripe', 'usd', 9900),
  ('homehuddle_family', 'stripe', 'usd', 2900),
  ('salonai_pro',       'manual', 'usd', 9900),
  ('homehuddle_family', 'manual', 'usd', 2900)
on conflict (plan_key, provider_key, currency) do nothing;

-- Wire the SalonAI Pro plan to the already-seeded VisibilityAI features, using
-- the entitlements.plan_features seam designed in 0010. Subscribing to this plan
-- will grant these features (0016 sync) — no product-specific entitlement code.
insert into entitlements.plan_features (plan_key, feature_key) values
  ('salonai_pro', 'visibility.core'),
  ('salonai_pro', 'visibility.content'),
  ('salonai_pro', 'visibility.reputation')
on conflict do nothing;
