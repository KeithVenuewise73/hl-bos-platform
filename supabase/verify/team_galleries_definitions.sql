-- Team galleries (0053 + 0054): a fingerprint of the FULL definitions, not just
-- the names. Read-only (it changes nothing; the search path is set for this
-- transaction only and the transaction is rolled back).
--
-- Compare production with the tested local copy: the three hashes must be
-- identical. (The names-only fingerprint in team_galleries_fingerprint.sql
-- would not notice a changed function body or column.)
--
-- The empty search path is deliberate: Postgres leaves the schema name off a
-- column default when that schema is on the session's path, so without it the
-- same stored default (extensions.gen_random_bytes) is DISPLAYED differently
-- on two servers and the hashes disagree for no real reason.
begin;
set local search_path = '';
select
  (select md5(string_agg(pg_get_functiondef(p.oid), E'\n--\n' order by p.proname, pg_get_function_identity_arguments(p.oid)))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gallery') as functions_md5,
  (select md5(string_agg(format('%s.%s %s %s %s %s', c.table_name, c.column_name, c.data_type, c.is_nullable,
                                coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
                                           where d.adrelid = format('gallery.%I', c.table_name)::regclass
                                             and d.adnum = c.ordinal_position), ''),
                                coalesce(c.character_maximum_length::text, '')),
                         E'\n' order by c.table_name, c.column_name))
     from information_schema.columns c where c.table_schema = 'gallery') as columns_md5,
  (select md5(string_agg(pg_get_constraintdef(k.oid), E'\n' order by k.conrelid::regclass::text, k.conname))
     from pg_constraint k join pg_namespace n on n.oid = k.connamespace
    where n.nspname = 'gallery') as constraints_md5,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'gallery') as functions,
  (select count(*) from information_schema.columns where table_schema = 'gallery') as columns;
rollback;
