-- ===========================================================================
-- v0_billing_subscriptions — subscription lifecycle + entitlement sync + events
--
-- The lifecycle half of the reusable subscription platform:
--   * subscriptions   — a tenant's recurring commitment to a plan
--   * invoices        — what is owed for a billing period
--   * payments        — attempts against an invoice (succeeded/failed/refunded)
--   * payment_methods — provider TOKEN references only (no PAN, PCI-safe)
--
-- Two guarantees enforced structurally, not by convention:
--   1. Anti-fabrication (Principle 10): invoices and payments have NO tenant
--      write path. Only the trusted billing service (platform admin / webhook)
--      records them. A tenant cannot invent a paid invoice.
--   2. Entitlement sync: billing.reconcile_entitlements(tenant) recomputes the
--      tenant's plan-sourced entitlements from its ACTIVE/TRIALING subscriptions
--      every time a subscription changes. Products consume entitlements; they
--      never implement billing logic. Idempotent, overlap-safe.
--
-- Every material action publishes an event via events.emit (0009). Refunds pass
-- through the workflows human gate (0013). No live provider call happens here —
-- that lives in the billing-webhook edge function (scaffolded, inert).
--
-- rollback:
--   -- (drop this migration's objects; 0015 owns the billing schema teardown)
--   DROP FUNCTION IF EXISTS billing.reconcile_entitlements(uuid);
--   DROP TABLE IF EXISTS billing.payments, billing.invoices,
--     billing.payment_methods, billing.subscriptions CASCADE;
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'billing.%'
--     AND permission_key IN ('billing.subscription.manage');  -- see 0015 for the full set
-- ===========================================================================

do $$ begin create type billing.subscription_status as enum ('trialing','active','past_due','canceled','incomplete'); exception when duplicate_object then null; end $$;
do $$ begin create type billing.invoice_status as enum ('draft','open','paid','void','uncollectible'); exception when duplicate_object then null; end $$;
do $$ begin create type billing.payment_status as enum ('pending','succeeded','failed','refunded'); exception when duplicate_object then null; end $$;

create table if not exists billing.subscriptions (
  id                    uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id             uuid not null references platform.tenants(id) on delete cascade,
  plan_key              extensions.citext not null references billing.plans(key) on delete restrict,
  provider_key          extensions.citext not null references billing.providers(key) on delete restrict,
  status                billing.subscription_status not null default 'incomplete',
  provider_subscription_ref extensions.citext,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  trial_end             timestamptz,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint subscriptions_unique_active unique (tenant_id, plan_key)
);
create index if not exists subscriptions_tenant_idx on billing.subscriptions (tenant_id, status);

create table if not exists billing.invoices (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  subscription_id    uuid references billing.subscriptions(id) on delete set null,
  status             billing.invoice_status not null default 'draft',
  currency           extensions.citext not null default 'usd',
  amount_due         integer not null default 0,      -- minor units
  amount_paid        integer not null default 0,
  provider_invoice_ref extensions.citext,
  period_start       timestamptz,
  period_end         timestamptz,
  issued_at          timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  constraint invoices_amounts_nonneg check (amount_due >= 0 and amount_paid >= 0),
  constraint invoices_currency_format check (currency ~ '^[a-z]{3}$')
);
create index if not exists invoices_tenant_idx on billing.invoices (tenant_id, status);

create table if not exists billing.payments (
  id                 uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id          uuid not null references platform.tenants(id) on delete cascade,
  invoice_id         uuid not null references billing.invoices(id) on delete cascade,
  status             billing.payment_status not null default 'pending',
  currency           extensions.citext not null default 'usd',
  amount             integer not null,
  provider_payment_ref extensions.citext,
  failure_reason     text,
  refunded_amount    integer not null default 0,
  created_at         timestamptz not null default now(),
  constraint payments_amount_nonneg check (amount >= 0 and refunded_amount >= 0),
  constraint payments_refund_le_amount check (refunded_amount <= amount)
);
create index if not exists payments_invoice_idx on billing.payments (invoice_id);

create table if not exists billing.payment_methods (
  id                  uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id           uuid not null references platform.tenants(id) on delete cascade,
  provider_key        extensions.citext not null references billing.providers(key) on delete restrict,
  provider_method_ref extensions.citext not null,     -- provider token/id, NOT card data
  brand               text,
  last4               text,                            -- last4 is not sensitive
  exp_month           integer,
  exp_year            integer,
  is_default          boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint payment_methods_last4_format check (last4 is null or last4 ~ '^[0-9]{4}$')
);
create index if not exists payment_methods_tenant_idx on billing.payment_methods (tenant_id);

create trigger subscriptions_set_updated_at before update on billing.subscriptions
  for each row execute function platform.set_updated_at();
create trigger subscriptions_audit after insert or update or delete on billing.subscriptions for each row execute function audit.emit();
create trigger invoices_audit  after insert or update or delete on billing.invoices  for each row execute function audit.emit();
create trigger payments_audit  after insert or update or delete on billing.payments  for each row execute function audit.emit();
create trigger payment_methods_audit after insert or update or delete on billing.payment_methods for each row execute function audit.emit();

-- --- RLS: tenant reads own; NO tenant write path (definer fns only) ----------
alter table billing.subscriptions  enable row level security; alter table billing.subscriptions  force row level security;
alter table billing.invoices       enable row level security; alter table billing.invoices       force row level security;
alter table billing.payments       enable row level security; alter table billing.payments       force row level security;
alter table billing.payment_methods enable row level security; alter table billing.payment_methods force row level security;

-- Tenant members read their own; platform admins (the billing operators/service)
-- read across tenants — a billing dashboard and the webhook processor need this.
drop policy if exists subscriptions_select on billing.subscriptions;
create policy subscriptions_select on billing.subscriptions for select to authenticated
  using (identity.has_permission(tenant_id, 'billing.subscription.read') or identity.is_platform_admin());
drop policy if exists invoices_select on billing.invoices;
create policy invoices_select on billing.invoices for select to authenticated
  using (identity.has_permission(tenant_id, 'billing.invoice.read') or identity.is_platform_admin());
drop policy if exists payments_select on billing.payments;
create policy payments_select on billing.payments for select to authenticated
  using (identity.has_permission(tenant_id, 'billing.invoice.read') or identity.is_platform_admin());
drop policy if exists payment_methods_select on billing.payment_methods;
create policy payment_methods_select on billing.payment_methods for select to authenticated
  using (identity.is_member(tenant_id));

grant select on billing.subscriptions, billing.invoices, billing.payments, billing.payment_methods to authenticated;

-- ===========================================================================
-- Entitlement sync — the bridge. Idempotent: recompute plan-sourced
-- entitlements from the tenant's ACTIVE/TRIALING subscriptions. Overlap-safe
-- (a feature stays granted while any active sub grants it). Owned by postgres
-- (BYPASSRLS), so it is the trusted grantor into the entitlements module.
-- ===========================================================================
create or replace function billing.reconcile_entitlements(p_tenant uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  -- Idempotent, temp-table-free (safe to call many times per transaction).
  -- "desired" = features from the tenant's ACTIVE/TRIALING subscriptions.

  -- grant newly-desired features
  for r in
    select distinct pf.feature_key
    from billing.subscriptions s
    join entitlements.plan_features pf on pf.plan_key = s.plan_key
    where s.tenant_id = p_tenant and s.status in ('active','trialing')
      and not exists (
        select 1 from entitlements.tenant_entitlements te
        where te.tenant_id = p_tenant and te.feature_key = pf.feature_key)
  loop
    insert into entitlements.tenant_entitlements (tenant_id, feature_key, source, granted_by)
    values (p_tenant, r.feature_key, 'plan', auth.uid())
    on conflict (tenant_id, feature_key) do update set source = 'plan', expires_at = null;
    perform events.emit('billing.feature.granted', p_tenant, jsonb_build_object('feature', r.feature_key));
  end loop;

  -- revoke plan-sourced entitlements no longer desired (leave 'grant'/'trial' sources alone)
  for r in
    select te.feature_key from entitlements.tenant_entitlements te
    where te.tenant_id = p_tenant and te.source = 'plan'
      and not exists (
        select 1 from billing.subscriptions s
        join entitlements.plan_features pf on pf.plan_key = s.plan_key
        where s.tenant_id = p_tenant and s.status in ('active','trialing')
          and pf.feature_key = te.feature_key)
  loop
    delete from entitlements.tenant_entitlements
      where tenant_id = p_tenant and feature_key = r.feature_key and source = 'plan';
    perform events.emit('billing.feature.revoked', p_tenant, jsonb_build_object('feature', r.feature_key));
  end loop;

  -- reconcile module activations, but only for modules the billing catalog governs
  for r in
    select distinct f.module from entitlements.features f
    where exists (select 1 from entitlements.plan_features pf
                  join billing.plans p on p.key = pf.plan_key
                  where pf.feature_key = f.key)
  loop
    if exists (
        select 1 from billing.subscriptions s
        join entitlements.plan_features pf on pf.plan_key = s.plan_key
        join entitlements.features f2 on f2.key = pf.feature_key
        where s.tenant_id = p_tenant and s.status in ('active','trialing') and f2.module = r.module)
    then
      insert into entitlements.module_activations (tenant_id, module, active, activated_by)
      values (p_tenant, r.module, true, auth.uid())
      on conflict (tenant_id, module) do update set active = true, activated_at = now();
    else
      update entitlements.module_activations set active = false
        where tenant_id = p_tenant and module = r.module;
    end if;
  end loop;
end; $$;
revoke all on function billing.reconcile_entitlements(uuid) from public, anon, authenticated;

-- ===========================================================================
-- Subscription lifecycle (tenant, permission-gated)
-- ===========================================================================
create or replace function billing.start_subscription(
  p_tenant uuid, p_plan extensions.citext, p_provider extensions.citext default 'stripe')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_trial_days integer; v_status billing.subscription_status; v_trial_end timestamptz;
begin
  if not identity.has_permission(p_tenant, 'billing.subscription.manage') then
    raise exception 'insufficient privilege to manage subscriptions' using errcode = 'insufficient_privilege';
  end if;
  select trial_days into v_trial_days from billing.plans where key = p_plan and is_active;
  if not found then raise exception 'plan % not found or inactive', p_plan using errcode = 'no_data_found'; end if;

  if v_trial_days > 0 then
    v_status := 'trialing'; v_trial_end := now() + make_interval(days => v_trial_days);
  else
    v_status := 'active'; v_trial_end := null;
  end if;

  insert into billing.subscriptions (tenant_id, plan_key, provider_key, status, trial_end,
                                     current_period_start, current_period_end)
  values (p_tenant, p_plan, p_provider, v_status, v_trial_end, now(),
          coalesce(v_trial_end, now() + interval '1 month'))
  on conflict (tenant_id, plan_key) do update
    set status = v_status, provider_key = p_provider, trial_end = v_trial_end,
        cancel_at_period_end = false, canceled_at = null, current_period_start = now()
  returning id into v_id;

  perform billing.reconcile_entitlements(p_tenant);
  perform events.emit('billing.subscription.created', p_tenant,
    jsonb_build_object('subscription', v_id, 'plan', p_plan, 'status', v_status));
  if v_status = 'trialing' then
    perform events.emit('billing.trial.started', p_tenant,
      jsonb_build_object('subscription', v_id, 'trial_end', v_trial_end));
  end if;
  return v_id;
end; $$;
revoke all on function billing.start_subscription(uuid, extensions.citext, extensions.citext) from public, anon;
grant execute on function billing.start_subscription(uuid, extensions.citext, extensions.citext) to authenticated;

create or replace function billing.cancel_subscription(p_subscription uuid, p_at_period_end boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from billing.subscriptions where id = p_subscription;
  if not found then raise exception 'subscription % not found', p_subscription using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'billing.subscription.manage') then
    raise exception 'insufficient privilege to cancel subscription' using errcode = 'insufficient_privilege';
  end if;

  if p_at_period_end then
    update billing.subscriptions set cancel_at_period_end = true where id = p_subscription;
  else
    update billing.subscriptions set status = 'canceled', canceled_at = now(), cancel_at_period_end = false
      where id = p_subscription;
    perform billing.reconcile_entitlements(v_tenant);   -- immediate revoke
  end if;
  perform events.emit('billing.subscription.canceled', v_tenant,
    jsonb_build_object('subscription', p_subscription, 'at_period_end', p_at_period_end));
end; $$;
revoke all on function billing.cancel_subscription(uuid, boolean) from public, anon;
grant execute on function billing.cancel_subscription(uuid, boolean) to authenticated;

-- ===========================================================================
-- Provider/service-side actions (platform-gated). Anti-fabrication: only the
-- trusted billing service records invoices, payments, and renewals — never a
-- tenant. A salon owner cannot invent a paid invoice.
-- ===========================================================================
create or replace function billing.renew_subscription(p_subscription uuid, p_period_end timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_cancel boolean;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the billing service may renew subscriptions' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id, cancel_at_period_end into v_tenant, v_cancel from billing.subscriptions where id = p_subscription;
  if not found then raise exception 'subscription % not found', p_subscription using errcode = 'no_data_found'; end if;

  if v_cancel then
    update billing.subscriptions set status = 'canceled', canceled_at = now() where id = p_subscription;
    perform billing.reconcile_entitlements(v_tenant);
    perform events.emit('billing.subscription.canceled', v_tenant, jsonb_build_object('subscription', p_subscription, 'at_period_end', true));
  else
    update billing.subscriptions
       set status = 'active', current_period_start = now(), current_period_end = p_period_end, trial_end = null
     where id = p_subscription;
    perform billing.reconcile_entitlements(v_tenant);
    perform events.emit('billing.subscription.renewed', v_tenant, jsonb_build_object('subscription', p_subscription, 'period_end', p_period_end));
  end if;
end; $$;
revoke all on function billing.renew_subscription(uuid, timestamptz) from public, anon;
grant execute on function billing.renew_subscription(uuid, timestamptz) to authenticated;

create or replace function billing.record_invoice(
  p_tenant uuid, p_subscription uuid, p_amount integer, p_currency extensions.citext default 'usd',
  p_period_start timestamptz default now(), p_period_end timestamptz default now() + interval '1 month')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the billing service may issue invoices' using errcode = 'insufficient_privilege';
  end if;
  insert into billing.invoices (tenant_id, subscription_id, status, currency, amount_due, period_start, period_end, issued_at)
  values (p_tenant, p_subscription, 'open', p_currency, p_amount, p_period_start, p_period_end, now())
  returning id into v_id;
  perform events.emit('billing.invoice.created', p_tenant, jsonb_build_object('invoice', v_id, 'amount', p_amount));
  return v_id;
end; $$;
revoke all on function billing.record_invoice(uuid, uuid, integer, extensions.citext, timestamptz, timestamptz) from public, anon;
grant execute on function billing.record_invoice(uuid, uuid, integer, extensions.citext, timestamptz, timestamptz) to authenticated;

create or replace function billing.record_payment(
  p_invoice uuid, p_status billing.payment_status, p_amount integer,
  p_provider_ref extensions.citext default null, p_failure_reason text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid; v_sub uuid;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the billing service may record payments' using errcode = 'insufficient_privilege';
  end if;
  select tenant_id, subscription_id into v_tenant, v_sub from billing.invoices where id = p_invoice;
  if not found then raise exception 'invoice % not found', p_invoice using errcode = 'no_data_found'; end if;

  insert into billing.payments (tenant_id, invoice_id, status, amount, provider_payment_ref, failure_reason)
  values (v_tenant, p_invoice, p_status, p_amount, p_provider_ref, p_failure_reason)
  returning id into v_id;

  if p_status = 'succeeded' then
    update billing.invoices set status = 'paid', amount_paid = p_amount, paid_at = now() where id = p_invoice;
    if v_sub is not null then
      update billing.subscriptions set status = 'active' where id = v_sub and status = 'past_due';
      perform billing.reconcile_entitlements(v_tenant);
    end if;
    perform events.emit('billing.payment.succeeded', v_tenant, jsonb_build_object('invoice', p_invoice, 'payment', v_id, 'amount', p_amount));
    perform events.emit('billing.invoice.paid', v_tenant, jsonb_build_object('invoice', p_invoice));
  elsif p_status = 'failed' then
    if v_sub is not null then
      update billing.subscriptions set status = 'past_due' where id = v_sub and status in ('active','trialing');
    end if;
    perform events.emit('billing.payment.failed', v_tenant, jsonb_build_object('invoice', p_invoice, 'payment', v_id, 'reason', p_failure_reason));
    perform events.emit('billing.payment.dunning', v_tenant, jsonb_build_object('invoice', p_invoice, 'subscription', v_sub));
    perform audit.log_security_event('billing.payment.failed','denied','warning', v_tenant,'billing.payments',v_id::text,
      jsonb_build_object('reason', p_failure_reason));
  end if;
  return v_id;
end; $$;
revoke all on function billing.record_payment(uuid, billing.payment_status, integer, extensions.citext, text) from public, anon;
grant execute on function billing.record_payment(uuid, billing.payment_status, integer, extensions.citext, text) to authenticated;

-- ===========================================================================
-- Refunds pass through the human approval gate (0013). Requesting is tenant
-- work; applying requires an APPROVED workflow instance AND the billing service.
-- ===========================================================================
create or replace function billing.request_refund(p_payment uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_instance uuid;
begin
  select tenant_id into v_tenant from billing.payments where id = p_payment and status = 'succeeded';
  if not found then raise exception 'no succeeded payment % to refund', p_payment using errcode = 'no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'billing.refund.manage') then
    raise exception 'insufficient privilege to request a refund' using errcode = 'insufficient_privilege';
  end if;
  v_instance := workflows.request_approval(v_tenant, 'billing.refund', 'billing.payment', p_payment::text, 'tenant_admin');
  perform events.emit('billing.refund.requested', v_tenant, jsonb_build_object('payment', p_payment, 'instance', v_instance, 'reason', p_reason));
  return v_instance;
end; $$;
revoke all on function billing.request_refund(uuid, text) from public, anon;
grant execute on function billing.request_refund(uuid, text) to authenticated;

create or replace function billing.apply_refund(p_payment uuid, p_instance uuid, p_amount integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  if not identity.is_platform_admin() then
    raise exception 'only the billing service may apply a refund' using errcode = 'insufficient_privilege';
  end if;
  if p_instance is null or not workflows.is_approved(p_instance) then
    raise exception 'refund requires an approved human review' using errcode = 'insufficient_privilege';
  end if;
  update billing.payments set status = 'refunded', refunded_amount = p_amount
    where id = p_payment and status = 'succeeded'
    returning tenant_id into v_tenant;
  if not found then raise exception 'payment % not refundable', p_payment using errcode = 'no_data_found'; end if;
  perform events.emit('billing.payment.refunded', v_tenant, jsonb_build_object('payment', p_payment, 'amount', p_amount));
end; $$;
revoke all on function billing.apply_refund(uuid, uuid, integer) from public, anon;
grant execute on function billing.apply_refund(uuid, uuid, integer) to authenticated;
