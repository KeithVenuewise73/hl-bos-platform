-- HSCS KPI tables: close the open "Allow all" policies.
-- Target: legacy project bkfsjhhclbqrhaolvhmz ("Herman Legacy Business Platform").
-- STATUS: written and tested locally only. NOT APPLIED. Needs owner approval.
--
-- Before: public.ltr_data, kpi_sp_weekly, kpi_spe_weekly each had one policy
--   "Allow all" (role public, USING true / WITH CHECK true) and anon + authenticated
--   held SELECT/INSERT/UPDATE/DELETE/TRUNCATE. The anon key is in a public repo.
-- After:  anon has nothing. Signed-in users need an ACTIVE membership and a role
--   (reads: any role except carrier_user; writes: owner_ceo, contract_admin,
--   operations_manager). Nobody but service_role can TRUNCATE.
--
-- The tables have no org_id, so these checks are "is this person staff anywhere",
-- built from the same user_roles / organization_users tables the rest of hscs_glp uses.

begin;

create or replace function hscs_glp.is_kpi_reader()
returns boolean language sql stable security definer
set search_path = hscs_glp, public as $$
  select exists (
    select 1
      from hscs_glp.user_roles r
      join hscs_glp.organization_users ou
        on ou.user_id = r.user_id and ou.org_id = r.org_id and ou.status = 'active'
     where r.user_id = auth.uid()
       and r.role <> 'carrier_user'
  );
$$;

create or replace function hscs_glp.is_kpi_writer()
returns boolean language sql stable security definer
set search_path = hscs_glp, public as $$
  select exists (
    select 1
      from hscs_glp.user_roles r
      join hscs_glp.organization_users ou
        on ou.user_id = r.user_id and ou.org_id = r.org_id and ou.status = 'active'
     where r.user_id = auth.uid()
       and r.role in ('owner_ceo','contract_admin','operations_manager')
  );
$$;

revoke all on function hscs_glp.is_kpi_reader() from public, anon;
revoke all on function hscs_glp.is_kpi_writer() from public, anon;
grant execute on function hscs_glp.is_kpi_reader() to authenticated;
grant execute on function hscs_glp.is_kpi_writer() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['ltr_data','kpi_sp_weekly','kpi_spe_weekly'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Allow all on '||t, t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);

    execute format('create policy %I on public.%I for select to authenticated using (hscs_glp.is_kpi_reader())', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (hscs_glp.is_kpi_writer())', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (hscs_glp.is_kpi_writer()) with check (hscs_glp.is_kpi_writer())', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (hscs_glp.is_kpi_writer())', t||'_delete', t);

    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on sequence public.%I from public, anon', t||'_id_seq');
    execute format('grant usage, select on sequence public.%I to authenticated', t||'_id_seq');
  end loop;
end $$;

commit;
