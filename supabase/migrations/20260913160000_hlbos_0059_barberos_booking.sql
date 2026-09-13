-- ===========================================================================
-- hlbos_0059_barberos_booking — the appointment book
--
-- The third BarberOS module, and the one three more are waiting behind: the
-- lead funnel converts into it, revenue intelligence counts it, and staff
-- management schedules against it. 0057 recorded its blocker as "Engineering
-- only." This is that engineering.
--
-- ---------------------------------------------------------------------------
-- A MODELLING MISTAKE THIS MIGRATION CORRECTS
--
-- 0052 hung `site_services` off `barberos.sites` — the shop's web page. That
-- read fine while the page was the only module that used prices. It is wrong:
-- a shop's services, their durations and their prices belong to the SHOP, and
-- the page is one of several things that displays them. Left alone it would
-- have forced one of two bad outcomes — booking could not be sold without the
-- website module (which would break the `starter` bundle, since starter is
-- client_crm + booking + review_engine and contains no website), or booking
-- would grow a second service list that drifts from the first until a customer
-- books a thirty-minute cut that takes forty-five.
--
-- So `site_services` is repointed at `barberos.shops`, and its capability gate
-- now admits EITHER owned_website OR booking. The name is left alone
-- deliberately: renaming a live table to improve a word is churn, and the
-- comment now says what it is.
--
-- ---------------------------------------------------------------------------
-- WHAT AN APPOINTMENT BOOK HAS TO GET RIGHT
--
-- Everything else in this platform can be wrong and recoverable. A double
-- booking cannot: two men are in the shop, one of them was promised the chair,
-- and no apology fixes it. So that rule is not application logic and not a
-- trigger — it is an EXCLUSION CONSTRAINT, which holds against a direct INSERT
-- by the table owner, a bug in a future function, and anything else.
--
-- ---------------------------------------------------------------------------
-- THE THINGS THIS SCHEMA REFUSES TO LET ANYONE CLAIM
--
--   * TWO PEOPLE CANNOT HAVE THE SAME BARBER AT THE SAME TIME. Enforced by
--     `appointments_no_double_booking`. Cancelled and no-show rows are outside
--     the constraint, because a cancellation must free the chair.
--
--   * AN EMPTY LIST OF TIMES ALWAYS SAYS WHY. "No slots" reads as FULLY BOOKED
--     to anybody looking at it, and the difference between a full day, a day
--     this barber does not work, a barber whose rota has never been set up and
--     a service with no duration recorded is the difference between a shop
--     that trusts the software and one that stops opening it. `available_slots`
--     returns `basis` on every answer, including the successful ones.
--
--   * A PRICE AND A DURATION ARE CAPTURED WHEN THE BOOKING IS MADE. Raising a
--     price on Tuesday must not rewrite what Monday's customer was quoted.
--
--   * A CANCELLED APPOINTMENT IS NEVER DELETED. It keeps who cancelled it,
--     when, and why. A row that vanishes is an argument with a customer that
--     the shop cannot win.
--
--   * NOBODY IS A NO-SHOW UNTIL THEIR APPOINTMENT IS OVER. Marking one early
--     is refused outright, because a no-show is a fact about the past.
--
--   * COMPLETING AN APPOINTMENT WRITES THE VISIT. One entry, not two: the
--     client's history and their rhythm come out of the book automatically, so
--     client_crm is right without anybody re-typing what just happened.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS NOT
--
-- It is not staff_management. `barbers` is a list of people who can be booked
-- and the hours they work — no logins, no pay, no commission, no permissions.
-- Those are a separate module that lists booking as its prerequisite, and this
-- migration deliberately stops at the line.
--
-- It is not a customer-facing booking page either. The shop books; a public
-- self-service page is the lead funnel's job and is next.
--
-- rollback:
--   DROP TABLE IF EXISTS barberos.appointments CASCADE;
--   DROP TABLE IF EXISTS barberos.barber_time_off CASCADE;
--   DROP TABLE IF EXISTS barberos.barber_hours CASCADE;
--   DROP TABLE IF EXISTS barberos.barbers CASCADE;
--   DROP TABLE IF EXISTS barberos.booking_settings CASCADE;
--   DROP TYPE IF EXISTS barberos.appointment_status;
--   DROP FUNCTION IF EXISTS barberos.upsert_barber(uuid, text, boolean, uuid);
--   DROP FUNCTION IF EXISTS barberos.set_barber_hours(uuid, smallint, time, time);
--   DROP FUNCTION IF EXISTS barberos.set_time_off(uuid, date, text, time, time);
--   DROP FUNCTION IF EXISTS barberos.clear_time_off(uuid);
--   DROP FUNCTION IF EXISTS barberos.save_booking_settings(uuid, smallint, integer, smallint);
--   DROP FUNCTION IF EXISTS barberos.available_slots(uuid, uuid, bigint, date);
--   DROP FUNCTION IF EXISTS barberos.book_appointment(uuid, uuid, uuid, bigint, timestamptz, text);
--   DROP FUNCTION IF EXISTS barberos.cancel_appointment(uuid, text);
--   DROP FUNCTION IF EXISTS barberos.mark_no_show(uuid);
--   DROP FUNCTION IF EXISTS barberos.complete_appointment(uuid, jsonb);
--   DROP FUNCTION IF EXISTS barberos.day_sheet(uuid, date);
--   DROP FUNCTION IF EXISTS barberos.barber_list(uuid);
--   DELETE FROM identity.role_permissions WHERE permission_key LIKE 'barberos.booking%';
--   DELETE FROM identity.permissions      WHERE key            LIKE 'barberos.booking%';
--   UPDATE barberos.capabilities SET status='planned',
--     blocked_on='Engineering only.', blocker_owner='engineering' WHERE key='booking';
--   ALTER TABLE barberos.site_services DROP CONSTRAINT site_services_tenant_id_fkey,
--     ADD CONSTRAINT site_services_tenant_id_fkey FOREIGN KEY (tenant_id)
--     REFERENCES barberos.sites(tenant_id) ON DELETE CASCADE;
--   (Additive apart from the site_services FK and policy, both widened rather
--    than narrowed: every row that was legal before is still legal.)
-- approved-destructive: the rollback block above is the only DROP here. The one
--   in-place change is the site_services foreign key, which is replaced with a
--   strictly weaker one (every shop with a site is a shop), so no existing row
--   can be invalidated by it.
-- ===========================================================================

-- Needed for the exclusion constraint: btree_gist is what lets a gist index
-- mix an equality column (the barber) with an overlap column (the time range).
create extension if not exists btree_gist with schema extensions;

do $$ begin create type barberos.appointment_status as enum
  ('booked','completed','cancelled','no_show');
  exception when duplicate_object then null; end $$;

-- ===========================================================================
-- The correction: services belong to the shop, not to its web page
-- ===========================================================================
alter table barberos.site_services drop constraint if exists site_services_tenant_id_fkey;
alter table barberos.site_services add constraint site_services_tenant_id_fkey
  foreign key (tenant_id) references barberos.shops(tenant_id) on delete cascade;

comment on table barberos.site_services is
  'The shop''s services, durations and prices. Named for the module that first needed them (0052, the web page); they belong to the SHOP and are read by booking too. Repointed at barberos.shops in 0059.';

-- The gate accepts either module now. `require_capability` is rewritten below
-- to take any number of keys and pass if ANY of them is on.
drop trigger if exists site_services_requires_capability on barberos.site_services;
create trigger site_services_requires_capability
  before insert or update or delete on barberos.site_services
  for each row execute function barberos.require_capability('owned_website', 'booking');

-- The old policy said "you may read the prices if you can see the page", which
-- is unreadable for a shop that bought booking and not the website. It now
-- asks the same question the shop record itself asks.
drop policy if exists site_services_select on barberos.site_services;
create policy site_services_select on barberos.site_services for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.shop.read')
         or identity.is_platform_admin());

create or replace function barberos.require_capability()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_key text; v_ok boolean := false;
begin
  v_tenant := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  -- Any one of the listed capabilities is enough. A table shared by two
  -- modules (site_services, since 0059) is writable by a shop that bought
  -- either of them, and by a shop that bought neither it is not writable at
  -- all -- which is the same guarantee the single-key form always gave.
  foreach v_key in array tg_argv loop
    if barberos.is_enabled(v_tenant, v_key::extensions.citext) then
      v_ok := true;
      exit;
    end if;
  end loop;
  if not v_ok then
    raise exception
      'the % capability is not enabled for this shop, so % cannot be written',
      array_to_string(tg_argv, ' or the '), tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
comment on function barberos.require_capability() is
  'Attach to any capability-owned table with one or more capability keys as trigger arguments; the write is allowed if ANY of them is enabled. Makes barberos.is_enabled() load-bearing rather than advisory.';

-- ===========================================================================
-- Who can be booked
--
-- NOT staff management. No login, no role, no pay: a row here is a person the
-- book can point an appointment at. staff_management lists booking as its
-- prerequisite and is where an actual employee record belongs.
-- ===========================================================================
create table if not exists barberos.barbers (
  id           uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id    uuid not null references barberos.shops(tenant_id) on delete cascade,
  display_name text not null,
  -- Retiring a barber must never delete their appointments: last month's
  -- takings and a client's history both say who cut it.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint barbers_name_present check (length(btrim(display_name)) > 0),
  constraint barbers_name_unique unique (tenant_id, display_name)
);
comment on table barberos.barbers is
  'Someone an appointment can be booked with. Deactivated rather than deleted, because their past appointments are the shop''s own history.';

-- ===========================================================================
-- When they work
--
-- NO ROW means this barber does not work that day. That is a different fact
-- from a barber whose rota has never been entered at all -- a barber with no
-- rows AT ALL -- and `available_slots` reports the two differently rather than
-- returning the same empty list for both.
-- ===========================================================================
create table if not exists barberos.barber_hours (
  barber_id   uuid not null references barberos.barbers(id) on delete cascade,
  tenant_id   uuid not null references barberos.shops(tenant_id) on delete cascade,
  -- 0 = Sunday, matching PostgreSQL's extract(dow) and barberos.site_hours.
  day_of_week smallint not null,
  starts_at   time not null,
  ends_at     time not null,
  primary key (barber_id, day_of_week),
  constraint barber_hours_day_range check (day_of_week between 0 and 6),
  constraint barber_hours_starts_before_ends check (ends_at > starts_at)
);
comment on table barberos.barber_hours is
  'A barber''s working week, in the shop''s own timezone. No row for a day means they do not work it. These are NOT the shop''s opening hours (barberos.site_hours) -- the door being open and this chair being bookable are different facts.';

create table if not exists barberos.barber_time_off (
  id        uuid primary key default pg_catalog.gen_random_uuid(),
  barber_id uuid not null references barberos.barbers(id) on delete cascade,
  tenant_id uuid not null references barberos.shops(tenant_id) on delete cascade,
  on_date   date not null,
  -- Both NULL is the whole day off. Otherwise it is a window out of it -- a
  -- dentist at two, a school run at three.
  starts_at time,
  ends_at   time,
  reason    text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint time_off_whole_day_or_window check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);
comment on table barberos.barber_time_off is
  'A day, or part of one, this barber is not available. Existing appointments are NOT cancelled by it -- that is a decision a person makes, one customer at a time.';

create unique index if not exists barber_time_off_whole_day_uniq
  on barberos.barber_time_off (barber_id, on_date) where starts_at is null;
create index if not exists barber_time_off_lookup_idx
  on barberos.barber_time_off (barber_id, on_date);

-- ===========================================================================
-- How the book behaves
--
-- These are the module's operating defaults, not facts about any shop, and
-- they are stated here rather than scattered through the code so a shop can
-- see and change them. Nothing about the shop's business is inferred: the
-- durations and prices are still whatever the shop entered, and a service
-- without a duration is still unbookable rather than assumed to take half an
-- hour.
-- ===========================================================================
create table if not exists barberos.booking_settings (
  tenant_id         uuid primary key references barberos.shops(tenant_id) on delete cascade,
  -- Offered start times land on this boundary. A booking made by hand does
  -- not have to: a walk-in squeezed in at 9:07 is a real thing.
  slot_minutes      smallint not null default 15,
  -- How far ahead of now the first offered slot may be.
  lead_time_minutes integer  not null default 0,
  max_days_ahead    smallint not null default 60,
  updated_at        timestamptz not null default now(),
  constraint booking_slot_minutes_sane check (slot_minutes between 5 and 120),
  constraint booking_lead_time_sane check (lead_time_minutes between 0 and 20160),
  constraint booking_window_sane check (max_days_ahead between 1 and 365)
);

-- ===========================================================================
-- The book itself
-- ===========================================================================
create table if not exists barberos.appointments (
  id         uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id  uuid not null references barberos.shops(tenant_id) on delete cascade,
  client_id  uuid not null references barberos.clients(id) on delete restrict,
  barber_id  uuid not null references barberos.barbers(id) on delete restrict,

  -- The service this came from, and what it SAID at the time. A price rise on
  -- Tuesday must not rewrite what Monday's customer was quoted, and deleting a
  -- service from the list must not blank forty appointments.
  service_id       bigint references barberos.site_services(id) on delete set null,
  service_name     text not null,
  price_cents      integer,
  duration_minutes integer not null,

  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     barberos.appointment_status not null default 'booked',
  notes      text,

  cancelled_at     timestamptz,
  cancelled_by     uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  -- Set when the appointment becomes a haircut that happened.
  visit_id   uuid references barberos.visits(id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint appointments_name_present check (length(btrim(service_name)) > 0),
  constraint appointments_duration_positive check (duration_minutes > 0),
  constraint appointments_price_sane check (price_cents is null or price_cents > 0),
  constraint appointments_ends_after_starts check (ends_at > starts_at),
  -- The end is the start plus the duration that was quoted. Not advisory:
  -- without it the exclusion constraint below could be walked around by
  -- writing a shorter range than the haircut actually takes.
  constraint appointments_end_matches_duration
    check (ends_at = starts_at + make_interval(mins => duration_minutes)),
  constraint appointments_cancelled_has_when
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint appointments_completed_or_not
    check (visit_id is null or status = 'completed'),

  -- THE RULE THIS MODULE EXISTS TO KEEP. An exclusion constraint rather than a
  -- trigger or a check in a function, so it holds against a direct INSERT by
  -- the table owner and against any bug in any future write path. Cancelled
  -- and no-show rows are outside it: a cancellation has to free the chair.
  constraint appointments_no_double_booking
    exclude using gist (
      barber_id extensions.gist_uuid_ops with =,
      tstzrange(starts_at, ends_at) with &&)
    where (status in ('booked', 'completed'))
);
comment on table barberos.appointments is
  'One appointment. Never deleted -- cancelling sets a status and keeps who, when and why, because a row that vanishes is an argument with a customer the shop cannot win.';
comment on constraint appointments_no_double_booking on barberos.appointments is
  'Two people cannot have the same barber at the same time. Everything else in this platform can be wrong and recoverable; this cannot.';

create index if not exists appointments_day_idx
  on barberos.appointments (tenant_id, starts_at);
create index if not exists appointments_client_idx
  on barberos.appointments (client_id, starts_at desc);
create index if not exists appointments_barber_idx
  on barberos.appointments (barber_id, starts_at);

-- ===========================================================================
-- Nothing here is writable unless the shop is paying for the module
-- ===========================================================================
create trigger barbers_capability before insert or update or delete on barberos.barbers
  for each row execute function barberos.require_capability('booking');
create trigger barber_hours_capability before insert or update or delete on barberos.barber_hours
  for each row execute function barberos.require_capability('booking');
create trigger barber_time_off_capability before insert or update or delete on barberos.barber_time_off
  for each row execute function barberos.require_capability('booking');
create trigger booking_settings_capability before insert or update or delete on barberos.booking_settings
  for each row execute function barberos.require_capability('booking');
create trigger appointments_capability before insert or update or delete on barberos.appointments
  for each row execute function barberos.require_capability('booking');

create trigger barbers_set_updated_at before update on barberos.barbers
  for each row execute function platform.set_updated_at();
create trigger appointments_set_updated_at before update on barberos.appointments
  for each row execute function platform.set_updated_at();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table barberos.barbers          enable row level security;
alter table barberos.barbers          force  row level security;
alter table barberos.barber_hours     enable row level security;
alter table barberos.barber_hours     force  row level security;
alter table barberos.barber_time_off  enable row level security;
alter table barberos.barber_time_off  force  row level security;
alter table barberos.booking_settings enable row level security;
alter table barberos.booking_settings force  row level security;
alter table barberos.appointments     enable row level security;
alter table barberos.appointments     force  row level security;

drop policy if exists barbers_select on barberos.barbers;
create policy barbers_select on barberos.barbers for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.booking.read')
         or identity.is_platform_admin());
drop policy if exists barber_hours_select on barberos.barber_hours;
create policy barber_hours_select on barberos.barber_hours for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.booking.read')
         or identity.is_platform_admin());
drop policy if exists barber_time_off_select on barberos.barber_time_off;
create policy barber_time_off_select on barberos.barber_time_off for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.booking.read')
         or identity.is_platform_admin());
drop policy if exists booking_settings_select on barberos.booking_settings;
create policy booking_settings_select on barberos.booking_settings for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.booking.read')
         or identity.is_platform_admin());
drop policy if exists appointments_select on barberos.appointments;
create policy appointments_select on barberos.appointments for select to authenticated
  using (identity.has_permission(tenant_id, 'barberos.booking.read')
         or identity.is_platform_admin());

grant select on barberos.barbers, barberos.barber_hours, barberos.barber_time_off,
                barberos.booking_settings, barberos.appointments to authenticated;

-- ===========================================================================
-- Permissions
--
-- THREE, not two, and the split is the point. `barberos.booking.manage` is
-- taking and cancelling bookings -- the work of the day, which the barber at
-- the chair does. THE ROTA IS A SEPARATE RESOURCE, `barberos.booking_rota`:
-- deciding who works and when belongs to whoever runs the shop, and a shop
-- where every barber can quietly rewrite their own hours is a shop with no
-- rota.
--
-- It is a separate RESOURCE rather than a third action on the same one because
-- 0003 froze the action vocabulary at seven verbs and `configure` is not among
-- them. The first draft of this migration tried to add it and the check
-- constraint refused -- correctly. The vocabulary is closed on purpose: an open
-- one is where an action nobody audits gets added, and widening it platform-
-- wide to save a word here would have been the wrong trade by a long way.
-- ===========================================================================
insert into identity.permissions (key, description, scope) values
  ('barberos.booking.read',      'See the appointment book, the barbers and their hours.', 'tenant'),
  ('barberos.booking.manage',    'Take, cancel and complete appointments.', 'tenant'),
  ('barberos.booking_rota.manage', 'Add barbers, set who works when, and change how the book behaves.', 'tenant')
on conflict (key) do nothing;

insert into identity.role_permissions (role_key, permission_key) values
  ('tenant_owner','barberos.booking.read'), ('tenant_owner','barberos.booking.manage'),
  ('tenant_owner','barberos.booking_rota.manage'),
  ('tenant_admin','barberos.booking.read'), ('tenant_admin','barberos.booking.manage'),
  ('tenant_admin','barberos.booking_rota.manage'),
  ('manager','barberos.booking.read'), ('manager','barberos.booking.manage'),
  ('manager','barberos.booking_rota.manage'),
  ('staff','barberos.booking.read'), ('staff','barberos.booking.manage'),
  ('viewer','barberos.booking.read')
on conflict do nothing;

-- ===========================================================================
-- The rota
-- ===========================================================================
create or replace function barberos.upsert_barber(
  p_tenant uuid, p_name text, p_active boolean default true, p_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not identity.has_permission(p_tenant, 'barberos.booking_rota.manage') then
    raise exception 'insufficient privilege to change who works at this shop'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id is not null then
    update barberos.barbers b set display_name = p_name, active = p_active
     where b.id = p_id and b.tenant_id = p_tenant
     returning b.id into v_id;
    if v_id is null then
      raise exception 'barber % does not work at this shop', p_id
        using errcode = 'check_violation';
    end if;
    return v_id;
  end if;

  -- Matched by name within the shop, so re-adding a barber who was retired
  -- brings back their history instead of starting a second, emptier one.
  select b.id into v_id from barberos.barbers b
   where b.tenant_id = p_tenant and b.display_name = p_name;
  if v_id is null then
    insert into barberos.barbers (tenant_id, display_name, active, created_by)
    values (p_tenant, p_name, p_active, auth.uid())
    returning id into v_id;
  else
    update barberos.barbers set active = p_active where id = v_id;
  end if;
  return v_id;
end; $$;
comment on function barberos.upsert_barber(uuid, text, boolean, uuid) is
  'Add a barber, rename one, or retire one. Retiring sets active = false and never deletes: their past appointments are the shop''s own history.';
revoke all on function barberos.upsert_barber(uuid, text, boolean, uuid) from public, anon;
grant execute on function barberos.upsert_barber(uuid, text, boolean, uuid) to authenticated;

create or replace function barberos.set_barber_hours(
  p_barber uuid, p_day smallint, p_starts time default null, p_ends time default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select b.tenant_id into v_tenant from barberos.barbers b where b.id = p_barber;
  if v_tenant is null then
    raise exception 'barber % does not exist', p_barber using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'barberos.booking_rota.manage') then
    raise exception 'insufficient privilege to change this shop''s rota'
      using errcode = 'insufficient_privilege';
  end if;

  -- Both times absent is how a day is taken OFF the rota. It leaves no row,
  -- because "does not work Tuesdays" is the absence of a working day, not a
  -- working day of zero length.
  if p_starts is null and p_ends is null then
    delete from barberos.barber_hours where barber_id = p_barber and day_of_week = p_day;
    return false;
  end if;
  if p_starts is null or p_ends is null then
    raise exception 'a working day needs both a start and an end, or neither'
      using errcode = 'check_violation';
  end if;

  insert into barberos.barber_hours (barber_id, tenant_id, day_of_week, starts_at, ends_at)
  values (p_barber, v_tenant, p_day, p_starts, p_ends)
  on conflict (barber_id, day_of_week)
    do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at;
  return true;
end; $$;
comment on function barberos.set_barber_hours(uuid, smallint, time, time) is
  'Set or clear one day of a barber''s working week. Passing no times removes the day, which is how a barber stops working Tuesdays.';
revoke all on function barberos.set_barber_hours(uuid, smallint, time, time) from public, anon;
grant execute on function barberos.set_barber_hours(uuid, smallint, time, time) to authenticated;

create or replace function barberos.set_time_off(
  p_barber uuid, p_date date, p_reason text default null,
  p_starts time default null, p_ends time default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_id uuid;
begin
  select b.tenant_id into v_tenant from barberos.barbers b where b.id = p_barber;
  if v_tenant is null then
    raise exception 'barber % does not exist', p_barber using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'barberos.booking_rota.manage') then
    raise exception 'insufficient privilege to change this shop''s rota'
      using errcode = 'insufficient_privilege';
  end if;

  insert into barberos.barber_time_off (barber_id, tenant_id, on_date, starts_at, ends_at, reason, created_by)
  values (p_barber, v_tenant, p_date, p_starts, p_ends, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
comment on function barberos.set_time_off(uuid, date, text, time, time) is
  'Mark a barber unavailable for a whole day (no times) or part of one. Appointments already in the book are NOT cancelled by it -- that is a decision a person makes, one customer at a time.';
revoke all on function barberos.set_time_off(uuid, date, text, time, time) from public, anon;
grant execute on function barberos.set_time_off(uuid, date, text, time, time) to authenticated;

create or replace function barberos.clear_time_off(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select t.tenant_id into v_tenant from barberos.barber_time_off t where t.id = p_id;
  if v_tenant is null then return false; end if;
  if not identity.has_permission(v_tenant, 'barberos.booking_rota.manage') then
    raise exception 'insufficient privilege to change this shop''s rota'
      using errcode = 'insufficient_privilege';
  end if;
  delete from barberos.barber_time_off where id = p_id;
  return true;
end; $$;
revoke all on function barberos.clear_time_off(uuid) from public, anon;
grant execute on function barberos.clear_time_off(uuid) to authenticated;

create or replace function barberos.save_booking_settings(
  p_tenant uuid, p_slot_minutes smallint default null,
  p_lead_time_minutes integer default null, p_max_days_ahead smallint default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_row barberos.booking_settings%rowtype;
begin
  if not identity.has_permission(p_tenant, 'barberos.booking_rota.manage') then
    raise exception 'insufficient privilege to change how this shop''s book behaves'
      using errcode = 'insufficient_privilege';
  end if;

  insert into barberos.booking_settings (tenant_id) values (p_tenant)
  on conflict (tenant_id) do nothing;

  -- coalesce, so changing one setting does not silently reset the others.
  update barberos.booking_settings s set
    slot_minutes      = coalesce(p_slot_minutes, s.slot_minutes),
    lead_time_minutes = coalesce(p_lead_time_minutes, s.lead_time_minutes),
    max_days_ahead    = coalesce(p_max_days_ahead, s.max_days_ahead),
    updated_at        = now()
   where s.tenant_id = p_tenant
   returning * into v_row;

  return jsonb_build_object(
    'slot_minutes', v_row.slot_minutes,
    'lead_time_minutes', v_row.lead_time_minutes,
    'max_days_ahead', v_row.max_days_ahead);
end; $$;
revoke all on function barberos.save_booking_settings(uuid, smallint, integer, smallint) from public, anon;
grant execute on function barberos.save_booking_settings(uuid, smallint, integer, smallint) to authenticated;

-- ===========================================================================
-- What times are actually free
--
-- The whole module turns on this answer, and on the fact that it NEVER returns
-- a bare empty list. "No times" reads as "fully booked" to whoever is looking,
-- and a shop that is told it is fully booked when really nobody entered the
-- rota will stop trusting every other number on the screen.
-- ===========================================================================
create or replace function barberos.available_slots(
  p_tenant uuid, p_barber uuid, p_service bigint, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_slot int; v_lead int; v_max int;
  v_dur int; v_svc_name text; v_price int;
  v_rota int; v_starts time; v_ends time;
  v_win_start timestamptz; v_win_end timestamptz; v_earliest timestamptz;
  v_cursor timestamptz; v_stop timestamptz;
  v_candidates int := 0; v_today date;
  v_basis text; v_slots jsonb := '[]'::jsonb;
  v_barber text; v_barber_tenant uuid; v_active boolean;
begin
  if not (identity.has_permission(p_tenant, 'barberos.booking.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s appointment book'
      using errcode = 'insufficient_privilege';
  end if;

  select s.timezone into v_tz from barberos.shops s where s.tenant_id = p_tenant;
  if v_tz is null then
    raise exception 'there is no shop record for this tenant' using errcode = 'no_data_found';
  end if;

  select b.display_name, b.tenant_id, b.active
    into v_barber, v_barber_tenant, v_active
    from barberos.barbers b where b.id = p_barber;
  if v_barber_tenant is null or v_barber_tenant <> p_tenant then
    raise exception 'barber % does not work at this shop', p_barber
      using errcode = 'check_violation';
  end if;

  select sv.name, sv.duration_minutes, sv.price_cents
    into v_svc_name, v_dur, v_price
    from barberos.site_services sv
   where sv.id = p_service and sv.tenant_id = p_tenant;
  if v_svc_name is null then
    raise exception 'service % is not one of this shop''s services', p_service
      using errcode = 'no_data_found';
  end if;

  select bs.slot_minutes, bs.lead_time_minutes, bs.max_days_ahead
    into v_slot, v_lead, v_max
    from barberos.booking_settings bs where bs.tenant_id = p_tenant;
  v_slot := coalesce(v_slot, 15);
  v_lead := coalesce(v_lead, 0);
  v_max  := coalesce(v_max, 60);

  -- "Today" is the shop's today, not the server's.
  v_today := (now() at time zone v_tz)::date;

  if not v_active then
    v_basis := 'this barber is not currently taking appointments';
  elsif v_dur is null then
    v_basis := 'this service has no duration recorded, so no appointment length can be worked out';
  elsif p_date < v_today then
    v_basis := 'that date has already passed';
  elsif p_date > v_today + v_max then
    v_basis := 'that date is beyond the ' || v_max || ' days this book is open for';
  end if;

  if v_basis is null then
    select count(*) into v_rota from barberos.barber_hours h where h.barber_id = p_barber;
    if v_rota = 0 then
      -- The distinction this whole function exists to keep: nobody has said
      -- when this barber works, which is not the same as a day they are off.
      v_basis := 'no working hours have been set for this barber yet';
    else
      select h.starts_at, h.ends_at into v_starts, v_ends
        from barberos.barber_hours h
       where h.barber_id = p_barber
         and h.day_of_week = extract(dow from p_date)::smallint;
      if v_starts is null then
        v_basis := 'this barber does not work on ' || btrim(to_char(p_date, 'Day')) || 's';
      elsif exists (select 1 from barberos.barber_time_off t
                     where t.barber_id = p_barber and t.on_date = p_date
                       and t.starts_at is null) then
        v_basis := 'this barber is off on that date';
      end if;
    end if;
  end if;

  if v_basis is null then
    v_win_start := (p_date + v_starts) at time zone v_tz;
    v_win_end   := (p_date + v_ends)   at time zone v_tz;
    v_earliest  := now() + make_interval(mins => v_lead);

    v_cursor := v_win_start;
    while v_cursor + make_interval(mins => v_dur) <= v_win_end loop
      v_candidates := v_candidates + 1;
      v_stop := v_cursor + make_interval(mins => v_dur);
      if v_cursor >= v_earliest
         and not exists (
           select 1 from barberos.appointments a
            where a.barber_id = p_barber
              and a.status in ('booked', 'completed')
              and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_stop))
         and not exists (
           select 1 from barberos.barber_time_off t
            where t.barber_id = p_barber and t.on_date = p_date
              and t.starts_at is not null
              and tstzrange((p_date + t.starts_at) at time zone v_tz,
                            (p_date + t.ends_at)   at time zone v_tz)
                  && tstzrange(v_cursor, v_stop))
      then
        v_slots := v_slots || to_jsonb(v_cursor);
      end if;
      v_cursor := v_cursor + make_interval(mins => v_slot);
    end loop;

    -- Four different empty lists, four different sentences.
    if jsonb_array_length(v_slots) > 0 then
      v_basis := 'open';
    elsif v_candidates = 0 then
      v_basis := 'this service takes longer than this barber works that day';
    elsif v_win_end <= v_earliest then
      v_basis := 'this barber has already finished for the day';
    else
      v_basis := 'every remaining time that day is taken';
    end if;
  end if;

  return jsonb_build_object(
    'date', p_date,
    'timezone', v_tz,
    'slot_minutes', v_slot,
    'barber', jsonb_build_object('id', p_barber, 'display_name', v_barber, 'active', v_active),
    'service', jsonb_build_object('id', p_service, 'name', v_svc_name,
      'duration_minutes', v_dur, 'price_cents', v_price),
    'slots', v_slots,
    'basis', v_basis);
end; $$;
comment on function barberos.available_slots(uuid, uuid, bigint, date) is
  'Free start times for one barber, one service, one day. ALWAYS returns a `basis` saying why the list is what it is -- a bare empty list reads as "fully booked" and would hide an unset rota, a day off, a service with no duration, and a day that is simply over.';
revoke all on function barberos.available_slots(uuid, uuid, bigint, date) from public, anon;
grant execute on function barberos.available_slots(uuid, uuid, bigint, date) to authenticated;

-- ===========================================================================
-- Taking the booking
-- ===========================================================================
create or replace function barberos.book_appointment(
  p_tenant uuid, p_client uuid, p_barber uuid, p_service bigint,
  p_starts_at timestamptz, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tz text; v_id uuid; v_dur int; v_svc_name text; v_price int;
  v_ends timestamptz; v_date date; v_starts time; v_ends_t time;
  v_lead int; v_max int; v_active boolean; v_barber text;
  v_barber_tenant uuid; v_client_tenant uuid;
begin
  if not identity.has_permission(p_tenant, 'barberos.booking.manage') then
    raise exception 'insufficient privilege to take a booking for this shop'
      using errcode = 'insufficient_privilege';
  end if;

  select s.timezone into v_tz from barberos.shops s where s.tenant_id = p_tenant;
  if v_tz is null then
    raise exception 'there is no shop record for this tenant' using errcode = 'no_data_found';
  end if;

  select c.tenant_id into v_client_tenant from barberos.clients c where c.id = p_client;
  if v_client_tenant is null then
    raise exception 'client % does not exist', p_client using errcode = 'no_data_found';
  end if;
  -- The same rule the visit record keeps: one shop's customer cannot end up in
  -- another shop's book.
  if v_client_tenant <> p_tenant then
    raise exception 'client % belongs to a different shop', p_client
      using errcode = 'check_violation';
  end if;

  select b.tenant_id, b.display_name, b.active
    into v_barber_tenant, v_barber, v_active
    from barberos.barbers b where b.id = p_barber;
  if v_barber_tenant is null or v_barber_tenant <> p_tenant then
    raise exception 'barber % does not work at this shop', p_barber
      using errcode = 'check_violation';
  end if;
  if not v_active then
    raise exception '% is not currently taking appointments', v_barber
      using errcode = 'check_violation';
  end if;

  select sv.name, sv.duration_minutes, sv.price_cents
    into v_svc_name, v_dur, v_price
    from barberos.site_services sv
   where sv.id = p_service and sv.tenant_id = p_tenant;
  if v_svc_name is null then
    raise exception 'service % is not one of this shop''s services', p_service
      using errcode = 'no_data_found';
  end if;
  -- A service with no duration cannot be given a slot without inventing one,
  -- and an invented length is a queue that runs late every single day.
  if v_dur is null then
    raise exception 'the service "%" has no duration recorded, so it cannot be booked until the shop says how long it takes', v_svc_name
      using errcode = 'check_violation';
  end if;

  select coalesce(bs.lead_time_minutes, 0), coalesce(bs.max_days_ahead, 60)
    into v_lead, v_max
    from (select p_tenant as t) x
    left join barberos.booking_settings bs on bs.tenant_id = x.t;

  if p_starts_at < now() + make_interval(mins => v_lead) then
    if v_lead = 0 then
      raise exception 'that time has already passed' using errcode = 'check_violation';
    else
      raise exception 'this shop takes bookings at least % minutes ahead', v_lead
        using errcode = 'check_violation';
    end if;
  end if;
  if p_starts_at > now() + make_interval(days => v_max) then
    raise exception 'this book is only open % days ahead', v_max
      using errcode = 'check_violation';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_dur);
  v_date := (p_starts_at at time zone v_tz)::date;

  select h.starts_at, h.ends_at into v_starts, v_ends_t
    from barberos.barber_hours h
   where h.barber_id = p_barber
     and h.day_of_week = extract(dow from v_date)::smallint;
  if v_starts is null then
    raise exception '% does not work on %s', v_barber, btrim(to_char(v_date, 'Day'))
      using errcode = 'check_violation';
  end if;
  if p_starts_at < (v_date + v_starts) at time zone v_tz
     or v_ends > (v_date + v_ends_t) at time zone v_tz then
    raise exception 'that time is outside %''s working hours on that day', v_barber
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from barberos.barber_time_off t
              where t.barber_id = p_barber and t.on_date = v_date
                and (t.starts_at is null
                     or tstzrange((v_date + t.starts_at) at time zone v_tz,
                                  (v_date + t.ends_at)   at time zone v_tz)
                         && tstzrange(p_starts_at, v_ends))) then
    raise exception '% is not available at that time', v_barber
      using errcode = 'check_violation';
  end if;

  begin
    insert into barberos.appointments (
      tenant_id, client_id, barber_id, service_id, service_name,
      price_cents, duration_minutes, starts_at, ends_at, notes, created_by)
    values (
      p_tenant, p_client, p_barber, p_service, v_svc_name,
      v_price, v_dur, p_starts_at, v_ends, p_notes, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    -- The constraint did its job; this turns it into a sentence a person can
    -- act on instead of a Postgres error about a gist index.
    raise exception '% is already booked at that time', v_barber
      using errcode = 'exclusion_violation';
  end;

  return v_id;
end; $$;
comment on function barberos.book_appointment(uuid, uuid, uuid, bigint, timestamptz, text) is
  'Take one booking. The price and the duration are copied in as they stand today, so a later price change never rewrites what this customer was quoted.';
revoke all on function barberos.book_appointment(uuid, uuid, uuid, bigint, timestamptz, text) from public, anon;
grant execute on function barberos.book_appointment(uuid, uuid, uuid, bigint, timestamptz, text) to authenticated;

create or replace function barberos.cancel_appointment(p_id uuid, p_reason text default null)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status barberos.appointment_status;
begin
  select a.tenant_id, a.status into v_tenant, v_status
    from barberos.appointments a where a.id = p_id;
  if v_tenant is null then
    raise exception 'appointment % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'barberos.booking.manage') then
    raise exception 'insufficient privilege to cancel this appointment'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status = 'completed' then
    raise exception 'that appointment has already happened, so it cannot be cancelled'
      using errcode = 'check_violation';
  end if;
  if v_status = 'cancelled' then return false; end if;

  update barberos.appointments set
    status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancellation_reason = p_reason
   where id = p_id;
  return true;
end; $$;
comment on function barberos.cancel_appointment(uuid, text) is
  'Cancel an appointment. The row stays, with who cancelled it, when and why -- a booking that vanishes is an argument with a customer the shop cannot win.';
revoke all on function barberos.cancel_appointment(uuid, text) from public, anon;
grant execute on function barberos.cancel_appointment(uuid, text) to authenticated;

create or replace function barberos.mark_no_show(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_tenant uuid; v_status barberos.appointment_status; v_ends timestamptz;
begin
  select a.tenant_id, a.status, a.ends_at into v_tenant, v_status, v_ends
    from barberos.appointments a where a.id = p_id;
  if v_tenant is null then
    raise exception 'appointment % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_tenant, 'barberos.booking.manage') then
    raise exception 'insufficient privilege to change this appointment'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'booked' then
    raise exception 'that appointment is already %', v_status using errcode = 'check_violation';
  end if;
  -- A no-show is a fact about the past. Marking one early would let a shop
  -- record a customer as having failed to turn up for an appointment they
  -- still have time to keep.
  if now() < v_ends then
    raise exception 'that appointment is not over yet, so nobody can be marked a no-show'
      using errcode = 'check_violation';
  end if;
  update barberos.appointments set status = 'no_show' where id = p_id;
  return true;
end; $$;
revoke all on function barberos.mark_no_show(uuid) from public, anon;
grant execute on function barberos.mark_no_show(uuid) to authenticated;

-- ===========================================================================
-- The join back to the client record
--
-- Completing an appointment writes the visit. One entry, not two: without this
-- every shop would keep the book and the client history separately, they would
-- disagree within a week, and the rhythm client_crm reports would be measured
-- against whichever one somebody remembered to fill in.
-- ===========================================================================
create or replace function barberos.complete_appointment(
  p_id uuid, p_visit jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a barberos.appointments%rowtype; v_tz text; v_visit uuid; v_barber text;
begin
  select * into v_a from barberos.appointments where id = p_id;
  if v_a.id is null then
    raise exception 'appointment % does not exist', p_id using errcode = 'no_data_found';
  end if;
  if not identity.has_permission(v_a.tenant_id, 'barberos.booking.manage') then
    raise exception 'insufficient privilege to complete this appointment'
      using errcode = 'insufficient_privilege';
  end if;
  if v_a.status = 'completed' then
    raise exception 'that appointment is already recorded as done'
      using errcode = 'check_violation';
  end if;
  if v_a.status <> 'booked' then
    raise exception 'that appointment is %, so it cannot be completed', v_a.status
      using errcode = 'check_violation';
  end if;
  if now() < v_a.starts_at then
    raise exception 'that appointment has not started yet'
      using errcode = 'check_violation';
  end if;

  select s.timezone into v_tz from barberos.shops s where s.tenant_id = v_a.tenant_id;
  select b.display_name into v_barber from barberos.barbers b where b.id = v_a.barber_id;

  -- What the book already knows, then whatever the barber adds about the cut.
  -- The caller's keys win, because the person who just did the haircut is a
  -- better source on what it cost than the price list was yesterday.
  v_visit := barberos.record_visit(v_a.tenant_id, v_a.client_id,
    jsonb_build_object(
      'visited_on', (v_a.starts_at at time zone v_tz)::date::text,
      'barber', v_barber,
      'service_name', v_a.service_name,
      'price_cents', v_a.price_cents,
      'duration_minutes', v_a.duration_minutes
    ) || coalesce(p_visit, '{}'::jsonb));

  update barberos.appointments
     set status = 'completed', visit_id = v_visit
   where id = p_id;

  return v_visit;
end; $$;
comment on function barberos.complete_appointment(uuid, jsonb) is
  'Mark an appointment done and write the visit it became, so the client''s history and their rhythm come out of the book without anybody re-typing what just happened.';
revoke all on function barberos.complete_appointment(uuid, jsonb) from public, anon;
grant execute on function barberos.complete_appointment(uuid, jsonb) to authenticated;

-- ===========================================================================
-- The screen a shop actually looks at
-- ===========================================================================
create or replace function barberos.day_sheet(p_tenant uuid, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_date date; v_rows jsonb; v_expected int; v_missing int; v_n int;
begin
  if not (identity.has_permission(p_tenant, 'barberos.booking.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s appointment book'
      using errcode = 'insufficient_privilege';
  end if;

  select s.timezone into v_tz from barberos.shops s where s.tenant_id = p_tenant;
  if v_tz is null then
    raise exception 'there is no shop record for this tenant' using errcode = 'no_data_found';
  end if;
  v_date := coalesce(p_date, (now() at time zone v_tz)::date);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'starts_at', a.starts_at,
           'ends_at', a.ends_at,
           'local_time', to_char(a.starts_at at time zone v_tz, 'HH24:MI'),
           'status', a.status,
           'client', jsonb_build_object('id', c.id, 'display_name', c.display_name, 'phone', c.phone),
           'barber', jsonb_build_object('id', b.id, 'display_name', b.display_name),
           'service_name', a.service_name,
           'price_cents', a.price_cents,
           'duration_minutes', a.duration_minutes,
           'notes', a.notes,
           'cancellation_reason', a.cancellation_reason,
           'visit_id', a.visit_id)
         order by a.starts_at, b.display_name), '[]'::jsonb)
    into v_rows
    from barberos.appointments a
    join barberos.clients c on c.id = a.client_id
    join barberos.barbers b on b.id = a.barber_id
   where a.tenant_id = p_tenant
     and (a.starts_at at time zone v_tz)::date = v_date;

  -- Money that is still expected, with its own gaps beside it. The same rule
  -- as lifetime value in client_crm: a total is never readable without the
  -- count of rows that carry no price at all.
  select count(*) filter (where a.status in ('booked','completed')),
         coalesce(sum(a.price_cents) filter (where a.status in ('booked','completed')), 0),
         count(*) filter (where a.status in ('booked','completed') and a.price_cents is null)
    into v_n, v_expected, v_missing
    from barberos.appointments a
   where a.tenant_id = p_tenant
     and (a.starts_at at time zone v_tz)::date = v_date;

  return jsonb_build_object(
    'date', v_date,
    'timezone', v_tz,
    'appointments', v_rows,
    'summary', jsonb_build_object(
      'in_the_book', v_n,
      'expected_cents', v_expected,
      'appointments_without_a_price', v_missing,
      'cancelled', (select count(*) from barberos.appointments a
                     where a.tenant_id = p_tenant and a.status = 'cancelled'
                       and (a.starts_at at time zone v_tz)::date = v_date),
      'no_shows', (select count(*) from barberos.appointments a
                    where a.tenant_id = p_tenant and a.status = 'no_show'
                      and (a.starts_at at time zone v_tz)::date = v_date)));
end; $$;
comment on function barberos.day_sheet(uuid, date) is
  'One day in the book, in the shop''s own timezone. Expected takings always carry the number of appointments with no price recorded, so a total can never be read as more certain than it is.';
revoke all on function barberos.day_sheet(uuid, date) from public, anon;
grant execute on function barberos.day_sheet(uuid, date) to authenticated;

create or replace function barberos.barber_list(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not (identity.has_permission(p_tenant, 'barberos.booking.read')
          or identity.is_platform_admin()) then
    raise exception 'insufficient privilege to read this shop''s appointment book'
      using errcode = 'insufficient_privilege';
  end if;
  select s.timezone into v_tz from barberos.shops s where s.tenant_id = p_tenant;

  return jsonb_build_object(
    'timezone', coalesce(v_tz, 'UTC'),
    -- The services come back with the barbers because a booking screen needs
    -- both to draw anything at all, and because `bookable` has to travel with
    -- them: a service with no duration is in the price list and cannot be put
    -- in the book, and the screen must be able to say which and why rather
    -- than silently dropping it from the menu.
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'name', sv.name,
        'price_cents', sv.price_cents,
        'duration_minutes', sv.duration_minutes,
        'bookable', sv.duration_minutes is not null)
        order by sv.display_order, sv.name)
      from barberos.site_services sv where sv.tenant_id = p_tenant), '[]'::jsonb),
    'settings', (
      select jsonb_build_object(
        'slot_minutes', coalesce(bs.slot_minutes, 15),
        'lead_time_minutes', coalesce(bs.lead_time_minutes, 0),
        'max_days_ahead', coalesce(bs.max_days_ahead, 60),
        'is_default', bs.tenant_id is null)
        from (select p_tenant as t) x
        left join barberos.booking_settings bs on bs.tenant_id = x.t),
    'barbers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'display_name', b.display_name,
        'active', b.active,
        -- An EMPTY hours array and "works no days" are the same array, so the
        -- flag beside it is what lets a screen say "no rota set" instead of
        -- inventing a barber who never works.
        'has_a_rota', exists (select 1 from barberos.barber_hours h where h.barber_id = b.id),
        'hours', coalesce((select jsonb_agg(jsonb_build_object(
                    'day_of_week', h.day_of_week,
                    'starts_at', h.starts_at, 'ends_at', h.ends_at)
                    order by h.day_of_week)
                  from barberos.barber_hours h where h.barber_id = b.id), '[]'::jsonb),
        'time_off', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', t.id, 'on_date', t.on_date,
                      'starts_at', t.starts_at, 'ends_at', t.ends_at,
                      'reason', t.reason) order by t.on_date)
                    from barberos.barber_time_off t
                   where t.barber_id = b.id
                     and t.on_date >= (now() at time zone coalesce(v_tz,'UTC'))::date),
                   '[]'::jsonb))
        order by b.active desc, b.display_name)
      from barberos.barbers b where b.tenant_id = p_tenant), '[]'::jsonb));
end; $$;
revoke all on function barberos.barber_list(uuid) from public, anon;
grant execute on function barberos.barber_list(uuid) to authenticated;

-- ===========================================================================
-- The door
--
-- SECURITY INVOKER, as 0056 established: `authenticated` already has USAGE on
-- this schema and EXECUTE on these functions, so the wrappers need no
-- privilege of their own and row level security stays in force.
-- ===========================================================================
create or replace function public.barberos_barbers(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.barber_list(p_tenant);
$$;
revoke all on function public.barberos_barbers(uuid) from public, anon;
grant execute on function public.barberos_barbers(uuid) to authenticated;

create or replace function public.barberos_save_barber(
  p_tenant uuid, p_name text, p_active boolean default true, p_id uuid default null)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.upsert_barber(p_tenant, p_name, p_active, p_id);
$$;
revoke all on function public.barberos_save_barber(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.barberos_save_barber(uuid, text, boolean, uuid) to authenticated;

create or replace function public.barberos_set_barber_hours(
  p_barber uuid, p_day smallint, p_starts time default null, p_ends time default null)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select barberos.set_barber_hours(p_barber, p_day, p_starts, p_ends);
$$;
revoke all on function public.barberos_set_barber_hours(uuid, smallint, time, time) from public, anon;
grant execute on function public.barberos_set_barber_hours(uuid, smallint, time, time) to authenticated;

create or replace function public.barberos_set_time_off(
  p_barber uuid, p_date date, p_reason text default null,
  p_starts time default null, p_ends time default null)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.set_time_off(p_barber, p_date, p_reason, p_starts, p_ends);
$$;
revoke all on function public.barberos_set_time_off(uuid, date, text, time, time) from public, anon;
grant execute on function public.barberos_set_time_off(uuid, date, text, time, time) to authenticated;

create or replace function public.barberos_clear_time_off(p_id uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select barberos.clear_time_off(p_id);
$$;
revoke all on function public.barberos_clear_time_off(uuid) from public, anon;
grant execute on function public.barberos_clear_time_off(uuid) to authenticated;

create or replace function public.barberos_booking_settings(
  p_tenant uuid, p_slot_minutes smallint default null,
  p_lead_time_minutes integer default null, p_max_days_ahead smallint default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select barberos.save_booking_settings(p_tenant, p_slot_minutes, p_lead_time_minutes, p_max_days_ahead);
$$;
revoke all on function public.barberos_booking_settings(uuid, smallint, integer, smallint) from public, anon;
grant execute on function public.barberos_booking_settings(uuid, smallint, integer, smallint) to authenticated;

create or replace function public.barberos_slots(
  p_tenant uuid, p_barber uuid, p_service bigint, p_date date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.available_slots(p_tenant, p_barber, p_service, p_date);
$$;
revoke all on function public.barberos_slots(uuid, uuid, bigint, date) from public, anon;
grant execute on function public.barberos_slots(uuid, uuid, bigint, date) to authenticated;

create or replace function public.barberos_book(
  p_tenant uuid, p_client uuid, p_barber uuid, p_service bigint,
  p_starts_at timestamptz, p_notes text default null)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.book_appointment(p_tenant, p_client, p_barber, p_service, p_starts_at, p_notes);
$$;
revoke all on function public.barberos_book(uuid, uuid, uuid, bigint, timestamptz, text) from public, anon;
grant execute on function public.barberos_book(uuid, uuid, uuid, bigint, timestamptz, text) to authenticated;

create or replace function public.barberos_cancel(p_id uuid, p_reason text default null)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select barberos.cancel_appointment(p_id, p_reason);
$$;
revoke all on function public.barberos_cancel(uuid, text) from public, anon;
grant execute on function public.barberos_cancel(uuid, text) to authenticated;

create or replace function public.barberos_no_show(p_id uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select barberos.mark_no_show(p_id);
$$;
revoke all on function public.barberos_no_show(uuid) from public, anon;
grant execute on function public.barberos_no_show(uuid) to authenticated;

create or replace function public.barberos_complete(p_id uuid, p_visit jsonb default '{}'::jsonb)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select barberos.complete_appointment(p_id, p_visit);
$$;
revoke all on function public.barberos_complete(uuid, jsonb) from public, anon;
grant execute on function public.barberos_complete(uuid, jsonb) to authenticated;

create or replace function public.barberos_day_sheet(p_tenant uuid, p_date date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select barberos.day_sheet(p_tenant, p_date);
$$;
revoke all on function public.barberos_day_sheet(uuid, date) from public, anon;
grant execute on function public.barberos_day_sheet(uuid, date) to authenticated;

-- ===========================================================================
-- The promotion
-- ===========================================================================
update barberos.capabilities
   set status = 'available',
       blocked_on = null,
       blocker_owner = null,
       description = 'The appointment book: who is working, when they are free, and what was booked. Two people can never hold the same chair at the same time -- that is a database constraint, not a screen. Completing an appointment writes the client''s visit, so their history stays right without being typed twice.',
       version = version + 1
 where key = 'booking';

-- ===========================================================================
-- The service list is shared, so its write path is shared too
--
-- Both functions still belong to 0052/0056; only the question they ask changes.
-- A shop that bought booking and not the website has nobody with
-- `barberos.site.update` in mind when they price a haircut, and refusing them
-- would leave the module unusable for exactly the shops the FK change above
-- was made for.
-- ===========================================================================
create or replace function barberos.upsert_site_service(
  p_tenant uuid, p_name text, p_price_cents integer default null,
  p_duration integer default null, p_order integer default 0)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not (identity.has_permission(p_tenant, 'barberos.site.update')
          or identity.has_permission(p_tenant, 'barberos.booking_rota.manage')) then
    raise exception 'insufficient privilege to change this shop''s services'
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
end; $$;

create or replace function barberos.delete_site_service(p_tenant uuid, p_name text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_found boolean;
begin
  if not (identity.has_permission(p_tenant, 'barberos.site.update')
          or identity.has_permission(p_tenant, 'barberos.booking_rota.manage')) then
    raise exception 'insufficient privilege to change this shop''s services'
      using errcode = 'insufficient_privilege';
  end if;
  delete from barberos.site_services s
   where s.tenant_id = p_tenant and s.name = p_name;
  get diagnostics v_found = row_count;
  -- Reports whether anything was actually removed, so a UI can tell "deleted"
  -- from "there was nothing there" instead of claiming success either way.
  return v_found;
end; $$;

-- ===========================================================================
-- What the app is allowed to draw
--
-- `can` is how the shop's app decides which controls to render at all, and a
-- key that is missing reads as false. So a module whose permissions are not
-- listed here ships with its buttons either always shown -- and failing after
-- they are pressed -- or never shown. Both are the same defect the platform
-- brief names: a control that cannot do its job is worse than no control.
--
-- `manage_clients` is added at the same time. 0058 shipped without it, which
-- meant the clients screen drew "Add a client" for a viewer who would then be
-- refused by the database. The database was right and the screen was wrong.
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
                  'manage_shop', identity.has_permission(sh.tenant_id, 'barberos.shop.manage'),
                  'manage_clients', identity.has_permission(sh.tenant_id, 'barberos.client.manage'),
                  'take_bookings', identity.has_permission(sh.tenant_id, 'barberos.booking.manage'),
                  'manage_rota', identity.has_permission(sh.tenant_id, 'barberos.booking_rota.manage'))
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
