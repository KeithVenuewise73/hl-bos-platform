\ir _fixtures.sql.inc

-- ===========================================================================
-- The product map — migration 0057.
--
-- The catalog is the vocabulary a proposal is allowed to use: 0055's honesty
-- trigger refuses any capability the catalog has never heard of. So "is the
-- product in the catalog" is not bookkeeping, it is whether we can describe
-- what we sell in the document we hand a shop.
--
-- Two things are worth testing hardest:
--
--   * A SHIPPED MODULE IS WAITING ON NOTHING. If `available` and `blocked_on`
--     could coexist, the console could show a module as both sellable and
--     stuck, and one of those would be a lie to somebody.
--   * A BLOCKER ALWAYS NAMES WHO CAN CLEAR IT. "Blocked" with no owner is how
--     a thing waits forever -- the whole point is to separate what needs an
--     account from what needs engineering time.
-- ===========================================================================
begin;
select plan(19);
select tests.seed();

-- ===========================================================================
-- The twelve layers can now be named
-- ===========================================================================
select is(
  (select count(*)::int from barberos.capabilities
    where key in ('local_seo','google_business','lead_funnel','retention_engine',
                  'marketing_engine','social_engine','ai_advisor')),
  7, 't_the_seven_missing_layers_are_in_the_catalog');

select is(
  (select count(*)::int from barberos.capabilities
    where key in ('local_seo','google_business','lead_funnel','retention_engine',
                  'marketing_engine','social_engine','ai_advisor')
      and status <> 'planned'),
  0, 't_and_every_one_of_them_is_planned_not_available');

select is(
  (select count(*)::int from barberos.capabilities where status = 'available'),
  2, 't_only_two_modules_are_actually_shipped');

select is(
  (select string_agg(key::text, ',' order by key) from barberos.capabilities
    where status = 'available'),
  'client_crm,owned_website', 't_and_they_are_the_ones_that_work');

-- The audit is how we WIN a shop, not something the shop buys. Offering it
-- back to the business it was performed on would be absurd.
select is(
  (select count(*)::int from barberos.capabilities
    where key in ('business_audit','audit','transform_audit')),
  0, 't_the_pre_sale_audit_is_deliberately_not_a_sellable_capability');

-- ===========================================================================
-- A shipped module is waiting on nothing
-- ===========================================================================
select is(
  (select blocked_on from barberos.capabilities where key = 'owned_website'),
  null, 't_the_shipped_module_has_no_blocker');

select throws_ok(
  $$update barberos.capabilities
       set blocked_on = 'something', blocker_owner = 'ceo'
     where key = 'owned_website'$$,
  '23514', null, 't_and_cannot_be_given_one_while_it_is_available');

select throws_ok(
  $$update barberos.capabilities set status = 'available'
     where key = 'marketing_engine'$$,
  '23514', null, 't_nor_can_a_blocked_module_be_marked_shipped');

-- ===========================================================================
-- A blocker always names who can clear it
-- ===========================================================================
select throws_ok(
  $$update barberos.capabilities set blocked_on = 'something', blocker_owner = null
     where key = 'client_crm'$$,
  '23514', null, 't_a_blocker_with_nobody_to_clear_it_is_refused');

select throws_ok(
  $$update barberos.capabilities set blocked_on = null
     where key = 'marketing_engine'$$,
  '23514', null, 't_and_an_owner_with_no_blocker_is_refused_too');

select is(
  (select count(*)::int from barberos.capabilities
    where status = 'planned' and blocked_on is null),
  0, 't_every_planned_module_says_what_it_is_waiting_on');

-- ===========================================================================
-- The split that matters to the CEO
-- ===========================================================================
select ok(
  (select count(*) from barberos.capabilities where blocker_owner = 'ceo') > 0,
  't_some_modules_are_waiting_on_an_account_only_he_can_open');

select ok(
  (select count(*) from barberos.capabilities where blocker_owner = 'engineering') > 0,
  't_and_some_are_waiting_only_on_engineering_time');

-- client_crm's blocker read "nothing but its turn" until 0058 took its turn.
-- A shipped module is waiting on nothing, so both fields are now NULL -- and
-- that transition is the one this whole column exists to make visible.
select is(
  (select blocked_on from barberos.capabilities where key = 'client_crm'),
  null, 't_the_crm_is_shipped_so_it_is_waiting_on_nothing');

select is(
  (select blocker_owner::text from barberos.capabilities where key = 'booking'),
  'engineering', 't_and_booking_still_needs_no_account_from_anybody');

select is(
  (select blocker_owner::text from barberos.capabilities where key = 'missed_call_capture'),
  'ceo', 't_missed_call_capture_cannot_start_without_a_phone_number');

-- ===========================================================================
-- The reputation engine is still ungateable
--
-- 0048 locked the config keys that would let a tenant ask only the happy
-- customers. Renaming the module to the CEO's language must not have loosened
-- that -- review gating is against Google's policies and is review suppression
-- under FTC guidance.
-- ===========================================================================
select is(
  (select name from barberos.capabilities where key = 'review_engine'),
  'Reputation Engine', 't_the_review_module_carries_the_ceos_name_for_it');

select ok(
  (select locked_config_keys from barberos.capabilities where key = 'review_engine')
    @> array['ask_only_if_happy','gate_by_sentiment','min_rating']::text[],
  't_and_still_cannot_be_configured_to_ask_only_the_happy_ones');

-- ===========================================================================
-- Dependencies
-- ===========================================================================
select is(
  (select requires_key::text from barberos.capability_requires
    where capability_key = 'retention_engine'),
  'client_crm', 't_retention_is_measured_against_a_clients_own_history');

select * from finish();
rollback;
