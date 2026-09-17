-- ===========================================================================
-- hlbos_0052 — BarberOS: the public API surface
--
-- PROVENANCE: see 0049. This reconstructs part of the `barberos` schema's end
-- state as it already exists in canonical production, where it was applied
-- under the names hlbos_0053_barberos_public_site_read,
-- hlbos_0056_barberos_shop_api and hlbos_0057_barberos_product_map.
-- ALREADY APPLIED THERE — do not re-apply.
--
-- WHY THESE WRAPPERS EXIST
--
-- The `barberos` schema is NOT exposed through PostgREST. An application
-- reaches it only through these seventeen functions in `public`, which is the
-- same pattern bti_* and hlvs_* already use on this platform.
--
-- Every wrapper except the two public-site reads is SECURITY INVOKER. It runs
-- as the caller and delegates to the SECURITY DEFINER function in `barberos`,
-- which performs its own identity.has_permission() check and raises
-- insufficient_privilege on failure. The wrapper adds reachability, never
-- authority — so no wrapper can hand a caller a permission the inner function
-- would have refused.
--
-- THE TWO DELIBERATE EXCEPTIONS
--
-- barberos_published_site() and barberos_published_sitemap() are SECURITY
-- DEFINER and granted to `anon`. That is the entire point of them: a shop's
-- page has to be readable by a member of the public who is not signed in to
-- anything. Supabase's security advisor flags both as
-- "anon_security_definer_function_executable", and on this platform that
-- warning is EXPECTED rather than a defect — it is the intended design, and
-- the reason it is safe is that barberos.published_site() filters on
-- status='published' inside the lookup itself, so neither function has any
-- code path that holds a draft row. Nothing else in `barberos` is granted to
-- anon, at all.
--
-- rollback:
--   DROP FUNCTION IF EXISTS
--     public.barberos_my_shops(), public.barberos_site(uuid),
--     public.barberos_save_site(uuid,text,text,text,text,text,text,text,text,text,text),
--     public.barberos_save_service(uuid,text,integer,integer,integer),
--     public.barberos_delete_service(uuid,text),
--     public.barberos_set_hours(uuid,smallint,boolean,time,time),
--     public.barberos_set_link(uuid,text,text),
--     public.barberos_publish(uuid), public.barberos_unpublish(uuid),
--     public.barberos_published_site(text), public.barberos_published_sitemap(),
--     public.barberos_clients(uuid,text), public.barberos_client(uuid),
--     public.barberos_clients_due(uuid),
--     public.barberos_save_client(uuid,text,text,text,text),
--     public.barberos_record_visit(uuid,uuid,jsonb), public.barberos_tools(uuid);
-- ===========================================================================

-- --- shop + page: owner-facing --------------------------------------------
-- The one call an app makes on sign-in: which shops am I a member of, what is
-- switched on, and what am I allowed to do. `can` is computed from the real
-- permission checks, so a UI hides a button because the permission is absent,
-- not because someone hardcoded a role name.
create or replace function public.barberos_my_shops()
returns jsonb language plpgsql stable set search_path = '' as $function$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x order by x->>'shop_name'), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
               'tenant_id', sh.tenant_id,
               'tenant_slug', t.slug,
               'shop_name', sh.shop_name,
               'chair_count', sh.chair_count,
               'timezone', sh.timezone,
               'capabilities', coalesce((
                  select jsonb_agg(tc.capability_key::text order by tc.capability_key)
                    from barberos.tenant_capabilities tc
                   where tc.tenant_id = sh.tenant_id), '[]'::jsonb),
               'site', (select jsonb_build_object('slug', s.slug, 'status', s.status)
                          from barberos.sites s where s.tenant_id = sh.tenant_id),
               'can', jsonb_build_object(
                  'read_shop',  identity.has_permission(sh.tenant_id, 'barberos.shop.read'),
                  'edit_page',  identity.has_permission(sh.tenant_id, 'barberos.site.update'),
                  'publish',    identity.has_permission(sh.tenant_id, 'barberos.publication.manage'),
                  'manage_shop', identity.has_permission(sh.tenant_id, 'barberos.shop.manage'))
             ) as x
        from barberos.shops sh
        join platform.tenants t on t.id = sh.tenant_id
       where exists (
         select 1 from identity.memberships m
          where m.tenant_id = sh.tenant_id
            and m.user_id = v_uid
            and m.status = 'active')
    ) q;
  return v_out;
end; $function$;

create or replace function public.barberos_site(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select barberos.site_content(p_tenant);
$function$;

create or replace function public.barberos_save_site(
  p_tenant uuid, p_slug text, p_headline text default null, p_about text default null,
  p_phone text default null, p_address text default null, p_locality text default null,
  p_region text default null, p_postal text default null, p_map_url text default null,
  p_booking_url text default null)
returns uuid language sql set search_path = '' as $function$
  select barberos.upsert_site(p_tenant, p_slug::extensions.citext, p_headline, p_about,
                              p_phone, p_address, p_locality, p_region, p_postal,
                              p_map_url, p_booking_url);
$function$;

create or replace function public.barberos_save_service(
  p_tenant uuid, p_name text, p_price_cents integer default null,
  p_duration integer default null, p_order integer default 0)
returns bigint language sql set search_path = '' as $function$
  select barberos.upsert_site_service(p_tenant, p_name, p_price_cents, p_duration, p_order);
$function$;

create or replace function public.barberos_delete_service(p_tenant uuid, p_name text)
returns boolean language sql set search_path = '' as $function$
  select barberos.delete_site_service(p_tenant, p_name);
$function$;

create or replace function public.barberos_set_hours(
  p_tenant uuid, p_day smallint, p_closed boolean,
  p_opens time default null, p_closes time default null)
returns void language sql set search_path = '' as $function$
  select barberos.set_site_hours(p_tenant, p_day, p_closed, p_opens, p_closes);
$function$;

-- p_kind is text at the boundary and cast inside, so a client never has to know
-- the enum type name to call the API.
create or replace function public.barberos_set_link(p_tenant uuid, p_kind text, p_url text)
returns void language sql set search_path = '' as $function$
  select barberos.set_site_link(p_tenant, p_kind::barberos.site_link_kind, p_url);
$function$;

create or replace function public.barberos_publish(p_tenant uuid)
returns text language sql set search_path = '' as $function$
  select barberos.publish_site(p_tenant)::text;
$function$;

create or replace function public.barberos_unpublish(p_tenant uuid)
returns text language sql set search_path = '' as $function$
  select barberos.unpublish_site(p_tenant)::text;
$function$;

-- --- the public page: the ONLY anon-reachable surface ----------------------
create or replace function public.barberos_published_site(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select barberos.published_site(p_slug::extensions.citext);
$function$;

create or replace function public.barberos_published_sitemap()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select barberos.published_sitemap();
$function$;

-- --- clients ---------------------------------------------------------------
create or replace function public.barberos_clients(p_tenant uuid, p_search text default null)
returns jsonb language sql stable set search_path = '' as $function$
  select barberos.client_list(p_tenant, p_search);
$function$;

create or replace function public.barberos_client(p_client uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select barberos.client_timeline(p_client);
$function$;

create or replace function public.barberos_clients_due(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select barberos.clients_due(p_tenant);
$function$;

create or replace function public.barberos_save_client(
  p_tenant uuid, p_name text, p_phone text default null,
  p_email text default null, p_notes text default null)
returns uuid language sql set search_path = '' as $function$
  select barberos.upsert_client(p_tenant, p_name, p_phone, p_email, p_notes);
$function$;

create or replace function public.barberos_record_visit(p_tenant uuid, p_client uuid, p_visit jsonb)
returns uuid language sql set search_path = '' as $function$
  select barberos.record_visit(p_tenant, p_client, p_visit);
$function$;

create or replace function public.barberos_tools(p_tenant uuid)
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'kind', t.kind)
                            order by t.name), '[]'::jsonb)
    from barberos.tools t where t.tenant_id = p_tenant;
$function$;

-- --- grants ----------------------------------------------------------------
-- Revoke from everyone first, then grant back deliberately. `anon` gets exactly
-- two functions and nothing else.
revoke all on function public.barberos_my_shops() from public, anon;
revoke all on function public.barberos_site(uuid) from public, anon;
revoke all on function public.barberos_save_site(uuid,text,text,text,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.barberos_save_service(uuid,text,integer,integer,integer) from public, anon;
revoke all on function public.barberos_delete_service(uuid,text) from public, anon;
revoke all on function public.barberos_set_hours(uuid,smallint,boolean,time,time) from public, anon;
revoke all on function public.barberos_set_link(uuid,text,text) from public, anon;
revoke all on function public.barberos_publish(uuid) from public, anon;
revoke all on function public.barberos_unpublish(uuid) from public, anon;
revoke all on function public.barberos_clients(uuid,text) from public, anon;
revoke all on function public.barberos_client(uuid) from public, anon;
revoke all on function public.barberos_clients_due(uuid) from public, anon;
revoke all on function public.barberos_save_client(uuid,text,text,text,text) from public, anon;
revoke all on function public.barberos_record_visit(uuid,uuid,jsonb) from public, anon;
revoke all on function public.barberos_tools(uuid) from public, anon;
revoke all on function public.barberos_published_site(text) from public;
revoke all on function public.barberos_published_sitemap() from public;

grant execute on function public.barberos_my_shops() to authenticated;
grant execute on function public.barberos_site(uuid) to authenticated;
grant execute on function public.barberos_save_site(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.barberos_save_service(uuid,text,integer,integer,integer) to authenticated;
grant execute on function public.barberos_delete_service(uuid,text) to authenticated;
grant execute on function public.barberos_set_hours(uuid,smallint,boolean,time,time) to authenticated;
grant execute on function public.barberos_set_link(uuid,text,text) to authenticated;
grant execute on function public.barberos_publish(uuid) to authenticated;
grant execute on function public.barberos_unpublish(uuid) to authenticated;
grant execute on function public.barberos_clients(uuid,text) to authenticated;
grant execute on function public.barberos_client(uuid) to authenticated;
grant execute on function public.barberos_clients_due(uuid) to authenticated;
grant execute on function public.barberos_save_client(uuid,text,text,text,text) to authenticated;
grant execute on function public.barberos_record_visit(uuid,uuid,jsonb) to authenticated;
grant execute on function public.barberos_tools(uuid) to authenticated;

-- The public page. Intentional, and the only anon grant in BarberOS.
grant execute on function public.barberos_published_site(text) to anon, authenticated;
grant execute on function public.barberos_published_sitemap() to anon, authenticated;
