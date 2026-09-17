-- ===========================================================================
-- hlbos_0050 — BarberOS: the shop record and its owned website
--
-- PROVENANCE: see 0049. This reconstructs part of the `barberos` schema's end
-- state as it already exists in canonical production, where it was applied
-- under the names hlbos_0052_barberos_owned_website and
-- hlbos_0056_barberos_shop_api. ALREADY APPLIED THERE — do not re-apply.
--
-- WHAT THIS IS
--
-- A barbershop's page, owned by the shop rather than rented from a booking
-- platform. One shop and one site per tenant (tenant_id is the primary key of
-- both), which is the honest shape of what BarberOS supports today: there is no
-- second location, and pretending otherwise with a locations table nothing
-- writes to would be a control that controls nothing.
--
-- Two guards are worth reading:
--
--   * enforce_publishable() refuses to publish a page that is missing a
--     headline, a street address, a way to act (phone or booking link), or
--     opening hours for at least one day. A published page that cannot tell a
--     visitor where the shop is or how to book is worse than no page.
--
--   * every write here is gated on the `owned_website` capability by
--     require_capability(), so the capability toggle from 0049 genuinely
--     controls the feature rather than only hiding it.
--
-- published_site() and published_sitemap() are the public read path. They are
-- SECURITY DEFINER and return only published rows — the published-only rule is
-- inside the lookup, so no code path in either function ever holds a draft.
-- Migration 0052 grants them to `anon`; that is deliberate and is what makes a
-- shop's page reachable by the public internet.
--
-- rollback:
--   -- approved-destructive: reverses only what this migration created.
--   DROP TABLE IF EXISTS barberos.site_links, barberos.site_hours,
--                        barberos.site_services, barberos.sites,
--                        barberos.shops CASCADE;
--   DROP TYPE IF EXISTS barberos.site_link_kind, barberos.site_status;
-- ===========================================================================

do $$ begin create type barberos.site_status as enum ('draft','published','unpublished');
exception when duplicate_object then null; end $$;
do $$ begin create type barberos.site_link_kind as enum ('instagram','facebook','google_business','tiktok','yelp','x');
exception when duplicate_object then null; end $$;

-- --- the shop --------------------------------------------------------------
-- origin_prospect_id links a paying shop back to the prospect record it came
-- from, so the diagnostic that won the customer stays attached to them.
create table if not exists barberos.shops (
  tenant_id          uuid primary key references platform.tenants(id) on delete cascade,
  shop_name          text not null,
  chair_count        integer not null default 1,
  timezone           text not null default 'America/New_York',
  origin_prospect_id uuid references visibility.prospects(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shops_name_present check (length(btrim(shop_name)) > 0),
  constraint shops_chair_count_pos check (chair_count > 0)
);

-- --- the page --------------------------------------------------------------
create table if not exists barberos.sites (
  tenant_id     uuid primary key references barberos.shops(tenant_id) on delete cascade,
  slug          extensions.citext not null unique,
  headline      text,
  about         text,
  phone         text,
  address_line1 text,
  locality      text,
  region        text,
  postal_code   text,
  map_url       text,
  booking_url   text,
  status        barberos.site_status not null default 'draft',
  published_at  timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sites_slug_format check (slug::text ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- published and published_at move together, in both directions
  constraint sites_published_has_provenance
    check ((status = 'published') = (published_at is not null)),
  constraint sites_url_shape check (
    (booking_url is null or booking_url ~* '^https?://') and
    (map_url is null or map_url ~* '^https?://'))
);
create index if not exists sites_status_idx on barberos.sites (status);

create table if not exists barberos.site_services (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references barberos.sites(tenant_id) on delete cascade,
  name             text not null,
  price_cents      integer,
  duration_minutes integer,
  display_order    integer not null default 0,
  constraint site_services_name_present check (length(btrim(name)) > 0),
  constraint site_services_name_unique unique (tenant_id, name),
  constraint site_services_price_positive check (price_cents is null or price_cents > 0),
  constraint site_services_duration_positive check (duration_minutes is null or duration_minutes > 0)
);
create index if not exists site_services_tenant_idx on barberos.site_services (tenant_id, display_order);

create table if not exists barberos.site_hours (
  tenant_id   uuid not null references barberos.sites(tenant_id) on delete cascade,
  day_of_week smallint not null,
  is_closed   boolean not null default false,
  opens_at    time,
  closes_at   time,
  primary key (tenant_id, day_of_week),
  constraint site_hours_day_range check (day_of_week >= 0 and day_of_week <= 6),
  -- closed means no times; open means both times. No half-stated day.
  constraint site_hours_closed_or_complete check (
    (is_closed and opens_at is null and closes_at is null) or
    (not is_closed and opens_at is not null and closes_at is not null)),
  constraint site_hours_opens_before_closes check (is_closed or closes_at > opens_at)
);

create table if not exists barberos.site_links (
  tenant_id uuid not null references barberos.sites(tenant_id) on delete cascade,
  kind      barberos.site_link_kind not null,
  url       text not null,
  primary key (tenant_id, kind),
  constraint site_links_url_shape check (url ~* '^https?://')
);

-- --- the publish gate ------------------------------------------------------
create or replace function barberos.enforce_publishable()
returns trigger language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

-- --- triggers --------------------------------------------------------------
drop trigger if exists shops_set_updated_at on barberos.shops;
create trigger shops_set_updated_at before update on barberos.shops
  for each row execute function platform.set_updated_at();
drop trigger if exists shops_audit on barberos.shops;
create trigger shops_audit after insert or update or delete on barberos.shops
  for each row execute function audit.emit();

drop trigger if exists sites_set_updated_at on barberos.sites;
create trigger sites_set_updated_at before update on barberos.sites
  for each row execute function platform.set_updated_at();
drop trigger if exists sites_audit on barberos.sites;
create trigger sites_audit after insert or update or delete on barberos.sites
  for each row execute function audit.emit();
drop trigger if exists sites_requires_capability on barberos.sites;
create trigger sites_requires_capability before insert or update on barberos.sites
  for each row execute function barberos.require_capability('owned_website');
drop trigger if exists sites_publishable on barberos.sites;
create trigger sites_publishable before insert or update on barberos.sites
  for each row execute function barberos.enforce_publishable();

drop trigger if exists site_services_requires_capability on barberos.site_services;
create trigger site_services_requires_capability before insert or update or delete on barberos.site_services
  for each row execute function barberos.require_capability('owned_website');
drop trigger if exists site_hours_requires_capability on barberos.site_hours;
create trigger site_hours_requires_capability before insert or update or delete on barberos.site_hours
  for each row execute function barberos.require_capability('owned_website');
drop trigger if exists site_links_requires_capability on barberos.site_links;
create trigger site_links_requires_capability before insert or update or delete on barberos.site_links
  for each row execute function barberos.require_capability('owned_website');

-- --- RLS -------------------------------------------------------------------
alter table barberos.shops         enable row level security; alter table barberos.shops         force row level security;
alter table barberos.sites         enable row level security; alter table barberos.sites         force row level security;
alter table barberos.site_services enable row level security; alter table barberos.site_services force row level security;
alter table barberos.site_hours    enable row level security; alter table barberos.site_hours    force row level security;
alter table barberos.site_links    enable row level security; alter table barberos.site_links    force row level security;

drop policy if exists shops_select on barberos.shops;
create policy shops_select on barberos.shops for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read') or identity.is_platform_admin());
drop policy if exists sites_select on barberos.sites;
create policy sites_select on barberos.sites for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read') or identity.is_platform_admin());

-- The child tables inherit reachability from the parent site row, which is
-- itself permission-gated above.
drop policy if exists site_services_select on barberos.site_services;
create policy site_services_select on barberos.site_services for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_services.tenant_id));
drop policy if exists site_hours_select on barberos.site_hours;
create policy site_hours_select on barberos.site_hours for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_hours.tenant_id));
drop policy if exists site_links_select on barberos.site_links;
create policy site_links_select on barberos.site_links for select to authenticated
  using (exists (select 1 from barberos.sites s where s.tenant_id = site_links.tenant_id));

grant select on barberos.shops, barberos.sites, barberos.site_services,
                barberos.site_hours, barberos.site_links to authenticated;

-- --- writes ----------------------------------------------------------------
create or replace function barberos.upsert_shop(
  p_tenant uuid, p_shop_name text, p_chair_count integer default 1,
  p_timezone text default 'America/New_York', p_origin_prospect uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
begin
  if not identity.has_permission(p_tenant, 'barberos.shop.manage') then
    raise exception 'insufficient privilege to configure a barbershop'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.shops (tenant_id, shop_name, chair_count, timezone, origin_prospect_id)
  values (p_tenant, p_shop_name, coalesce(p_chair_count, 1),
          coalesce(p_timezone, 'America/New_York'), p_origin_prospect)
  on conflict (tenant_id) do update
    set shop_name          = excluded.shop_name,
        chair_count        = excluded.chair_count,
        timezone           = excluded.timezone,
        origin_prospect_id = coalesce(excluded.origin_prospect_id, barberos.shops.origin_prospect_id),
        updated_at         = now();
  return p_tenant;
end; $function$;

create or replace function barberos.upsert_site(
  p_tenant uuid, p_slug extensions.citext, p_headline text default null,
  p_about text default null, p_phone text default null, p_address text default null,
  p_locality text default null, p_region text default null, p_postal text default null,
  p_map_url text default null, p_booking_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

create or replace function barberos.upsert_site_service(
  p_tenant uuid, p_name text, p_price_cents integer default null,
  p_duration integer default null, p_order integer default 0)
returns bigint language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

create or replace function barberos.delete_site_service(p_tenant uuid, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_found boolean;
begin
  if not identity.has_permission(p_tenant, 'barberos.site.update') then
    raise exception 'insufficient privilege to edit this shop''s page'
      using errcode = 'insufficient_privilege';
  end if;
  delete from barberos.site_services s
   where s.tenant_id = p_tenant and s.name = p_name;
  get diagnostics v_found = row_count;
  -- Reports whether anything was actually removed, so a UI can tell "deleted"
  -- from "there was nothing there" instead of claiming success either way.
  return v_found;
end; $function$;

create or replace function barberos.set_site_hours(
  p_tenant uuid, p_day smallint, p_closed boolean,
  p_opens time default null, p_closes time default null)
returns void language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

create or replace function barberos.set_site_link(
  p_tenant uuid, p_kind barberos.site_link_kind, p_url text)
returns void language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

-- --- publish / unpublish ---------------------------------------------------
create or replace function barberos.publish_site(p_tenant uuid)
returns barberos.site_status language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

create or replace function barberos.unpublish_site(p_tenant uuid)
returns barberos.site_status language plpgsql security definer set search_path = '' as $function$
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
end; $function$;

-- --- reads -----------------------------------------------------------------
-- The owner's view of their own page, at any status.
create or replace function barberos.site_content(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
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
end; $function$;

-- The PUBLIC read. Published rows only, enforced in the lookup itself.
create or replace function barberos.published_site(p_slug extensions.citext)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_s barberos.sites%rowtype;
begin
  -- The published-only rule is IN the lookup, not applied after it. There is no
  -- code path in this function that has a draft in hand.
  select * into v_s from barberos.sites s
   where s.slug = p_slug and s.status = 'published';
  if v_s.tenant_id is null then return null; end if;

  -- tenant_id, published_by, created_at and updated_at are deliberately absent.
  -- A visitor needs the shop's facts; the platform's internal identifiers are
  -- not among them.
  return jsonb_build_object(
    'slug', v_s.slug, 'status', v_s.status,
    'shop_name', (select sh.shop_name from barberos.shops sh
                   where sh.tenant_id = v_s.tenant_id),
    'headline', v_s.headline, 'about', v_s.about, 'phone', v_s.phone,
    'address_line1', v_s.address_line1, 'locality', v_s.locality,
    'region', v_s.region, 'postal_code', v_s.postal_code,
    'map_url', v_s.map_url, 'booking_url', v_s.booking_url,
    'published_at', v_s.published_at,
    'hours', coalesce((select jsonb_agg(jsonb_build_object(
        'day', h.day_of_week, 'closed', h.is_closed,
        'opens', h.opens_at, 'closes', h.closes_at) order by h.day_of_week)
      from barberos.site_hours h where h.tenant_id = v_s.tenant_id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'name', sv.name, 'price_cents', sv.price_cents,
        'duration_minutes', sv.duration_minutes) order by sv.display_order, sv.name)
      from barberos.site_services sv where sv.tenant_id = v_s.tenant_id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'url', l.url)
        order by l.kind)
      from barberos.site_links l where l.tenant_id = v_s.tenant_id), '[]'::jsonb)
  );
end; $function$;

create or replace function barberos.published_sitemap()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', s.slug, 'published_at', s.published_at)
         order by s.published_at desc nulls last, s.slug), '[]'::jsonb)
    from barberos.sites s
   where s.status = 'published';
$function$;

revoke all on function barberos.upsert_shop(uuid, text, integer, text, uuid) from public, anon;
revoke all on function barberos.upsert_site(uuid, extensions.citext, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function barberos.upsert_site_service(uuid, text, integer, integer, integer) from public, anon;
revoke all on function barberos.delete_site_service(uuid, text) from public, anon;
revoke all on function barberos.set_site_hours(uuid, smallint, boolean, time, time) from public, anon;
revoke all on function barberos.set_site_link(uuid, barberos.site_link_kind, text) from public, anon;
revoke all on function barberos.publish_site(uuid) from public, anon;
revoke all on function barberos.unpublish_site(uuid) from public, anon;
revoke all on function barberos.site_content(uuid) from public, anon;
revoke all on function barberos.published_site(extensions.citext) from public;
revoke all on function barberos.published_sitemap() from public;

grant execute on function barberos.upsert_shop(uuid, text, integer, text, uuid) to authenticated;
grant execute on function barberos.upsert_site(uuid, extensions.citext, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function barberos.upsert_site_service(uuid, text, integer, integer, integer) to authenticated;
grant execute on function barberos.delete_site_service(uuid, text) to authenticated;
grant execute on function barberos.set_site_hours(uuid, smallint, boolean, time, time) to authenticated;
grant execute on function barberos.set_site_link(uuid, barberos.site_link_kind, text) to authenticated;
grant execute on function barberos.publish_site(uuid) to authenticated;
grant execute on function barberos.unpublish_site(uuid) to authenticated;
grant execute on function barberos.site_content(uuid) to authenticated;
-- These two also carry authenticated:EXECUTE in production. The public path does
-- not need it -- public.barberos_published_site is SECURITY DEFINER and runs
-- these as the definer -- but a signed-in caller may reach them directly, and
-- both are published-only by construction. Matching production exactly matters
-- more here than trimming a grant nothing depends on.
grant execute on function barberos.published_site(extensions.citext) to authenticated;
grant execute on function barberos.published_sitemap() to authenticated;
