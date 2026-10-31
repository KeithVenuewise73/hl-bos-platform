\ir _fixtures.sql.inc

-- ===========================================================================
-- HLG Career Platform — migration 0053.
--
--   1. One subscriber never sees or writes another's career records.
--   2. A submitted application cannot be changed — not even by its owner.
--   3. Usage events cannot be changed or deleted to reset a limit; only
--      account erasure removes them.
--   4. Account erasure removes every row the caller owns and nobody else's.
--   5. anon sees nothing.
-- ===========================================================================
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c0001', 'cand-a@example.test'),
  ('00000000-0000-4000-8000-0000000c0002', 'cand-b@example.test');

create or replace function tests.cr_update(p_id uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  update ats.career_records set data = data || '{"notes":"edited"}'::jsonb where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function tests.cr_delete(p_id uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  delete from ats.career_records where id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Subscriber A writes an opportunity, a submission and a usage event.
select tests.login_as('00000000-0000-4000-8000-0000000c0001');
insert into ats.career_records (id, owner_id, kind, data) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000c0001', 'opportunity',
   '{"id":"00000000-0000-4000-8000-00000000a001","title":"Dispatcher"}'),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000c0001', 'submission',
   jsonb_build_object('id','00000000-0000-4000-8000-00000000a002','contentHash', repeat('a',64))),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000c0001', 'usage_event',
   '{"id":"00000000-0000-4000-8000-00000000a003","action":"package_generation"}');

select is((select count(*)::int from ats.career_records), 3, 'owner sees their own records');
select is(tests.cr_update('00000000-0000-4000-8000-00000000a001'), 1, 'owner can edit an opportunity');

select throws_ok(
  $$ select tests.cr_update('00000000-0000-4000-8000-00000000a002') $$,
  '23514', null, 'a submitted application can never be updated, even by its owner');
select throws_ok(
  $$ select tests.cr_update('00000000-0000-4000-8000-00000000a003') $$,
  '23514', null, 'a usage event can never be updated');
select throws_ok(
  $$ select tests.cr_delete('00000000-0000-4000-8000-00000000a003') $$,
  '23514', null, 'a usage event cannot be deleted to reset a limit');
select throws_ok(
  $$ insert into ats.career_records (id, owner_id, kind, data) values
       ('00000000-0000-4000-8000-00000000a009', '00000000-0000-4000-8000-0000000c0001', 'submission',
        '{"id":"00000000-0000-4000-8000-00000000a009"}') $$,
  '23514', null, 'a submission without a content hash is refused');
select throws_ok(
  $$ insert into ats.career_records (id, owner_id, kind, data) values
       ('00000000-0000-4000-8000-00000000a00a', '00000000-0000-4000-8000-0000000c0001', 'opportunity',
        '{"id":"00000000-0000-4000-8000-00000000ffff"}') $$,
  '23514', null, 'a row cannot carry a record whose id disagrees with it');
select throws_ok(
  $$ insert into ats.career_records (id, owner_id, kind, data) values
       ('00000000-0000-4000-8000-00000000a00b', '00000000-0000-4000-8000-0000000c0002', 'opportunity',
        '{"id":"00000000-0000-4000-8000-00000000a00b"}') $$,
  '42501', null, 'a subscriber cannot write a row owned by someone else');

-- Subscriber B sees and changes nothing of A's.
select tests.login_as('00000000-0000-4000-8000-0000000c0002');
select is((select count(*)::int from ats.career_records), 0, 'another subscriber sees none of them');
select is(tests.cr_update('00000000-0000-4000-8000-00000000a001'), 0, 'another subscriber cannot edit them');
select is(tests.cr_delete('00000000-0000-4000-8000-00000000a001'), 0, 'another subscriber cannot delete them');
insert into ats.career_records (id, owner_id, kind, data) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000c0002', 'opportunity',
   '{"id":"00000000-0000-4000-8000-00000000b001"}');

-- anon
select tests.login_as_anon();
select throws_ok($$ select count(*) from ats.career_records $$, '42501', null, 'anon has no access at all');

-- Account erasure: A's rows go, B's stay.
select tests.login_as('00000000-0000-4000-8000-0000000c0001');
select is(ats.erase_my_career_data(), 3, 'erasure removes every row the caller owns, usage events included');
select is((select count(*)::int from ats.career_records), 0, 'nothing of the erased account remains visible');
select is(current_setting('ats.erasing_account', true), '', 'the erasure flag does not outlive the call');
select tests.logout();
select is((select count(*)::int from ats.career_records where owner_id = '00000000-0000-4000-8000-0000000c0002'), 1,
  'another subscriber''s data is untouched by erasure');

select * from finish();
rollback;
