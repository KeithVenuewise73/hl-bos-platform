\ir _fixtures.sql.inc

-- Coverage for v0_events: emit-in-tx, dispatch fan-out, at-least-once
-- idempotency, platform-only read, and no client-callable producer API.
begin;
select plan(9);
select tests.seed();

-- a subscription for the test topic (seeded here as owner; RLS applies to clients)
insert into events.subscriptions (key, topic, consumer_module)
values ('test_sub', 'test.thing.created', 'test');

-- emit two events in the caller's tx
select ok(events.emit('test.thing.created', tests.uid('tenant_a'), '{"n":1}'::jsonb) > 0,
  't_emit_returns_id: first event appended');
select events.emit('test.thing.created', tests.uid('tenant_a'), '{"n":2}'::jsonb);

select is((select count(*)::int from events.outbox where topic='test.thing.created'), 2,
  't_emit_writes_outbox: both events present');

-- nothing published until dispatch
select is((select count(*)::int from events.outbox where published_at is not null), 0,
  't_unpublished_before_dispatch');

-- dispatch: fan out to subscriptions, mark published
select is(events.dispatch_batch(100), 2, 't_dispatch_processes_both');
select is((select count(*)::int from events.deliveries d
           join events.outbox o on o.id=d.outbox_id where o.topic='test.thing.created'), 2,
  't_dispatch_creates_one_delivery_per_event');
select is((select count(*)::int from events.outbox where published_at is not null), 2,
  't_dispatch_marks_published');

-- re-dispatch is a no-op (idempotent): no new deliveries, count 0
select is(events.dispatch_batch(100), 0, 't_redispatch_is_idempotent: nothing left unpublished');

-- RLS: a tenant user (not platform admin) cannot read the outbox
select tests.login_as(tests.uid('owner_a'));
select is((select count(*)::int from events.outbox), 0,
  't_tenant_user_cannot_read_outbox: RLS hides platform events');
select tests.logout();

-- producer API is not client-callable
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select events.emit('x.y.z', null, '{}'::jsonb) $$,
  '42501', null, 't_emit_not_client_callable: execute revoked');
select tests.logout();

select * from finish();
