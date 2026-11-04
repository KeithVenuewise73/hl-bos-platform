-- ===========================================================================
-- hlbos_0059_salon_api — gated RPCs for SalonOS Release 1.
-- Each: authenticate -> tenant membership -> module licence -> permission -> validate -> act.
-- rollback: drop the salon.* functions (schema dropped by 0058's rollback).
-- ===========================================================================
create or replace function salon._gate(p_tenant uuid, p_module extensions.citext, p_permission extensions.citext default null) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = 'insufficient_privilege'; end if;
  if not identity.is_member(p_tenant) then raise exception 'not a member of this tenant' using errcode = 'insufficient_privilege'; end if;
  perform entitlements.require_module(p_tenant, p_module);
  if p_permission is not null and not identity.has_permission(p_tenant, p_permission) then
    raise exception 'insufficient privilege: % required', p_permission using errcode = 'insufficient_privilege';
  end if;
end; $$;
revoke all on function salon._gate(uuid, extensions.citext, extensions.citext) from public, anon, authenticated;

create or replace function salon._tz(p_tenant uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.timezone from salon.settings s where s.tenant_id = p_tenant), 'America/New_York') $$;
revoke all on function salon._tz(uuid) from public, anon, authenticated;

-- is the caller this stylist (by login)?
create or replace function salon._is_own_stylist(p_tenant uuid, p_stylist uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from salon.stylists s where s.id = p_stylist and s.tenant_id = p_tenant and s.user_id = auth.uid()) $$;
revoke all on function salon._is_own_stylist(uuid, uuid) from public, anon, authenticated;

-- may the caller act on THIS appointment? managers: any; stylists: own only
create or replace function salon._assert_can_act(p_tenant uuid, p_stylist uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if identity.has_permission(p_tenant, 'salon.appointment.manage') then return; end if;
  if identity.has_permission(p_tenant, 'salon.appointment.update') and salon._is_own_stylist(p_tenant, p_stylist) then return; end if;
  raise exception 'you may only act on your own appointments' using errcode = 'insufficient_privilege';
end; $$;
revoke all on function salon._assert_can_act(uuid, uuid) from public, anon, authenticated;

-- slot must sit fully inside one availability window on the salon's local calendar day
create or replace function salon._assert_slot(p_tenant uuid, p_stylist uuid, p_start timestamptz, p_end timestamptz) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := salon._tz(p_tenant); v_ls timestamp := p_start at time zone v_tz; v_le timestamp := p_end at time zone v_tz;
begin
  if p_start <= now() then raise exception 'appointments must start in the future' using errcode = 'invalid_parameter_value'; end if;
  if v_ls::date <> v_le::date and not (v_le::time = '00:00' and v_le::date = v_ls::date + 1) then
    raise exception 'appointment must end on the same day it starts' using errcode = 'invalid_parameter_value'; end if;
  if not exists (select 1 from salon.availability a where a.stylist_id = p_stylist and a.tenant_id = p_tenant
        and a.weekday = extract(dow from v_ls) and a.start_time <= v_ls::time and (a.end_time >= v_le::time or v_le::time = '00:00')) then
    raise exception 'the stylist is not available at that time' using errcode = 'invalid_parameter_value'; end if;
end; $$;
revoke all on function salon._assert_slot(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function salon._upsert_customer(p_tenant uuid, p_name text, p_email text, p_phone text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_email extensions.citext := nullif(btrim(coalesce(p_email, '')), '')::extensions.citext; v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
begin
  if p_name is null or btrim(p_name) = '' then raise exception 'customer name is required' using errcode = 'invalid_parameter_value'; end if;
  if v_email is null and v_phone is null then raise exception 'an email or phone number is required' using errcode = 'invalid_parameter_value'; end if;
  select c.id into v_id from salon.customers c where c.tenant_id = p_tenant and ((v_email is not null and lower(c.email::text) = lower(v_email::text)) or (v_phone is not null and c.phone = v_phone)) order by c.created_at limit 1;
  if v_id is null then
    insert into salon.customers (tenant_id, full_name, email, phone) values (p_tenant, btrim(p_name), v_email, v_phone) returning id into v_id;
  else
    update salon.customers set full_name = btrim(p_name), email = coalesce(email, lower(v_email::text)::extensions.citext), phone = coalesce(phone, v_phone), updated_at = now() where id = v_id;
  end if;
  return v_id;
end; $$;
revoke all on function salon._upsert_customer(uuid, text, text, text) from public, anon, authenticated;

create or replace function salon._notify(p_tenant uuid, p_appt uuid, p_event text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_tz text := salon._tz(p_tenant);
begin
  if not entitlements.module_is_active(p_tenant, 'salon.notifications') then return; end if;   -- not licensed: booking still works, nothing is queued
  select a.starts_at, c.full_name, c.email, sv.name as service, st.display_name as stylist into r
    from salon.appointments a join salon.customers c on c.id = a.customer_id join salon.services sv on sv.id = a.service_id join salon.stylists st on st.id = a.stylist_id
   where a.id = p_appt;
  if r.email is null then return; end if;
  perform comms.enqueue_internal(p_tenant, 'salon', 'email', ('salon_booking_' || p_event)::extensions.citext, 1, r.email,
    jsonb_build_object('customer_name', r.full_name, 'service', r.service, 'stylist', r.stylist, 'when', to_char(r.starts_at at time zone v_tz, 'Dy Mon DD, HH12:MI AM')),
    ('salon-' || p_appt::text || '-' || p_event || '-' || extract(epoch from r.starts_at)::bigint::text)::extensions.citext);
end; $$;
revoke all on function salon._notify(uuid, uuid, text) from public, anon, authenticated;

-- NOTE: inside search_path='' functions the citext '=' operator is not resolved, so comparisons fall back to
-- case-SENSITIVE text equality. Always compare citext values with lower(x::text) here.

-- --- Setup (S4) -------------------------------------------------------------------------
create or replace function salon.configure_salon(p_tenant uuid, p_display_name text, p_model salon.operating_model, p_timezone text default 'America/New_York', p_branding jsonb default '{}')
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform salon._gate(p_tenant, 'salon.core', 'salon.settings.manage');
  if not exists (select 1 from pg_timezone_names n where n.name = p_timezone) then raise exception 'unknown timezone %', p_timezone using errcode = 'invalid_parameter_value'; end if;
  insert into salon.settings (tenant_id, display_name, operating_model, timezone, branding) values (p_tenant, p_display_name, p_model, p_timezone, coalesce(p_branding, '{}'))
  on conflict (tenant_id) do update set display_name = excluded.display_name, operating_model = excluded.operating_model, timezone = excluded.timezone, branding = excluded.branding, updated_at = now();
end; $$;

create or replace function salon.add_service(p_tenant uuid, p_name text, p_duration_min integer, p_price_cents integer) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  perform salon._gate(p_tenant, 'salon.core', 'salon.catalog.manage');
  insert into salon.services (tenant_id, name, duration_min, price_cents) values (p_tenant, btrim(p_name), p_duration_min, p_price_cents) returning id into v;
  return v;
end; $$;

create or replace function salon.add_stylist(p_tenant uuid, p_name text, p_user uuid default null, p_model salon.stylist_model default 'employee',
  p_chair_rent_cents integer default 0, p_service_ids uuid[] default '{}') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid; v_op salon.operating_model; sid uuid;
begin
  perform salon._gate(p_tenant, 'salon.stylists', 'salon.catalog.manage');
  select s.operating_model into v_op from salon.settings s where s.tenant_id = p_tenant;
  if v_op is null then raise exception 'configure the salon before adding stylists' using errcode = 'object_not_in_prerequisite_state'; end if;
  if v_op <> 'mixed' and p_model::text <> v_op::text then raise exception 'this salon operates as % but the stylist is %', v_op, p_model using errcode = 'check_violation'; end if;
  if p_model = 'employee' and p_chair_rent_cents <> 0 then raise exception 'employees do not pay chair rent' using errcode = 'check_violation'; end if;
  if p_user is not null and not exists (select 1 from identity.memberships m where m.tenant_id = p_tenant and m.user_id = p_user and m.status = 'active') then
    raise exception 'user is not an active member of this tenant' using errcode = 'foreign_key_violation'; end if;
  insert into salon.stylists (tenant_id, user_id, display_name, model, chair_rent_cents) values (p_tenant, p_user, btrim(p_name), p_model, p_chair_rent_cents) returning id into v;
  foreach sid in array coalesce(p_service_ids, '{}') loop
    if not exists (select 1 from salon.services s where s.id = sid and s.tenant_id = p_tenant) then raise exception 'service % not found in this tenant', sid using errcode = 'no_data_found'; end if;
    insert into salon.stylist_services (tenant_id, stylist_id, service_id) values (p_tenant, v, sid);
  end loop;
  return v;
end; $$;

-- windows: [{"weekday":1,"start":"09:00","end":"17:00"}, ...]. Managers set anyone's; a stylist sets only their OWN, and only when they are a chair renter.
create or replace function salon.set_availability(p_tenant uuid, p_stylist uuid, p_windows jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare w jsonb; v_n integer := 0; v_model salon.stylist_model;
begin
  perform salon._gate(p_tenant, 'salon.stylists');
  select s.model into v_model from salon.stylists s where s.id = p_stylist and s.tenant_id = p_tenant;
  if not found then raise exception 'stylist not found in this tenant' using errcode = 'no_data_found'; end if;
  if not identity.has_permission(p_tenant, 'salon.catalog.manage') then
    if not (identity.has_permission(p_tenant, 'salon.availability.update') and salon._is_own_stylist(p_tenant, p_stylist) and v_model = 'chair_rental') then
      raise exception 'only a manager, or a chair-rental stylist for their own calendar, may change availability' using errcode = 'insufficient_privilege'; end if;
  end if;
  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then raise exception 'windows must be an array' using errcode = 'invalid_parameter_value'; end if;
  for w in select * from jsonb_array_elements(p_windows) loop
    if (w->>'weekday') is null or (w->>'weekday')::int not between 0 and 6 or (w->>'start')::time >= (w->>'end')::time then
      raise exception 'invalid availability window %', w using errcode = 'invalid_parameter_value'; end if;
  end loop;
  delete from salon.availability where stylist_id = p_stylist and tenant_id = p_tenant;
  for w in select * from jsonb_array_elements(p_windows) loop
    insert into salon.availability (tenant_id, stylist_id, weekday, start_time, end_time) values (p_tenant, p_stylist, (w->>'weekday')::smallint, (w->>'start')::time, (w->>'end')::time);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- --- Booking (S1) ------------------------------------------------------------------------
create or replace function salon.available_slots(p_tenant uuid, p_service uuid, p_stylist uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_dur integer; v_tz text := salon._tz(p_tenant);
begin
  perform salon._gate(p_tenant, 'salon.booking', 'salon.appointment.create');
  select s.duration_min into v_dur from salon.services s where s.id = p_service and s.tenant_id = p_tenant and s.active;
  if v_dur is null then raise exception 'service not found or inactive' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from salon.stylist_services x join salon.stylists st on st.id = x.stylist_id where x.stylist_id = p_stylist and x.service_id = p_service and x.tenant_id = p_tenant and st.active) then
    raise exception 'that stylist does not offer that service' using errcode = 'no_data_found'; end if;
  return coalesce((select jsonb_agg(to_jsonb(g.t) order by g.t) from (
      select distinct slot as t from salon.availability a,
        lateral generate_series((p_date + a.start_time) at time zone v_tz, ((p_date + a.end_time) at time zone v_tz) - make_interval(mins => v_dur), interval '15 minutes') slot
       where a.stylist_id = p_stylist and a.tenant_id = p_tenant and a.weekday = extract(dow from p_date)
         and slot > now()
         and not exists (select 1 from salon.appointments ap where ap.stylist_id = p_stylist and ap.status = 'booked'
                           and tstzrange(ap.starts_at, ap.ends_at, '[)') && tstzrange(slot, slot + make_interval(mins => v_dur), '[)'))) g), '[]'::jsonb);
end; $$;

create or replace function salon.book_appointment(p_tenant uuid, p_service uuid, p_stylist uuid, p_starts_at timestamptz,
  p_customer_name text, p_customer_email text default null, p_customer_phone text default null, p_idempotency_key text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_dur integer; v_price integer; v_cust uuid; v_id uuid;
begin
  perform salon._gate(p_tenant, 'salon.booking', 'salon.appointment.create');
  if p_idempotency_key is not null then
    select a.id into v_id from salon.appointments a where a.tenant_id = p_tenant and a.idempotency_key = p_idempotency_key;
    if found then return v_id; end if;
  end if;
  select s.duration_min, s.price_cents into v_dur, v_price from salon.services s where s.id = p_service and s.tenant_id = p_tenant and s.active;
  if v_dur is null then raise exception 'service not found or inactive' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from salon.stylist_services x join salon.stylists st on st.id = x.stylist_id where x.stylist_id = p_stylist and x.service_id = p_service and x.tenant_id = p_tenant and st.active) then
    raise exception 'that stylist does not offer that service' using errcode = 'no_data_found'; end if;
  perform salon._assert_slot(p_tenant, p_stylist, p_starts_at, p_starts_at + make_interval(mins => v_dur));
  v_cust := salon._upsert_customer(p_tenant, p_customer_name, p_customer_email, p_customer_phone);
  insert into salon.appointments (tenant_id, customer_id, stylist_id, service_id, starts_at, ends_at, price_cents, idempotency_key, created_by)
  values (p_tenant, v_cust, p_stylist, p_service, p_starts_at, p_starts_at + make_interval(mins => v_dur), v_price, p_idempotency_key, auth.uid())
  returning id into v_id;       -- the exclusion constraint rejects an overlapping booking for the same stylist (23P01)
  perform salon._notify(p_tenant, v_id, 'confirmed');
  perform events.emit('salon.appointment.booked', p_tenant, jsonb_build_object('appointment', v_id));
  return v_id;
end; $$;

-- --- Appointment management (S2) ---------------------------------------------------------------
create or replace function salon.reschedule_appointment(p_tenant uuid, p_appt uuid, p_new_start timestamptz, p_new_stylist uuid default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a salon.appointments%rowtype; v_dur integer; v_stylist uuid;
begin
  perform salon._gate(p_tenant, 'salon.booking');
  select * into a from salon.appointments x where x.id = p_appt and x.tenant_id = p_tenant for update;
  if not found then raise exception 'appointment not found in this tenant' using errcode = 'no_data_found'; end if;
  perform salon._assert_can_act(p_tenant, a.stylist_id);
  if a.status <> 'booked' then raise exception 'only a booked appointment can be rescheduled (status is %)', a.status using errcode = 'invalid_parameter_value'; end if;
  v_stylist := coalesce(p_new_stylist, a.stylist_id);
  if v_stylist <> a.stylist_id then
    perform salon._assert_can_act(p_tenant, v_stylist);
    if not exists (select 1 from salon.stylist_services x join salon.stylists st on st.id = x.stylist_id where x.stylist_id = v_stylist and x.service_id = a.service_id and x.tenant_id = p_tenant and st.active) then
      raise exception 'that stylist does not offer that service' using errcode = 'no_data_found'; end if;
  end if;
  select s.duration_min into v_dur from salon.services s where s.id = a.service_id;
  perform salon._assert_slot(p_tenant, v_stylist, p_new_start, p_new_start + make_interval(mins => v_dur));
  update salon.appointments set starts_at = p_new_start, ends_at = p_new_start + make_interval(mins => v_dur), stylist_id = v_stylist where id = p_appt;
  perform salon._notify(p_tenant, p_appt, 'rescheduled');
  perform events.emit('salon.appointment.rescheduled', p_tenant, jsonb_build_object('appointment', p_appt));
end; $$;

create or replace function salon.cancel_appointment(p_tenant uuid, p_appt uuid, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a salon.appointments%rowtype;
begin
  perform salon._gate(p_tenant, 'salon.booking');
  select * into a from salon.appointments x where x.id = p_appt and x.tenant_id = p_tenant for update;
  if not found then raise exception 'appointment not found in this tenant' using errcode = 'no_data_found'; end if;
  perform salon._assert_can_act(p_tenant, a.stylist_id);
  if a.status <> 'booked' then raise exception 'only a booked appointment can be cancelled (status is %)', a.status using errcode = 'invalid_parameter_value'; end if;
  update salon.appointments set status = 'cancelled', cancel_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_appt;
  perform salon._notify(p_tenant, p_appt, 'cancelled');
  perform events.emit('salon.appointment.cancelled', p_tenant, jsonb_build_object('appointment', p_appt));
end; $$;

create or replace function salon.complete_appointment(p_tenant uuid, p_appt uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a salon.appointments%rowtype;
begin
  perform salon._gate(p_tenant, 'salon.booking');
  select * into a from salon.appointments x where x.id = p_appt and x.tenant_id = p_tenant for update;
  if not found then raise exception 'appointment not found in this tenant' using errcode = 'no_data_found'; end if;
  perform salon._assert_can_act(p_tenant, a.stylist_id);
  if a.status <> 'booked' then raise exception 'only a booked appointment can be completed (status is %)', a.status using errcode = 'invalid_parameter_value'; end if;
  update salon.appointments set status = 'completed' where id = p_appt;
end; $$;

create or replace function salon.list_appointments(p_tenant uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_all boolean;
begin
  perform salon._gate(p_tenant, 'salon.booking');
  v_all := identity.has_permission(p_tenant, 'salon.appointment.manage');
  if not v_all and not identity.has_permission(p_tenant, 'salon.appointment.update') then raise exception 'insufficient privilege' using errcode = 'insufficient_privilege'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status, 'customer', c.full_name,
      'service', sv.name, 'stylist', st.display_name) order by a.starts_at)
    from salon.appointments a join salon.customers c on c.id = a.customer_id join salon.services sv on sv.id = a.service_id join salon.stylists st on st.id = a.stylist_id
    where a.tenant_id = p_tenant and a.starts_at >= p_from and a.starts_at < p_to and (v_all or st.user_id = auth.uid())), '[]'::jsonb);
end; $$;

-- --- Customer CRM (S3) ----------------------------------------------------------------------------
create or replace function salon.upsert_customer(p_tenant uuid, p_name text, p_email text default null, p_phone text default null, p_notes text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  perform salon._gate(p_tenant, 'salon.crm', 'salon.customer.manage');
  v := salon._upsert_customer(p_tenant, p_name, p_email, p_phone);
  if p_notes is not null then update salon.customers set notes = p_notes where id = v; end if;
  return v;
end; $$;

-- chair-rental stylists are independent businesses: they see only THEIR OWN visits with a customer; employees' salon shows everything
create or replace function salon.customer_history(p_tenant uuid, p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_all boolean; v_model salon.operating_model;
begin
  perform salon._gate(p_tenant, 'salon.crm', 'salon.customer.read');
  if not exists (select 1 from salon.customers c where c.id = p_customer and c.tenant_id = p_tenant) then raise exception 'customer not found in this tenant' using errcode = 'no_data_found'; end if;
  select coalesce((select s.operating_model from salon.settings s where s.tenant_id = p_tenant), 'employee') into v_model;
  v_all := identity.has_permission(p_tenant, 'salon.appointment.manage') or v_model = 'employee';
  return jsonb_build_object(
    'customer', (select jsonb_build_object('id', c.id, 'name', c.full_name, 'email', c.email, 'phone', c.phone, 'notes', c.notes) from salon.customers c where c.id = p_customer),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('appointment', a.id, 'starts_at', a.starts_at, 'status', a.status, 'service', sv.name, 'stylist', st.display_name, 'price_cents', a.price_cents) order by a.starts_at desc)
      from salon.appointments a join salon.services sv on sv.id = a.service_id join salon.stylists st on st.id = a.stylist_id
      where a.customer_id = p_customer and a.tenant_id = p_tenant and (v_all or st.user_id = auth.uid())), '[]'::jsonb));
end; $$;

-- --- Owner dashboard / analytics / campaigns (separately licensed) --------------------------------------
create or replace function salon.owner_dashboard(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_model salon.operating_model;
begin
  perform salon._gate(p_tenant, 'salon.dashboard', 'salon.report.read');
  select coalesce((select s.operating_model from salon.settings s where s.tenant_id = p_tenant), 'employee') into v_model;
  return jsonb_build_object('operating_model', v_model,
    'upcoming', (select count(*) from salon.appointments a where a.tenant_id = p_tenant and a.status = 'booked' and a.starts_at > now()),
    'completed', (select count(*) from salon.appointments a where a.tenant_id = p_tenant and a.status = 'completed'),
    'cancelled', (select count(*) from salon.appointments a where a.tenant_id = p_tenant and a.status = 'cancelled'),
    -- employee stylists: services revenue belongs to the shop; chair renters: the shop earns their rent, not their service revenue
    'shop_service_revenue_cents', (select coalesce(sum(a.price_cents), 0) from salon.appointments a join salon.stylists st on st.id = a.stylist_id
                                    where a.tenant_id = p_tenant and a.status = 'completed' and st.model = 'employee'),
    'chair_rent_due_cents', (select coalesce(sum(st.chair_rent_cents), 0) from salon.stylists st where st.tenant_id = p_tenant and st.active and st.model = 'chair_rental'),
    'by_stylist', coalesce((select jsonb_agg(jsonb_build_object('stylist', x.display_name, 'model', x.model, 'booked', x.booked, 'completed', x.completed) order by x.display_name)
      from (select st.display_name, st.model, count(a.*) filter (where a.status = 'booked') as booked, count(a.*) filter (where a.status = 'completed') as completed
              from salon.stylists st left join salon.appointments a on a.stylist_id = st.id where st.tenant_id = p_tenant group by st.id, st.display_name, st.model) x), '[]'::jsonb));
end; $$;

create or replace function salon.analytics_summary(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform salon._gate(p_tenant, 'salon.analytics', 'salon.report.read');
  return jsonb_build_object(
    'cancellation_rate', (select round(coalesce(count(*) filter (where status = 'cancelled')::numeric / nullif(count(*), 0), 0), 4) from salon.appointments where tenant_id = p_tenant),
    'service_mix', coalesce((select jsonb_agg(jsonb_build_object('service', sv.name, 'appointments', n) order by n desc)
      from (select a.service_id, count(*) n from salon.appointments a where a.tenant_id = p_tenant and a.status in ('booked','completed') group by a.service_id) m
      join salon.services sv on sv.id = m.service_id), '[]'::jsonb));
end; $$;

create or replace function salon.create_campaign_draft(p_tenant uuid, p_name text, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v uuid;
begin
  perform salon._gate(p_tenant, 'salon.campaigns', 'salon.campaign.manage');
  insert into salon.campaigns (tenant_id, name, body, created_by) values (p_tenant, btrim(p_name), p_body, auth.uid()) returning id into v;
  return v;
end; $$;

do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'salon' and p.proname !~ '^_' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
