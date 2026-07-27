\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 5 — shared dispatcher handler-invocation (events.handlers +
-- claim_deliveries + complete_delivery). Claim/idempotency, success, retry
-- with backoff, dead-letter, correlation ids. These are internal worker
-- functions (granted to service_role); tests run as the superuser session.
-- ===========================================================================
begin;
select plan(13);
select tests.seed();

insert into events.subscriptions (key, topic, consumer_module, active)
  values ('t_sub', 'test.evt', 'test', true) on conflict (key) do nothing;
select events.register_handler('t_sub', 't-handler', 2, 60, 30);
select is((select count(*)::int from events.handlers where subscription_key='t_sub'), 1,
  't_handler_registered');

-- first event -> dispatch -> a delivery exists
select events.emit('test.evt', tests.uid('tenant_a'), '{}'::jsonb);
select events.dispatch_batch(100);
select ok((select count(*) from events.deliveries d join events.outbox o on o.id=d.outbox_id
           where o.topic='test.evt') >= 1, 't_delivery_created');

-- claim exactly one; a second claim sees nothing (already claimed)
select is((select count(*)::int from events.claim_deliveries('t-handler', 10)), 1, 't_claim_one');
select is((select count(*)::int from events.claim_deliveries('t-handler', 10)), 0, 't_claim_idempotent');
select ok((select correlation_id from events.deliveries
           order by id limit 1) is not null, 't_correlation_id_present');

-- complete success -> delivered
select lives_ok(
  $$ select events.complete_delivery(
       (select min(d.id) from events.deliveries d join events.outbox o on o.id=d.outbox_id where o.topic='test.evt'),
       true) $$, 't_complete_success');
select is((select status::text from events.deliveries d join events.outbox o on o.id=d.outbox_id
           where o.topic='test.evt' order by d.id limit 1), 'delivered', 't_delivered');

-- second event -> claim -> fail (retry) -> fail again (dead-letter)
select events.emit('test.evt', tests.uid('tenant_a'), '{}'::jsonb);
select events.dispatch_batch(100);
select is((select count(*)::int from events.claim_deliveries('t-handler', 10)), 1, 't_claim_second');
select lives_ok(
  $$ select events.complete_delivery(
       (select max(d.id) from events.deliveries d join events.outbox o on o.id=d.outbox_id where o.topic='test.evt'),
       false, 'boom') $$, 't_complete_failure');
select is((select status::text from events.deliveries d join events.outbox o on o.id=d.outbox_id
           where o.topic='test.evt' order by d.id desc limit 1), 'failed', 't_failed_then_retry');
select lives_ok(
  $$ select events.complete_delivery(
       (select max(d.id) from events.deliveries d join events.outbox o on o.id=d.outbox_id where o.topic='test.evt'),
       false, 'boom2') $$, 't_second_failure');
select is((select status::text from events.deliveries d join events.outbox o on o.id=d.outbox_id
           where o.topic='test.evt' order by d.id desc limit 1), 'dead', 't_dead_letter');
select ok((select count(*) from audit.security_events where action='events.delivery.dead') >= 1,
  't_dead_letter_audited');

select * from finish();
rollback;
