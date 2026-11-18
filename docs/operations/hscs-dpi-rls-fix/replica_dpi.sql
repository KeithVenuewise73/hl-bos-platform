-- LOCAL replica of the live dpi schema (columns, constraints, policies and ACLs copied from live metadata).
-- Fake rows only. Needs ../hscs-kpi-rls-fix/replica.sql loaded first (roles, auth.uid, hscs_glp, fixtures).
create schema dpi;
grant usage on schema dpi to anon, authenticated;     -- live: anon=true authenticated=true service_role=false
create table dpi.dsp_companies (id uuid primary key default gen_random_uuid(), name text not null unique, market text,
  contact_name text, contact_email text, active boolean default true, created_at timestamptz default now());
create table dpi.drivers (id uuid primary key default gen_random_uuid(), name text not null,
  dsp_id uuid references dpi.dsp_companies(id), market text, active boolean default true, created_at timestamptz default now());
create table dpi.deliveries (id uuid primary key default gen_random_uuid(), delivery_id text not null unique, date date not null,
  market text not null, store text, dsp_id uuid references dpi.dsp_companies(id), dsp_name text not null,
  driver_id uuid references dpi.drivers(id), driver_name text not null, scheduled_time time, actual_time time,
  on_time boolean default false, completed boolean default false, root_cause text, notes text, created_at timestamptz default now());
create table dpi.surveys (id uuid primary key default gen_random_uuid(), delivery_id uuid references dpi.deliveries(id),
  delivery_ref text, date date not null, dsp_name text not null, driver_name text not null, market text, store text,
  score integer check (score >= 0 and score <= 10), ltr_status text check (ltr_status in ('Promoter','Passive','Detractor')),
  comment text, follow_up_required boolean default false, created_at timestamptz default now());

do $$ declare t text; begin
  foreach t in array array['deliveries','surveys','drivers','dsp_companies'] loop
    execute format('alter table dpi.%I enable row level security', t);
    execute format('create policy %I on dpi.%I for select to public using (true)', 'Public read '||t, t);
    execute format('create policy %I on dpi.%I for insert to public with check (true)', 'Public insert '||t, t);
    execute format('revoke all on dpi.%I from public', t);
    execute format('grant select, insert on dpi.%I to anon, authenticated', t);   -- live ACL: anon=ar authenticated=ar
  end loop; end $$;

insert into dpi.dsp_companies (name, market, contact_name, contact_email) values ('Test DSP','Test Market','Test Person','test@example.test');
insert into dpi.drivers (name, dsp_id, market) select 'Test Driver', id, 'Test Market' from dpi.dsp_companies;
insert into dpi.deliveries (delivery_id, date, market, dsp_name, driver_name, notes) values
  ('D1','2026-01-04','Test Market','Test DSP','Test Driver','note one'),('D2','2026-01-05','Test Market','Test DSP','Test Driver','note two');
insert into dpi.surveys (date, dsp_name, driver_name, score, ltr_status, comment) values ('2026-01-04','Test DSP','Test Driver',9,'Promoter','fine');
