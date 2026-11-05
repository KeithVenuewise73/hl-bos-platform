-- Team galleries (migrations 0053 + 0054): the schema's fingerprint.
-- Run on production right after applying, and compare with the value
-- recorded in docs/operations/team-galleries-switch-on.md, which was taken
-- from a local database with every migration applied from empty. Read-only.
select
  (select count(*) from pg_tables where schemaname = 'gallery')                          as tables,
  (select count(*) from information_schema.columns where table_schema = 'gallery')        as columns,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'gallery' and c.contype = 'c')                                      as checks,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'gallery' and c.contype = 'f')                                      as fks,
  (select count(*) from pg_policies where schemaname = 'gallery')                         as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery')                                                          as functions,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'gallery' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity) as rls_forced,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'gallery' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))) as web_readable_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) as web_runnable_functions,
  has_schema_privilege('anon', 'gallery', 'usage')                                        as anon_usage,
  (select string_agg(id || ':' || public::text, ',' order by id) from storage.buckets
    where id in ('gallery-photos', 'gallery-covers'))                                     as buckets,
  (select md5(string_agg(conname, ',' order by conname)) from pg_constraint c
     join pg_namespace n on n.oid = c.connamespace where n.nspname = 'gallery')           as constraint_names_md5,
  (select md5(string_agg(proname, ',' order by proname)) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'gallery')           as function_names_md5,
  (select connect_until > now() from gallery.settings)                                    as connect_window_open,
  (select publisher_key_sha256 is null from gallery.settings)                             as no_publisher_yet;
