-- Read-only schema fingerprint. Identical query on production and on the local
-- production-equivalent copy; each row is (category, object, md5 of its definition).
-- Returns definitions' HASHES only — never data.
with s as (
  select oid, nspname from pg_namespace
  where nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime','extensions',
    'graphql','graphql_public','vault','net','cron','pgbouncer','pgsodium','pgsodium_masks','supabase_functions',
    'supabase_migrations','_realtime','_analytics','tests','public')
    and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%'
)
select * from (
  select 'table' cat, s.nspname||'.'||c.relname obj,
    md5(coalesce((select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'')) h
  from pg_class c join s on s.oid=c.relnamespace where c.relkind in ('r','p')
  union all
  select 'rls', s.nspname||'.'||c.relname, c.relrowsecurity::text||'/'||c.relforcerowsecurity::text
  from pg_class c join s on s.oid=c.relnamespace where c.relkind in ('r','p')
  union all
  select 'view', s.nspname||'.'||c.relname, md5(pg_get_viewdef(c.oid))||'/'||coalesce(array_to_string(c.reloptions,','),'')
  from pg_class c join s on s.oid=c.relnamespace where c.relkind in ('v','m')
  union all
  select 'constraint', s.nspname||'.'||c.relname||'.'||k.conname, md5(pg_get_constraintdef(k.oid))
  from pg_constraint k join pg_class c on c.oid=k.conrelid join s on s.oid=c.relnamespace
  union all
  select 'index', s.nspname||'.'||i.relname, md5(regexp_replace(pg_get_indexdef(i.oid), '\s+', ' ', 'g'))
  from pg_index x join pg_class i on i.oid=x.indexrelid join s on s.oid=i.relnamespace
  union all
  select 'trigger', s.nspname||'.'||c.relname||'.'||t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join s on s.oid=c.relnamespace where not t.tgisinternal
  union all
  select 'function', s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    md5(p.prosrc||'|'||p.provolatile::text||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||pg_get_function_result(p.oid))
  from pg_proc p join s on s.oid=p.pronamespace
  union all
  select 'function_grant', s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    (select coalesce(string_agg(r, ',' order by r),'') from unnest(array['anon','authenticated','service_role']) r where has_function_privilege(r, p.oid, 'execute'))
  from pg_proc p join s on s.oid=p.pronamespace
  union all
  select 'policy', pol.schemaname||'.'||pol.tablename||'.'||pol.policyname,
    md5(pol.cmd||'|'||array_to_string(pol.roles,',')||'|'||coalesce(pol.qual,'')||'|'||coalesce(pol.with_check,'')||'|'||pol.permissive::text)
  from pg_policies pol join s on s.nspname=pol.schemaname
  union all
  select 'table_grant', s.nspname||'.'||c.relname,
    (select coalesce(string_agg(r||'='||p, ',' order by r, p),'') from unnest(array['anon','authenticated','service_role']) r,
       unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege(r, c.oid, p))
  from pg_class c join s on s.oid=c.relnamespace where c.relkind in ('r','p','v','m')
  union all
  select 'type', s.nspname||'.'||t.typname,
    md5(coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid), t.typtype::text))
  from pg_type t join s on s.oid=t.typnamespace where t.typtype in ('e','d')
  union all
  select 'schema_grant', s.nspname,
    (select coalesce(string_agg(r, ',' order by r),'') from unnest(array['anon','authenticated','service_role']) r where has_schema_privilege(r, s.oid, 'usage'))
  from s
) x order by 1, 2;
