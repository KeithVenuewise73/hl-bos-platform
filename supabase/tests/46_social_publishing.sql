\ir _fixtures.sql.inc

-- ===========================================================================
-- HL Social Publishing (Phase 1) — migration 0046.
--
-- Covers the acceptance test in the build brief, in SQL: one post, four
-- targets, one deliberately forced to fail, every attempt logged, and the
-- failure proven not to block the other three. Plus the guards that make the
-- honesty claims structural rather than aspirational: no credential is
-- reachable, no tenant can fabricate a published post, no TikTok inbox
-- delivery can call itself a publication, and no attempt row can be edited
-- after the fact.
--
-- events.outbox / audit are platform-observability only, so those assertions
-- run after logout (postgres bypasses their tenant/platform RLS).
-- ===========================================================================
begin;
select plan(59);
select tests.seed();

-- Local helpers so the test reads as prose. psql meta-commands are unavailable here and
-- this suite runs under two different runners, so the post and its targets are
-- looked up by name instead.
create or replace function tests.mc_post() returns uuid language sql stable as $$
  select id from social.posts where campaign_ref = 'morning_chaos' limit 1
$$;
create or replace function tests.mc_target(p_platform text) returns uuid language sql stable as $$
  select t.id from social.post_targets t
    join social.accounts a on a.id = t.account_id
   where t.post_id = tests.mc_post() and a.platform::text = p_platform
$$;
create or replace function tests.acct(p_ext text) returns uuid language sql stable as $$
  select id from social.accounts where external_account_id = p_ext limit 1
$$;

-- --- Fixture: four owned channels, one per Phase 1 platform ----------------
select tests.login_as(tests.uid('owner_a'));
select ok(social.upsert_account(tests.uid('tenant_a'), 'facebook_page', 'fb-page-1',
       'Venuewise FB Page') is not null, 't_register_facebook_page');
select ok(social.upsert_account(tests.uid('tenant_a'), 'instagram', 'ig-user-1',
       'Venuewise IG', jsonb_build_object('facebook_page_id','fb-page-1')) is not null,
  't_register_instagram_with_linked_page');
select ok(social.upsert_account(tests.uid('tenant_a'), 'linkedin_member', 'urn:li:person:xyz',
       'Keith Herman (personal)') is not null, 't_register_linkedin_member');
select ok(social.upsert_account(tests.uid('tenant_a'), 'tiktok_inbox', 'tt-open-1',
       'HSCS TikTok') is not null, 't_register_tiktok_inbox');

-- An Instagram account NOT linked to a Facebook Page cannot publish via the
-- API, so the schema refuses to record one as a channel at all. Blocking
-- input #2 in the brief, enforced instead of assumed.
select throws_ok(
  $$ select social.upsert_account(tests.uid('tenant_a'), 'instagram', 'ig-personal',
       'Personal IG') $$,
  '23514', null, 't_instagram_without_linked_page_rejected');

-- --- Credentials are not a tenant-user action -------------------------------
select is(has_function_privilege('authenticated',
  'social.set_credential(uuid, extensions.citext, timestamptz, extensions.citext, text[])', 'execute'),
  false, 't_authenticated_cannot_set_a_credential');
select tests.logout();

-- Granting the credential is the trusted path (service_role). Note what is
-- stored: a Vault REFERENCE and an expiry, never a token.
select social.set_credential(tests.acct('fb-page-1'),
  'vault:social_fb_page_1', now() + interval '55 days');
select social.set_credential(tests.acct('ig-user-1'),
  'vault:social_ig_user_1', now() + interval '55 days');
select social.set_credential(tests.acct('urn:li:person:xyz'),
  'vault:social_li_member', now() + interval '58 days');
select social.set_credential(tests.acct('tt-open-1'),
  'vault:social_tiktok_1', now() + interval '20 days');

select is((select count(*)::int from social.accounts where tenant_id=tests.uid('tenant_a') and status='active'),
  4, 't_credential_activates_the_channel');

-- --- The credential table is unreachable, and holds no secret ---------------
select is((select count(*)::int from pg_catalog.pg_policies
           where schemaname='social' and tablename='credentials'),
  0, 't_credentials_has_zero_rls_policies');
select is(has_table_privilege('authenticated','social.credentials','select'),
  false, 't_authenticated_has_no_grant_on_credentials');
select is(has_table_privilege('anon','social.credentials','select'),
  false, 't_anon_has_no_grant_on_credentials');
select ok((select bool_and(credential_ref ~ '^vault:') from social.credentials),
  't_every_credential_is_a_vault_reference');
select throws_ok(
  $$ insert into social.credentials (account_id, credential_ref)
     values (tests.acct('fb-page-1'), 'EAAG-a-real-looking-token') $$,
  '23514', null, 't_a_raw_token_cannot_be_stored');

-- --- Compose + fan out ------------------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(social.create_post(tests.uid('tenant_a'), 'homehuddle',
  'Morning Chaos: the 6:47am shoe hunt is not a character flaw.', 'morning_chaos',
  now() + interval '10 minutes') is not null, 't_post_composed');

select is((select status::text from social.posts where id = tests.mc_post()), 'draft', 't_post_starts_as_draft');

select ok(social.add_target(tests.mc_post(), tests.acct('fb-page-1')) is not null, 't_target_facebook');
select ok(social.add_target(tests.mc_post(), tests.acct('ig-user-1')) is not null, 't_target_instagram');
select ok(social.add_target(tests.mc_post(), tests.acct('urn:li:person:xyz'),
       'Personal take: the 6:47am shoe hunt.') is not null, 't_target_linkedin_with_caption_override');
select ok(social.add_target(tests.mc_post(), tests.acct('tt-open-1')) is not null, 't_target_tiktok');
select is((select count(*)::int from social.post_targets where post_id = tests.mc_post()), 4, 't_four_targets');

-- Instagram fetches media itself, so the URL must be public https and JPEG.
select ok(social.attach_media(tests.mc_post(),'image','tenant-public',
  tests.uid('tenant_a')::text || '/social/chaos.jpg',
  'https://cdn.hermanlegacy.test/social/chaos.jpg','image/jpeg') is not null, 't_attach_jpeg');
select throws_ok(
  $$ select social.attach_media((select id from social.posts where campaign_ref='morning_chaos'),
       'image','tenant-public', tests.uid('tenant_a')::text || '/social/x.png',
       'https://cdn.hermanlegacy.test/social/x.png','image/png', 1) $$,
  '23514', null, 't_instagram_rejects_non_jpeg_image');
select throws_ok(
  $$ select social.attach_media((select id from social.posts where campaign_ref='morning_chaos'),
       'image','tenant-public', tests.uid('tenant_a')::text || '/social/y.jpg',
       'http://cdn.hermanlegacy.test/social/y.jpg','image/jpeg', 2) $$,
  '23514', null, 't_media_url_must_be_https');

-- --- Nothing is due for the worker before a human approves ------------------
select tests.logout();
select is((select count(*)::int from social.claim_targets(10)), 0, 't_nothing_claimable_before_approval');

-- --- The approval gate cannot be talked past --------------------------------
select tests.login_as(tests.uid('owner_a'));
select ok(social.submit_for_approval(tests.mc_post()) is not null, 't_submitted_for_approval');
-- approve_post refuses while the human decision does not exist
select throws_ok(
  $$ select social.approve_post((select id from social.posts where campaign_ref='morning_chaos')) $$,
  '42501', null, 't_cannot_approve_without_a_human_decision');
select tests.logout();

-- manager may compose but not approve; that is a brand decision
select tests.login_as(tests.uid('manager_a'));
select throws_ok(
  $$ select social.approve_post((select id from social.posts where campaign_ref='morning_chaos')) $$,
  '42501', null, 't_manager_cannot_approve');
select tests.logout();

-- another tenant's owner cannot see it at all
select tests.login_as(tests.uid('owner_b'));
select is((select count(*)::int from social.posts where campaign_ref='morning_chaos'), 0,
  't_other_tenant_cannot_read_the_post');
select tests.logout();

-- the real human decision, then the approval
select tests.login_as(tests.uid('admin_a'));
select workflows.decide(
  (select t.id from workflows.tasks t join workflows.instances i on i.id = t.instance_id
    where i.subject_id = (select id::text from social.posts where campaign_ref='morning_chaos')),
  'approved', 'ship it');
select social.approve_post(tests.mc_post());
select is((select status::text from social.posts where id = tests.mc_post()), 'approved', 't_post_approved');
select ok((select approved_by is not null and approved_at is not null
           from social.posts where id = tests.mc_post()), 't_approver_recorded');
select is((select count(*)::int from social.post_targets where post_id = tests.mc_post() and status='scheduled'),
  4, 't_all_four_targets_scheduled_on_approval');
select tests.logout();

-- --- A tenant cannot fabricate a publication --------------------------------
select is(has_function_privilege('authenticated',
  'social.complete_target(uuid, social.target_status, text, text, text, boolean)', 'execute'),
  false, 't_authenticated_cannot_complete_a_target');
select is(has_function_privilege('authenticated', 'social.claim_targets(integer)', 'execute'),
  false, 't_authenticated_cannot_claim_targets');
select is(has_table_privilege('authenticated','social.post_targets','update'),
  false, 't_authenticated_cannot_update_a_target_directly');

-- --- The worker loop --------------------------------------------------------
-- Targets become due once scheduled_at passes.
update social.post_targets set next_attempt_at = now() - interval '1 minute' where post_id = tests.mc_post();

-- The batch is captured because claiming is destructive: a second call returns
-- nothing, and asserting over an empty set proves nothing at all.
create temp table claimed_batch as select * from social.claim_targets(10);
select is((select count(*)::int from claimed_batch), 4, 't_worker_claims_all_four');
-- A second overlapping worker run claims nothing: the rows are already claimed.
select is((select count(*)::int from social.claim_targets(10)), 0, 't_second_worker_claims_nothing');
-- The claim hands over the Vault REFERENCE, never a token.
select ok((select bool_and(credential_ref ~ '^vault:') from claimed_batch),
  't_worker_receives_only_vault_references');
-- ...and the per-platform caption override actually reaches the worker, which
-- is the whole point of having one.
select is((select caption from claimed_batch where platform = 'linkedin_member'),
  'Personal take: the 6:47am shoe hunt.', 't_worker_receives_the_caption_override');
-- Instagram's linked Facebook Page travels with the claim; without it the
-- adapter has no publish path.
select is((select account_config->>'facebook_page_id' from claimed_batch where platform = 'instagram'),
  'fb-page-1', 't_worker_receives_the_instagram_linked_page');

-- Three succeed. The Facebook and Instagram targets go live; LinkedIn goes
-- live; TikTok is deliberately forced to fail on every attempt.
select social.record_attempt(tests.mc_target('facebook_page'),
  'publish', true, now(), 200, '{"message":"..."}'::jsonb, '{"id":"fb_post_9001"}'::jsonb);
select social.complete_target(tests.mc_target('facebook_page'),
  'published', 'fb_post_9001', 'https://facebook.test/fb_post_9001');

select social.record_attempt(tests.mc_target('instagram'),
  'create_container', true, now(), 200, null, '{"id":"ig_container_1"}'::jsonb);
select social.record_attempt(tests.mc_target('instagram'),
  'publish', true, now(), 200, null, '{"id":"ig_post_7002"}'::jsonb);
select social.complete_target(tests.mc_target('instagram'),
  'published', 'ig_post_7002');

select social.record_attempt(tests.mc_target('linkedin_member'),
  'publish', true, now(), 201, null, '{"id":"urn:li:share:5003"}'::jsonb);
select social.complete_target(tests.mc_target('linkedin_member'),
  'published', 'urn:li:share:5003');

-- --- TikTok cannot claim to be published ------------------------------------
select throws_ok(
  $$ select social.complete_target(tests.mc_target('tiktok_inbox'), 'published', 'tt_1') $$,
  '23514', null, 't_tiktok_inbox_cannot_report_published');
-- and no other platform may borrow the inbox status
select throws_ok(
  $$ select social.complete_target(tests.mc_target('facebook_page'), 'delivered_to_inbox', 'x') $$,
  '23514', null, 't_only_tiktok_can_be_delivered_to_inbox');

-- --- The forced failure -----------------------------------------------------
-- Drive the TikTok target to terminal failure. Each failure is logged, and the
-- backoff path leaves it 'scheduled' until max_attempts is spent.
do $$
declare v_t uuid; i integer;
begin
  select t.id into v_t from social.post_targets t join social.accounts a on a.id=t.account_id
   where a.platform='tiktok_inbox';
  for i in 1..5 loop
    update social.post_targets set status='claimed', claimed_at=now(), attempts=i where id=v_t;
    perform social.record_attempt(v_t, 'upload', false, now(), 401, null,
      '{"error":{"code":"access_token_invalid"}}'::jsonb, 'forced failure for the acceptance test');
    perform social.complete_target(v_t, 'failed', null, null, 'forced failure for the acceptance test');
  end loop;
end $$;

select is((select t.status::text from social.post_targets t join social.accounts a on a.id=t.account_id
           where a.platform='tiktok_inbox'), 'failed', 't_forced_target_ends_failed');

-- THE POINT OF THE ACCEPTANCE TEST: the failure blocked nothing.
select is((select count(*)::int from social.post_targets t join social.accounts a on a.id=t.account_id
           where t.post_id = tests.mc_post() and t.status='published'), 3,
  't_one_failure_does_not_block_the_other_three');
select is((select status::text from social.posts where id = tests.mc_post()), 'partially_published',
  't_post_rolls_up_as_partially_published_not_published');

-- --- Every attempt is logged, and the log cannot be rewritten ---------------
select is((select count(*)::int from social.publish_attempts
           where target_id in (select id from social.post_targets where post_id = tests.mc_post())),
  9, 't_every_attempt_logged');
select is((select count(*)::int from social.publish_attempts
           where target_id in (select id from social.post_targets where post_id = tests.mc_post()) and not ok),
  5, 't_failures_logged_not_just_successes');
select throws_ok(
  $$ update social.publish_attempts set ok = true where not ok $$,
  '42501', null, 't_attempt_log_cannot_be_edited');
select throws_ok(
  $$ delete from social.publish_attempts $$,
  '42501', null, 't_attempt_log_cannot_be_deleted');

-- A success with no provider id is refused: "published" always has something
-- to point at.
select throws_ok(
  $$ update social.post_targets set status='published', published_at=now()
      where status='failed' $$,
  '23514', null, 't_published_requires_an_external_id');

-- --- Token refresh: the failure this module was built around ----------------
-- TikTok's credential expires in 20 days, so a 14-day window excludes it and a
-- 30-day window includes it.
select is((select count(*)::int from social.credentials_due_for_refresh(14)), 0, 't_nothing_due_at_14_days');
select is((select count(*)::int from social.credentials_due_for_refresh(30)), 1, 't_tiktok_due_at_30_days');

-- An UNKNOWN expiry is treated as due: "we don't know" must not read as
-- "we're fine".
update social.credentials set expires_at = null
 where account_id = tests.acct('fb-page-1');
select is((select count(*)::int from social.credentials_due_for_refresh(14)), 1,
  't_unknown_expiry_counts_as_due');

select social.record_credential_refresh(
  tests.acct('fb-page-1'), true, now() + interval '60 days');
select is((select count(*)::int from social.credentials_due_for_refresh(14)), 0,
  't_successful_refresh_clears_the_due_list');

-- A refresh failure is LOUD: a warning-severity security event, not a log line.
select social.record_credential_refresh(
  tests.acct('urn:li:person:xyz'), false, null, 'invalid_grant');
select is((select c.status::text from social.credentials c join social.accounts a on a.id=c.account_id
           where a.external_account_id='urn:li:person:xyz'), 'expiring', 't_failed_refresh_marks_the_credential');
select is((select count(*)::int from audit.security_events
           where action='social.credential.refresh_failed' and severity='warning'), 1,
  't_failed_refresh_raises_a_security_event');

-- --- Stale claim recovery ---------------------------------------------------
-- A worker killed mid-publish must not strand a target forever.
update social.post_targets set status='claimed', claimed_at = now() - interval '1 hour',
       published_at = null, external_post_id = null
 where id = tests.mc_target('facebook_page');
select is(social.release_stale_claims(15), 1, 't_stale_claim_released');
select is((select t.status::text from social.post_targets t join social.accounts a on a.id=t.account_id
           where a.platform='facebook_page'), 'scheduled', 't_released_target_is_requeued');

-- The ambiguous-outcome safeguard: a request that may or may not have created
-- a live post is ended terminally on the FIRST attempt rather than retried,
-- because retrying is how one scheduled item becomes two live ones.
do $$
declare v_t uuid;
begin
  -- a fresh target with 4 of 5 attempts still available
  insert into social.accounts (tenant_id, platform, external_account_id, display_name, status)
  values (tests.uid('tenant_a'), 'facebook_page', 'fb-page-probe', 'Probe Page', 'active');
  insert into social.post_targets (post_id, account_id, tenant_id, status, attempts, idempotency_key)
  values (tests.mc_post(), tests.acct('fb-page-probe'), tests.uid('tenant_a'), 'claimed', 1, 'ambiguous_probe')
  returning id into v_t;
  perform social.complete_target(v_t, 'failed', null, null, 'ambiguous: request timed out', true);
end $$;
select is((select status::text from social.post_targets where idempotency_key='ambiguous_probe'),
  'failed', 't_ambiguous_outcome_is_not_retried');
select is((select attempts from social.post_targets where idempotency_key='ambiguous_probe'), 1,
  't_ambiguous_outcome_ended_with_attempts_to_spare');

-- --- Every function in the schema pins its search_path ---------------------
-- Migration 0046 shipped one function without `set search_path = ''`
-- (social.deny_attempt_mutation), and the LOCAL suite did not catch it -- the
-- Supabase advisor did, after it was already applied. 0047 repaired it
-- forward. This assertion is the guard that makes the next omission fail here
-- instead of in production: a trigger or helper whose search_path is mutable
-- resolves unqualified names against whatever the caller happens to have set.
select is(
  (select string_agg(p.proname, ', ' order by p.proname)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'social'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
         where cfg like 'search_path=%')),
  null,
  't_every_social_function_pins_its_search_path');

select * from finish();
rollback;
