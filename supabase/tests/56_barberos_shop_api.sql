\ir _fixtures.sql.inc

-- ===========================================================================
-- The BarberOS shop API — migration 0056.
--
-- Until this migration BarberOS had a capability spine, a real module and a
-- page on the internet, and NO WAY FOR A SHOP TO TOUCH ANY OF IT: PostgREST
-- exposes only `public`, and every write function lives in `barberos`.
--
-- These wrappers are the door. The thing worth testing hardest is that a door
-- is all they are:
--
--   * THE WRAPPERS ADD REACH, NOT AUTHORITY. Every permission check that
--     applied inside the database still applies through the wrapper, and the
--     capability gate still applies too.
--   * ANON GAINS NOTHING. 0053's two functions remain the only things an
--     unauthenticated stranger may call in this platform.
--   * `barberos_my_shops` SHOWS YOU ONLY YOUR OWN SHOPS, and tells the truth
--     about what you personally may do -- because the app draws its buttons
--     from that answer, and a button that cannot work is worse than none.
-- ===========================================================================
begin;
select plan(33);
select tests.seed();

-- Two shops in two different tenants. tenant_a's is the one under test;
-- tenant_b's exists so "only your own" means something.
-- Configuring a shop is itself permission-checked, so the fixtures are created
-- by each tenant's own owner rather than by the superuser the test session
-- starts as -- which is also a small proof that the setup path is guarded.
select tests.login_as(tests.uid('owner_b'));
select barberos.upsert_shop(tests.uid('tenant_b'), 'Someone Else Cuts', 1);

select tests.login_as(tests.uid('owner_a'));
select barberos.upsert_shop(tests.uid('tenant_a'), 'Truth Barbershop', 3);
select barberos.enable_capability(tests.uid('tenant_a'), 'owned_website');

-- ===========================================================================
-- The entry point
-- ===========================================================================
select is(
  (select jsonb_array_length(public.barberos_my_shops())),
  1, 't_an_owner_sees_exactly_their_own_shop');

select is(
  (public.barberos_my_shops() -> 0 ->> 'shop_name'),
  'Truth Barbershop', 't_with_its_name');

select is(
  (public.barberos_my_shops() -> 0 -> 'capabilities' ->> 0),
  'owned_website', 't_and_the_capability_that_is_actually_switched_on');

select is(
  (public.barberos_my_shops() -> 0 -> 'can' ->> 'edit_page')::boolean,
  true, 't_an_owner_is_told_they_may_edit_the_page');

select is(
  (public.barberos_my_shops() -> 0 -> 'can' ->> 'publish')::boolean,
  true, 't_and_publish_it');

select is(
  jsonb_typeof(public.barberos_my_shops() -> 0 -> 'site'),
  'null', 't_a_shop_with_no_page_yet_says_so_rather_than_inventing_one');

-- ===========================================================================
-- The page, through the door
-- ===========================================================================
select lives_ok(
  $$select public.barberos_save_site(tests.uid('tenant_a'), 'truth-barbershop',
      'Sharp cuts since 1998', null, '716-939-3443', '2401 Seneca St')$$,
  't_an_owner_can_create_their_page_over_the_api');

select is(
  (public.barberos_site(tests.uid('tenant_a')) ->> 'headline'),
  'Sharp cuts since 1998', 't_and_read_it_back');

select is(
  (public.barberos_site(tests.uid('tenant_a')) ->> 'status'),
  'draft', 't_a_new_page_is_a_draft_and_not_on_the_internet');

select lives_ok(
  $$select public.barberos_set_hours(tests.uid('tenant_a'), 2::smallint, false,
      '09:00'::time, '18:00'::time)$$,
  't_hours_can_be_set');

select is(
  (select count(*)::int from jsonb_array_elements(
     public.barberos_site(tests.uid('tenant_a')) -> 'hours')),
  1, 't_and_come_back_on_the_page');

select lives_ok(
  $$select public.barberos_save_service(tests.uid('tenant_a'), 'Skin fade', 3500, 45)$$,
  't_a_service_can_be_priced');

select is(
  (public.barberos_site(tests.uid('tenant_a')) -> 'services' -> 0 ->> 'price_cents'),
  '3500', 't_at_the_price_that_was_set');

-- The operation that did not exist before this migration. A price list you can
-- only add to is a broken editor.
select is(
  public.barberos_delete_service(tests.uid('tenant_a'), 'Skin fade'),
  true, 't_a_service_can_be_removed_again');

select is(
  (select jsonb_array_length(
     public.barberos_site(tests.uid('tenant_a')) -> 'services')),
  0, 't_and_is_then_gone_from_the_page');

select is(
  public.barberos_delete_service(tests.uid('tenant_a'), 'Never existed'),
  false, 't_removing_something_that_was_not_there_reports_that_honestly');

select lives_ok(
  $$select public.barberos_set_link(tests.uid('tenant_a'), 'instagram',
      'https://instagram.com/truthbarbershop')$$,
  't_a_link_can_be_set');

select throws_ok(
  $$select public.barberos_set_link(tests.uid('tenant_a'), 'myspace', 'https://x.test')$$,
  '22P02', null, 't_but_not_a_kind_the_renderer_cannot_label');

select lives_ok(
  $$select public.barberos_set_link(tests.uid('tenant_a'), 'instagram', null)$$,
  't_and_a_link_can_be_taken_down');

-- ===========================================================================
-- Publishing
--
-- The gate that decides whether a page is fit to be seen is a trigger, and it
-- has to keep speaking through the API -- its message is the only thing that
-- can tell a barber WHY their page will not go out.
-- ===========================================================================
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$select public.barberos_publish(tests.uid('tenant_b'))$$,
  'P0002', null, 't_a_shop_with_no_page_at_all_is_told_so');
select tests.login_as(tests.uid('owner_a'));

select is(
  public.barberos_publish(tests.uid('tenant_a')),
  'published', 't_the_page_can_be_put_on_the_internet');

select is(
  (public.barberos_my_shops() -> 0 -> 'site' ->> 'status'),
  'published', 't_and_the_first_screen_knows_it');

select is(
  public.barberos_unpublish(tests.uid('tenant_a')),
  'unpublished', 't_and_taken_back_off');

-- ===========================================================================
-- THE WRAPPERS ADD REACH, NOT AUTHORITY
--
-- `staff` has barberos.shop.read and nothing else. Every check that applied
-- inside the database must still apply through the door.
-- ===========================================================================
select tests.login_as(tests.uid('staff_a'));

select is(
  (public.barberos_my_shops() -> 0 -> 'can' ->> 'edit_page')::boolean,
  false, 't_staff_are_told_plainly_they_may_not_edit');

select throws_ok(
  $$select public.barberos_save_site(tests.uid('tenant_a'), 'truth-barbershop', 'Mine now')$$,
  '42501', null, 't_and_the_api_refuses_them_exactly_as_the_database_would');

select throws_ok(
  $$select public.barberos_delete_service(tests.uid('tenant_a'), 'Skin fade')$$,
  '42501', null, 't_including_the_new_delete');

select throws_ok(
  $$select public.barberos_publish(tests.uid('tenant_a'))$$,
  '42501', null, 't_and_publishing');

-- Another tenant's owner: not a member here at all.
select tests.login_as(tests.uid('owner_b'));

select is(
  (public.barberos_my_shops() -> 0 ->> 'shop_name'),
  'Someone Else Cuts', 't_another_tenants_owner_sees_only_their_own_shop');

select throws_ok(
  $$select public.barberos_site(tests.uid('tenant_a'))$$,
  '42501', null, 't_and_cannot_read_this_shops_page');

-- ===========================================================================
-- The door is exactly this wide
-- ===========================================================================
select tests.logout();

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_%'
      and has_function_privilege('anon', p.oid, 'execute')),
  2, 't_anon_still_reaches_exactly_the_two_public_page_functions_from_0053');

select ok(
  not has_function_privilege('anon',
    'public.barberos_my_shops()', 'execute'),
  't_and_none_of_the_shops_own_api');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'barberos\_%'
      and p.prosecdef
      and p.proname not in ('barberos_published_site','barberos_published_sitemap')),
  0, 't_no_wrapper_added_here_carries_privilege_of_its_own');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname like 'barberos\_%')
        or (n.nspname = 'barberos' and p.proname = 'delete_site_service'))
      and not coalesce(p.proconfig::text like '%search_path%', false)),
  0, 't_every_function_on_this_path_pins_its_search_path');

select * from finish();
rollback;
