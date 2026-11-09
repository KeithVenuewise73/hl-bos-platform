#!/usr/bin/env python3
"""Per-hazard object fingerprint SQL (read-only, hashes only).

For each replay-hazard migration in supabase/migrations, list the objects its SQL
defines (functions, tables, views, policies, triggers, indexes) and emit ONE
read-only query that returns, per migration: objects expected, objects found, and
an md5 over every found object's definition. Run the same query on production
and on the production-equivalent copy and compare row by row.
Run the query with search_path "$user", public, extensions (as production sessions use);
otherwise types such as citext render schema-qualified and every hash differs.
Usage: python3 -I hazard-objects.py <file> [<file> ...] > query.sql
"""
import re, sys, os

def objects(sql):
    sql = re.sub(r'--[^\n]*', '', sql)
    o = set()
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+([a-z_]+)\.([a-z_0-9]+)\s*\(', sql, re.I):
        o.add(('function', f'{m[1]}.{m[2]}'.lower()))
    for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\.([a-z_0-9]+)', sql, re.I):
        o.add(('table', f'{m[1]}.{m[2]}'.lower()))
    for m in re.finditer(r'create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([a-z_]+)\.([a-z_0-9]+)', sql, re.I):
        o.add(('view', f'{m[1]}.{m[2]}'.lower()))
    for m in re.finditer(r'create\s+policy\s+"?([a-z_0-9]+)"?\s+on\s+([a-z_]+)\.([a-z_0-9]+)', sql, re.I):
        o.add(('policy', f'{m[2]}.{m[3]}.{m[1]}'.lower()))
    for m in re.finditer(r'create\s+(?:constraint\s+)?trigger\s+([a-z_0-9]+)\s+(?:before|after|instead\s+of)\b.*?\bon\s+([a-z_]+)\.([a-z_0-9]+)', sql, re.I | re.S):
        o.add(('trigger', f'{m[2]}.{m[3]}.{m[1]}'.lower()))
    for m in re.finditer(r'create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_0-9]+)\s+on\s+(?:only\s+)?([a-z_]+)\.', sql, re.I):
        o.add(('index', f'{m[2]}.{m[1]}'.lower()))
    return sorted(o)

H = {
 'function': "(select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname = o.ident)",
 'table': "(select md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull, ',' order by a.attnum)) from pg_attribute a where a.attrelid = to_regclass(o.ident) and a.attnum > 0 and not a.attisdropped)",
 'view': "(select md5(pg_get_viewdef(to_regclass(o.ident))) where to_regclass(o.ident) is not null)",
 'policy': "(select md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')||'|'||p.polcmd::text||'|'||(select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any(p.polroles))) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname||'.'||p.polname = o.ident)",
 'trigger': "(select md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname||'.'||t.tgname = o.ident)",
 'index': "(select md5(regexp_replace(pg_get_indexdef(to_regclass(o.ident)), '\\s+', ' ', 'g')) where to_regclass(o.ident) is not null)",
}
rows = []
for f in sys.argv[1:]:
    mig = re.search(r'hlbos_([0-9a-z]+)_', os.path.basename(f))[1]
    for kind, ident in objects(open(f).read()):
        rows.append(f"('{mig}','{kind}','{ident}')")
print("with o(mig, kind, ident) as (values " + ",\n".join(rows) + "),")
print("h as (select o.mig, o.kind, o.ident, case o.kind " + " ".join(f"when '{k}' then {v}" for k, v in H.items()) + " end hash from o)")
print("select mig, count(*) expected, count(hash) found, md5(string_agg(kind||':'||ident||'='||coalesce(hash,'MISSING'), '|' order by kind, ident)) fingerprint from h group by mig order by mig;")
