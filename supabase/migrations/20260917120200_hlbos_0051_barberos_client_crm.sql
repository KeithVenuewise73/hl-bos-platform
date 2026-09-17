-- ===========================================================================
-- hlbos_0051 — BarberOS: the client book, the cut, and each client's rhythm
--
-- PROVENANCE: see 0049. This reconstructs part of the `barberos` schema's end
-- state as it already exists in canonical production, where it was applied
-- under the name hlbos_0058_barberos_client_crm. ALREADY APPLIED THERE — do
-- not re-apply.
--
-- WHAT THIS IS, AND WHY IT IS NOT AN APPOINTMENTS TABLE
--
-- `visits` records what was DONE, not what is booked. visited_on is a date in
-- the past and a constraint forbids the future. There is no availability, no
-- slot and no calendar here, because BarberOS has no booking engine yet;
-- calling this "appointments" would imply a scheduling system that does not
-- exist.
--
-- What it does hold is the cut itself: sides_guard, top_finish, top_guard,
-- fade, beard, beard_guard, line_up, part, and the tools used. That is the
-- point of the product. A regular's "the usual" is a real specification, and
-- writing it down is what lets it survive eighteen months and a change of
-- barber. Guard numbers are constrained to 0-8 because that is the range
-- clipper guards actually come in.
--
-- HONESTY BUILT INTO THE SHAPE
--
--   * client_rhythm() refuses to claim a rhythm from fewer than three visits.
--     It returns `basis` in plain words ('never visited', 'not enough visits
--     to know a rhythm', 'average of the last gaps') and overdue_by_days is
--     null — never 0 — when there is no rhythm to be overdue against. A
--     fabricated interval would produce fabricated reactivation campaigns.
--
--   * client_timeline() reports total_cents together with
--     visits_without_a_price. "$420 across 12 visits" must never be readable
--     without "3 of them have no price recorded", or the shop's lifetime-value
--     figure quietly becomes a lie.
--
--   * clients_due() is the overdue engine the retention capability will run on.
--     It only returns clients who have a known rhythm AND are past it.
--
-- rollback:
--   -- approved-destructive: reverses only what this migration created.
--   DROP TABLE IF EXISTS barberos.visit_tools, barberos.visits,
--                        barberos.tools, barberos.clients CASCADE;
--   DROP TYPE IF EXISTS barberos.tool_kind, barberos.fade_kind,
--                       barberos.top_finish;
-- ===========================================================================

do $$ begin create type barberos.top_finish as enum ('guard','scissor','razor','freehand');
exception when duplicate_object then null; end $$;
do $$ begin create type barberos.fade_kind as enum ('none','taper','low','mid','high','skin');
exception when duplicate_object then null; end $$;
do $$ begin create type barberos.tool_kind as enum ('clipper','trimmer','blade','guard','shear','razor','product','other');
exception when duplicate_object then null; end $$;

-- --- the client book -------------------------------------------------------
create table if not exists barberos.clients (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references platform.tenants(id) on delete cascade,
  display_name text not null,
  phone        text,
  email        extensions.citext,
  notes        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint clients_name_present check (length(btrim(display_name)) > 0)
);
create index if not exists clients_tenant_idx on barberos.clients (tenant_id, display_name);
-- Partial: a phone number identifies a person within a shop, but plenty of
-- walk-ins never give one, and a NULL must not collide with another NULL.
create unique index if not exists clients_tenant_phone_uniq
  on barberos.clients (tenant_id, phone) where phone is not null;

-- --- the shop's kit --------------------------------------------------------
create table if not exists barberos.tools (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  name       text not null,
  kind       barberos.tool_kind not null default 'other',
  created_at timestamptz not null default now(),
  constraint tools_name_present check (length(btrim(name)) > 0)
);
create unique index if not exists tools_tenant_name_uniq on barberos.tools (tenant_id, name);

-- --- the cut ---------------------------------------------------------------
create table if not exists barberos.visits (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references platform.tenants(id) on delete cascade,
  client_id        uuid not null references barberos.clients(id) on delete cascade,
  visited_on       date not null default current_date,
  barber           text,
  service_name     text,
  price_cents      integer,
  duration_minutes integer,
  sides_guard      smallint,
  top_finish       barberos.top_finish,
  top_guard        smallint,
  fade             barberos.fade_kind,
  beard            boolean not null default false,
  beard_guard      smallint,
  line_up          boolean not null default false,
  part             boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  -- This is a record of what happened, not a booking.
  constraint visits_not_in_the_future check (visited_on <= current_date),
  constraint visits_price_sane check (price_cents is null or price_cents >= 0),
  constraint visits_duration_sane check (duration_minutes is null or duration_minutes > 0),
  -- Clipper guards are 0-8. A "guard 14" is a typo, not a haircut.
  constraint visits_sides_guard_range check (sides_guard is null or (sides_guard >= 0 and sides_guard <= 8)),
  constraint visits_top_guard_range check (top_guard is null or (top_guard >= 0 and top_guard <= 8)),
  constraint visits_beard_guard_range check (beard_guard is null or (beard_guard >= 0 and beard_guard <= 8)),
  -- A guard number only means something when a guard was what was used.
  constraint visits_top_guard_needs_guard_finish
    check (top_guard is null or top_finish = 'guard'),
  constraint visits_beard_guard_needs_beard check (beard_guard is null or beard)
);
create index if not exists visits_tenant_idx on barberos.visits (tenant_id, visited_on desc);
create index if not exists visits_client_idx on barberos.visits (client_id, visited_on desc);

create table if not exists barberos.visit_tools (
  visit_id  uuid not null references barberos.visits(id) on delete cascade,
  tool_id   uuid not null references barberos.tools(id) on delete restrict,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  primary key (visit_id, tool_id)
);

-- --- triggers --------------------------------------------------------------
drop trigger if exists clients_set_updated_at on barberos.clients;
create trigger clients_set_updated_at before update on barberos.clients
  for each row execute function platform.set_updated_at();
drop trigger if exists clients_capability on barberos.clients;
create trigger clients_capability before insert or update or delete on barberos.clients
  for each row execute function barberos.require_capability('client_crm');
drop trigger if exists tools_capability on barberos.tools;
create trigger tools_capability before insert or update or delete on barberos.tools
  for each row execute function barberos.require_capability('client_crm');
drop trigger if exists visits_capability on barberos.visits;
create trigger visits_capability before insert or update or delete on barberos.visits
  for each row execute function barberos.require_capability('client_crm');
drop trigger if exists visit_tools_capability on barberos.visit_tools;
create trigger visit_tools_capability before insert or update or delete on barberos.visit_tools
  for each row execute function barberos.require_capability('client_crm');

-- --- RLS -------------------------------------------------------------------
-- This is the most sensitive data in the platform: a named private individual,
-- their phone number, and where they get their hair cut.
alter table barberos.clients     enable row level security; alter table barberos.clients     force row level security;
alter table barberos.tools       enable row level security; alter table barberos.tools       force row level security;
alter table barberos.visits      enable row level security; alter table barberos.visits      force row level security;
alter table barberos.visit_tools enable row level security; alter table barberos.visit_tools force row level security;

drop policy if exists clients_select on barberos.clients;
create policy clients_select on barberos.clients for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read') or identity.is_platform_admin());
drop policy if exists tools_select on barberos.tools;
create policy tools_select on barberos.tools for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read') or identity.is_platform_admin());
drop policy if exists visits_select on barberos.visits;
create policy visits_select on barberos.visits for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read') or identity.is_platform_admin());
drop policy if exists visit_tools_select on barberos.visit_tools;
create policy visit_tools_select on barberos.visit_tools for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read') or identity.is_platform_admin());

-- SELECT only; every write goes through the permission-checked RPCs.
grant select on barberos.clients, barberos.tools, barberos.visits, barberos.visit_tools to authenticated;

-- --- writes ----------------------------------------------------------------
create or replace function barberos.upsert_tool(p_tenant uuid, p_name text, p_kind text default 'other')
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'barberos.client.manage') then
    raise exception 'insufficient privilege to edit this shop''s kit'
      using errcode = 'insufficient_privilege';
  end if;
  insert into barberos.tools (tenant_id, name, kind)
  values (p_tenant, p_name, p_kind::barberos.tool_kind)
  on conflict (tenant_id, name) do update set kind = excluded.kind
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function barberos.upsert_client(
  p_tenant uuid, p_name text, p_phone text default null,
  p_email text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'barberos.client.manage') then
    raise exception 'insufficient privilege to add a client to this shop'
      using errcode = 'insufficient_privilege';
  end if;

  -- A phone number identifies a person within a shop. Matching on it means a
  -- barber who writes the same regular down twice updates them instead of
  -- creating a second record that splits their history in half.
  if p_phone is not null then
    select c.id into v_id from barberos.clients c
     where c.tenant_id = p_tenant and c.phone = p_phone;
  end if;

  if v_id is null then
    insert into barberos.clients (tenant_id, display_name, phone, email, notes, created_by)
    values (p_tenant, p_name, p_phone, p_email::extensions.citext, p_notes, auth.uid())
    returning id into v_id;
  else
    update barberos.clients c set
      display_name = p_name,
      -- coalesce, so editing one field does not blank the others.
      email = coalesce(p_email::extensions.citext, c.email),
      notes = coalesce(p_notes, c.notes)
     where c.id = v_id;
  end if;
  return v_id;
end; $function$;

create or replace function barberos.record_visit(p_tenant uuid, p_client uuid, p_visit jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid; v_client_tenant uuid; v_tool text;
begin
  if not identity.has_permission(p_tenant, 'barberos.client.manage') then
    raise exception 'insufficient privilege to record a visit for this shop'
      using errcode = 'insufficient_privilege';
  end if;

  select c.tenant_id into v_client_tenant from barberos.clients c where c.id = p_client;
  if v_client_tenant is null then
    raise exception 'client % does not exist', p_client using errcode = 'no_data_found';
  end if;
  -- A visit filed against another shop's client would put one shop's haircut
  -- in another shop's history.
  if v_client_tenant <> p_tenant then
    raise exception 'client % belongs to a different shop', p_client
      using errcode = 'check_violation';
  end if;

  insert into barberos.visits (
    tenant_id, client_id, visited_on, barber, service_name, price_cents,
    duration_minutes, sides_guard, top_finish, top_guard, fade, beard,
    beard_guard, line_up, part, notes, created_by)
  values (
    p_tenant, p_client,
    coalesce((p_visit->>'visited_on')::date, current_date),
    p_visit->>'barber',
    p_visit->>'service_name',
    (p_visit->>'price_cents')::integer,
    (p_visit->>'duration_minutes')::integer,
    (p_visit->>'sides_guard')::smallint,
    (p_visit->>'top_finish')::barberos.top_finish,
    (p_visit->>'top_guard')::smallint,
    (p_visit->>'fade')::barberos.fade_kind,
    coalesce((p_visit->>'beard')::boolean, false),
    (p_visit->>'beard_guard')::smallint,
    coalesce((p_visit->>'line_up')::boolean, false),
    coalesce((p_visit->>'part')::boolean, false),
    p_visit->>'notes',
    auth.uid())
  returning id into v_id;

  -- Tools are named, not id'd: the person recording a cut knows "the T-liner",
  -- not a uuid. An unknown name is created, so the shop's kit list builds
  -- itself out of what is actually used.
  if jsonb_typeof(p_visit->'tools') = 'array' then
    for v_tool in select value#>>'{}' from pg_catalog.jsonb_array_elements(p_visit->'tools') loop
      if pg_catalog.btrim(coalesce(v_tool,'')) <> '' then
        insert into barberos.visit_tools (visit_id, tool_id, tenant_id)
        values (v_id, barberos.upsert_tool(p_tenant, v_tool), p_tenant)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end; $function$;

-- --- reads -----------------------------------------------------------------
-- Refuses to invent a rhythm. Fewer than three visits means no interval, and
-- overdue_by_days stays null rather than defaulting to something reassuring.
create or replace function barberos.client_rhythm(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_tenant uuid; v_n int; v_typical numeric; v_last date; v_since int;
begin
  select c.tenant_id into v_tenant from barberos.clients c where c.id = p_client;
  if v_tenant is null then return null; end if;
  if not (identity.has_permission(v_tenant, 'barberos.client.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this client'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*), max(v.visited_on) into v_n, v_last
    from barberos.visits v where v.client_id = p_client;

  if v_n >= 3 then
    select avg(gap) into v_typical from (
      select v.visited_on - lag(v.visited_on) over (order by v.visited_on) as gap
        from barberos.visits v where v.client_id = p_client
       order by v.visited_on desc limit 6) g
     where g.gap is not null;
  end if;

  v_since := case when v_last is null then null else current_date - v_last end;

  return jsonb_build_object(
    'visits', v_n,
    'last_visit', v_last,
    'days_since_last', v_since,
    'typical_days', case when v_typical is null then null else round(v_typical) end,
    'basis', case when v_n = 0 then 'never visited'
                  when v_n < 3 then 'not enough visits to know a rhythm'
                  else 'average of the last gaps' end,
    -- Only ever a number when there is a rhythm to be overdue against.
    'overdue_by_days', case when v_typical is null or v_since is null then null
                            when v_since > v_typical then v_since - round(v_typical)
                            else 0 end);
end; $function$;

create or replace function barberos.client_timeline(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_tenant uuid; v_c barberos.clients%rowtype;
begin
  select * into v_c from barberos.clients where id = p_client;
  if v_c.id is null then return null; end if;
  v_tenant := v_c.tenant_id;
  if not (identity.has_permission(v_tenant, 'barberos.client.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this client'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'id', v_c.id, 'display_name', v_c.display_name, 'phone', v_c.phone,
    'email', v_c.email, 'notes', v_c.notes, 'since', v_c.created_at::date,
    -- Lifetime value AND its own gaps. "$420 across 12 visits" must never be
    -- readable without "3 of them have no price recorded".
    'value', (select jsonb_build_object(
        'total_cents', coalesce(sum(v.price_cents), 0),
        'visits', count(*),
        'visits_without_a_price', count(*) filter (where v.price_cents is null))
      from barberos.visits v where v.client_id = p_client),
    'rhythm', barberos.client_rhythm(p_client),
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'visited_on', v.visited_on, 'barber', v.barber,
        'service_name', v.service_name, 'price_cents', v.price_cents,
        'duration_minutes', v.duration_minutes,
        'sides_guard', v.sides_guard, 'top_finish', v.top_finish,
        'top_guard', v.top_guard, 'fade', v.fade, 'beard', v.beard,
        'beard_guard', v.beard_guard, 'line_up', v.line_up, 'part', v.part,
        'notes', v.notes,
        'tools', coalesce((select jsonb_agg(t.name order by t.name)
                    from barberos.visit_tools vt
                    join barberos.tools t on t.id = vt.tool_id
                   where vt.visit_id = v.id), '[]'::jsonb))
        order by v.visited_on desc, v.created_at desc)
      from barberos.visits v where v.client_id = p_client), '[]'::jsonb));
end; $function$;

create or replace function barberos.client_list(p_tenant uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'barberos.client.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s clients'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by x->>'display_name') from (
    select jsonb_build_object(
      'id', c.id, 'display_name', c.display_name, 'phone', c.phone,
      'visits', (select count(*) from barberos.visits v where v.client_id = c.id),
      'last_visit', (select max(v.visited_on) from barberos.visits v where v.client_id = c.id)
    ) as x
      from barberos.clients c
     where c.tenant_id = p_tenant
       and (p_search is null or pg_catalog.btrim(p_search) = ''
            or c.display_name ilike '%'||p_search||'%'
            or coalesce(c.phone,'') ilike '%'||p_search||'%')) q), '[]'::jsonb);
end; $function$;

-- The overdue engine. Only clients with a KNOWN rhythm who are past it.
create or replace function barberos.clients_due(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (identity.has_permission(p_tenant, 'barberos.client.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s clients'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((select jsonb_agg(x order by (x->>'overdue_by_days')::int desc) from (
    select jsonb_build_object(
             'id', c.id, 'display_name', c.display_name, 'phone', c.phone,
             'last_visit', r.rhythm->>'last_visit',
             'typical_days', (r.rhythm->>'typical_days')::int,
             'overdue_by_days', (r.rhythm->>'overdue_by_days')::int) as x
      from barberos.clients c
      cross join lateral (select barberos.client_rhythm(c.id) as rhythm) r
     where c.tenant_id = p_tenant
       and (r.rhythm->>'typical_days') is not null
       and coalesce((r.rhythm->>'overdue_by_days')::int, 0) > 0) q), '[]'::jsonb);
end; $function$;

revoke all on function barberos.upsert_tool(uuid, text, text) from public, anon;
revoke all on function barberos.upsert_client(uuid, text, text, text, text) from public, anon;
revoke all on function barberos.record_visit(uuid, uuid, jsonb) from public, anon;
revoke all on function barberos.client_rhythm(uuid) from public, anon;
revoke all on function barberos.client_timeline(uuid) from public, anon;
revoke all on function barberos.client_list(uuid, text) from public, anon;
revoke all on function barberos.clients_due(uuid) from public, anon;

grant execute on function barberos.upsert_tool(uuid, text, text) to authenticated;
grant execute on function barberos.upsert_client(uuid, text, text, text, text) to authenticated;
grant execute on function barberos.record_visit(uuid, uuid, jsonb) to authenticated;
grant execute on function barberos.client_rhythm(uuid) to authenticated;
grant execute on function barberos.client_timeline(uuid) to authenticated;
grant execute on function barberos.client_list(uuid, text) to authenticated;
grant execute on function barberos.clients_due(uuid) to authenticated;
