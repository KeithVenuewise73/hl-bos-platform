\ir _fixtures.sql.inc

-- Coverage for v0_visibility_assessments: the prospect -> assessment -> score ->
-- Business Growth Score workflow, permission gates, honest scoring (no empty
-- completion), prospect advancement, and tenant isolation.
begin;
select plan(11);
select tests.seed();

-- the 16 category catalog is seeded by the migration
select is((select count(*)::int from visibility.assessment_categories), 16, 't_categories_seeded');

-- an agency member creates a prospect
select tests.login_as(tests.uid('owner_a'));
select ok(visibility.create_prospect(tests.uid('tenant_a'), 'Maria Salon', 'Maria', 'maria@example.test') is not null,
  't_owner_creates_prospect');
select tests.logout();

-- a viewer cannot
select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select visibility.create_prospect(tests.uid('tenant_a'), 'Nope') $$,
  '42501', null, 't_viewer_cannot_create_prospect');
select tests.logout();

-- start an assessment on the prospect
select tests.login_as(tests.uid('owner_a'));
select ok(visibility.start_assessment(
  (select id from visibility.prospects where business_name = 'Maria Salon' and tenant_id = tests.uid('tenant_a'))
) is not null, 't_start_assessment');

-- cannot complete an assessment that has no scored categories (honest scoring)
select throws_ok($$ select visibility.complete_assessment(
  (select a.id from visibility.assessments a
   join visibility.prospects p on p.id = a.prospect_id
   where p.business_name = 'Maria Salon' and a.tenant_id = tests.uid('tenant_a') limit 1)) $$,
  null, null, 't_cannot_complete_empty');

-- score every category = 3
select lives_ok($$
  select visibility.score_category(
    (select a.id from visibility.assessments a
     join visibility.prospects p on p.id = a.prospect_id
     where p.business_name = 'Maria Salon' and a.tenant_id = tests.uid('tenant_a') limit 1),
    c.key, 3)
  from visibility.assessment_categories c
$$, 't_score_all_categories');

-- completing yields a Business Growth Score of 60 (mean 3 of 5 -> 60/100)
select is(visibility.complete_assessment(
  (select a.id from visibility.assessments a
   join visibility.prospects p on p.id = a.prospect_id
   where p.business_name = 'Maria Salon' and a.tenant_id = tests.uid('tenant_a') limit 1)), 60,
  't_growth_score_60');

-- the score persists on the record (baseline for monthly reporting)
select is((select growth_score from visibility.assessments a
           join visibility.prospects p on p.id = a.prospect_id
           where p.business_name = 'Maria Salon' and a.tenant_id = tests.uid('tenant_a') limit 1), 60,
  't_score_persisted');

-- completing advances the prospect stage
select is((select stage::text from visibility.prospects
           where business_name = 'Maria Salon' and tenant_id = tests.uid('tenant_a')), 'assessed',
  't_prospect_advanced');

-- recommendations attach to the assessment
select ok(visibility.add_recommendation(
  (select a.id from visibility.assessments a
   join visibility.prospects p on p.id = a.prospect_id
   where p.business_name = 'Maria Salon' and a.tenant_id = tests.uid('tenant_a') limit 1),
  'quick_win', 'Claim & optimize Google Business Profile') is not null, 't_add_recommendation');
select tests.logout();

-- tenant isolation: another agency tenant cannot see these prospects
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from visibility.prospects where tenant_id = tests.uid('tenant_a')), 0,
  't_tenant_isolation_prospects');
select tests.logout();

select * from finish();
rollback;
