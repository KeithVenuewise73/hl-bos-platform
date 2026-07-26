\ir _fixtures.sql.inc

-- Coverage for v0_billing_subscriptions: the subscription lifecycle, automatic
-- entitlement sync, anti-fabrication of invoices/payments, tenant isolation,
-- and the refund human gate. End to end, on the reused spine + V0 modules.
begin;
select plan(14);
select tests.seed();

-- --- subscribe: grants entitlements automatically, no product-side logic -----
select tests.login_as(tests.uid('owner_a'));
select ok(billing.start_subscription(tests.uid('tenant_a'), 'salonai_pro', 'stripe') is not null,
  't_owner_can_subscribe');
select is(entitlements.has_feature(tests.uid('tenant_a'), 'visibility.core'), true,
  't_subscribe_grants_feature');
select is(entitlements.module_is_active(tests.uid('tenant_a'), 'visibility'), true,
  't_subscribe_activates_module');
select is((select status::text from billing.subscriptions
           where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'), 'trialing',
  't_trial_status');
select tests.logout();

-- --- a viewer cannot subscribe ----------------------------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select billing.start_subscription(tests.uid('tenant_a'), 'homehuddle_family', 'manual') $$,
  '42501', null, 't_viewer_cannot_subscribe');
select tests.logout();

-- --- anti-fabrication: a tenant cannot issue an invoice ---------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select billing.record_invoice(tests.uid('tenant_a'), null, 9900) $$,
  '42501', null, 't_tenant_cannot_issue_invoice');
select tests.logout();

-- --- billing service records a FAILED payment -> subscription past_due ------
select tests.login_as(tests.uid('padmin'));
select lives_ok($$
  select billing.record_payment(
    billing.record_invoice(tests.uid('tenant_a'),
      (select id from billing.subscriptions where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'),
      9900),
    'failed', 9900, null, 'card_declined')
$$, 't_service_records_failed_payment');
select is((select status::text from billing.subscriptions
           where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'), 'past_due',
  't_failed_payment_sets_past_due');
select tests.logout();

-- --- billing service records a SUCCEEDED payment -> active + invoice paid ---
select tests.login_as(tests.uid('padmin'));
select lives_ok($$
  select billing.record_payment(
    billing.record_invoice(tests.uid('tenant_a'),
      (select id from billing.subscriptions where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'),
      9900),
    'succeeded', 9900, 'pay_123', null)
$$, 't_service_records_succeeded_payment');
select is((select status::text from billing.subscriptions
           where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'), 'active',
  't_succeeded_payment_reactivates');
select tests.logout();

-- --- tenant isolation: tenant B cannot see tenant A's subscriptions ---------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from billing.subscriptions where tenant_id = tests.uid('tenant_a')), 0,
  't_tenant_isolation_subscriptions');
select tests.logout();

-- --- cancel (immediate) revokes the entitlement -----------------------------
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select billing.cancel_subscription(
  (select id from billing.subscriptions where tenant_id = tests.uid('tenant_a') and plan_key = 'salonai_pro'),
  false) $$, 't_owner_can_cancel');
select is(entitlements.has_feature(tests.uid('tenant_a'), 'visibility.core'), false,
  't_cancel_revokes_feature');
select tests.logout();

-- --- refunds require an approved human review -------------------------------
select tests.login_as(tests.uid('padmin'));
select throws_ok($$ select billing.apply_refund(
  (select id from billing.payments where status = 'succeeded' and tenant_id = tests.uid('tenant_a') limit 1),
  pg_catalog.gen_random_uuid(), 9900) $$, '42501', null, 't_refund_requires_approval');
select tests.logout();

select * from finish();
rollback;
