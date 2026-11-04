-- hlbos_0039: make the intelligence gate provable.
--
-- The escape hatch for direct connections was too wide: pg_prove also connects
-- as `postgres`, so all nine intelligence guards short-circuited under test and
-- the refusal path was unreachable. It now also requires the ABSENCE of a
-- request context, which is strictly tighter -- every caller allowed after this
-- migration was allowed before it.
--
-- The nine function bodies are rewritten in place from their CURRENT definitions
-- so that nothing but the guard can change.
--
-- rollback:
--   Re-run the function definitions from migrations 0034-0038, then:
--     drop function if exists vstudio.assert_intelligence_manage();
--   No data is touched by this migration and none is touched by its rollback.

create or replace function vstudio.assert_intelligence_manage()
returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  -- A direct maintenance connection: no request context to authorise against,
  -- and no PostgREST path that could reach here.
  if session_user in ('postgres', 'supabase_admin')
     and coalesce(pg_catalog.current_setting('request.jwt.claims', true), '') = '' then
    return;
  end if;
  if not identity.has_platform_permission('vstudio.intelligence.manage') then
    raise exception 'insufficient privilege: vstudio.intelligence.manage required'
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;
revoke all on function vstudio.assert_intelligence_manage() from public, anon;
grant execute on function vstudio.assert_intelligence_manage() to authenticated;
comment on function vstudio.assert_intelligence_manage() is
  'Single gate for the vstudio intelligence controls. Allows an unauthenticated direct connection (psql/MCP, which has no auth.uid() to check) and requires vstudio.intelligence.manage from everyone else -- including a test impersonating a user, which is what makes the refusal observable.';

do $mig$
declare
  v_oids oid[];
  v_oid oid;
  v_name text;
  v_def text;
  v_old text;
  v_new text := '  perform vstudio.assert_intelligence_manage();' || chr(10);
  v_count int := 0;
begin
  v_old :=
    '  if session_user not in (''postgres'', ''supabase_admin'')' || chr(10) ||
    '     and not identity.has_platform_permission(''vstudio.intelligence.manage'') then' || chr(10) ||
    '    raise exception ''insufficient privilege: vstudio.intelligence.manage required''' || chr(10) ||
    '      using errcode = ''insufficient_privilege'';' || chr(10) ||
    '  end if;' || chr(10);

  -- Snapshot the targets first: replacing a function while iterating a cursor
  -- over pg_proc is not a safe thing to do.
  select array_agg(p.oid order by p.proname) into v_oids
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'vstudio'
    and p.prosrc like '%session_user not in (''postgres'', ''supabase_admin'')%';

  if coalesce(array_length(v_oids, 1), 0) <> 9 then
    raise exception 'expected 9 gated functions, found %', coalesce(array_length(v_oids, 1), 0);
  end if;

  foreach v_oid in array v_oids loop
    select p.proname into v_name from pg_proc p where p.oid = v_oid;
    v_def := pg_get_functiondef(v_oid);
    if position(v_old in v_def) = 0 then
      raise exception 'guard text not found in vstudio.%', v_name;
    end if;
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;

  raise notice 'hlbos_0039: rewrote % intelligence gates', v_count;
end $mig$;