\ir _fixtures.sql.inc

-- Coverage for hlbos_0043 and the generated hlbos_0044.
--
-- The claim here is that a capability is never asserted without evidence, that
-- extraction cannot pretend to be a measurement, and -- the case that would
-- most embarrass us in front of the CEO -- that a web framework is not
-- labelled a logistics product because its description says "routing".
begin;
select plan(17);
select tests.seed();

select has_table('vstudio', 'capabilities', 'the capability vocabulary is stored');
select has_table('vstudio', 'opportunity_capabilities', 'capabilities attach to repositories');
select has_table('vstudio', 'opportunity_reusable_assets', 'reusable parts are recorded separately');
select has_function('vstudio', 'extract_capabilities', array['text'], 'extraction is a named control');

-- The vocabulary must match @hl-bos/catalog. If these diverge the intelligence
-- bridge silently stops joining, which is worse than failing loudly.
select is(
  (select count(*)::int from vstudio.capabilities
    where domain not in ('platform','identity','operations','automation','ai',
      'communications','marketing','analytics','commerce','discovery','factory',
      'intelligence','transportation')),
  0,
  'every capability uses a domain the HLG catalog already knows');

-- --- Extraction is an inference and cannot claim otherwise --------------------
create temp table t_cap (like vstudio.opportunity_capabilities including all) on commit drop;
select throws_ok(
  $$insert into t_cap (opportunity_id, capability_slug, evidence_kind, confidence, confidence_status)
    values (gen_random_uuid(), 'route-optimization', 'description', 90, 'measured')$$,
  '23514', null,
  'a capability can never be labelled measured -- it is read, not counted');
select throws_ok(
  $$insert into t_cap (opportunity_id, capability_slug, evidence_kind, confidence)
    values (gen_random_uuid(), 'route-optimization', 'vibes', 90)$$,
  '23514', null,
  'evidence must come from a known artifact, not an unnamed one');

-- --- Real extraction over real rows -------------------------------------------
insert into vstudio.opportunities
  (tenant_id, title, summary, source_type, category, repository_url, topics, license, language)
values
  (tests.uid('tenant_a'), 'googlemaps/js-route-optimization-app',
   'Route optimization application for planning multi-stop vehicle routing with fleet capacity constraints.',
   'github', 'logistics', 'https://github.com/googlemaps/js-route-optimization-app',
   array['routing','fleet','logistics'], 'Apache-2.0', 'TypeScript'),
  (tests.uid('tenant_a'), 'remix-run/react-router',
   'Declarative routing for React applications.',
   'github', 'web-frameworks', 'https://github.com/remix-run/react-router',
   array['react','routing','frontend'], 'MIT', 'TypeScript'),
  (tests.uid('tenant_a'), 'someone/untitled-project', '',
   'github', 'misc', 'https://github.com/someone/untitled-project',
   array[]::text[], null, null),
  (tests.uid('tenant_a'), 'acme/agpl-router',
   'Route optimization engine with a google maps integration.',
   'github', 'logistics', 'https://github.com/acme/agpl-router',
   array['routing','logistics','fleet'], 'AGPL-3.0', 'Python');

select lives_ok(
  $$select vstudio.extract_capabilities(c.category) from vstudio.extract_capability_categories() c$$,
  'extraction runs across every category partition');

select is(
  (select oc.capability_slug from vstudio.opportunity_capabilities oc
    join vstudio.opportunities o on o.id = oc.opportunity_id
   where o.title = 'googlemaps/js-route-optimization-app' and oc.is_primary),
  'route-optimization',
  'a routing project is read as route optimization');
select is(
  (select oc.evidence_kind from vstudio.opportunity_capabilities oc
    join vstudio.opportunities o on o.id = oc.opportunity_id
   where o.title = 'googlemaps/js-route-optimization-app' and oc.is_primary),
  'description',
  'and the claim names the artifact it was read from');

-- The single most important negative case in this file.
select is(
  (select count(*)::int from vstudio.opportunity_capabilities oc
    join vstudio.opportunities o on o.id = oc.opportunity_id
   where o.title = 'remix-run/react-router' and oc.capability_slug = 'route-optimization'),
  0,
  'a web framework is NOT called a logistics product because it says routing');

select is(
  (select count(*)::int from vstudio.opportunity_capabilities oc
    join vstudio.opportunities o on o.id = oc.opportunity_id
   where o.title = 'someone/untitled-project'),
  0,
  'a repository with no evidence gets no capability rather than a guess');

select ok(
  (select bool_and(oc.confidence between 0 and 100) from vstudio.opportunity_capabilities oc),
  'every confidence stays inside its declared range');
select ok(
  (select bool_and(oc.evidence_excerpt <> '') from vstudio.opportunity_capabilities oc),
  'every stored claim carries the text that justified it');
select ok(
  (select bool_and(c = 1) from (
     select count(*) filter (where is_primary) as c
     from vstudio.opportunity_capabilities group by opportunity_id) x),
  'each repository has exactly one primary capability');

-- --- Licensing travels with the asset -----------------------------------------
select is(
  (select distinct a.licence_permits_commercial from vstudio.opportunity_reusable_assets a
    join vstudio.opportunities o on o.id = a.opportunity_id
   where o.title = 'acme/agpl-router'),
  false,
  'a copyleft licence is recorded as not permitting commercial reuse');
select is(
  (select count(*)::int from vstudio.opportunity_reusable_assets a
    join vstudio.opportunities o on o.id = a.opportunity_id
   where o.title = 'someone/untitled-project'),
  0,
  'no assets are invented for a project that describes none');

select * from finish();
rollback;
