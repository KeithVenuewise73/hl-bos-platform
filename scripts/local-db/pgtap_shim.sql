-- LOCAL ONLY. A tiny subset of pgTAP (plan/ok/is/isnt/throws_ok/lives_ok/finish) so the
-- repository's pgTAP-style tests run on a bare PostgreSQL where the extension is unavailable.
-- CI uses the real pgTAP. Same call shapes; output is TAP.
create schema if not exists tapshim;
create unlogged table if not exists tapshim.state (id int primary key default 1, planned int, n int default 0, failed int default 0);
create or replace function plan(p int) returns text language plpgsql as $$
begin
  insert into tapshim.state(id, planned, n, failed) values (1, p, 0, 0)
    on conflict (id) do update set planned = p, n = 0, failed = 0;
  return '1..' || p;
end $$;
create or replace function _res(p boolean, d text, extra text default '') returns text language plpgsql as $$
begin
  update tapshim.state set n = n + 1, failed = failed + (case when p then 0 else 1 end) where id = 1;
  return (case when p then 'ok ' else 'not ok ' end) || (select n from tapshim.state) || ' - ' || coalesce(d, '') || extra;
end $$;
create or replace function ok(p boolean, d text default '') returns text language sql as $$ select _res(coalesce(p,false), d) $$;
create or replace function is(a anyelement, b anyelement, d text default '') returns text language sql as $$
  select _res(a is not distinct from b, d, case when a is not distinct from b then '' else E'\n#   have: ' || coalesce(a::text,'NULL') || E'\n#   want: ' || coalesce(b::text,'NULL') end) $$;
create or replace function isnt(a anyelement, b anyelement, d text default '') returns text language sql as $$
  select _res(a is distinct from b, d) $$;
create or replace function lives_ok(q text, d text default '') returns text language plpgsql as $$
begin execute q; return _res(true, d);
exception when others then return _res(false, d, E'\n#   threw: ' || sqlstate || ' ' || sqlerrm); end $$;
create or replace function throws_ok(q text, code text, msg text default null, d text default '') returns text language plpgsql as $$
begin execute q; return _res(false, d, E'\n#   expected exception ' || coalesce(code,'?') || ' but none thrown');
exception when others then
  if (code is null or sqlstate = code) and (msg is null or sqlerrm like msg) then return _res(true, d);
  else return _res(false, d, E'\n#   got ' || sqlstate || ': ' || sqlerrm || E'\n#   want ' || coalesce(code,'any') || ' ' || coalesce(msg,'')); end if;
end $$;
create or replace function finish() returns setof text language plpgsql as $$
declare s tapshim.state%rowtype;
begin
  select * into s from tapshim.state where id = 1;
  if s.failed > 0 then return next '# Looks like you failed ' || s.failed || ' test(s) of ' || s.n; end if;
  if s.n <> s.planned then return next '# Looks like you planned ' || s.planned || ' but ran ' || s.n; end if;
  if s.failed = 0 and s.n = s.planned then return next '# all ' || s.n || ' tests passed'; end if;
end $$;
-- tests impersonate roles (anon/authenticated); the shim must stay usable after SET ROLE.
grant usage on schema tapshim to public;
grant select, insert, update on tapshim.state to public;
grant execute on all functions in schema public to public;
