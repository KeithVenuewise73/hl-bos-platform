-- ===========================================================================
-- The public read, in barberos where the rule belongs
-- ===========================================================================
create or replace function barberos.published_site(p_slug extensions.citext)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
comment on function barberos.published_site(extensions.citext) is
  'The public read: a published page by slug, or NULL. A draft, an unpublished page and a slug nobody has used are all NULL, so absence cannot be told apart from privacy.';

create or replace function barberos.published_sitemap()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', s.slug, 'published_at', s.published_at)
         order by s.published_at desc nulls last, s.slug), '[]'::jsonb)
    from barberos.sites s
   where s.status = 'published';
$$;
comment on function barberos.published_sitemap() is
  'Every published slug, for the sitemap. Published only -- unpublishing removes a shop from it.';

-- Read-only, and reached ONLY through the wrappers below. `anon` is given no
-- USAGE on this schema, so it cannot call these directly and cannot see what
-- else lives here.
revoke all on function barberos.published_site(extensions.citext) from public, anon;
revoke all on function barberos.published_sitemap() from public, anon;
grant execute on function barberos.published_site(extensions.citext) to authenticated;
grant execute on function barberos.published_sitemap() to authenticated;

-- ===========================================================================
-- The wrappers PostgREST can actually see
--
-- SECURITY DEFINER, for the reason argued in the header: it is what lets `anon`
-- stay out of schema `barberos` entirely. Each is one statement, pinned
-- search_path, no dynamic SQL, and STABLE -- there is no write reachable from
-- either, at any depth.
-- ===========================================================================
create or replace function public.barberos_published_site(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select barberos.published_site(p_slug::extensions.citext);
$$;
comment on function public.barberos_published_site(text) is
  'The one HTTP-reachable door to a published shop page. SECURITY DEFINER so that anon needs no USAGE on schema barberos; published-only is enforced by barberos.published_site().';

create or replace function public.barberos_published_sitemap()
returns jsonb language sql stable security definer set search_path = '' as $$
  select barberos.published_sitemap();
$$;
comment on function public.barberos_published_sitemap() is
  'Every published slug, for the sitemap. SECURITY DEFINER for the same reason as barberos_published_site().';

revoke all on function public.barberos_published_site(text) from public;
revoke all on function public.barberos_published_sitemap() from public;
grant execute on function public.barberos_published_site(text) to anon, authenticated;
grant execute on function public.barberos_published_sitemap() to anon, authenticated;