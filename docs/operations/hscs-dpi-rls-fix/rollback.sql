-- Rollback for migration.sql. THIS REOPENS THE HOLE (public read and public insert on the dpi tables).
begin;
grant usage on schema dpi to anon;
do $$
declare t text;
begin
  foreach t in array array['deliveries','surveys','drivers','dsp_companies'] loop
    execute format('drop policy if exists %I on dpi.%I', t||'_select', t);
    execute format('drop policy if exists %I on dpi.%I', t||'_insert', t);
    execute format('create policy %I on dpi.%I for select to public using (true)', 'Public read '||t, t);
    execute format('create policy %I on dpi.%I for insert to public with check (true)', 'Public insert '||t, t);
    execute format('grant select, insert on dpi.%I to anon, authenticated', t);
  end loop;
end $$;
commit;
