\ir _fixtures.sql.inc

-- ===========================================================================
-- HLG SiteGen core (migration 0060)
--
--   1. Locked down: RLS forced + a policy on every table; no anon access; no
--      client can write a table; internal functions are not callable.
--   2. Tenant isolation: another tenant sees, edits, publishes and uploads
--      nothing of a site that is not theirs.
--   3. Plan limits and edit scopes are DATA, enforced in the database against
--      the base version: a Free-style client can change theme, business info
--      and the hero graphic and nothing else.
--   4. Theme values are validated (font allowlist, #rrggbb, real logo only).
--   5. Versions are immutable; going live happens only through publish().
--   6. Suspension, suspended tenants, rollback by publishing an older version.
--   7. The public read returns a site only when it is live and operable.
--   8. Claims must carry a source; no tier name appears in function bodies.
-- ===========================================================================
begin;
select no_plan();
select tests.seed();

-- A valid barber spec; overrides merge at the top level.
create or replace function tests.sg_spec(
  p_color text default '#112233', p_phone text default '+17165550100',
  p_pages integer default 1, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'specVersion', 1, 'vertical', 'barber',
    'theme', jsonb_build_object('brandColor', p_color, 'accentColor', '#c8a24a',
                                'fontHeading', 'serif_classic', 'fontBody', 'sans_clean'),
    'profile', jsonb_build_object('businessName', 'Test Barbers', 'phone', p_phone,
                 'services', jsonb_build_array(jsonb_build_object('name', 'Haircut', 'priceCents', 3000)),
                 'hours', '[]'::jsonb),
    'hero', jsonb_build_object('headline', 'Fresh cuts', 'subheadline', '',
                               'choice', jsonb_build_object('kind', 'default')),
    'pages', (select jsonb_agg(jsonb_build_object('slug', 'p' || g, 'title', 'Page ' || g, 'sections', '[]'::jsonb))
                from generate_series(1, p_pages) g),
    'seo', jsonb_build_object('title', 'Test Barbers', 'description', 'A barber shop')
  ) || p_extra;
$$;
grant execute on function tests.sg_spec(text, text, integer, jsonb) to public;

-- tenant A is on the free plan; tenant B has no plan at all
insert into billing.subscriptions (tenant_id, plan_key, provider_key, status)
values (tests.uid('tenant_a'), 'sitegen_free', 'manual', 'active');
select billing.reconcile_entitlements(tests.uid('tenant_a'));

-- --- 1. Locked down ---------------------------------------------------------
select is((select count(*)::int from pg_class c where c.relnamespace = 'sitegen'::regnamespace
             and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 't_rls_forced_on_every_sitegen_table');
select is((select count(*)::int from pg_class c where c.relnamespace = 'sitegen'::regnamespace
             and c.relkind = 'r'
             and not exists (select 1 from pg_policies p where p.schemaname = 'sitegen' and p.tablename = c.relname)),
  0, 't_every_table_has_a_policy_so_no_new_advisor_finding');
select is((select count(*)::int from pg_class c where c.relnamespace = 'sitegen'::regnamespace
             and c.relkind = 'r'
             and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert'))),
  0, 't_anon_has_no_table_access');
select is((select count(*)::int from pg_class c where c.relnamespace = 'sitegen'::regnamespace
             and c.relkind = 'r'
             and (has_table_privilege('authenticated', c.oid, 'insert')
               or has_table_privilege('authenticated', c.oid, 'update')
               or has_table_privilege('authenticated', c.oid, 'delete'))),
  0, 't_no_client_can_write_any_table');
select is((select count(*)::int from pg_class c where c.relnamespace = 'sitegen'::regnamespace
             and c.relkind = 'r'
             and (has_table_privilege('service_role', c.oid, 'select') or has_table_privilege('service_role', c.oid, 'insert'))),
  0, 't_service_role_holds_no_table_privilege');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'sitegen'::regnamespace
             and p.prosecdef and not coalesce(p.proconfig::text like '%search_path=%', false)),
  0, 't_every_definer_function_pins_search_path');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'sitegen'::regnamespace
             and (has_function_privilege('anon', p.oid, 'execute'))),
  0, 't_anon_runs_no_sitegen_function');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'sitegen'::regnamespace
             and p.proname in ('limit_for','consume','assert_spec','assert_theme','assert_profile',
                               'assert_claims','assert_hero_choice')
             and has_function_privilege('authenticated', p.oid, 'execute')),
  0, 't_internal_functions_are_not_callable_by_clients');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'sitegen'::regnamespace
             and p.proname = 'published_site'
             and has_function_privilege('service_role', p.oid, 'execute')
             and not has_function_privilege('authenticated', p.oid, 'execute')),
  1, 't_only_service_role_can_read_a_published_site');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'sitegen'::regnamespace
             and p.prosrc ~* '(sitegen_free|sitegen_managed|''free''|''assisted''|''custom_build'')'),
  0, 't_no_tier_name_in_any_function_body');

-- --- catalogs ---------------------------------------------------------------
select is((select count(*)::int from sitegen.verticals where key = 'barber' and schema_org_type = 'HairSalon'),
  1, 't_barber_vertical_is_data');
select is((select count(*)::int from sitegen.theme_fonts), 5, 't_five_allowed_fonts');
select ok(exists (select 1 from sitegen.reserved_slugs where slug = 'www'), 't_www_is_reserved');
select is((select count(*)::int from sitegen.library_assets), 0,
  't_hero_library_is_empty_until_curated_not_invented');
select is((select count(*)::int from entitlements.tenant_entitlements
            where tenant_id = tests.uid('tenant_a') and feature_key like 'sitegen.%'), 3,
  't_free_plan_grants_exactly_theme_profile_hero');
select is(sitegen.limit_for(tests.uid('tenant_a'), 'sitegen.max_sites'), 1, 't_limit_comes_from_the_plan_data');
select is(sitegen.limit_for(tests.uid('tenant_b'), 'sitegen.max_sites'), 0, 't_no_plan_means_limit_zero');

-- --- 2/3. Create a site -----------------------------------------------------
select tests.login_as_anon();
select throws_ok($$ select count(*) from sitegen.sites $$, '42501', null, 't_anon_cannot_read_sites');
select tests.logout();

select tests.login_as(tests.uid('viewer_a'));
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'viewer-try', 'X', tests.sg_spec()) $$,
  '42501', null, 't_viewer_cannot_create_a_site');
select tests.logout();

select tests.login_as(tests.uid('owner_b'));
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'b-into-a', 'X', tests.sg_spec()) $$,
  '42501', null, 't_other_tenant_cannot_create_in_my_tenant');
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_b'), 'barber', 'b-noplan', 'X', tests.sg_spec()) $$,
  '53400', null, 't_a_tenant_with_no_plan_cannot_create_a_site');
select tests.logout();

select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'www', 'X', tests.sg_spec()) $$,
  '23514', null, 't_reserved_address_refused');
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'Bad_Slug!', 'X', tests.sg_spec()) $$,
  '23514', null, 't_malformed_address_refused');
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'bad-color', 'X', tests.sg_spec('red')) $$,
  '23514', null, 't_theme_color_must_be_hex');
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'nosuch', 'no-vertical', 'X', tests.sg_spec()) $$,
  'P0002', null, 't_unknown_vertical_refused');
select lives_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'barber-a', 'Barber A', tests.sg_spec()) $$,
  't_owner_creates_the_first_site');
select throws_ok($$ select sitegen.create_site(tests.uid('tenant_a'), 'barber', 'barber-a2', 'Barber A2', tests.sg_spec()) $$,
  '53400', null, 't_second_site_blocked_by_plan_limit');
select is((select count(*)::int from sitegen.sites), 1, 't_owner_sees_their_site');
select is((select count(*)::int from sitegen.site_versions), 1, 't_first_version_exists');
select tests.logout();
select set_config('t.site_a', (select id::text from sitegen.sites where slug = 'barber-a'), true);

-- platform staff create a site for tenant B (no plan limit applies to staff)
select tests.login_as(tests.uid('padmin'));
select lives_ok($$ select sitegen.create_site(tests.uid('tenant_b'), 'barber', 'barber-b', 'Barber B', tests.sg_spec('#334455')) $$,
  't_staff_creates_a_site_for_a_client');
select tests.logout();
select set_config('t.site_b', (select id::text from sitegen.sites where slug = 'barber-b'), true);
select is((select origin::text from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid),
  'staff', 't_staff_version_is_labelled_staff');

-- --- tenant isolation -------------------------------------------------------
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from sitegen.sites), 1, 't_tenant_b_sees_only_its_own_site');
select is((select count(*)::int from sitegen.sites where id = current_setting('t.site_a')::uuid), 0,
  't_tenant_b_cannot_see_tenant_a_site');
select is((select count(*)::int from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid), 0,
  't_tenant_b_cannot_see_tenant_a_versions');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions limit 1), tests.sg_spec('#445566')) $$,
  null, null, 't_tenant_b_cannot_edit_tenant_a_site');
select throws_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid, gen_random_uuid()) $$,
  '42501', null, 't_tenant_b_cannot_publish_tenant_a_site');
select throws_ok($$ select sitegen.register_asset(current_setting('t.site_a')::uuid, 'logo', 'l.png', 'image/png', 1000) $$,
  '42501', null, 't_tenant_b_cannot_upload_to_tenant_a_site');
select tests.logout();

-- --- 3. Edit scopes (free-style entitlements) --------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid, gen_random_uuid(),
    tests.sg_spec('#445566')) $$, '40001', null, 't_stale_base_version_refused');

select lives_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566')) $$, 't_can_change_theme');
select lives_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199')) $$, 't_can_change_business_info');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 1,
      '{"pages":[{"slug":"p1","title":"Changed","sections":[]}]}')) $$,
  '42501', null, 't_cannot_change_page_content_without_the_entitlement');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 1,
      '{"hero":{"headline":"New headline","subheadline":"","choice":{"kind":"default"}}}')) $$,
  '42501', null, 't_cannot_change_hero_text_without_the_entitlement');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 1, '{"seo":{"title":"Changed","description":"x"}}')) $$,
  '42501', null, 't_cannot_change_seo_without_the_entitlement');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 1, '{"extra":"added"}')) $$,
  '42501', null, 't_cannot_smuggle_a_new_top_level_field');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 3)) $$,
  null, null, 't_cannot_add_pages_on_the_free_plan');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '+17165550199', 1,
      '{"hero":{"headline":"Fresh cuts","subheadline":"","choice":{"kind":"library","key":"made_up"}}}')) $$,
  '23514', null, 't_hero_choice_must_be_in_the_library');

-- --- 4. Validation ----------------------------------------------------------
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#445566', '+17165550199'), '{theme,fontBody}', '"Comic Sans; } body{display:none"')) $$,
  '23514', null, 't_font_must_be_on_the_allowed_list_no_css_injection');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#445566', '+17165550199'), '{theme,customCss}', '"body{}"')) $$,
  '23514', null, 't_unknown_theme_field_refused');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    tests.sg_spec('#445566', '7165550199')) $$,
  '23514', null, 't_phone_must_be_international_format');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#445566', '+17165550199'), '{theme,logoAssetId}', to_jsonb(gen_random_uuid()::text))) $$,
  '23514', null, 't_logo_must_be_a_real_upload_of_this_site');
select tests.logout();

-- --- logo upload: only PNG/JPEG/WebP, size capped, must be confirmed --------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.register_asset(current_setting('t.site_a')::uuid, 'logo', 'l.svg', 'image/svg+xml', 1000) $$,
  '23514', null, 't_svg_logo_refused');
select throws_ok($$ select sitegen.register_asset(current_setting('t.site_a')::uuid, 'logo', 'l.png', 'image/png', 3000000) $$,
  '23514', null, 't_oversize_logo_refused');
select lives_ok($$ select sitegen.register_asset(current_setting('t.site_a')::uuid, 'logo', 'l.png', 'image/png', 50000, 'Logo') $$,
  't_png_logo_registers');
select tests.logout();
select set_config('t.logo', (select id::text from sitegen.site_assets limit 1), true);
select is((select f.object_path like tests.uid('tenant_a')::text || '/sitegen/%' from sitegen.site_assets a
            join storage_meta.files f on f.id = a.file_id where a.id = current_setting('t.logo')::uuid),
  true, 't_logo_lives_under_the_tenant_prefix');

select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#445566', '+17165550199'), '{theme,logoAssetId}', to_jsonb(current_setting('t.logo')))) $$,
  '23514', null, 't_logo_not_usable_until_the_upload_is_confirmed');
select throws_ok($$ select sitegen.confirm_asset(current_setting('t.logo')::uuid, null, 50000, 9000, 9000) $$,
  '23514', null, 't_logo_dimensions_are_capped');
select lives_ok($$ select sitegen.confirm_asset(current_setting('t.logo')::uuid, null, 50000, 400, 400) $$,
  't_logo_confirms');
select lives_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#445566', '+17165550199'), '{theme,logoAssetId}', to_jsonb(current_setting('t.logo')))) $$,
  't_confirmed_logo_can_be_used');
select tests.logout();

select tests.login_as(tests.uid('padmin'));
select throws_ok($$ select sitegen.save_version(current_setting('t.site_b')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid order by version_no desc limit 1),
    jsonb_set(tests.sg_spec('#334455'), '{theme,logoAssetId}', to_jsonb(current_setting('t.logo')))) $$,
  '23514', null, 't_a_logo_of_another_site_cannot_be_borrowed_even_by_staff');
select lives_ok($$ select sitegen.save_version(current_setting('t.site_b')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid order by version_no desc limit 1),
    tests.sg_spec('#334455', '+17165550100', 4, '{"seo":{"title":"Staff edit","description":"d"}}')) $$,
  't_staff_may_edit_content_and_exceed_page_limit');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_b')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid order by version_no desc limit 1),
    tests.sg_spec('#334455', '+17165550100', 1,
      '{"claims":[{"kind":"yearsInBusiness","value":"25 years"}]}')) $$,
  '23514', null, 't_a_claim_without_a_source_is_refused_even_from_staff');
select lives_ok($$ select sitegen.save_version(current_setting('t.site_b')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid order by version_no desc limit 1),
    tests.sg_spec('#334455', '+17165550100', 1,
      '{"claims":[{"kind":"yearsInBusiness","value":"25 years","source":{"type":"intake","field":"yearsInBusiness"}}]}')) $$,
  't_a_sourced_claim_is_accepted');
select tests.logout();

-- --- roles ------------------------------------------------------------------
select tests.login_as(tests.uid('viewer_a'));
select is((select count(*)::int from sitegen.sites), 1, 't_viewer_can_read');
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid, gen_random_uuid(), tests.sg_spec()) $$,
  '42501', null, 't_viewer_cannot_edit');
select throws_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid, gen_random_uuid()) $$,
  '42501', null, 't_viewer_cannot_publish');
select tests.logout();
select tests.login_as(tests.uid('staff_a'));
select throws_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid, gen_random_uuid()) $$,
  '42501', null, 't_staff_role_in_tenant_cannot_publish');
select tests.logout();

-- --- 5. Immutability and going live -----------------------------------------
select throws_ok($$ update sitegen.site_versions set note = 'tamper' where site_id = current_setting('t.site_a')::uuid $$,
  '42501', null, 't_a_version_cannot_be_edited_even_by_the_owner_role');
select throws_ok($$ delete from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid $$,
  '42501', null, 't_a_version_cannot_be_deleted');
select throws_ok($$ update sitegen.sites set status = 'published',
    active_version_id = (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid limit 1)
    where id = current_setting('t.site_a')::uuid $$,
  '42501', null, 't_nothing_but_publish_can_put_a_site_live');
select throws_ok($$ update sitegen.sites set tenant_id = tests.uid('tenant_b') where id = current_setting('t.site_a')::uuid $$,
  '42501', null, 't_a_site_cannot_be_moved_to_another_tenant');

select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_b')::uuid limit 1)) $$,
  '23503', null, 't_cannot_publish_another_sites_version');
select tests.logout();
select is((select count(*)::int from sitegen.sites where status = 'published'), 0, 't_nothing_is_published_by_saving');
select is(sitegen.published_site('barber-a'), null, 't_a_draft_site_is_not_served');

select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid and version_no = 1)) $$,
  't_owner_publishes_version_one');
select tests.logout();
select is((select status::text from sitegen.sites where slug = 'barber-a'), 'published', 't_site_is_published');
select ok(exists (select 1 from events.outbox where topic = 'sitegen.site.published'), 't_publish_emits_an_event');
select ok(exists (select 1 from audit.events where action = 'sitegen.sites.update' and tenant_id = tests.uid('tenant_a')),
  't_the_change_is_in_the_audit_log');

-- --- 7. The public read -----------------------------------------------------
select tests.login_as_anon();
select throws_ok($$ select sitegen.published_site('barber-a') $$, '42501', null, 't_anon_cannot_call_the_public_read');
select tests.logout();
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.published_site('barber-a') $$, '42501', null, 't_a_signed_in_client_cannot_call_it_either');
select tests.logout();
set local role service_role;
select is((sitegen.published_site('barber-a') -> 'versionNo')::int, 1, 't_service_role_gets_the_live_version');
select is(sitegen.published_site('barber-a') #>> '{spec,theme,brandColor}', '#112233',
  't_and_it_is_the_published_version_not_the_latest_draft');
select is(sitegen.published_site('no-such-site'), null, 't_unknown_site_gives_null');
reset role;

-- --- 6. Rollback, suspension, suspended tenant ------------------------------
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid order by version_no desc limit 1)) $$,
  't_owner_publishes_the_newest_version');
select lives_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid and version_no = 1)) $$,
  't_rollback_is_publishing_an_older_version');
select throws_ok($$ select sitegen.suspend_site(current_setting('t.site_a')::uuid, 'owner tries') $$,
  '42501', null, 't_a_client_cannot_suspend_a_site');
select tests.logout();
select is((select (active_version_id = (select id from sitegen.site_versions
            where site_id = sites.id and version_no = 1)) from sitegen.sites where slug = 'barber-a'),
  true, 't_rollback_took_effect');

select tests.login_as(tests.uid('padmin'));
select throws_ok($$ select sitegen.suspend_site(current_setting('t.site_a')::uuid, '   ') $$,
  '23514', null, 't_suspension_needs_a_reason');
select lives_ok($$ select sitegen.suspend_site(current_setting('t.site_a')::uuid, 'phishing report') $$,
  't_staff_can_take_a_site_down');
select is((select count(*)::int from sitegen.sites), 2, 't_staff_see_every_tenants_sites');
select tests.logout();
set local role service_role;
select is(sitegen.published_site('barber-a'), null, 't_a_suspended_site_is_not_served');
reset role;
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid, gen_random_uuid(), tests.sg_spec()) $$,
  '42501', null, 't_client_cannot_edit_a_suspended_site');
select throws_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid limit 1)) $$,
  '42501', null, 't_client_cannot_republish_a_suspended_site');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select lives_ok($$ select sitegen.unsuspend_site(current_setting('t.site_a')::uuid) $$, 't_staff_lift_the_suspension');
select tests.logout();
select is((select status::text || coalesce(active_version_id::text, '-') from sitegen.sites where slug = 'barber-a'),
  'draft-', 't_lifted_site_returns_to_draft_and_must_be_published_again_by_a_person');

-- a suspended TENANT stops everything, for every role
select tests.login_as(tests.uid('owner_a'));
select lives_ok($$ select sitegen.publish(current_setting('t.site_a')::uuid,
    (select id from sitegen.site_versions where site_id = current_setting('t.site_a')::uuid and version_no = 1)) $$,
  't_owner_republishes_after_the_lift');
select tests.logout();
update platform.tenants set status = 'suspended' where id = tests.uid('tenant_a');
set local role service_role;
select is(sitegen.published_site('barber-a'), null, 't_a_suspended_tenants_site_is_not_served');
reset role;
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.save_version(current_setting('t.site_a')::uuid, gen_random_uuid(), tests.sg_spec()) $$,
  '42501', null, 't_a_suspended_tenant_cannot_edit');
select tests.logout();
update platform.tenants set status = 'active' where id = tests.uid('tenant_a');

-- --- limits: overrides and atomic counters ----------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok($$ select sitegen.set_limit_override(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month', 99, 'self-serve') $$,
  '42501', null, 't_a_client_cannot_raise_its_own_limit');
select throws_ok($$ select sitegen.consume(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month') $$,
  '42501', null, 't_a_client_cannot_touch_the_counter');
select tests.logout();
select tests.login_as(tests.uid('padmin'));
select lives_ok($$ select sitegen.set_limit_override(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month', 2, 'test allowance') $$,
  't_staff_can_set_an_override');
select tests.logout();
select is(sitegen.limit_for(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month'), 2, 't_override_beats_the_plan');
select is(sitegen.consume(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month'), 1, 't_first_use_counts');
select is(sitegen.consume(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month'), 2, 't_second_use_counts');
select throws_ok($$ select sitegen.consume(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month') $$,
  '53400', null, 't_use_past_the_limit_is_refused');
select is((select used from sitegen.usage_counters where tenant_id = tests.uid('tenant_a')
            and metric = 'sitegen.ai_assisted_edits_per_month'), 2, 't_refused_use_is_not_counted');
select throws_ok($$ select sitegen.consume(tests.uid('tenant_a'), 'sitegen.ai_assisted_edits_per_month', 0) $$,
  '23514', null, 't_zero_amount_refused');
select throws_ok($$ select sitegen.consume(tests.uid('tenant_a'), 'sitegen.never_granted') $$,
  '53400', null, 't_a_metric_with_no_limit_is_denied');
insert into sitegen.tenant_limit_overrides (tenant_id, limit_key, value, reason)
  values (tests.uid('tenant_a'), 'sitegen.unmetered', -1, 'test');
select is(sitegen.consume(tests.uid('tenant_a'), 'sitegen.unmetered', 1000), 1000, 't_minus_one_means_unlimited');
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from sitegen.usage_counters), 0, 't_tenant_b_cannot_see_tenant_a_usage');
select tests.logout();

select * from finish();
rollback;
