create schema if not exists t;
grant usage on schema t to public;
-- expect a permission / row-level-security refusal
create or replace function t.denied(q text, label text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when insufficient_privilege then raise notice 'PASS  %', label; return;
  end;
  raise exception 'FAIL  % (statement was allowed)', label;
end $$;
create or replace function t.rows(q text, want bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from ('||q||') s' into n;
  if n is distinct from want then raise exception 'FAIL  % (saw % rows, wanted %)', label, n, want; end if;
  raise notice 'PASS  %', label;
end $$;
create or replace function t.affected(q text, want bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count;
  if n <> want then raise exception 'FAIL  % (changed % rows, wanted %)', label, n, want; end if;
  raise notice 'PASS  %', label;
end $$;
