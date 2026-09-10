-- ===========================================================================
-- hlbos_0052_barberos_owned_website — the first BarberOS module that does something
--
-- 0048 shipped a capability toggle with nothing behind it, deliberately, so
-- that no module would ever ship without a gate. This is the first module to
-- come through that gate, and it is the one the audit tool actually asks for:
-- all 40 analysed WNY shops point at `owned_website` and nothing else. 35 have
-- no website at all; 5 are bookable only on a platform they do not own.
--
-- WHAT IT IS. One published page per shop, holding exactly the things the
-- website rubric looks for and does not find:
--
--   audit finding            this module
--   ---------------------    -----------------------------------------------
--   no_website               the page itself, on a domain the shop owns
--   owned_domain             ditto -- it replaces a booking-platform page
--   published_hours          barberos.site_hours
--   services_listed          barberos.site_services
--   pricing_published        barberos.site_services.price_cents
--   address_or_map           sites.address_line1 + map_url
--   tap_to_call              sites.phone, rendered as a tel: link
--   online_booking           sites.booking_url
--   social_linked            barberos.site_links
--
-- That correspondence is the product. A shop fixes its audit by filling this
-- in, and the next audit reads the new page and says so.
--
-- ---------------------------------------------------------------------------
-- THE GATE, FINALLY LOAD-BEARING
--
-- Every table here refuses a write unless `barberos.is_enabled(tenant,
-- 'owned_website')` is true. Not a policy, not a convention -- a trigger on
-- each table. Turning the capability off does not hide the shop's page behind
-- an `if` somewhere in an app; it makes the rows unwritable at the source.
--
-- This migration also promotes `owned_website` from 'planned' to 'available',
-- which is the ONLY thing that makes it enableable at all (0048's
-- `enable_capability` refuses any other status). Promotion happens in the same
-- migration that makes it work, and never before.
--
-- ---------------------------------------------------------------------------
-- NOTHING IS INVENTED. THIS IS THE WHOLE DESIGN.
--
-- A generated page for a business is a place where plausible content is very
-- tempting and very damaging: opening hours nobody confirmed, a price nobody
-- set, an "about us" nobody wrote. A wrong opening time sends a customer to a
-- locked door, and the shop -- not us -- takes the review for it.
--
--   * There are NO defaults for hours, prices or copy. Not '9-5', not ''.
--   * A day with NO ROW means "the shop has not said". A row with
--     is_closed = true means "the shop says it is closed that day". These are
--     different facts and the schema keeps them apart, so the page can too.
--   * A service with a NULL price is a service whose price was not given. The
--     renderer says "price on request". It never guesses a number.
--   * A page cannot be PUBLISHED until it carries the minimum a customer
--     needs -- a name, a way to act, and somewhere to go. Trigger-enforced.
--     A blank page under a shop's own name is worse than no page: it is the
--     shop looking abandoned, at its own address.
--
-- NO PHOTO GALLERY IN v1, on purpose. `storage_meta.files` exists and would be
-- the right home, but nothing in this platform can yet upload a file, so a
-- photos table would be a table nobody can fill -- exactly the empty-capability
-- liability CONTRIBUTING warns about. The audit's `photos_present` finding
-- stays open and honest until there is an upload path.
--
-- SCHEMA PLACEMENT. The spec proposed a separate schema per capability
-- (`barberos_website`). These tables live in `barberos` with a `site_` prefix
-- instead: the isolation the spec wanted comes from the gate above, not from
-- the schema name, and a second schema would mean a second set of grants,
-- policies and default privileges to keep in step with the first.
--
-- NOT APPLIED to any environment by this file.
--
-- rollback:
--   UPDATE barberos.capabilities SET status = 'planned', is_default = false
--    WHERE key = 'owned_website';
--   DROP TABLE IF EXISTS barberos.site_links, barberos.site_services,
--     barberos.site_hours, barberos.sites CASCADE;
--   DROP TYPE IF EXISTS barberos.site_status, barberos.site_link_kind;
--   DROP FUNCTION IF EXISTS barberos.require_capability() CASCADE;
--   (Additive: it creates new tables and promotes one catalog row. Reverting
--    the promotion is what actually disables the module.)
-- approved-destructive: the rollback block above is the only DROP here; this
--   migration itself creates and promotes, and removes nothing.
-- ===========================================================================

-- --- Types ------------------------------------------------------------------
do $$ begin create type barberos.site_status as enum ('draft','published','unpublished');
  exception when duplicate_object then null; end $$;

-- A closed vocabulary: a link kind the renderer does not know how to label
-- would render as a bare URL next to the shop's name.
do $$ begin create type barberos.site_link_kind as enum
  ('instagram','facebook','google_business','tiktok','yelp','x');
  exception when duplicate_object then null; end $$;

-- ===========================================================================
-- The gate, as a reusable trigger
--
-- Generic on purpose: every future BarberOS module attaches this same function
-- with its own capability key, so no module can be written without one.
-- ===========================================================================
create or replace function barberos.require_capability()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_key text := tg_argv[0];
begin
  v_tenant := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  if not barberos.is_enabled(v_tenant, v_key::extensions.citext) then
    raise exception
      'the % capability is not enabled for this shop, so % cannot be written',
      v_key, tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
comment on function barberos.require_capability() is
  'Attach to any capability-owned table with the capability key as the trigger argument. Makes barberos.is_enabled() load-bearing rather than advisory.';

-- ===========================================================================
-- The site
-- ===========================================================================
create table if not exists barberos.sites (
  -- One page per shop. A shop with two locations is two tenants, because that
  -- is what the audit found: Dark Horse and Slawich each appear twice in the
  -- WNY list, at different addresses, sharing one site -- which is precisely
  -- the local-SEO problem the module is meant to fix.
  tenant_id     uuid primary key references barberos.shops(tenant_id) on delete cascade,
  slug          extensions.citext not null unique,
  headline      text,
  about         text,
  -- The published contact block. Deliberately NOT read from barberos.shops:
  -- what a shop puts on its public page is its own decision, and may not be
  -- the number its staff answer.
  phone         text,
  address_line1 text,
  locality      text,
  region        text,
  postal_code   text,
  map_url       text,
  -- Where "Book now" goes. Today an external booking platform; when the
  -- BarberOS booking module ships this points at it instead, and the shop's
  -- page does not change shape.
  booking_url   text,
  status        barberos.site_status not null default 'draft',
  published_at  timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sites_slug_format check ((slug)::text ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- Published is a fact with a time and a person behind it, or it is not a
  -- fact. A page cannot be "published" with nobody having published it.
  constraint sites_published_has_provenance
    check ((status = 'published') = (published_at is not null)),
  constraint sites_url_shape check (
    (booking_url is null or booking_url ~* '^https?://')
    and (map_url is null or map_url ~* '^https?://'))
);
comment on table barberos.sites is
  'One owned page per shop. Every field is nullable: an empty field means the shop has not said, and the page renders nothing rather than something plausible.';
comment on column barberos.sites.booking_url is
  'Where "Book now" goes. External today; the BarberOS booking module when it ships.';

create index if not exists sites_status_idx on barberos.sites (status);

-- --- Hours ------------------------------------------------------------------
create table if not exists barberos.site_hours (
  tenant_id   uuid not null references barberos.sites(tenant_id) on delete cascade,
  -- 0 = Sunday, matching PostgreSQL's extract(dow).
  day_of_week smallint not null,
  is_closed   boolean not null default false,
  opens_at    time,
  closes_at   time,
  primary key (tenant_id, day_of_week),
  constraint site_hours_day_range check (day_of_week between 0 and 6),
  -- A day is either closed, or it is open between two times. There is no third
  -- state where a page shows "Monday: 9:00 –" and lets the reader guess.
  constraint site_hours_closed_or_complete check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null)),
  -- Overnight is real for a barbershop only in the sense of a late close, and
  -- a close BEFORE an open is far more likely a typo than a 2am shop.
  constraint site_hours_opens_before_closes
    check (is_closed or closes_at > opens_at)
);
comment on table barberos.site_hours is
  'A row per day the shop has stated. NO ROW means the shop has not said; a row with is_closed means the shop says it is closed. The renderer shows these differently.';

-- --- Services and prices ----------------------------------------------------
create table if not exists barberos.site_services (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references barberos.sites(tenant_id) on delete cascade,
  name          text not null,
  -- NULL is "price not given", and renders as "price on request". Never 0,
  -- which would advertise a free haircut.
  price_cents   integer,
  duration_minutes integer,
  display_order integer not null default 0,
  constraint site_services_name_present check (length(btrim(name)) > 0),
  constraint site_services_price_positive check (price_cents is null or price_cents > 0),
  constraint site_services_duration_positive
    check (duration_minutes is null or duration_minutes > 0),
  constraint site_services_name_unique unique (tenant_id, name)
);
comment on column barberos.site_services.price_cents is
  'NULL means the shop did not give a price. It is never defaulted to 0 -- that would publish a free haircut.';

create index if not exists site_services_tenant_idx
  on barberos.site_services (tenant_id, display_order);

-- --- Social links -----------------------------------------------------------
create table if not exists barberos.site_links (
  tenant_id uuid not null references barberos.sites(tenant_id) on delete cascade,
  kind      barberos.site_link_kind not null,
  url       text not null,
  primary key (tenant_id, kind),
  constraint site_links_url_shape check (url ~* '^https?://')
);

-- ===========================================================================
-- The capability gate on every table
-- ===========================================================================
create trigger sites_requires_capability
  before insert or update on barberos.sites
  for each row execute function barberos.require_capability('owned_website');
create trigger site_hours_requires_capability
  before insert or update or delete on barberos.site_hours
  for each row execute function barberos.require_capability('owned_website');
create trigger site_services_requires_capability
  before insert or update or delete on barberos.site_services
  for each row execute function barberos.require_capability('owned_website');
create trigger site_links_requires_capability
  before insert or update or delete on barberos.site_links
  for each row execute function barberos.require_capability('owned_website');

-- ===========================================================================
-- The publish gate
--
-- A page goes public only when it carries the minimum a customer needs. This
-- is not a style rule: a shop that publishes a blank page under its own name
-- and address looks abandoned at exactly the moment someone was deciding
-- whether to walk in.
-- ===========================================================================
create or replace function barberos.enforce_publishable()
returns trigger language plpgsql security definer set search_path = '' as $$
-- Each append is cast explicitly: `text[] || 'literal'` resolves to
-- array-concat-ARRAY and tries to parse the sentence as an array literal,
-- so the gate raised 22P02 'malformed array literal' instead of the message
-- it had carefully written. It still blocked publishing -- but a guard that
-- fires with the wrong reason teaches whoever hits it to distrust the guard.
declare v_missing text[] := '{}'::text[];
begin
  if new.status <> 'published' then return new; end if;

  if new.headline is null or length(btrim(new.headline)) = 0 then
    v_missing := v_missing || 'a headline'::text;
  end if;
  -- Somewhere to go.
  if new.address_line1 is null or length(btrim(new.address_line1)) = 0 then
    v_missing := v_missing || 'a street address'::text;
  end if;
  -- Some way to act. Either is enough; neither is not.
  if (new.phone is null or length(btrim(new.phone)) = 0)
     and (new.booking_url is null or length(btrim(new.booking_url)) = 0) then
    v_missing := v_missing || 'a phone number or a booking link'::text;
  end if;
  -- Opening hours are the single most-asked question of a local page, and the
  -- audit's most common failing finding after booking. At least one stated day.
  if not exists (select 1 from barberos.site_hours h where h.tenant_id = new.tenant_id) then
    v_missing := v_missing || 'opening hours for at least one day'::text;
  end if;

  if pg_catalog.array_length(v_missing, 1) is not null then
    raise exception 'this page cannot be published yet: it is missing %',
      pg_catalog.array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

create trigger sites_publishable
  before insert or update on barberos.sites
  for each row execute function barberos.enforce_publishable();

-- --- updated_at + audit -----------------------------------------------------
create trigger sites_set_updated_at before update on barberos.sites
  for each row execute function platform.set_updated_at();
create trigger sites_audit after insert or update or delete on barberos.sites
  for each row execute function audit.emit();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table barberos.sites          enable row level security;
alter table barberos.sites          force  row level security;
alter table barberos.site_hours     enable row level security;
alter table barberos.site_hours     force  row level security;
alter table barberos.site_services  enable row level security;
alter table barberos.site_services  force  row level security;
alter table barberos.site_links     enable row level security;
alter table barberos.site_links     force  row level security;

drop policy if exists sites_select on barberos.sites;
create policy sites_select on barberos.sites for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read')
         or identity.is_platform_admin());

-- The child tables carry a tenant_id for the gate trigger, and inherit
-- visibility from the site they belong to rather than re-deciding it.
drop policy if exists site_hours_select on barberos.site_hours;
create policy site_hours_select on barberos.site_hours for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_hours.tenant_id));
drop policy if exists site_services_select on barberos.site_services;
create policy site_services_select on barberos.site_services for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_services.tenant_id));
drop policy if exists site_links_select on barberos.site_links;
create policy site_links_select on barberos.site_links for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_links.tenant_id));

grant select on barberos.sites, barberos.site_hours, barberos.site_services,
                barberos.site_links to authenticated;

-- ===========================================================================
-- Write paths
-- ===========================================================================

create or replace function barberos.upsert_site(
  p_tenant uuid, p_slug extensions.citext,
  p_headline text default null, p_about text default null,
  p_phone text default null, p_address text default null,
  p_locality text default null, p_region text default null,
  p_postal text default null, p_map_url text default null,
  p_booking_url text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.site.update') then
    raise exception 'insufficient privilege to edit this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.sites
    (tenant_id, slug, headline, about, phone, address_line1, locality, region,
     postal_code, map_url, booking_url)
  values (p_tenant, p_slug, p_headline, p_about, p_phone, p_address, p_locality,
          p_region, p_postal, p_map_url, p_booking_url)
  on conflict (tenant_id) do update
    -- coalesce, so a partial edit does not blank the fields it did not mention.
    set slug          = excluded.slug,
        headline      = coalesce(excluded.headline, barberos.sites.headline),
        about         = coalesce(excluded.about, barberos.sites.about),
        phone         = coalesce(excluded.phone, barberos.sites.phone),
        address_line1 = coalesce(excluded.address_line1, barberos.sites.address_line1),
        locality      = coalesce(excluded.locality, barberos.sites.locality),
        region        = coalesce(excluded.region, barberos.sites.region),
        postal_code   = coalesce(excluded.postal_code, barberos.sites.postal_code),
        map_url       = coalesce(excluded.map_url, barberos.sites.map_url),
        booking_url   = coalesce(excluded.booking_url, barberos.sites.booking_url),
        updated_at    = now();
  return p_tenant;
end; $$;
revoke all on function barberos.upsert_site(uuid, extensions.citext, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function barberos.upsert_site(uuid, extensions.citext, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function barberos.set_site_hours(
  p_tenant uuid, p_day smallint, p_closed boolean,
  p_opens time default null, p_closes time default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.site.update') then
    raise exception 'insufficient privilege to edit this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.site_hours (tenant_id, day_of_week, is_closed, opens_at, closes_at)
  values (p_tenant, p_day, p_closed, p_opens, p_closes)
  on conflict (tenant_id, day_of_week) do update
    set is_closed = excluded.is_closed,
        opens_at  = excluded.opens_at,
        closes_at = excluded.closes_at;
end; $$;
revoke all on function barberos.set_site_hours(uuid, smallint, boolean, time, time) from public, anon;
grant execute on function barberos.set_site_hours(uuid, smallint, boolean, time, time) to authenticated;

create or replace function barberos.upsert_site_service(
  p_tenant uuid, p_name text, p_price_cents integer default null,
  p_duration integer default null, p_order integer default 0)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not identity.has_permission(p_tenant, 'barberos.site.update') then
    raise exception 'insufficient privilege to edit this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.site_services (tenant_id, name, price_cents, duration_minutes, display_order)
  values (p_tenant, p_name, p_price_cents, p_duration, coalesce(p_order, 0))
  on conflict (tenant_id, name) do update
    set price_cents      = excluded.price_cents,
        duration_minutes = excluded.duration_minutes,
        display_order    = excluded.display_order
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function barberos.upsert_site_service(uuid, text, integer, integer, integer) from public, anon;
grant execute on function barberos.upsert_site_service(uuid, text, integer, integer, integer) to authenticated;

create or replace function barberos.set_site_link(
  p_tenant uuid, p_kind barberos.site_link_kind, p_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.site.update') then
    raise exception 'insufficient privilege to edit this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  if p_url is null then
    delete from barberos.site_links l where l.tenant_id = p_tenant and l.kind = p_kind;
    return;
  end if;
  insert into barberos.site_links (tenant_id, kind, url) values (p_tenant, p_kind, p_url)
  on conflict (tenant_id, kind) do update set url = excluded.url;
end; $$;
revoke all on function barberos.set_site_link(uuid, barberos.site_link_kind, text) from public, anon;
grant execute on function barberos.set_site_link(uuid, barberos.site_link_kind, text) to authenticated;

-- --- Publishing -------------------------------------------------------------
-- Separate from editing, and a different permission: putting a page in front of
-- the public is a decision, not a save.
create or replace function barberos.publish_site(p_tenant uuid)
returns barberos.site_status language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.publication.manage') then
    raise exception 'insufficient privilege to publish this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  update barberos.sites s
     set status = 'published', published_at = now(), published_by = auth.uid()
   where s.tenant_id = p_tenant;
  if not found then
    raise exception 'this shop has no page to publish' using errcode = 'no_data_found';
  end if;
  perform events.emit('barberos.site.published', p_tenant,
    jsonb_build_object('tenant', p_tenant));
  return 'published';
end; $$;
revoke all on function barberos.publish_site(uuid) from public, anon;
grant execute on function barberos.publish_site(uuid) to authenticated;

create or replace function barberos.unpublish_site(p_tenant uuid)
returns barberos.site_status language plpgsql volatile security definer set search_path = '' as $$
begin
  if not identity.has_permission(p_tenant, 'barberos.publication.manage') then
    raise exception 'insufficient privilege to unpublish this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  -- published_at is cleared because the constraint ties it to being published.
  -- The audit trail of who published and when lives in audit.emit(), which
  -- keeps the whole history; the row only carries the current fact.
  update barberos.sites s
     set status = 'unpublished', published_at = null
   where s.tenant_id = p_tenant;
  if not found then
    raise exception 'this shop has no page' using errcode = 'no_data_found';
  end if;
  perform events.emit('barberos.site.unpublished', p_tenant,
    jsonb_build_object('tenant', p_tenant));
  return 'unpublished';
end; $$;
revoke all on function barberos.unpublish_site(uuid) from public, anon;
grant execute on function barberos.unpublish_site(uuid) to authenticated;

-- --- Read path --------------------------------------------------------------
-- Everything the renderer needs, in one call, as stored. No section is
-- fabricated: an absent one comes back as an empty array or null and the page
-- simply does not have it.
create or replace function barberos.site_content(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s barberos.sites%rowtype; v_out jsonb;
begin
  select * into v_s from barberos.sites where tenant_id = p_tenant;
  if v_s.tenant_id is null then return null; end if;
  if not (identity.has_permission(p_tenant, 'barberos.shop.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'slug', v_s.slug, 'status', v_s.status,
    'shop_name', (select sh.shop_name from barberos.shops sh where sh.tenant_id = p_tenant),
    'headline', v_s.headline, 'about', v_s.about, 'phone', v_s.phone,
    'address_line1', v_s.address_line1, 'locality', v_s.locality,
    'region', v_s.region, 'postal_code', v_s.postal_code,
    'map_url', v_s.map_url, 'booking_url', v_s.booking_url,
    'published_at', v_s.published_at,
    'hours', coalesce((select jsonb_agg(jsonb_build_object(
        'day', h.day_of_week, 'closed', h.is_closed,
        'opens', h.opens_at, 'closes', h.closes_at) order by h.day_of_week)
      from barberos.site_hours h where h.tenant_id = p_tenant), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'name', sv.name, 'price_cents', sv.price_cents,
        'duration_minutes', sv.duration_minutes) order by sv.display_order, sv.name)
      from barberos.site_services sv where sv.tenant_id = p_tenant), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url)
        order by l.kind)
      from barberos.site_links l where l.tenant_id = p_tenant), '[]'::jsonb)
  ) into v_out;
  return v_out;
end; $$;
revoke all on function barberos.site_content(uuid) from public, anon;
grant execute on function barberos.site_content(uuid) to authenticated;

-- ===========================================================================
-- Permissions
-- ===========================================================================
-- THREE DIFFERENT ACTS, THREE PERMISSIONS.
--
-- 0048 gave `manager` read-only access to the shop, reasoning that turning a
-- capability on is a commercial decision. That is right, and it is also why
-- editing the PAGE needs a permission of its own: putting this week's prices up
-- is the daily work of running a shop, not a commercial decision, and a manager
-- who cannot do it will phone the owner instead -- or the page will go stale,
-- which is the failure this module exists to fix.
--
--   barberos.site.update         edit the page       owner, admin, MANAGER
--   barberos.publication.manage  put it in public    owner, admin
--   barberos.shop.manage         the shop + what it pays for   owner, admin
--
-- `publication.manage`, not `site.publish`: identity.permissions enforces a
-- CLOSED action vocabulary (read/create/update/delete/revoke/assign/manage) so
-- that permission names cannot drift into a vague hierarchy. `social` hit the
-- same wall for the same reason and named it `social.publication.manage`; this
-- follows that, so the two modules describe the same act the same way.
insert into identity.permissions (key, description, scope) values
  ('barberos.site.update',        'Edit the content of the shop''s public page.', 'tenant'),
  ('barberos.publication.manage', 'Publish or unpublish the shop''s public page.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','barberos.site.update'), ('tenant_owner','barberos.publication.manage'),
  ('tenant_admin','barberos.site.update'), ('tenant_admin','barberos.publication.manage'),
  ('manager','barberos.site.update')
on conflict do nothing;
-- Deliberate: a `manager` edits the page but cannot put it in front of the
-- public, and `staff` and `viewer` can do neither. Editing is work; publishing
-- is a decision.

-- ===========================================================================
-- The promotion
--
-- The one line that makes this capability real. Until now `enable_capability`
-- has refused `owned_website` because it was 'planned'. It ships here, in the
-- same migration that gives it tables, so the catalog has never claimed a
-- module that did not work.
-- ===========================================================================
update barberos.capabilities
   set status = 'available',
       description = 'A page the shop owns: hours, services, prices, address, '
                     'tap-to-call and a booking link. Replaces a booking-platform-hosted page.',
       version = version + 1
 where key = 'owned_website';
