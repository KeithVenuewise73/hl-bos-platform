-- ===========================================================================
-- The missing operation
-- ===========================================================================
create or replace function barberos.delete_site_service(p_tenant uuid, p_name text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
comment on function barberos.delete_site_service(uuid, text) is
  'Remove one service from a shop''s price list. Returns whether a row was actually deleted.';
revoke all on function barberos.delete_site_service(uuid, text) from public, anon;
grant execute on function barberos.delete_site_service(uuid, text) to authenticated;

-- ===========================================================================
-- The entry point: what shops does the signed-in person run?
--
-- Everything the app needs to draw its first screen without guessing:
-- the shop, the capabilities actually switched on, whether a page exists --
-- and WHAT THIS PERSON MAY DO. That last part matters: the app cannot evaluate
-- identity.has_permission() itself, so without it every barber would be shown
-- a Publish button and told "insufficient privilege" only after pressing it.
-- A control that cannot do its job is worse than no control.
-- ===========================================================================
create or replace function public.barberos_my_shops()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
end; $$;
comment on function public.barberos_my_shops() is
  'The shops the signed-in person is an active member of, with the capabilities switched on and what they personally may do. Returns [] for a stranger rather than raising -- an empty list and a refusal look the same from outside.';
revoke all on function public.barberos_my_shops() from public, anon;
grant execute on function public.barberos_my_shops() to authenticated;

-- ===========================================================================
-- The page: read, edit, publish
--
-- Each of these is one line of delegation. The check, the capability gate and
-- the error message all still belong to the barberos function underneath.
-- ===========================================================================
create or replace function public.barberos_site(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.site_content(p_tenant);
$$;
comment on function public.barberos_site(uuid) is
  'A shop''s page as its owner sees it, draft included. Refuses without barberos.shop.read.';
revoke all on function public.barberos_site(uuid) from public, anon;
grant execute on function public.barberos_site(uuid) to authenticated;

create or replace function public.barberos_save_site(
  p_tenant uuid, p_slug text,
  p_headline text default null, p_about text default null,
  p_phone text default null, p_address text default null,
  p_locality text default null, p_region text default null,
  p_postal text default null, p_map_url text default null,
  p_booking_url text default null)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.upsert_site(p_tenant, p_slug::extensions.citext, p_headline, p_about,
                              p_phone, p_address, p_locality, p_region, p_postal,
                              p_map_url, p_booking_url);
$$;
comment on function public.barberos_save_site(uuid, text, text, text, text, text, text, text, text, text, text) is
  'Create or edit a shop''s page. Refuses without barberos.site.update, and the capability gate still applies.';
revoke all on function public.barberos_save_site(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.barberos_save_site(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.barberos_set_hours(
  p_tenant uuid, p_day smallint, p_closed boolean,
  p_opens time default null, p_closes time default null)
returns void language sql volatile security invoker set search_path = '' as $$
  select barberos.set_site_hours(p_tenant, p_day, p_closed, p_opens, p_closes);
$$;
revoke all on function public.barberos_set_hours(uuid, smallint, boolean, time, time) from public, anon;
grant execute on function public.barberos_set_hours(uuid, smallint, boolean, time, time) to authenticated;

create or replace function public.barberos_save_service(
  p_tenant uuid, p_name text, p_price_cents integer default null,
  p_duration integer default null, p_order integer default 0)
returns bigint language sql volatile security invoker set search_path = '' as $$
  select barberos.upsert_site_service(p_tenant, p_name, p_price_cents, p_duration, p_order);
$$;
revoke all on function public.barberos_save_service(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.barberos_save_service(uuid, text, integer, integer, integer) to authenticated;

create or replace function public.barberos_delete_service(p_tenant uuid, p_name text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select barberos.delete_site_service(p_tenant, p_name);
$$;
revoke all on function public.barberos_delete_service(uuid, text) from public, anon;
grant execute on function public.barberos_delete_service(uuid, text) to authenticated;

-- The link kind arrives as text and is cast to the closed vocabulary here. An
-- unknown kind is rejected by the cast with PostgreSQL's own enum error, which
-- is the behaviour we want: the renderer only knows how to label six kinds,
-- and a seventh must not reach the table.
create or replace function public.barberos_set_link(
  p_tenant uuid, p_kind text, p_url text)
returns void language sql volatile security invoker set search_path = '' as $$
  select barberos.set_site_link(p_tenant, p_kind::barberos.site_link_kind, p_url);
$$;
comment on function public.barberos_set_link(uuid, text, text) is
  'Set or, with a NULL url, remove one of the shop''s links. An unrecognised kind is refused by the enum cast.';
revoke all on function public.barberos_set_link(uuid, text, text) from public, anon;
grant execute on function public.barberos_set_link(uuid, text, text) to authenticated;

create or replace function public.barberos_publish(p_tenant uuid)
returns text language sql volatile security invoker set search_path = '' as $$
  select barberos.publish_site(p_tenant)::text;
$$;
comment on function public.barberos_publish(uuid) is
  'Put the shop''s page on the internet. Refuses without barberos.publication.manage, and the publishable check still applies.';
revoke all on function public.barberos_publish(uuid) from public, anon;
grant execute on function public.barberos_publish(uuid) to authenticated;

create or replace function public.barberos_unpublish(p_tenant uuid)
returns text language sql volatile security invoker set search_path = '' as $$
  select barberos.unpublish_site(p_tenant)::text;
$$;
revoke all on function public.barberos_unpublish(uuid) from public, anon;
grant execute on function public.barberos_unpublish(uuid) to authenticated;