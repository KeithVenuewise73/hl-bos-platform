-- Minimal LOCAL replica of the live legacy objects the fix touches. Column types for the
-- KPI tables are approximations (only names were read); function bodies and the
-- before-state policies/grants are copied from the live project's metadata.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema hscs_glp;
grant usage on schema hscs_glp to authenticated;      -- live: authenticated yes, anon no
create type hscs_glp.glp_role as enum ('owner_ceo','contract_admin','opportunity_analyst','proposal_manager',
  'operations_manager','compliance_manager','finance_manager','carrier_manager','readonly_exec','carrier_user');
create table hscs_glp.organization_users (user_id uuid, org_id uuid, status text);
create table hscs_glp.user_roles (user_id uuid, org_id uuid, role hscs_glp.glp_role);
create function hscs_glp.is_member(p_org uuid) returns boolean language sql stable security definer
  set search_path = hscs_glp, public as
  $$ select exists (select 1 from hscs_glp.organization_users where user_id = auth.uid() and org_id = p_org and status='active') $$;
grant execute on function hscs_glp.is_member(uuid) to authenticated;

create table public.ltr_data (id bigserial primary key, store_number text, store_name text, ltr_score int,
  contractor_carrier text, carrier text, detractor text, delivery_date date, improvement_comment text,
  follow_up_comment text, created_at timestamptz default now(), market text);
create table public.kpi_sp_weekly (id bigserial primary key, week_ending date, carrier text, region text,
  district text, routes int, completion_pct numeric, on_time_pct numeric);
create table public.kpi_spe_weekly (id bigserial primary key, week_ending date, carrier text, spe_name text,
  region text, district text, routes int, completion_pct numeric, on_time_pct numeric);

-- live "before" state
do $$ declare t text; begin
  foreach t in array array['ltr_data','kpi_sp_weekly','kpi_spe_weekly'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to public using (true) with check (true)', 'Allow all on '||t, t);
    execute format('grant all on public.%I to anon, authenticated', t);
    execute format('grant all on sequence public.%I to anon, authenticated', t||'_id_seq');
  end loop; end $$;

-- live: service_role holds everything on public tables (and bypasses RLS)
grant all on public.ltr_data, public.kpi_sp_weekly, public.kpi_spe_weekly to service_role;
grant all on all sequences in schema public to service_role;

-- fixtures: fake people and fake rows only
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2'),
 ('00000000-0000-0000-0000-0000000000a3'),('00000000-0000-0000-0000-0000000000a4'),
 ('00000000-0000-0000-0000-0000000000a5'),('00000000-0000-0000-0000-0000000000a6'),
 ('00000000-0000-0000-0000-0000000000a7');
insert into hscs_glp.organization_users values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1','active'),  -- ceo
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000f1','active'),  -- ops
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000f1','active'),  -- readonly_exec
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000f1','active'),  -- carrier_user
 ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000f1','suspended'), -- ceo role, inactive
 ('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000f1','active');  -- finance
insert into hscs_glp.user_roles values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1','owner_ceo'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000f1','operations_manager'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000f1','readonly_exec'),
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000f1','carrier_user'),
 ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000f1','owner_ceo'),
 ('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000f1','finance_manager');
-- a6 (a signed-in stranger) has no membership at all
insert into public.ltr_data (store_number, store_name, ltr_score, carrier) values ('0001','Test Store',9,'Test Carrier'),('0002','Test Store 2',7,'Test Carrier');
insert into public.kpi_sp_weekly (week_ending, carrier, routes) values ('2026-01-04','Test Carrier',5);
insert into public.kpi_spe_weekly (week_ending, carrier, spe_name, routes) values ('2026-01-04','Test Carrier','Test Driver',3);
