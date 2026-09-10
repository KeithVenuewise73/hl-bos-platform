-- ===========================================================================
-- hlbos_0053_barberos_public_site_read — the read path for a visitor with no account
--
-- 0052 gave a shop a page and a way to publish it, and then nothing served it.
-- A published page that nobody outside the platform can read is not published;
-- it is a row that says 'published'. This is the migration that makes the word
-- true, and it is the ONLY new externally-reachable surface the module needs.
--
-- ---------------------------------------------------------------------------
-- WHY A NEW FUNCTION RATHER THAN REUSING barberos.site_content()
--
-- site_content() is the OWNER's view: it requires `barberos.shop.read`, returns
-- drafts, and is keyed by tenant_id. A customer standing outside has no
-- account, no permission and no business knowing a tenant_id. Handing the
-- public path the owner's function -- or, worse, letting a server call it with
-- the service-role key and filtering in application code -- would move the
-- published/draft decision out of the database and into a TypeScript `if`.
-- That is the failure 0052's gate trigger exists to avoid, and it would be a
-- strange thing to reintroduce one migration later.
--
-- So the public path is a separate function with a separate contract:
--
--   * it takes a SLUG, never a tenant_id, and never returns one
--   * it returns content ONLY for status = 'published'
--   * a draft, an unpublished page and a slug that was never used are
--     indistinguishable in its output -- all three are NULL. A visitor (or a
--     scraper) cannot learn that a shop has a page it has not published yet
--   * it is read-only and takes no other input
--
-- ---------------------------------------------------------------------------
-- WHY A public.* WRAPPER
--
-- PostgREST exposes exactly one schema (`supabase/config.toml`: schemas =
-- ["public"]), which is a security control the platform has been deliberate
-- about. `barberos` is not exposed and must not be: exposing it to reach one
-- read function would put every barberos table and every write function behind
-- an HTTP endpoint at the same time.
--
-- The established pattern here is a thin wrapper in `public` -- `bti_*`,
-- `graph_*`, `hlvs_*` all do this. EXECUTE is granted to `anon`, which is the
-- point of the migration and the first anon-executable path in the platform.
-- It reads published marketing copy and nothing else.
--
-- THE WRAPPERS ARE SECURITY DEFINER, AND THE FIRST DRAFT OF THIS MIGRATION HAD
-- THEM AS INVOKER. That looked tidier -- a wrapper holding no privilege of its
-- own, staying out of the `authenticated_security_definer_function_executable`
-- advisory the existing wrappers all appear in. It does not survive contact
-- with what it costs: an INVOKER wrapper runs AS `anon`, so `anon` needs USAGE
-- on schema `barberos` for the inner call to resolve at all.
--
-- Granting that would mean the public internet's reach into `barberos` is
-- bounded by every function in the schema having remembered to revoke the
-- EXECUTE that PostgreSQL grants to PUBLIC by default. Counted at the time of
-- writing: 5 of 19 barberos functions still carry that default. They are all
-- trigger functions, which refuse to run outside a trigger -- so nothing is
-- exposed today. But "nothing is exposed today, provided every future
-- migration remembers" is a standing invariant nobody is checking, and it
-- would be load-bearing for an unauthenticated caller.
--
-- SECURITY DEFINER here buys the opposite: `anon` gets no schema-level reach at
-- all, and the door is exactly two functions wide. Each has an empty
-- search_path, takes one text argument or none, and does nothing but call the
-- read above. The tidier version was the less safe one.
--
-- ---------------------------------------------------------------------------
-- THE SITEMAP IS A DECISION, NOT A DETAIL
--
-- `barberos_published_sitemap()` lists every published slug. That is an
-- aggregate view of who Herman Legacy Digital's live customers are, and it is
-- deliberate: a page nobody links to is a page no search engine will ever
-- index, and local search is the entire reason this module exists. A sitemap
-- is how these pages get found.
--
-- It lists PUBLISHED pages only. A shop that does not want to be in it
-- unpublishes, which is a control it already has, in the same place.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.barberos_published_site(text);
--   DROP FUNCTION IF EXISTS public.barberos_published_sitemap();
--   DROP FUNCTION IF EXISTS barberos.published_site(extensions.citext);
--   DROP FUNCTION IF EXISTS barberos.published_sitemap();
--   (Additive: four new read-only functions. No table, column or row is
--    changed, so reverting removes the public read path and nothing else.)
-- ===========================================================================

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
