-- a statement is "refused" if it fails on privileges, row security, or a check constraint
create or replace function t.refused(q text, label text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when insufficient_privilege or check_violation then raise notice 'PASS  %', label; return;
  end;
  raise exception 'FAIL  % (statement was allowed)', label;
end $$;
