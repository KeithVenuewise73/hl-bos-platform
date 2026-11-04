-- ===========================================================================
-- hlbos_0111_transportation_api — gated RPCs for TransportationOS Release 1.
-- Every function: authenticates, checks tenant membership via permission, checks the
-- module licence (entitlements.require_module), validates input, then touches data.
-- rollback: drop the functions below (schema transportation is dropped by 0110's rollback).
-- ===========================================================================

-- internal: caller must be an active registered driver of the tenant
create or replace function transportation._actor_driver(p_tenant uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select d.id into v from transportation.drivers d
   where d.tenant_id = p_tenant and d.user_id = auth.uid() and d.active;
  if v is null then raise exception 'caller is not an active driver of this tenant' using errcode = 'insufficient_privilege'; end if;
  return v;
end; $$;
revoke all on function transportation._actor_driver(uuid) from public, anon, authenticated;

-- internal: recompute a vehicle's status from its open defects
create or replace function transportation._refresh_vehicle_status(p_vehicle uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_new transportation.vehicle_status;
begin
  select case when bool_or(severity = 'critical') then 'out_of_service'
              when bool_or(severity = 'major')    then 'restricted'
              else 'in_service' end::transportation.vehicle_status
    into v_new from transportation.defects where vehicle_id = p_vehicle and status <> 'resolved';
  update transportation.vehicles set status = coalesce(v_new, 'in_service') where id = p_vehicle;
end; $$;
revoke all on function transportation._refresh_vehicle_status(uuid) from public, anon, authenticated;

create or replace function transportation._gate(p_tenant uuid, p_module extensions.citext, p_permission extensions.citext default null) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if not identity.is_member(p_tenant) then raise exception 'not a member of this tenant' using errcode = 'insufficient_privilege'; end if;
  perform entitlements.require_module(p_tenant, p_module);
  if p_permission is not null and not identity.has_permission(p_tenant, p_permission) then
    raise exception 'insufficient privilege: % required', p_permission using errcode = 'insufficient_privilege';
  end if;
end; $$;
revoke all on function transportation._gate(uuid, extensions.citext, extensions.citext) from public, anon, authenticated;

-- --- Records ---------------------------------------------------------------------
create or replace function transportation.add_vehicle(p_tenant uuid, p_unit text, p_vin text default null, p_make text default null,
  p_model text default null, p_year integer default null, p_plate text default null, p_odometer integer default 0)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform transportation._gate(p_tenant, 'trans.core', 'trans.fleet.manage');
  insert into transportation.vehicles (tenant_id, unit_number, vin, make, model, model_year, plate, odometer, created_by)
  values (p_tenant, btrim(p_unit), upper(nullif(btrim(p_vin), '')), p_make, p_model, p_year, p_plate, coalesce(p_odometer, 0), auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

create or replace function transportation.register_driver(p_tenant uuid, p_user uuid, p_name text, p_license_class text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform transportation._gate(p_tenant, 'trans.core', 'trans.driver.manage');
  if not exists (select 1 from identity.memberships m where m.tenant_id = p_tenant and m.user_id = p_user and m.status = 'active') then
    raise exception 'user is not an active member of this tenant' using errcode = 'foreign_key_violation';
  end if;
  insert into transportation.drivers (tenant_id, user_id, display_name, license_class) values (p_tenant, p_user, p_name, p_license_class)
  on conflict (tenant_id, user_id) do update set display_name = excluded.display_name, license_class = excluded.license_class, active = true
  returning id into v_id;
  return v_id;
end; $$;

create or replace function transportation.assign_vehicle(p_tenant uuid, p_vehicle uuid, p_driver uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform transportation._gate(p_tenant, 'trans.fleet', 'trans.fleet.manage');
  if not exists (select 1 from transportation.vehicles v where v.id = p_vehicle and v.tenant_id = p_tenant) then
    raise exception 'vehicle not found in this tenant' using errcode = 'no_data_found'; end if;
  update transportation.vehicle_assignments set released_at = now() where released_at is null and (vehicle_id = p_vehicle or driver_id = p_driver);
  if p_driver is null then return null; end if;
  if not exists (select 1 from transportation.drivers d where d.id = p_driver and d.tenant_id = p_tenant and d.active) then
    raise exception 'driver not found or inactive in this tenant' using errcode = 'no_data_found'; end if;
  insert into transportation.vehicle_assignments (tenant_id, vehicle_id, driver_id, assigned_by) values (p_tenant, p_vehicle, p_driver, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

-- --- Driver workflow (T1): list vehicles, submit inspection -------------------------
create or replace function transportation.driver_vehicles(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.dvir.create');
  perform transportation._actor_driver(p_tenant);
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'unit_number', v.unit_number, 'status', v.status,
     'assigned_to_me', exists (select 1 from transportation.vehicle_assignments a join transportation.drivers d on d.id = a.driver_id
                               where a.vehicle_id = v.id and a.released_at is null and d.user_id = auth.uid())) order by v.unit_number)
     from transportation.vehicles v where v.tenant_id = p_tenant), '[]'::jsonb);
end; $$;

create or replace function transportation.submit_inspection(p_tenant uuid, p_vehicle uuid, p_kind transportation.inspection_kind,
  p_odometer integer, p_items jsonb, p_client_id text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_driver uuid; v_id uuid; v_item jsonb; v_status text; v_sev text; v_note text; v_key text;
        v_has_defect boolean := false; v_cur_odo integer; v_n integer;
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.dvir.create');
  v_driver := transportation._actor_driver(p_tenant);
  if p_client_id is null or length(p_client_id) not between 8 and 64 then
    raise exception 'client_submission_id must be 8-64 characters' using errcode = 'invalid_parameter_value'; end if;
  -- duplicate submission (retry / double tap): return the original, create nothing
  select i.id into v_id from transportation.inspections i
   where i.tenant_id = p_tenant and i.driver_id = v_driver and i.client_submission_id = p_client_id;
  if found then return v_id; end if;
  select v.odometer into v_cur_odo from transportation.vehicles v where v.id = p_vehicle and v.tenant_id = p_tenant for update;
  if not found then raise exception 'vehicle not found in this tenant' using errcode = 'no_data_found'; end if;
  if p_odometer is not null and (p_odometer < 0 or p_odometer < v_cur_odo) then
    raise exception 'odometer % is lower than the last recorded reading %', p_odometer, v_cur_odo using errcode = 'invalid_parameter_value'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'items must be a non-empty array of at most 100 checklist entries' using errcode = 'invalid_parameter_value'; end if;
  -- validate everything BEFORE writing anything
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_key := v_item->>'item_key'; v_status := v_item->>'status'; v_sev := v_item->>'severity'; v_note := btrim(coalesce(v_item->>'note', ''));
    if v_key is null or v_key !~ '^[a-z0-9_]{2,40}$' then raise exception 'invalid item_key %', coalesce(v_key, '(missing)') using errcode = 'invalid_parameter_value'; end if;
    if v_status is null or v_status not in ('ok','defect','na') then raise exception 'invalid status for item %', v_key using errcode = 'invalid_parameter_value'; end if;
    if v_status = 'defect' then
      v_has_defect := true;
      if v_sev is null or v_sev not in ('minor','major','critical') then raise exception 'defect item % needs severity minor|major|critical', v_key using errcode = 'invalid_parameter_value'; end if;
      if v_note = '' then raise exception 'defect item % needs a description', v_key using errcode = 'invalid_parameter_value'; end if;
    end if;
  end loop;
  select count(distinct e->>'item_key') into v_n from jsonb_array_elements(p_items) e;
  if v_n <> jsonb_array_length(p_items) then raise exception 'duplicate item_key in submission' using errcode = 'invalid_parameter_value'; end if;

  insert into transportation.inspections (tenant_id, vehicle_id, driver_id, kind, odometer, result, client_submission_id)
  values (p_tenant, p_vehicle, v_driver, p_kind, p_odometer, case when v_has_defect then 'defects_found' else 'pass' end, p_client_id)
  returning id into v_id;
  insert into transportation.inspection_items (tenant_id, inspection_id, item_key, status, note)
    select p_tenant, v_id, e->>'item_key', (e->>'status')::transportation.item_status, nullif(btrim(coalesce(e->>'note','')), '')
      from jsonb_array_elements(p_items) e;
  insert into transportation.defects (tenant_id, vehicle_id, inspection_id, item_key, severity, description, reported_by)
    select p_tenant, p_vehicle, v_id, e->>'item_key', (e->>'severity')::transportation.defect_severity, btrim(e->>'note'), auth.uid()
      from jsonb_array_elements(p_items) e where e->>'status' = 'defect';
  if p_odometer is not null then update transportation.vehicles set odometer = p_odometer where id = p_vehicle; end if;
  perform transportation._refresh_vehicle_status(p_vehicle);
  perform events.emit('transportation.inspection.submitted', p_tenant,
    jsonb_build_object('inspection', v_id, 'vehicle', p_vehicle, 'result', case when v_has_defect then 'defects_found' else 'pass' end));
  return v_id;
end; $$;

-- --- Defects (T2) ------------------------------------------------------------------
create or replace function transportation.report_defect(p_tenant uuid, p_vehicle uuid, p_item_key text,
  p_severity transportation.defect_severity, p_description text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.dvir.create');
  perform transportation._actor_driver(p_tenant);
  if p_item_key is null or p_item_key !~ '^[a-z0-9_]{2,40}$' then raise exception 'invalid item_key' using errcode = 'invalid_parameter_value'; end if;
  if p_description is null or btrim(p_description) = '' then raise exception 'a description is required' using errcode = 'invalid_parameter_value'; end if;
  if not exists (select 1 from transportation.vehicles v where v.id = p_vehicle and v.tenant_id = p_tenant) then
    raise exception 'vehicle not found in this tenant' using errcode = 'no_data_found'; end if;
  insert into transportation.defects (tenant_id, vehicle_id, item_key, severity, description, reported_by)
  values (p_tenant, p_vehicle, p_item_key, p_severity, btrim(p_description), auth.uid()) returning id into v_id;
  perform transportation._refresh_vehicle_status(p_vehicle);
  perform events.emit('transportation.defect.reported', p_tenant, jsonb_build_object('defect', v_id, 'vehicle', p_vehicle, 'severity', p_severity));
  return v_id;
end; $$;

create or replace function transportation.record_corrective_action(p_tenant uuid, p_defect uuid, p_action text, p_resolves boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_vehicle uuid; v_status transportation.defect_status;
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.defect.manage');
  if p_action is null or btrim(p_action) = '' then raise exception 'an action description is required' using errcode = 'invalid_parameter_value'; end if;
  select d.vehicle_id, d.status into v_vehicle, v_status from transportation.defects d where d.id = p_defect and d.tenant_id = p_tenant for update;
  if not found then raise exception 'defect not found in this tenant' using errcode = 'no_data_found'; end if;
  if v_status = 'resolved' then raise exception 'defect is already resolved' using errcode = 'invalid_parameter_value'; end if;
  insert into transportation.corrective_actions (tenant_id, defect_id, action, resolves, performed_by)
  values (p_tenant, p_defect, btrim(p_action), coalesce(p_resolves, false), auth.uid()) returning id into v_id;
  if coalesce(p_resolves, false) then
    update transportation.defects set status = 'resolved', resolved_at = now() where id = p_defect;
  else
    update transportation.defects set status = 'in_repair' where id = p_defect;
  end if;
  perform transportation._refresh_vehicle_status(v_vehicle);
  perform events.emit('transportation.defect.actioned', p_tenant, jsonb_build_object('defect', p_defect, 'resolved', coalesce(p_resolves, false)));
  return v_id;
end; $$;

create or replace function transportation.list_defects(p_tenant uuid, p_only_unresolved boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.fleet.read');
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'vehicle', v.unit_number, 'item_key', d.item_key, 'severity', d.severity,
      'description', d.description, 'status', d.status, 'reported_at', d.reported_at, 'resolved_at', d.resolved_at,
      'actions', coalesce((select jsonb_agg(jsonb_build_object('action', c.action, 'resolves', c.resolves, 'at', c.performed_at) order by c.performed_at)
                           from transportation.corrective_actions c where c.defect_id = d.id), '[]'::jsonb))
      order by d.reported_at desc)
    from transportation.defects d join transportation.vehicles v on v.id = d.vehicle_id
    where d.tenant_id = p_tenant and (not p_only_unresolved or d.status <> 'resolved')), '[]'::jsonb);
end; $$;

-- --- Manager views (T3, T4) -----------------------------------------------------------
create or replace function transportation._board(p_tenant uuid, p_with_drivers boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', v.id, 'unit_number', v.unit_number, 'status', v.status, 'odometer', v.odometer,
      'last_inspection_at', li.submitted_at, 'last_inspection_result', li.result,
      'open_defects', (select count(*) from transportation.defects d where d.vehicle_id = v.id and d.status <> 'resolved'),
      'open_critical', (select count(*) from transportation.defects d where d.vehicle_id = v.id and d.status <> 'resolved' and d.severity = 'critical'))
    || case when p_with_drivers then jsonb_build_object('assigned_driver',
         (select d.display_name from transportation.vehicle_assignments a join transportation.drivers d on d.id = a.driver_id
           where a.vehicle_id = v.id and a.released_at is null)) else '{}'::jsonb end
    order by v.unit_number), '[]'::jsonb)
  from transportation.vehicles v
  left join lateral (select i.submitted_at, i.result from transportation.inspections i where i.vehicle_id = v.id order by i.submitted_at desc limit 1) li on true
  where v.tenant_id = p_tenant;
$$;
revoke all on function transportation._board(uuid, boolean) from public, anon, authenticated;

create or replace function transportation.fleet_overview(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform transportation._gate(p_tenant, 'trans.fleet', 'trans.fleet.read');
  return transportation._board(p_tenant, true);
end; $$;

create or replace function transportation.dvir_board(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform transportation._gate(p_tenant, 'trans.dvir', 'trans.fleet.read');
  return transportation._board(p_tenant, false);
end; $$;

create or replace function transportation.maintenance_overview(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform transportation._gate(p_tenant, 'trans.maintenance', 'trans.fleet.read');
  return coalesce((select jsonb_agg(jsonb_build_object('unit_number', v.unit_number, 'status', v.status,
      'open_minor', count(d.*) filter (where d.status <> 'resolved' and d.severity = 'minor'),
      'open_major', count(d.*) filter (where d.status <> 'resolved' and d.severity = 'major'),
      'open_critical', count(d.*) filter (where d.status <> 'resolved' and d.severity = 'critical'),
      'resolved_total', count(d.*) filter (where d.status = 'resolved'),
      'avg_days_to_resolve', round(avg(extract(epoch from (d.resolved_at - d.reported_at)) / 86400.0) filter (where d.status = 'resolved')::numeric, 2))
      order by v.unit_number)
    from transportation.vehicles v left join transportation.defects d on d.vehicle_id = v.id where v.tenant_id = p_tenant group by v.id, v.unit_number, v.status), '[]'::jsonb);
end; $$;

-- --- Grants: every public RPC is executable by authenticated only -----------------------
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'transportation' and p.proname !~ '^_' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
