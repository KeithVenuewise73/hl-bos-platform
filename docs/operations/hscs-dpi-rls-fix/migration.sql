-- HSCS delivery-performance (dpi) tables: close public read and public insert.
-- Target: legacy project bkfsjhhclbqrhaolvhmz ("Herman Legacy Business Platform").
-- STATUS: written and tested locally only. NOT APPLIED. Needs owner approval.
-- DEPENDS ON ../hscs-kpi-rls-fix/migration.sql (it defines hscs_glp.is_kpi_reader / is_kpi_writer). Apply that first.
--
-- Before: dpi.deliveries, surveys, drivers, dsp_companies each had "Public read" (SELECT, role public, USING true)
--   and "Public insert" (INSERT, role public, WITH CHECK true); anon and authenticated held SELECT + INSERT; anon had
--   USAGE on schema dpi. The anon key is in a public repo, so anyone could read all rows (including driver names,
--   delivery notes and dsp_companies.contact_name / contact_email) and add rows.
-- After:  anon has nothing. Signed-in users need an ACTIVE membership and a role:
--   read   = any role except carrier_user
--   insert = owner_ceo, contract_admin, operations_manager
-- UPDATE and DELETE stay refused to everyone but the database owner, exactly as today. (The dashboard's
-- "clear existing data first" option has therefore never worked; this does not change that.)

begin;

do $$
begin
  if to_regprocedure('hscs_glp.is_kpi_reader()') is null or to_regprocedure('hscs_glp.is_kpi_writer()') is null then
    raise exception 'Apply hscs-kpi-rls-fix/migration.sql first: hscs_glp.is_kpi_reader() / is_kpi_writer() are missing';
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['deliveries','surveys','drivers','dsp_companies'] loop
    execute format('alter table dpi.%I enable row level security', t);
    execute format('drop policy if exists %I on dpi.%I', 'Public read '||t, t);
    execute format('drop policy if exists %I on dpi.%I', 'Public insert '||t, t);
    execute format('drop policy if exists %I on dpi.%I', t||'_select', t);
    execute format('drop policy if exists %I on dpi.%I', t||'_insert', t);

    execute format('create policy %I on dpi.%I for select to authenticated using (hscs_glp.is_kpi_reader())', t||'_select', t);
    execute format('create policy %I on dpi.%I for insert to authenticated with check (hscs_glp.is_kpi_writer())', t||'_insert', t);

    execute format('revoke all on dpi.%I from public, anon, authenticated', t);
    execute format('grant select, insert on dpi.%I to authenticated', t);
  end loop;
end $$;

revoke usage on schema dpi from anon;

commit;
