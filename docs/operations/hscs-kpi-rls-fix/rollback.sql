-- Rollback for migration.sql. THIS REOPENS THE HOLE (anyone with the public anon key
-- can read, change and wipe the three KPI tables). Use only to restore service while
-- a different fix is built.
begin;
do $$
declare t text;
begin
  foreach t in array array['ltr_data','kpi_sp_weekly','kpi_spe_weekly'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for all to public using (true) with check (true)', 'Allow all on '||t, t);
    execute format('grant all on public.%I to anon, authenticated', t);
    execute format('grant all on sequence public.%I to anon, authenticated', t||'_id_seq');
  end loop;
end $$;
drop function if exists hscs_glp.is_kpi_reader();
drop function if exists hscs_glp.is_kpi_writer();
commit;
