do $$ begin create type barberos.tool_kind as enum
  ('clipper','trimmer','blade','guard','shear','razor','product','other');
  exception when duplicate_object then null; end $$;

do $$ begin create type barberos.top_finish as enum
  ('guard','scissor','razor','freehand');
  exception when duplicate_object then null; end $$;

do $$ begin create type barberos.fade_kind as enum
  ('none','taper','low','mid','high','skin');
  exception when duplicate_object then null; end $$;

create table if not exists barberos.clients (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
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
comment on table barberos.clients is
  'A person the shop cuts. Belongs to the SHOP, not to the platform: one tenant''s client list is invisible to every other, by policy and by trigger.';

create index if not exists clients_tenant_idx on barberos.clients (tenant_id, display_name);
create unique index if not exists clients_tenant_phone_uniq
  on barberos.clients (tenant_id, phone) where phone is not null;

create table if not exists barberos.tools (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references platform.tenants(id) on delete cascade,
  name       text not null,
  kind       barberos.tool_kind not null default 'other',
  created_at timestamptz not null default now(),
  constraint tools_name_present check (length(btrim(name)) > 0)
);
create unique index if not exists tools_tenant_name_uniq on barberos.tools (tenant_id, name);

create table if not exists barberos.visits (
  id          uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id   uuid not null references platform.tenants(id) on delete cascade,
  client_id   uuid not null references barberos.clients(id) on delete cascade,
  visited_on  date not null default current_date,
  barber      text,
  service_name text,
  price_cents integer,
  duration_minutes integer,

  sides_guard smallint,
  top_finish  barberos.top_finish,
  top_guard   smallint,
  fade        barberos.fade_kind,
  beard       boolean not null default false,
  beard_guard smallint,
  line_up     boolean not null default false,
  part        boolean not null default false,
  notes       text,

  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,

  constraint visits_not_in_the_future check (visited_on <= current_date),
  constraint visits_price_sane check (price_cents is null or price_cents >= 0),
  constraint visits_duration_sane check (duration_minutes is null or duration_minutes > 0),
  constraint visits_sides_guard_range check (sides_guard is null or sides_guard between 0 and 8),
  constraint visits_top_guard_range check (top_guard is null or top_guard between 0 and 8),
  constraint visits_beard_guard_range check (beard_guard is null or beard_guard between 0 and 8),
  constraint visits_top_guard_needs_guard_finish
    check (top_guard is null or top_finish = 'guard'),
  constraint visits_beard_guard_needs_beard
    check (beard_guard is null or beard)
);
comment on table barberos.visits is
  'One haircut that happened, with the cut recorded structurally so it can be compared across visits. Never a future appointment -- see visits_not_in_the_future.';

create index if not exists visits_client_idx on barberos.visits (client_id, visited_on desc);
create index if not exists visits_tenant_idx on barberos.visits (tenant_id, visited_on desc);

create table if not exists barberos.visit_tools (
  visit_id uuid not null references barberos.visits(id) on delete cascade,
  tool_id  uuid not null references barberos.tools(id) on delete restrict,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  primary key (visit_id, tool_id)
);
comment on table barberos.visit_tools is
  'What was used on a cut. ON DELETE RESTRICT on the tool: removing a clipper from the shop''s kit must not quietly rewrite what was used on forty past haircuts.';

create trigger clients_capability before insert or update or delete on barberos.clients
  for each row execute function barberos.require_capability('client_crm');
create trigger tools_capability before insert or update or delete on barberos.tools
  for each row execute function barberos.require_capability('client_crm');
create trigger visits_capability before insert or update or delete on barberos.visits
  for each row execute function barberos.require_capability('client_crm');
create trigger visit_tools_capability before insert or update or delete on barberos.visit_tools
  for each row execute function barberos.require_capability('client_crm');

create trigger clients_set_updated_at before update on barberos.clients
  for each row execute function platform.set_updated_at();

alter table barberos.clients     enable row level security;
alter table barberos.clients     force  row level security;
alter table barberos.tools       enable row level security;
alter table barberos.tools       force  row level security;
alter table barberos.visits      enable row level security;
alter table barberos.visits      force  row level security;
alter table barberos.visit_tools enable row level security;
alter table barberos.visit_tools force  row level security;

drop policy if exists clients_select on barberos.clients;
create policy clients_select on barberos.clients for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read')
         or identity.is_platform_admin());
drop policy if exists tools_select on barberos.tools;
create policy tools_select on barberos.tools for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read')
         or identity.is_platform_admin());
drop policy if exists visits_select on barberos.visits;
create policy visits_select on barberos.visits for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read')
         or identity.is_platform_admin());
drop policy if exists visit_tools_select on barberos.visit_tools;
create policy visit_tools_select on barberos.visit_tools for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.client.read')
         or identity.is_platform_admin());

grant select on barberos.clients, barberos.tools, barberos.visits,
                barberos.visit_tools to authenticated;

insert into identity.permissions (key, description, scope) values
  ('barberos.client.read',   'Read the shop''s clients, their visits and their preferences.', 'tenant'),
  ('barberos.client.manage', 'Add clients and record what was done at a visit.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','barberos.client.read'),  ('tenant_owner','barberos.client.manage'),
  ('tenant_admin','barberos.client.read'),  ('tenant_admin','barberos.client.manage'),
  ('manager','barberos.client.read'),       ('manager','barberos.client.manage'),
  ('staff','barberos.client.read'),         ('staff','barberos.client.manage'),
  ('viewer','barberos.client.read')
on conflict do nothing;

create or replace function barberos.upsert_client(
  p_tenant uuid, p_name text, p_phone text default null,
  p_email text default null, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'barberos.client.manage') then
    raise exception 'insufficient privilege to add a client to this shop'
      using errcode = 'insufficient_privilege';
  end if;

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
      email = coalesce(p_email::extensions.citext, c.email),
      notes = coalesce(p_notes, c.notes)
     where c.id = v_id;
  end if;
  return v_id;
end; $$;
comment on function barberos.upsert_client(uuid, text, text, text, text) is
  'Add or update a client, matched within the shop by phone number so the same regular written down twice does not end up with two half-histories.';
revoke all on function barberos.upsert_client(uuid, text, text, text, text) from public, anon;
grant execute on function barberos.upsert_client(uuid, text, text, text, text) to authenticated;

create or replace function barberos.upsert_tool(
  p_tenant uuid, p_name text, p_kind text default 'other')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.upsert_tool(uuid, text, text) from public, anon;
grant execute on function barberos.upsert_tool(uuid, text, text) to authenticated;

create or replace function barberos.record_visit(
  p_tenant uuid, p_client uuid, p_visit jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
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
end; $$;
comment on function barberos.record_visit(uuid, uuid, jsonb) is
  'Record one haircut. Tools are given by name and created on first use, so the shop''s kit list builds itself out of what is actually used.';
revoke all on function barberos.record_visit(uuid, uuid, jsonb) from public, anon;
grant execute on function barberos.record_visit(uuid, uuid, jsonb) to authenticated;

create or replace function barberos.client_rhythm(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
    'overdue_by_days', case when v_typical is null or v_since is null then null
                            when v_since > v_typical then v_since - round(v_typical)
                            else 0 end);
end; $$;
comment on function barberos.client_rhythm(uuid) is
  'How often this client comes, measured against themselves. typical_days is NULL until three visits exist: one gap is not a rhythm, and "overdue" from one haircut is how this module would lose a shop''s trust in week one.';
revoke all on function barberos.client_rhythm(uuid) from public, anon;
grant execute on function barberos.client_rhythm(uuid) to authenticated;

create or replace function barberos.client_timeline(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.client_timeline(uuid) from public, anon;
grant execute on function barberos.client_timeline(uuid) to authenticated;

create or replace function barberos.client_list(p_tenant uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
revoke all on function barberos.client_list(uuid, text) from public, anon;
grant execute on function barberos.client_list(uuid, text) to authenticated;

create or replace function barberos.clients_due(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
end; $$;
comment on function barberos.clients_due(uuid) is
  'Clients past their own usual gap. Only those with an established rhythm appear -- there is no row here that means "we guessed".';
revoke all on function barberos.clients_due(uuid) from public, anon;
grant execute on function barberos.clients_due(uuid) to authenticated;

create or replace function public.barberos_clients(p_tenant uuid, p_search text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.client_list(p_tenant, p_search);
$$;
revoke all on function public.barberos_clients(uuid, text) from public, anon;
grant execute on function public.barberos_clients(uuid, text) to authenticated;

create or replace function public.barberos_client(p_client uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.client_timeline(p_client);
$$;
revoke all on function public.barberos_client(uuid) from public, anon;
grant execute on function public.barberos_client(uuid) to authenticated;

create or replace function public.barberos_save_client(
  p_tenant uuid, p_name text, p_phone text default null,
  p_email text default null, p_notes text default null)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.upsert_client(p_tenant, p_name, p_phone, p_email, p_notes);
$$;
revoke all on function public.barberos_save_client(uuid, text, text, text, text) from public, anon;
grant execute on function public.barberos_save_client(uuid, text, text, text, text) to authenticated;

create or replace function public.barberos_record_visit(
  p_tenant uuid, p_client uuid, p_visit jsonb)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.record_visit(p_tenant, p_client, p_visit);
$$;
revoke all on function public.barberos_record_visit(uuid, uuid, jsonb) from public, anon;
grant execute on function public.barberos_record_visit(uuid, uuid, jsonb) to authenticated;

create or replace function public.barberos_clients_due(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.clients_due(p_tenant);
$$;
revoke all on function public.barberos_clients_due(uuid) from public, anon;
grant execute on function public.barberos_clients_due(uuid) to authenticated;

create or replace function public.barberos_tools(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'kind', t.kind)
                            order by t.name), '[]'::jsonb)
    from barberos.tools t where t.tenant_id = p_tenant;
$$;
revoke all on function public.barberos_tools(uuid) from public, anon;
grant execute on function public.barberos_tools(uuid) to authenticated;

update barberos.capabilities
   set status = 'available',
       blocked_on = null,
       blocker_owner = null,
       description = 'Every client, every visit, and the cut itself -- guard numbers, fade, finish, beard and the tools used -- so a regular''s preferences survive eighteen months and a change of barber. Reports each client''s own rhythm and who is overdue against it.',
       version = version + 1
 where key = 'client_crm';