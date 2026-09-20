\ir _fixtures.sql.inc

-- ===========================================================================
-- SceneFlow AI — migration 0050.
--
-- The claims this suite exists to make structural rather than aspirational:
--
--   1. A cast cannot become generatable without both attestations, a recorded
--      consent wording, and at least two adults.
--   2. A user cannot fabricate a generated scene, mint a credit, or award
--      themselves an entitlement.
--   3. A scene cannot say READY with nothing to look at.
--   4. A request that was blocked cannot cost a credit.
--   5. The credit ledger and the moderation log cannot be rewritten.
--
-- Plus the ordinary things this schema must not get wrong: one user never
-- seeing another's photographs, a stored path never pointing outside its
-- owner's prefix, and a branch never reaching into a different story.
-- ===========================================================================
begin;
select plan(81);
select tests.seed();

create or replace function tests.sf_cast() returns uuid language sql stable as $$
  select id from sceneflow.casts where name = 'Anniversary' limit 1 $$;
create or replace function tests.sf_story() returns uuid language sql stable as $$
  select id from sceneflow.stories where title = 'Night in the City' limit 1 $$;

-- SECURITY INVOKER (the default), so the delete runs as whoever is logged in
-- and is subject to their policies. Defined here rather than inline because a
-- data-modifying CTE may not be nested inside a subquery.
create or replace function tests.sf_delete_all_scenes() returns integer
language plpgsql as $$
declare n integer;
begin
  delete from sceneflow.scenes;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- Structure
-- ===========================================================================

select has_schema('sceneflow', 't_schema');

select has_table('sceneflow', t, 't_table_' || t)
  from unnest(array[
    'profiles','casts','cast_members','cast_references','stories','scenes',
    'generation_jobs','moderation_events','credit_ledger','subscriptions'
  ]) as t;

-- RLS enabled AND forced. Forced is the half that is usually missing, and
-- without it the owning role quietly bypasses every policy below.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'sceneflow' and c.relkind = 'r'
      and c.relrowsecurity and c.relforcerowsecurity),
  10, 't_rls_enabled_and_forced_on_all_10');

-- Nothing in this schema is readable without a login. Ever.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'sceneflow' and grantee in ('anon','public')),
  0, 't_no_anon_or_public_grants');

select is(has_schema_privilege('anon', 'sceneflow', 'usage'), false, 't_anon_no_schema_usage');

-- ===========================================================================
-- Refusal 2: AI-produced rows are not user-writable
-- ===========================================================================

select is(has_table_privilege('authenticated', 'sceneflow.scenes', 'insert'),
          false, 't_cannot_insert_a_scene');
select is(has_table_privilege('authenticated', 'sceneflow.generation_jobs', 'insert'),
          false, 't_cannot_insert_a_job');
select is(has_table_privilege('authenticated', 'sceneflow.credit_ledger', 'insert'),
          false, 't_cannot_insert_a_credit');
select is(has_table_privilege('authenticated', 'sceneflow.subscriptions', 'insert'),
          false, 't_cannot_grant_self_an_entitlement');
select is(has_table_privilege('authenticated', 'sceneflow.subscriptions', 'update'),
          false, 't_cannot_upgrade_self');
select is(has_table_privilege('authenticated', 'sceneflow.credit_ledger', 'update'),
          false, 't_cannot_edit_the_ledger');
select is(has_table_privilege('authenticated', 'sceneflow.credit_ledger', 'delete'),
          false, 't_cannot_delete_from_the_ledger');

-- Deleting your own results is a privacy requirement; forging one is not.
select is(has_table_privilege('authenticated', 'sceneflow.scenes', 'delete'),
          true, 't_can_delete_own_scene');
select is(has_table_privilege('authenticated', 'sceneflow.scenes', 'select'),
          true, 't_can_read_own_scene');

-- The UPDATE grant on scenes names exactly one column.
select is(has_column_privilege('authenticated', 'sceneflow.scenes', 'favorite', 'update'),
          true, 't_can_favorite');
select is(has_column_privilege('authenticated', 'sceneflow.scenes', 'image_path', 'update'),
          false, 't_cannot_repoint_an_image');
select is(has_column_privilege('authenticated', 'sceneflow.scenes', 'status', 'update'),
          false, 't_cannot_promote_a_scene_to_ready');
select is(has_column_privilege('authenticated', 'sceneflow.scenes', 'prompt_snapshot', 'update'),
          false, 't_cannot_rewrite_the_prompt_snapshot');

-- The moderation log is for the trusted path only: no grant, and no policy.
select is(has_table_privilege('authenticated', 'sceneflow.moderation_events', 'select'),
          false, 't_moderation_log_unreadable');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'sceneflow' and tablename = 'moderation_events'),
  0, 't_moderation_log_has_no_policies');

-- ===========================================================================
-- Refusal 1: attestation
-- ===========================================================================

select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  insert into sceneflow.casts (owner_id, name)
  values (tests.uid('owner_a'), 'Anniversary')
$$, 't_create_draft_cast');

-- A tick with no recorded wording is not a record of anything.
select throws_ok($$
  update sceneflow.casts set adult_confirmed = true, permission_confirmed = true
   where name = 'Anniversary'
$$, '23514', null, 't_attestation_needs_a_recorded_wording');

select lives_ok($$
  update sceneflow.casts
     set adult_confirmed = true, permission_confirmed = true,
         consent_text_version = 'v1.0', consent_recorded_at = now()
   where name = 'Anniversary'
$$, 't_attestation_with_wording_and_timestamp');

-- Both boxes, or the cast is not generatable.
select throws_ok($$
  update sceneflow.casts set permission_confirmed = false, status = 'ready'
   where name = 'Anniversary'
$$, '23514', null, 't_ready_needs_both_boxes');

-- Two adults minimum, enforced by trigger.
select throws_ok($$
  update sceneflow.casts set status = 'ready' where name = 'Anniversary'
$$, '23514', null, 't_ready_needs_two_adults');

select lives_ok($$
  insert into sceneflow.cast_members (owner_id, cast_id, member_key, display_label, sort_order)
  values (tests.uid('owner_a'), tests.sf_cast(), 'person_a', 'Person A', 0),
         (tests.uid('owner_a'), tests.sf_cast(), 'person_b', 'Person B', 1)
$$, 't_add_two_members');

select throws_ok($$
  insert into sceneflow.cast_members (owner_id, cast_id, member_key, display_label)
  values (tests.uid('owner_a'), tests.sf_cast(), 'person_a', 'Person A again')
$$, '23505', null, 't_member_keys_are_unique_per_cast');

select lives_ok($$
  update sceneflow.casts set status = 'ready' where name = 'Anniversary'
$$, 't_cast_becomes_ready');

-- ===========================================================================
-- Storage paths never leave the owner's prefix
-- ===========================================================================

select lives_ok($$
  insert into sceneflow.cast_references (owner_id, cast_id, storage_path)
  values (tests.uid('owner_a'), tests.sf_cast(),
          tests.uid('owner_a')::text || '/cast-1/source.jpg')
$$, 't_reference_under_own_prefix');

select throws_ok($$
  insert into sceneflow.cast_references (owner_id, cast_id, storage_path)
  values (tests.uid('owner_a'), tests.sf_cast(),
          tests.uid('owner_b')::text || '/cast-9/stolen.jpg')
$$, '23514', null, 't_reference_cannot_point_at_another_user');

select is(
  (select moderation_status::text from sceneflow.cast_references limit 1),
  'pending', 't_reference_starts_unmoderated');

-- ===========================================================================
-- Jobs, scenes and the rest, written as the trusted path does
-- ===========================================================================

select lives_ok($$
  insert into sceneflow.stories (owner_id, cast_id, title, intimacy_ceiling)
  values (tests.uid('owner_a'), tests.sf_cast(), 'Night in the City', 'romantic')
$$, 't_create_story');

select tests.logout();

-- A job may not name a cast that is not attested and ready.
select lives_ok($$
  insert into sceneflow.casts (owner_id, name, status)
  values (tests.uid('owner_a'), 'Unattested', 'draft')
$$, 't_create_unattested_cast');

select throws_ok($$
  insert into sceneflow.generation_jobs
    (owner_id, cast_id, generation_type, idempotency_key)
  select tests.uid('owner_a'), id, 'single', 'k-unattested'
    from sceneflow.casts where name = 'Unattested'
$$, '23514', null, 't_no_generation_against_an_unattested_cast');

select lives_ok($$
  insert into sceneflow.generation_jobs
    (owner_id, cast_id, story_id, generation_type, idempotency_key, status, credit_cost)
  values (tests.uid('owner_a'), tests.sf_cast(), tests.sf_story(),
          'story-6', 'k-1', 'complete', 6)
$$, 't_create_job_against_attested_cast');

select throws_ok($$
  insert into sceneflow.generation_jobs
    (owner_id, cast_id, generation_type, idempotency_key)
  values (tests.uid('owner_a'), tests.sf_cast(), 'single', 'k-1')
$$, '23505', null, 't_idempotency_key_stops_double_submission');

-- Refusal 4: a blocked request is free.
select throws_ok($$
  insert into sceneflow.generation_jobs
    (owner_id, cast_id, generation_type, idempotency_key, status, credit_cost)
  values (tests.uid('owner_a'), tests.sf_cast(), 'single', 'k-blocked', 'blocked', 1)
$$, '23514', null, 't_blocked_job_cannot_cost_credits');

select lives_ok($$
  insert into sceneflow.generation_jobs
    (owner_id, cast_id, generation_type, idempotency_key, status, credit_cost)
  values (tests.uid('owner_a'), tests.sf_cast(), 'single', 'k-blocked', 'blocked', 0)
$$, 't_blocked_job_at_zero_credits');

-- Refusal 3: ready means there is something to look at.
select throws_ok($$
  insert into sceneflow.scenes (owner_id, story_id, scene_number, status)
  values (tests.uid('owner_a'), tests.sf_story(), 1, 'ready')
$$, '23514', null, 't_scene_cannot_be_ready_without_an_image');

select lives_ok($$
  insert into sceneflow.scenes (owner_id, story_id, scene_number, title, status, image_path)
  values (tests.uid('owner_a'), tests.sf_story(), 1, 'Arrival', 'ready',
          tests.uid('owner_a')::text || '/story-1/scene-1.jpg')
$$, 't_scene_ready_with_an_image');

select throws_ok($$
  insert into sceneflow.scenes (owner_id, story_id, scene_number, status, image_path)
  values (tests.uid('owner_a'), tests.sf_story(), 2, 'ready',
          tests.uid('owner_b')::text || '/story-9/scene-2.jpg')
$$, '23514', null, 't_scene_image_cannot_point_at_another_user');

-- Focus characters must be in this story's cast.
select throws_ok($$
  insert into sceneflow.scenes
    (owner_id, story_id, scene_number, status, focus_member_keys)
  values (tests.uid('owner_a'), tests.sf_story(), 2, 'pending', array['person_h']::sceneflow.member_key[])
$$, '23514', null, 't_stale_focus_character_refused');

select lives_ok($$
  insert into sceneflow.scenes
    (owner_id, story_id, scene_number, title, status, focus_member_keys, image_path)
  values (tests.uid('owner_a'), tests.sf_story(), 2, 'Whisper', 'ready',
          array['person_a','person_b']::sceneflow.member_key[],
          tests.uid('owner_a')::text || '/story-1/scene-2.jpg')
$$, 't_focus_characters_in_the_cast');

-- Branching: two children of the same parent may share a scene number.
select lives_ok($$
  insert into sceneflow.scenes
    (owner_id, story_id, scene_number, title, status, parent_scene_id, image_path)
  select tests.uid('owner_a'), tests.sf_story(), 3, 'Kiss (A)', 'ready', s.id,
         tests.uid('owner_a')::text || '/story-1/scene-3a.jpg'
    from sceneflow.scenes s where s.title = 'Whisper'
$$, 't_branch_a');

select lives_ok($$
  insert into sceneflow.scenes
    (owner_id, story_id, scene_number, title, status, parent_scene_id, image_path)
  select tests.uid('owner_a'), tests.sf_story(), 3, 'Goodnight (B)', 'ready', s.id,
         tests.uid('owner_a')::text || '/story-1/scene-3b.jpg'
    from sceneflow.scenes s where s.title = 'Whisper'
$$, 't_branch_b_shares_the_scene_number');

-- A branch cannot reach into a different story.
select lives_ok($$
  insert into sceneflow.stories (owner_id, cast_id, title)
  values (tests.uid('owner_a'), tests.sf_cast(), 'Another Story')
$$, 't_create_second_story');

select throws_ok($$
  insert into sceneflow.scenes (owner_id, story_id, scene_number, status, parent_scene_id)
  select tests.uid('owner_a'), s2.id, 1, 'pending', s1.id
    from sceneflow.stories s2, sceneflow.scenes s1
   where s2.title = 'Another Story' and s1.title = 'Whisper'
$$, '23514', null, 't_branch_cannot_cross_stories');

-- ===========================================================================
-- Refusals 4 and 5: the ledger
-- ===========================================================================

select lives_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type, description)
  values (tests.uid('owner_a'), 20, 'introductory-grant', 'welcome')
$$, 't_grant_credits');

select throws_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type)
  values (tests.uid('owner_a'), 5, 'debit')
$$, '23514', null, 't_a_debit_must_be_negative');

select throws_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type)
  values (tests.uid('owner_a'), -5, 'refund')
$$, '23514', null, 't_a_refund_must_be_positive');

select throws_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type)
  values (tests.uid('owner_a'), 0, 'grant')
$$, '23514', null, 't_a_zero_entry_is_not_an_entry');

-- A request that produced nothing cannot be charged for.
select throws_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type, generation_job_id)
  select tests.uid('owner_a'), -1, 'debit', id
    from sceneflow.generation_jobs where idempotency_key = 'k-blocked'
$$, '23514', null, 't_no_debit_against_a_blocked_job');

select lives_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type, generation_job_id)
  select tests.uid('owner_a'), -6, 'debit', id
    from sceneflow.generation_jobs where idempotency_key = 'k-1'
$$, 't_debit_against_a_completed_job');

-- Append-only, and this is the service-role-equivalent session: even here.
select throws_ok($$
  update sceneflow.credit_ledger set amount = 999 where event_type = 'debit'
$$, '42501', null, 't_ledger_cannot_be_edited');

select throws_ok($$
  delete from sceneflow.credit_ledger where event_type = 'debit'
$$, '42501', null, 't_ledger_cannot_be_deleted');

select lives_ok($$
  insert into sceneflow.moderation_events
    (owner_id, moderation_stage, result, reason_codes)
  values (tests.uid('owner_a'), 'request_policy', 'blocked', array['explicit_sexual_act'])
$$, 't_record_a_moderation_event');

select throws_ok($$
  update sceneflow.moderation_events set result = 'allowed'
$$, '42501', null, 't_moderation_log_cannot_be_edited');

select throws_ok($$
  delete from sceneflow.moderation_events
$$, '42501', null, 't_moderation_log_cannot_be_deleted');

-- A refund is a second row, so the balance is arithmetic over history.
select lives_ok($$
  insert into sceneflow.credit_ledger (owner_id, amount, event_type, description)
  values (tests.uid('owner_a'), 6, 'refund', 'storyboard failed')
$$, 't_refund_is_a_second_row');

select is(
  (select sum(amount)::int from sceneflow.credit_ledger
    where owner_id = tests.uid('owner_a')),
  20, 't_balance_is_the_sum_of_history');

-- ===========================================================================
-- Refusal 2, behaviourally: the column grant holds against a real statement
-- ===========================================================================
--
-- has_column_privilege() above says what the catalog believes. These two say
-- what actually happens when a signed-in user tries it.

select tests.login_as(tests.uid('owner_a'));

select lives_ok($$
  update sceneflow.scenes set favorite = true where title = 'Arrival'
$$, 't_user_can_favourite_their_own_scene');

select throws_ok($$
  update sceneflow.scenes
     set image_path = tests.uid('owner_a')::text || '/forged.jpg'
   where title = 'Arrival'
$$, '42501', null, 't_user_cannot_repoint_an_image_in_practice');

-- ===========================================================================
-- One user never sees another's photographs
-- ===========================================================================

select tests.login_as(tests.uid('owner_b'));

select is((select count(*)::int from sceneflow.casts), 0, 't_b_sees_no_casts');
select is((select count(*)::int from sceneflow.cast_members), 0, 't_b_sees_no_members');
select is((select count(*)::int from sceneflow.cast_references), 0, 't_b_sees_no_photographs');
select is((select count(*)::int from sceneflow.stories), 0, 't_b_sees_no_stories');
select is((select count(*)::int from sceneflow.scenes), 0, 't_b_sees_no_scenes');
select is((select count(*)::int from sceneflow.generation_jobs), 0, 't_b_sees_no_jobs');
select is((select count(*)::int from sceneflow.credit_ledger), 0, 't_b_sees_no_credits');

-- And cannot write a row owned by somebody else.
select throws_ok($$
  insert into sceneflow.casts (owner_id, name)
  values (tests.uid('owner_a'), 'Planted')
$$, '42501', null, 't_b_cannot_write_as_a');

-- B holds a DELETE grant on scenes, so this does not raise — RLS filters the
-- statement to the rows B owns, which is none. The assertion that matters is
-- therefore how many rows it removed, not whether it threw.
select is(tests.sf_delete_all_scenes(), 0, 't_b_deletes_none_of_as_scenes');

select tests.login_as_anon();
select throws_ok($$ select 1 from sceneflow.casts $$, '42501', null, 't_anon_is_locked_out');

select * from finish();
rollback;
