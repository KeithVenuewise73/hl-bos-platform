-- ===========================================================================
-- Site pages — migration 0056: which pages of the website are switched on.
--
--   1. Nobody but the service role can touch any of it.
--   2. Every page that was switched off is listed, all OFF; no staff tool is.
--   3. The switches: on, coming soon, and turning on removes "coming soon".
--   4. "I'd like this" is anonymous, counted once per person per page per day,
--      and only for a page that is off and listed as coming soon.
--   5. The public list never carries a count.
-- ===========================================================================
begin;
select plan(31);

-- --- 1. Locked down ---------------------------------------------------------
select is((select count(*)::int from pg_class c
             where c.relnamespace = 'site'::regnamespace and c.relkind = 'r'
               and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 't_rls_forced_on_every_table');
select is((select count(*)::int from pg_class c
             where c.relnamespace = 'site'::regnamespace and c.relkind = 'r'
               and (has_table_privilege('anon', c.oid, 'select')
                 or has_table_privilege('authenticated', c.oid, 'select'))),
  0, 't_anon_and_authenticated_read_nothing');
select is((select count(*)::int from pg_policies where schemaname = 'site'), 0, 't_no_policy_admits_anyone');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'site'::regnamespace
            and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 't_anon_and_authenticated_run_no_function');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'site'::regnamespace
            and not has_function_privilege('service_role', p.oid, 'execute')),
  0, 't_service_role_runs_every_function');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'site'::regnamespace and p.prosecdef),
  0, 't_no_security_definer_function');

-- --- 2. The switched-off pages ----------------------------------------------
select is((select count(*)::int from site.pages), 15, 't_fifteen_page_groups');
select is((select count(*)::int from site.pages where enabled or coming_soon), 0, 't_every_page_starts_off_and_unlisted');
select ok(exists (select 1 from site.pages where slug = 'athletes' and 'athlete-spotlight.html' = any (paths)
                    and href = 'athlete-spotlight.html' and menu_label = 'Athletes'), 't_athlete_spotlight_is_there');
select ok(exists (select 1 from site.pages where slug = 'scores' and 'scores/' = any (paths) and 'scores.html' = any (paths)),
  't_scores_covers_its_sport_pages');
select is((select count(*)::int from site.pages p, unnest(p.paths) x where x in
            ('admin.html', 'media-dashboard.html', 'staff.html', 'photo-review.html', 'academy/portal.html',
             'admin-gametracker.html', 'analytics-dashboard.html', 'index.html', 'about.html', 'contact.html', 'photo-galleries.html')),
  0, 't_no_staff_tool_and_no_kept_page_can_be_switched');
select is((select count(*)::int from (select x from (select unnest(paths) x from site.pages) a group by x having count(*) > 1) d),
  0, 't_no_file_belongs_to_two_switches');
select throws_ok($$ insert into site.pages (slug, title, href, menu_label, paths) values ('Bad Slug', 'x', 'x.html', 'x', array['x.html']) $$,
  '23514', null, 't_a_slug_is_plain');
select throws_ok($$ insert into site.pages (slug, title, href, menu_label, paths) values ('ok', 'x', 'http://evil.example/x.html', 'x', array['x.html']) $$,
  '23514', null, 't_a_page_address_is_a_file_on_this_site');

-- --- 3. The switches --------------------------------------------------------
select site.set_page('athletes', null, true);
select is((select coming_soon from site.pages where slug = 'athletes'), true, 't_list_a_page_as_coming_soon');
select is((select enabled from site.pages where slug = 'athletes'), false, 't_listing_does_not_turn_it_on');
select site.set_page('athletes', true, null);
select is((select enabled || '/' || coming_soon from site.pages where slug = 'athletes'), 'true/false',
  't_turning_a_page_on_takes_it_off_the_coming_soon_list');
select site.set_page('athletes', null, true);
select is((select coming_soon from site.pages where slug = 'athletes'), false, 't_a_page_that_is_on_cannot_be_listed_as_coming');
select site.set_page('athletes', false, null);
select is((select enabled from site.pages where slug = 'athletes'), false, 't_turn_it_off_again');
select throws_ok($$ select site.set_page('no-such-page', true, null) $$, '22023', null, 't_an_unknown_page_is_refused');

-- --- 4. "I'd like this" -----------------------------------------------------
select throws_ok($$ select site.record_interest('athletes', repeat('a', 64)) $$, '22023', null,
  't_interest_only_for_a_page_listed_as_coming_soon');
select site.set_page('athletes', null, true);
select is(site.record_interest('athletes', repeat('a', 64)), true, 't_a_first_vote_is_counted');
select is(site.record_interest('athletes', repeat('a', 64)), false, 't_the_same_person_twice_in_a_day_is_not');
select is(site.record_interest('athletes', repeat('b', 64)), true, 't_another_person_is_counted');
select is((select interest from site.owner_pages() where slug = 'athletes'), 2::bigint, 't_the_owner_sees_two_people');
select throws_ok($$ select site.record_interest('athletes', 'not-a-fingerprint') $$, '22023', null, 't_a_fingerprint_is_64_hex');
select is((select count(*)::int from information_schema.columns where table_schema = 'site' and table_name = 'page_interest'
             and column_name in ('ip', 'ip_address', 'email', 'name', 'user_agent')), 0, 't_no_address_or_name_is_stored');

-- A day later the same person can ask again (it is one per person per day).
update site.page_interest set day = current_date - 1 where voter_hash = repeat('a', 64);
select is(site.record_interest('athletes', repeat('a', 64)), true, 't_the_next_day_counts_again');

-- Switching the page on keeps the history and stops new votes.
select site.set_page('athletes', true, null);
select throws_ok($$ select site.record_interest('athletes', repeat('c', 64)) $$, '22023', null, 't_no_votes_once_it_is_on');

-- --- 5. The public list -----------------------------------------------------
select ok(not exists (select 1 from pg_proc p, unnest(p.proargnames) n
                       where p.proname = 'public_pages' and p.pronamespace = 'site'::regnamespace and n = 'interest'),
  't_the_public_list_has_no_count');
select is((select count(*)::int from site.public_pages()), 15, 't_the_public_list_has_every_page');

select * from finish();
rollback;
