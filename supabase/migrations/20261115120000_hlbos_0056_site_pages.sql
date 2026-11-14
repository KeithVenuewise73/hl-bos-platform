-- ===========================================================================
-- 0056_site_pages — which pages of 5starsportsmedia.com are switched on
--
-- The site was scaled down to Home, Photos, Contact and About. Every other page
-- still exists, switched OFF. This table is the list of those pages and the
-- owner's switches:
--
--   enabled      the page is on: it is in the menu and can be opened. Off: a
--                visitor who reaches it is sent to the home page.
--   coming_soon  a page that is off can be listed on the home page under
--                "Coming soon", with a count-only "I'd like this" button.
--
-- The count is anonymous. A visit is remembered only as a one-way fingerprint
-- (made by the Edge Function from the visitor's address and the day, with a
-- secret it alone holds), kept only so one person is not counted twice a day.
-- No address, name or email is stored.
--
-- Same lock-down as the rest of the review area: not API-exposed, RLS forced on
-- every table with no policy, service role only, via the media-review Edge
-- Function. The public list is readable by anyone through that function, and
-- contains only page names, never a count. WRITTEN AND TESTED, NOT APPLIED.
--
-- rollback:
--   drop schema if exists site cascade;
-- ===========================================================================

create schema if not exists site;
comment on schema site is
  'HL-BOS: the 5 Star website page switches. NOT API-exposed; service role only, via the media-review Edge Function.';
revoke all on schema site from public, anon, authenticated;
grant usage on schema site to service_role;
alter default privileges in schema site revoke all on tables from public, anon, authenticated;
alter default privileges in schema site revoke all on functions from public, anon, authenticated;

create table if not exists site.pages (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  title       text not null check (length(title) between 1 and 80),
  blurb       text not null default '' check (length(blurb) <= 240),
  -- The page the menu and the Coming soon list point to.
  href        text not null check (href ~ '^[a-z0-9][a-z0-9/_-]*\.html$' and length(href) <= 120),
  menu_label  text not null check (length(menu_label) between 1 and 30),
  menu_order  integer not null default 100,
  -- Every file this switch covers: an exact file ('scores.html') or a folder ('scores/').
  paths       text[] not null check (cardinality(paths) >= 1),
  enabled     boolean not null default false,
  coming_soon boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- One row per person, page and day: a fingerprint, never an address.
create table if not exists site.page_interest (
  page_slug  text not null references site.pages(slug) on delete cascade,
  voter_hash text not null check (voter_hash ~ '^[0-9a-f]{64}$'),
  day        date not null default current_date,
  primary key (page_slug, voter_hash, day)
);
create index if not exists page_interest_by_page on site.page_interest (page_slug);

do $$
declare t text;
begin
  foreach t in array array['pages', 'page_interest'] loop
    execute format('alter table site.%I enable row level security', t);
    execute format('alter table site.%I force row level security', t);
    execute format('revoke all on site.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on site.%I to service_role', t);
  end loop;
end $$;

-- The pages that were switched off on 2026-11-13, all OFF. The staff tools
-- (admin, media dashboard, academy portal, photo review) are not here: they keep
-- their own logins and are never switched.
insert into site.pages (slug, title, blurb, href, menu_order, menu_label, paths) values
  ('athletes',      'Athlete Spotlight',        'Athlete spotlights and player profiles.',              'athlete-spotlight.html',    10, 'Athletes',      array['athlete-spotlight.html','players.html','player-card.html','spotlight-detail.html']),
  ('coaches',       'Coach Spotlight',          'Spotlights on the coaches shaping WNY athletes.',      'coach-spotlight.html',      20, 'Coaches',       array['coach-spotlight.html']),
  ('teams',         'Team Spotlight',           'Team stories and championship runs.',                  'team-spotlight.html',       30, 'Teams',         array['team-spotlight.html']),
  ('organizations', 'Organizations',            'Profiles of WNY sports organizations.',                'organization-spotlight.html',40,'Organizations', array['organization-spotlight.html']),
  ('scores',        'Scores & Schedules',       'Live scores, schedules and results.',                  'scores.html',               50, 'Scores',        array['scores.html','school.html','games-board.html','scores/']),
  ('game-coverage', 'Game Coverage',            'Game recaps and coverage.',                            'game-coverage.html',        60, 'Game Coverage', array['game-coverage.html']),
  ('legends',       'Legends Spotlight',        'People whose success was shaped by sports.',           'legends-spotlight.html',    70, 'Legends',       array['legends-spotlight.html']),
  ('calendar',      'WNY Sports Calendar',      'Upcoming events across Western New York.',             'wny-sports-calendar.html',  80, 'Calendar',      array['wny-sports-calendar.html']),
  ('podcast',       'Podcast',                  'Episodes and guest features.',                         'podcast.html',              90, 'Podcast',       array['podcast.html','podcast/']),
  ('videos',        'Videos',                   'Game and feature videos.',                             'videos.html',              100, 'Videos',        array['videos.html']),
  ('cause',         'Sports for a Cause',       'Causes connected to sports.',                          'sports-for-a-cause.html',  110, 'Cause',         array['sports-for-a-cause.html']),
  ('academy',       'Academy',                  'The 5-Star Academy program.',                          'academy.html',             120, 'Academy',       array['academy.html','academy-apply.html','academy-programs.html','academy-mentor.html','academy-correspondents.html','academy-code-of-conduct.html','academy-parent-permission.html','academy/downloads/']),
  ('sponsors',      'Sponsors',                 'Sponsor packages and partners.',                       'sponsors.html',            130, 'Sponsors',      array['sponsors.html']),
  ('submit-story',  'Submit a Story',           'Nominate an athlete, coach, team or legend.',          'submit-story.html',        140, 'Submit a Story', array['submit-story.html']),
  ('photo-upload',  'Upload Game Photos',       'Send game photos to 5-Star.',                          'photo-upload.html',        150, 'Upload Photos', array['photo-upload.html'])
on conflict (slug) do nothing;

-- --- Reading and switching (the Edge Function) ------------------------------

-- What visitors' pages need: every page's name, address and state. No counts.
create or replace function site.public_pages()
returns table (slug text, title text, blurb text, href text, menu_label text, menu_order integer,
               paths text[], enabled boolean, coming_soon boolean)
language sql stable set search_path = '' as $$
  select p.slug, p.title, p.blurb, p.href, p.menu_label, p.menu_order, p.paths, p.enabled, p.coming_soon
    from site.pages p order by p.menu_order, p.title
$$;

-- For the owner: the same, with how many different people asked for each page.
create or replace function site.owner_pages()
returns table (slug text, title text, blurb text, href text, menu_label text, menu_order integer,
               paths text[], enabled boolean, coming_soon boolean, interest bigint)
language sql stable set search_path = '' as $$
  select p.slug, p.title, p.blurb, p.href, p.menu_label, p.menu_order, p.paths, p.enabled, p.coming_soon,
         (select count(*) from site.page_interest i where i.page_slug = p.slug)
    from site.pages p order by p.menu_order, p.title
$$;

-- Flip a page. A null leaves that switch as it is. Turning a page ON also takes it
-- off the Coming soon list: it is no longer coming.
create or replace function site.set_page(p_slug text, p_enabled boolean, p_coming_soon boolean)
returns void language plpgsql set search_path = '' as $$
begin
  update site.pages
     set enabled = coalesce(p_enabled, enabled),
         coming_soon = case when coalesce(p_enabled, enabled) then false
                            else coalesce(p_coming_soon, coming_soon) end,
         updated_at = now()
   where slug = p_slug;
  if not found then
    raise exception 'that page was not found' using errcode = '22023';
  end if;
end $$;

-- One "I'd like this". Only for a page that is off and listed as coming soon.
-- Returns true when it was counted, false when this person had already asked today.
create or replace function site.record_interest(p_slug text, p_voter text)
returns boolean language plpgsql set search_path = '' as $$
declare added integer;
begin
  if p_voter is null or p_voter !~ '^[0-9a-f]{64}$' then
    raise exception 'a visitor fingerprint is 64 hex characters' using errcode = '22023';
  end if;
  if not exists (select 1 from site.pages where slug = p_slug and coming_soon and not enabled) then
    raise exception 'that page is not listed as coming soon' using errcode = '22023';
  end if;
  insert into site.page_interest (page_slug, voter_hash) values (p_slug, p_voter)
  on conflict do nothing;
  get diagnostics added = row_count;
  return added = 1;
end $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'site'::regnamespace loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
