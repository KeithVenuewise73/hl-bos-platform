\ir _fixtures.sql.inc

-- ===========================================================================
-- The public read path — migration 0053.
--
-- This is the first thing in the platform an unauthenticated stranger can
-- call, so the tests are mostly about what that stranger CANNOT do:
--
--   * cannot read a draft, or learn that one exists
--   * cannot read an unpublished page, or tell that apart from a wrong slug
--   * cannot learn a tenant_id
--   * cannot reach the tables, or any write path, through the same door
--
-- Every assertion below runs as the `anon` ROLE, not merely logged out. Run as
-- the owner these would pass on the owner's own privileges and prove nothing.
-- ===========================================================================
begin;
select plan(24);
select tests.seed();

-- --- A real published page, and a real draft, built through the real paths ---
select tests.login_as(tests.uid('owner_a'));
select barberos.upsert_shop(tests.uid('tenant_a'), 'Elmwood Barber Co.', 2);
select barberos.enable_capability(tests.uid('tenant_a'), 'owned_website');
select barberos.upsert_site(tests.uid('tenant_a'), 'elmwood-barber-co',
  'Traditional cuts on Elmwood', null, '716-555-0100', '742 Elmwood Ave',
  'Buffalo', 'NY', '14222');
select barberos.set_site_hours(tests.uid('tenant_a'), 1::smallint, false, '09:00', '19:00');
select barberos.upsert_site_service(tests.uid('tenant_a'), 'Haircut', 3500, 30, 1);
select barberos.upsert_site_service(tests.uid('tenant_a'), 'Hot towel shave', null, 45, 2);
select barberos.publish_site(tests.uid('tenant_a'));

-- tenant_b gets a page that is never published. It exists; it must stay unseen.
select tests.login_as(tests.uid('owner_b'));
select barberos.upsert_shop(tests.uid('tenant_b'), '88 South Barbershop', 1);
select barberos.enable_capability(tests.uid('tenant_b'), 'owned_website');
select barberos.upsert_site(tests.uid('tenant_b'), '88-south-barbershop');

-- ===========================================================================
-- From here down: a stranger.
-- ===========================================================================
select tests.logout();
select tests.login_as_anon();

select is(
  public.barberos_published_site('elmwood-barber-co')->>'shop_name',
  'Elmwood Barber Co.', 't_a_stranger_can_read_a_published_page');
select is(
  public.barberos_published_site('elmwood-barber-co')->>'headline',
  'Traditional cuts on Elmwood', 't_and_gets_the_shops_own_words');
select is(
  jsonb_array_length(public.barberos_published_site('elmwood-barber-co')->'hours'),
  1, 't_and_only_the_days_the_shop_stated');
select is(
  jsonb_array_length(public.barberos_published_site('elmwood-barber-co')->'services'),
  2, 't_and_the_services');
select is(
  (select v->>'price_cents'
     from jsonb_array_elements(public.barberos_published_site('elmwood-barber-co')->'services') v
    where v->>'name' = 'Hot towel shave'),
  null, 't_and_an_ungiven_price_is_still_null_in_public');

-- --- What the payload must NOT carry ---------------------------------------
select ok(
  not (public.barberos_published_site('elmwood-barber-co') ? 'tenant_id'),
  't_the_public_payload_carries_no_tenant_id');
select ok(
  not (public.barberos_published_site('elmwood-barber-co') ? 'published_by'),
  't_nor_who_published_it');
select ok(
  not (public.barberos_published_site('elmwood-barber-co') ? 'updated_at'),
  't_nor_when_it_was_last_edited');

-- --- Absence and privacy look identical ------------------------------------
select is(public.barberos_published_site('88-south-barbershop'), null,
  't_a_draft_is_invisible');
select is(public.barberos_published_site('no-such-shop-at-all'), null,
  't_and_so_is_a_slug_nobody_has_used');
select is(
  (public.barberos_published_site('88-south-barbershop') is not distinct from
   public.barberos_published_site('no-such-shop-at-all')),
  true, 't_the_two_are_indistinguishable_so_a_draft_cannot_be_probed_for');

-- --- Unpublishing takes it back off the internet ----------------------------
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select barberos.unpublish_site(tests.uid('tenant_a'));
select tests.logout();
select tests.login_as_anon();
select is(public.barberos_published_site('elmwood-barber-co'), null,
  't_unpublishing_actually_removes_it_from_the_public_read');

select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select barberos.publish_site(tests.uid('tenant_a'));
select tests.logout();
select tests.login_as_anon();
select ok(public.barberos_published_site('elmwood-barber-co') is not null,
  't_and_republishing_puts_it_back');

-- ===========================================================================
-- The sitemap
-- ===========================================================================
select is(jsonb_array_length(public.barberos_published_sitemap()), 1,
  't_the_sitemap_lists_the_one_published_page');
select is(public.barberos_published_sitemap()->0->>'slug', 'elmwood-barber-co',
  't_by_slug');
select ok(
  not exists (select 1 from jsonb_array_elements(public.barberos_published_sitemap()) v
               where v->>'slug' = '88-south-barbershop'),
  't_and_never_the_draft');

-- ===========================================================================
-- The door is exactly two functions wide
--
-- The wrappers are SECURITY DEFINER precisely so that `anon` needs no reach
-- into schema `barberos`. That trade is only worth anything if the reach is
-- actually absent, so it is asserted rather than assumed.
-- ===========================================================================
select is(
  has_schema_privilege('anon', 'barberos', 'usage'),
  false, 't_anon_has_no_usage_on_the_barberos_schema_at_all');
select throws_ok(
  $$select barberos.published_site('elmwood-barber-co')$$,
  '42501', null, 't_so_even_the_public_read_is_unreachable_by_its_real_name');

-- Neither wrapper can write, at any depth: SQL-language, STABLE, and STABLE is
-- enforced by the planner, not by intent.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.provolatile <> 's'
      and p.proname in ('barberos_published_site','barberos_published_sitemap')),
  0, 't_neither_wrapper_is_volatile_so_neither_can_write');

-- ===========================================================================
-- The same door does not open anything else
-- ===========================================================================
select throws_ok(
  $$select count(*) from barberos.sites$$,
  '42501', null, 't_a_stranger_still_cannot_read_the_table_itself');
select throws_ok(
  format($$select barberos.site_content(%L::uuid)$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_call_the_owners_read_function');
select throws_ok(
  format($$select barberos.upsert_site(%L::uuid, 'hijacked')$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_edit_anything');
select throws_ok(
  format($$select barberos.publish_site(%L::uuid)$$, tests.uid('tenant_a')),
  '42501', null, 't_nor_publish_anything');

-- --- search_path pinning, including the two new functions -------------------
select tests.logout();
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('barberos','public')
      and p.proname in ('published_site','published_sitemap',
                        'barberos_published_site','barberos_published_sitemap')
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_new_function_pins_its_search_path');

select * from finish();
rollback;
