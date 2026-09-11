\ir _fixtures.sql.inc

-- ===========================================================================
-- The proposal — migration 0055.
--
-- A proposal is a PROMISE, and this table is where the promise is kept. Two
-- things are worth testing harder than the rest:
--
--   1. THE HONESTY TRIGGER. capability_match.ts already refuses to offer a
--      deferred module or to call a planned one deliverable today, and it has
--      tests. That holds right up until somebody assembles a document another
--      way. So the same two rules are checked where the document is STORED,
--      and these tests go at them directly rather than through the composer.
--
--   2. SENT IS IMMUTABLE. "What did we offer this shop in September" must have
--      exactly one answer. A sent proposal that could be edited would make the
--      shop's copy and our copy disagree, and you find that out in front of
--      the customer.
-- ===========================================================================
begin;
select plan(36);
select tests.seed();

-- A fixed id, for the reason 54 records: looking the prospect up by name
-- returns NULL once signed in as someone RLS hides it from, and a guard test
-- handed a NULL id proves nothing while appearing to pass.
insert into visibility.prospects (id, tenant_id, business_name, city)
values ('22222222-2222-2222-2222-222222222222'::uuid, tests.uid('tenant_a'),
        'Truth Barbershop', 'West Seneca');
-- A second shop, in the SAME tenant, so the "that run is another shop's"
-- check is tested on its own rather than colliding with the tenant guard.
insert into visibility.prospects (id, tenant_id, business_name, city)
values ('33333333-3333-3333-3333-333333333333'::uuid, tests.uid('tenant_a'),
        'Another Shop', 'Lackawanna');

-- A document shaped the way proposal-doc.ts builds them. Only `offer` is the
-- database's business; the rest is words it stores and does not read.
create or replace function tests.doc(p_offer jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'shop', jsonb_build_object('name','Truth Barbershop'),
    'offer', p_offer);
$$;

-- An audit run belonging to the OTHER shop, so the "that evidence is not this
-- shop's" guard can be tested on a real run rather than a missing one.
insert into transform_audit.campaigns (id, tenant_id, key, name)
values ('77777777-7777-7777-7777-777777777777'::uuid, tests.uid('tenant_a'),
        'wny_barbershops', 'WNY barbershops');
insert into transform_audit.runs (id, tenant_id, campaign_id, prospect_id,
                                  weights, dimensions_possible)
values ('88888888-8888-8888-8888-888888888888'::uuid, tests.uid('tenant_a'),
        '77777777-7777-7777-7777-777777777777'::uuid,
        '33333333-3333-3333-3333-333333333333'::uuid,
        '{"website": 1}'::jsonb, 1);

select tests.login_as(tests.uid('owner_a'));

-- ===========================================================================
-- Before anything exists
-- ===========================================================================
select is(
  transform_audit.proposals_for('22222222-2222-2222-2222-222222222222'::uuid),
  '[]'::jsonb, 't_a_shop_with_no_proposals_says_so_rather_than_erroring');

select is(
  transform_audit.proposal('44444444-4444-4444-4444-444444444444'::uuid),
  null, 't_an_unknown_proposal_is_null_not_an_error');

-- ===========================================================================
-- Rule 1: a deferred capability never appears, in any form
--
-- `payments` is deferred for PCI reasons. Note the offer below does NOT claim
-- it is deliverable today -- it is merely mentioned, as a roadmap line would
-- mention it. That is exactly the case the rule exists for.
-- ===========================================================================
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','payments','deliverable_today',false))))$$,
  '23514', null, 't_a_deferred_module_cannot_be_put_in_a_proposal_at_all');

-- ===========================================================================
-- Rule 2: only what has shipped may be sold as available
-- ===========================================================================
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','missed_call_capture','deliverable_today',true))))$$,
  '23514', null, 't_a_planned_module_cannot_be_offered_as_deliverable_today');

select lives_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','missed_call_capture','deliverable_today',false))))$$,
  't_but_the_same_module_is_fine_when_it_is_labelled_as_roadmap');

-- ===========================================================================
-- Rule 3: the catalog is the vocabulary
-- ===========================================================================
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','ai_hair_oracle','deliverable_today',true))))$$,
  '23503', null, 't_a_proposal_cannot_invent_a_module_the_catalog_never_heard_of');

select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object('deliverable_today',true))))$$,
  '23514', null, 't_an_offer_line_that_names_no_capability_is_refused');

select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      '{"shop":{"name":"x"}}'::jsonb)$$,
  '23514', null, 't_a_document_with_no_offer_at_all_is_not_a_proposal');

-- ===========================================================================
-- The real thing
-- ===========================================================================
create temporary table t_p (id uuid);
insert into t_p
select transform_audit.draft_proposal(
  '22222222-2222-2222-2222-222222222222'::uuid, null,
  tests.doc(jsonb_build_array(
    jsonb_build_object('capability','owned_website','deliverable_today',true),
    jsonb_build_object('capability','missed_call_capture','deliverable_today',false))));

select is(
  (transform_audit.proposal((select id from t_p))->>'status'),
  'draft', 't_a_new_proposal_is_a_draft');

select is(
  (transform_audit.proposal((select id from t_p))->'document'->'offer'
     -> 0 ->> 'capability'),
  'owned_website', 't_and_carries_the_document_it_was_given');

select is(
  (select jsonb_array_length(
     transform_audit.proposals_for('22222222-2222-2222-2222-222222222222'::uuid))),
  2, 't_the_shop_list_shows_both_drafts');

select is(
  (select (e->>'offer_lines')::int
     from jsonb_array_elements(
       transform_audit.proposals_for('22222222-2222-2222-2222-222222222222'::uuid)) e
    where (e->>'id')::uuid = (select id from t_p)),
  2, 't_and_says_how_many_things_each_one_offers');

-- A draft is working material and may be reworked freely.
select lives_ok(
  $$select transform_audit.save_proposal((select id from t_p),
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','owned_website','deliverable_today',true))))$$,
  't_a_draft_can_be_edited');

-- ...but not into something dishonest.
select throws_ok(
  $$select transform_audit.save_proposal((select id from t_p),
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','payments','deliverable_today',false))))$$,
  '23514', null, 't_and_editing_cannot_smuggle_in_a_deferred_module');

-- ===========================================================================
-- Sending
-- ===========================================================================
select throws_ok(
  $$select transform_audit.send_proposal(
      transform_audit.draft_proposal(
        '22222222-2222-2222-2222-222222222222'::uuid, null,
        tests.doc('[]'::jsonb)))$$,
  '23514', null, 't_a_proposal_that_offers_nothing_cannot_be_sent');

select lives_ok(
  $$select transform_audit.send_proposal((select id from t_p))$$,
  't_a_real_proposal_can_be_sent');

select is(
  (transform_audit.proposal((select id from t_p))->>'status'),
  'sent', 't_and_is_then_sent');

select isnt(
  (transform_audit.proposal((select id from t_p))->>'sent_at'),
  null, 't_with_the_moment_it_went_out_recorded');

select is(
  (select sent_by from transform_audit.proposals where id = (select id from t_p)),
  tests.uid('owner_a'), 't_and_the_person_who_sent_it');

select throws_ok(
  $$select transform_audit.send_proposal((select id from t_p))$$,
  '23514', null, 't_it_cannot_be_sent_twice');

-- The whole reason the snapshot exists.
select throws_ok(
  $$select transform_audit.save_proposal((select id from t_p),
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','owned_website','deliverable_today',true))))$$,
  '23514', null, 't_a_sent_proposal_cannot_be_edited');

-- And not by going around the function either. This statement runs as the
-- session superuser -- the local shim's session user, and the shape of any
-- future fix-up script -- so it is the trigger that has to refuse it, not a
-- missing grant.
select tests.logout();
select throws_ok(
  $$update transform_audit.proposals
       set document = '{"offer":[]}'::jsonb
     where id = (select id from t_p)$$,
  '23514', null, 't_nor_by_updating_the_table_directly');

select throws_ok(
  $$update transform_audit.proposals set status = 'draft'
     where id = (select id from t_p)$$,
  '23514', null, 't_and_it_cannot_be_walked_back_to_a_draft');

-- ===========================================================================
-- The outcome
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));

select throws_ok(
  $$select transform_audit.decide_proposal((select id from t_p), 'maybe')$$,
  '23514', null, 't_an_outcome_must_be_one_of_the_three_real_ones');

select lives_ok(
  $$select transform_audit.decide_proposal((select id from t_p), 'accepted',
      'Signed on the call.')$$,
  't_an_outcome_can_be_recorded');

select is(
  (transform_audit.proposal((select id from t_p))->>'status'),
  'accepted', 't_and_the_proposal_says_so');

select is(
  (select decided_by from transform_audit.proposals where id = (select id from t_p)),
  tests.uid('owner_a'), 't_with_the_person_who_heard_it');

-- ===========================================================================
-- Who may do this
--
-- `manager` deliberately does NOT get proposal.manage. Recording what a shop
-- said on a call and putting a number in front of that shop are different
-- acts, and the second commits the business.
-- ===========================================================================
select tests.login_as(tests.uid('manager_a'));
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid, null,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','owned_website','deliverable_today',true))))$$,
  '42501', null, 't_a_manager_can_record_a_call_but_cannot_draft_a_proposal');

select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$select transform_audit.send_proposal((select id from t_p))$$,
  '42501', null, 't_nor_can_a_viewer_send_one');

select tests.login_as(tests.uid('owner_b'));
select is(
  (select count(*)::int from transform_audit.proposals),
  0, 't_another_tenant_cannot_see_this_shops_proposals');

select throws_ok(
  $$select transform_audit.proposal((select id from t_p))$$,
  '42501', null, 't_nor_read_one_by_id');

select throws_ok(
  $$select transform_audit.decide_proposal((select id from t_p), 'declined')$$,
  '42501', null, 't_nor_record_an_outcome_on_it');

-- ===========================================================================
-- Evidence belongs to the shop it is about
-- ===========================================================================
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','owned_website','deliverable_today',true))))$$,
  'P0002', null, 't_a_proposal_cannot_cite_an_audit_run_that_does_not_exist');

-- The one that matters: a REAL run, in the same tenant, about a different
-- shop. A proposal citing it would be a document full of somebody else's
-- evidence, and nothing but this check stands between the two.
select throws_ok(
  $$select transform_audit.draft_proposal(
      '22222222-2222-2222-2222-222222222222'::uuid,
      '88888888-8888-8888-8888-888888888888'::uuid,
      tests.doc(jsonb_build_array(jsonb_build_object(
        'capability','owned_website','deliverable_today',true))))$$,
  '23514', null, 't_nor_cite_an_audit_that_is_about_another_shop');

select throws_ok(
  $$select transform_audit.draft_proposal(
      '66666666-6666-6666-6666-666666666666'::uuid, null,
      tests.doc('[]'::jsonb))$$,
  'P0002', null, 't_nor_be_drafted_against_a_shop_that_does_not_exist');

-- --- search_path pinning ----------------------------------------------------
select tests.logout();
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'transform_audit'
      and p.proname in ('draft_proposal','save_proposal','send_proposal',
                        'decide_proposal','proposal','proposals_for',
                        'enforce_proposal_honesty','enforce_proposal_lifecycle')
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_new_function_pins_its_search_path');

select * from finish();
rollback;
