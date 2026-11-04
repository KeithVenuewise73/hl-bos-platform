-- ===========================================================================
-- PROPOSED MIGRATION P002 — TransportationOS: the module licence gate on the
-- production fleet API, and configurable DVIR inspection templates.
--
-- STATUS: tested against an ISOLATED local PostgreSQL only. NOT applied.
-- Depends on: the recovered production fleet SQL
-- (supabase/recovered/production-2026-10-17) and proposed P001.
--
-- WHY: production fleet.api checks roles but never licences. Any signed-in
-- member of a fleet company can call any operation, so module licensing
-- enforced only in an app would be a control that does not control. This
-- puts the gate in the one door every client uses.
--
-- WHAT CHANGES IN EXISTING OBJECTS (needs owner approval):
--   - public.hlg_fleet_rpc and public.hlg_fleet_medical_rpc keep their
--     signatures but route through the gate.
--   - EXECUTE on fleet.api and fleet.medical_api is revoked from
--     authenticated, so the gate cannot be bypassed by calling them directly.
--   fleet.api itself is NOT modified.
--
-- rollback:
--   create or replace function public.hlg_fleet_rpc(p_op text, p_args jsonb default '{}'::jsonb)
--     returns jsonb language sql set search_path = '' as $f$select fleet.api(p_op,p_args)$f$;
--   create or replace function public.hlg_fleet_medical_rpc(p_op text, p_args jsonb default '{}'::jsonb)
--     returns jsonb language sql set search_path = '' as $f$select fleet.medical_api(p_op,p_args)$f$;
--   grant execute on function fleet.api(text,jsonb), fleet.medical_api(text,jsonb) to authenticated;
--   DROP FUNCTION IF EXISTS fleet.licensed_medical_api(text, jsonb);
--   DROP FUNCTION IF EXISTS fleet.licensed_api(text, jsonb);
--   DROP FUNCTION IF EXISTS fleet.require_any_module(uuid, text[]);
--   DROP TABLE IF EXISTS fleet.inspection_templates;
-- ===========================================================================

-- --- Configurable inspection templates --------------------------------------
-- fleet.api requires the 11 base items (plus 5 tank items for tankers) and
-- accepts up to 30 checks. A template ADDS required items for an equipment
-- type (reefer, trailer, bus, ...). It cannot remove a base item. 14 items
-- maximum keeps a tanker report (16 + 14) within fleet.api's 30-check limit.
create table if not exists fleet.inspection_templates (
  workspace_id   uuid not null references fleet.workspaces(id) on delete cascade,
  equipment_type text not null,
  items          text[] not null,
  updated_by     uuid not null,
  updated_at     timestamptz not null default clock_timestamp(),
  primary key (workspace_id, equipment_type),
  constraint templates_type check (length(btrim(equipment_type)) between 1 and 60),
  constraint templates_items check (cardinality(items) between 1 and 14)
);
alter table fleet.inspection_templates enable row level security;
alter table fleet.inspection_templates force row level security;
revoke all on fleet.inspection_templates from public, anon, authenticated;

-- --- Helpers -------------------------------------------------------------------
create or replace function fleet.require_any_module(w uuid, modules text[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare names text;
begin
  if exists (select 1 from unnest(modules) m where entitlements.module_licensed(w, m::extensions.citext)) then return; end if;
  select string_agg(em.name, ' or ' order by em.number) into names
    from entitlements.modules em where em.key = any(modules);
  raise exception '% is not licensed for this company', coalesce(names, array_to_string(modules, ', '))
    using errcode = 'insufficient_privilege';
end; $$;
revoke all on function fleet.require_any_module(uuid, text[]) from public, anon, authenticated;

-- Canonical comparison of a fleet section: order-insensitive by id.
create or replace function fleet.section_digest(arr jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce((select jsonb_agg(x order by x->>'id', x::text)
                   from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) x), '[]'::jsonb);
$$;
revoke all on function fleet.section_digest(jsonb) from public, anon, authenticated;

-- --- The gate ----------------------------------------------------------------
create or replace function fleet.licensed_api(op text, a jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  w uuid; f jsonb; v jsonb; r text; unit_type text; needed text; items text[];
begin
  -- Not company-scoped: list my companies, claim a bootstrap ownership.
  if op in ('workspaces', 'claim_owner') then
    return fleet.api(op, a);
  end if;

  begin
    w := (a->>'workspace')::uuid;
  exception when invalid_text_representation then
    raise exception 'No active membership in this company' using errcode = 'insufficient_privilege';
  end;
  -- Membership first (fleet.api's own words), so a non-member learns nothing
  -- about another company's licences.
  if fleet.member_role(w) is null then
    raise exception 'No active membership in this company' using errcode = 'insufficient_privilege';
  end if;
  r := fleet.member_role(w);

  -- Every operation needs at least one TransportationOS module.
  if not exists (select 1 from entitlements.modules m
                 where m.product = 'transportation' and entitlements.module_licensed(w, m.key)) then
    raise exception 'This company has no TransportationOS module' using errcode = 'insufficient_privilege';
  end if;

  case op
    when 'submit_inspection' then perform fleet.require_any_module(w, array['tms_dvir']);
    when 'submit_action'     then perform fleet.require_any_module(w, array['tms_dvir','tms_maintenance']);
    when 'submit_service', 'submit_document', 'submit_event'
                             then perform fleet.require_any_module(w, array['tms_maintenance']);
    when 'templates', 'save_template'
                             then perform fleet.require_any_module(w, array['tms_dvir']);
    else null;
  end case;

  -- save_fleet writes the shared registry (core) AND module-owned sections.
  -- A section may only change if its module is licensed.
  if op = 'save_fleet' then
    f := a->'fleet';
    if not entitlements.module_licensed(w, 'tms_maintenance')
       and fleet.section_digest(f->'work') is distinct from
           fleet.section_digest((select jsonb_agg(z.payload) from fleet.work_orders z where z.workspace_id = w)) then
      raise exception 'Maintenance Management is not licensed for this company: work orders cannot be changed'
        using errcode = 'insufficient_privilege';
    end if;
    if not (entitlements.module_licensed(w, 'tms_fleet') or entitlements.module_licensed(w, 'tms_maintenance'))
       and fleet.section_digest(f->'fuel') is distinct from
           fleet.section_digest((select jsonb_agg(z.payload) from fleet.fuel_entries z where z.workspace_id = w)) then
      raise exception 'Fleet Management or Maintenance Management is not licensed for this company: fuel entries cannot be changed'
        using errcode = 'insufficient_privilege';
    end if;
    if not entitlements.module_licensed(w, 'tms_drivers')
       and (fleet.section_digest(f->'drivers') is distinct from
              fleet.section_digest((select jsonb_agg(z.payload) from fleet.driver_profiles z where z.workspace_id = w))
         or fleet.section_digest(f->'driverEvents') is distinct from
              fleet.section_digest((select jsonb_agg(z.payload) from fleet.driver_events z where z.workspace_id = w))) then
      raise exception 'Driver Management is not licensed for this company: driver profiles cannot be changed'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if op = 'templates' then
    return coalesce((select jsonb_agg(jsonb_build_object('equipmentType', t.equipment_type, 'items', to_jsonb(t.items)) order by t.equipment_type)
                     from fleet.inspection_templates t where t.workspace_id = w), '[]'::jsonb);
  end if;

  if op = 'save_template' then
    if r not in ('owner','manager') then
      raise exception 'Owner or manager required' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(length(btrim(a->>'equipmentType')), 0) not between 1 and 60 then
      raise exception 'Equipment type required (1-60 characters)';
    end if;
    if a->'items' = '[]'::jsonb then
      delete from fleet.inspection_templates where workspace_id = w and equipment_type = btrim(a->>'equipmentType');
      insert into fleet.audit_events (workspace_id, actor, kind, details)
      values (w, auth.uid(), 'template_removed', jsonb_build_object('equipmentType', btrim(a->>'equipmentType')));
      return jsonb_build_object('saved', true);
    end if;
    if jsonb_typeof(a->'items') is distinct from 'array'
       or jsonb_array_length(a->'items') not between 1 and 14
       or exists (select 1 from jsonb_array_elements(a->'items') i
                  where jsonb_typeof(i) <> 'string' or length(btrim(i #>> '{}')) not between 1 and 80)
       or (select count(*) <> count(distinct btrim(i #>> '{}')) from jsonb_array_elements(a->'items') i) then
      raise exception 'A template needs 1-14 distinct items of 1-80 characters';
    end if;
    items := array(select btrim(i #>> '{}') from jsonb_array_elements(a->'items') i);
    insert into fleet.inspection_templates (workspace_id, equipment_type, items, updated_by)
    values (w, btrim(a->>'equipmentType'), items, auth.uid())
    on conflict (workspace_id, equipment_type) do update set items = excluded.items, updated_by = excluded.updated_by, updated_at = clock_timestamp();
    insert into fleet.audit_events (workspace_id, actor, kind, details)
    values (w, auth.uid(), 'template_saved', jsonb_build_object('equipmentType', btrim(a->>'equipmentType'), 'items', to_jsonb(items)));
    return jsonb_build_object('saved', true);
  end if;

  -- A template's items are required on top of fleet.api's own checklist.
  if op = 'submit_inspection' then
    v := a->'report';
    select u.payload->>'type' into unit_type from fleet.units u where u.workspace_id = w and u.id = v->>'asset';
    select t.items into items from fleet.inspection_templates t where t.workspace_id = w and t.equipment_type = unit_type;
    if items is not null and jsonb_typeof(v->'checks') = 'array' then
      foreach needed in array items loop
        if not exists (select 1 from jsonb_array_elements(v->'checks') c where c->>'item' = needed) then
          raise exception 'Required checklist item missing: %', needed;
        end if;
      end loop;
    end if;
  end if;

  return fleet.api(op, a);
end; $$;
revoke all on function fleet.licensed_api(text, jsonb) from public, anon;
grant execute on function fleet.licensed_api(text, jsonb) to authenticated;

-- Driver medical cards are part of Driver Management.
create or replace function fleet.licensed_medical_api(op text, a jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare w uuid;
begin
  begin
    w := (a->>'workspace')::uuid;
  exception when invalid_text_representation then
    raise exception 'No active membership in this company' using errcode = 'insufficient_privilege';
  end;
  if fleet.member_role(w) is null then
    raise exception 'No active membership in this company' using errcode = 'insufficient_privilege';
  end if;
  perform fleet.require_any_module(w, array['tms_drivers']);
  return fleet.medical_api(op, a);
end; $$;
revoke all on function fleet.licensed_medical_api(text, jsonb) from public, anon;
grant execute on function fleet.licensed_medical_api(text, jsonb) to authenticated;

-- --- Route the public doors through the gate, and close the side doors -------
create or replace function public.hlg_fleet_rpc(p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb language sql set search_path = '' as $f$ select fleet.licensed_api(p_op, p_args) $f$;
create or replace function public.hlg_fleet_medical_rpc(p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb language sql set search_path = '' as $f$ select fleet.licensed_medical_api(p_op, p_args) $f$;
revoke execute on function fleet.api(text, jsonb) from authenticated;
revoke execute on function fleet.medical_api(text, jsonb) from authenticated;
