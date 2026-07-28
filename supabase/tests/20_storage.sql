\ir _fixtures.sql.inc

-- ===========================================================================
-- Checkpoint 3 — shared storage (storage_meta) tests.
-- Authorized/denied upload metadata, tenant isolation, MIME/size/extension
-- validation, cross-tenant path prevention, soft delete + restore, the
-- signed-URL access boundary, source-module attribution, audit, events.
-- ===========================================================================
begin;
select plan(20);
select tests.seed();

-- --- authorized upload metadata + attribution + tenant-scoped path ----------
select tests.login_as(tests.uid('owner_a'));
select ok(
  storage_meta.register_upload(tests.uid('tenant_a'), 'visibility', 'evidence',
    'evidence/site.png', 'site.png', 'image/png', 2048) is not null,
  't_authorized_register_upload');
select tests.logout();

select is((select source_module from storage_meta.files order by created_at desc limit 1)::text,
  'visibility', 't_source_module_attribution');
select ok((select object_path from storage_meta.files order by created_at desc limit 1)
            like tests.uid('tenant_a')::text || '/%',
  't_object_path_is_tenant_scoped');

-- --- unauthorized: viewer has no storage.file.write ------------------------
select tests.login_as(tests.uid('viewer_a'));
select throws_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'), 'visibility', 'evidence',
       'x.png', 'x.png', 'image/png', 100) $$,
  '42501', null, 't_viewer_cannot_write');
select tests.logout();

-- --- tenant isolation: non-member cannot store for another tenant -----------
select tests.login_as(tests.uid('owner_b'));
select throws_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'), 'visibility', 'evidence',
       'y.png', 'y.png', 'image/png', 100) $$,
  '42501', null, 't_nonmember_cannot_write_other_tenant');
select tests.logout();

-- --- validation: MIME, extension, size --------------------------------------
select tests.login_as(tests.uid('owner_a'));
select throws_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'),'visibility','customer_upload',
       'm.png','m.png','application/x-msdownload',100) $$,
  '23514', null, 't_executable_mime_rejected');
select throws_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'),'visibility','customer_upload',
       'evil.exe','evil.exe','image/png',100) $$,
  '23514', null, 't_dangerous_extension_rejected');
select throws_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'),'visibility','report',
       'big.pdf','big.pdf','application/pdf',60000000) $$,
  '23514', null, 't_oversized_rejected');
select lives_ok(
  $$ select storage_meta.register_upload(tests.uid('tenant_a'),'visibility','logo',
       'brand/logo.png','logo.png','image/png',4096) $$,
  't_valid_file_accepted');
select tests.logout();

-- --- cross-tenant path prevention: a malicious path is forced under caller --
-- Two statements: the insert (register) and the read must be separate so the
-- read sees the just-inserted row (same-statement snapshots predate the insert).
select tests.login_as(tests.uid('owner_a'));
select storage_meta.register_upload(tests.uid('tenant_a'),'visibility','evidence',
  tests.uid('tenant_b')::text || '/../secret.png', 'p.png', 'image/png', 100);
select ok(
  (select object_path from storage_meta.files
     where tenant_id = tests.uid('tenant_a') order by created_at desc limit 1)
   like tests.uid('tenant_a')::text || '/%',
  't_cross_tenant_path_forced_under_caller');
select tests.logout();

-- the CHECK constraint blocks a wrong-prefix row even via a bypass-RLS path
select throws_ok(
  $$ insert into storage_meta.files (tenant_id, source_module, category, object_path,
        original_filename, mime_type, size_bytes)
     values (tests.uid('tenant_a'),'x','other', tests.uid('tenant_b')::text || '/z',
        'z','text/plain',1) $$,
  '23514', null, 't_check_blocks_foreign_prefix');

-- --- confirm upload -> stored + file.uploaded event -------------------------
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ select storage_meta.confirm_upload(
       (select id from storage_meta.files where tenant_id=tests.uid('tenant_a')
          and status='pending' order by created_at limit 1),
       repeat('a',64), 2048) $$,
  't_confirm_upload');
select tests.logout();
select ok((select count(*) from events.outbox where topic='file.uploaded') >= 1,
  't_file_uploaded_event_emitted');

-- --- signed-URL access boundary --------------------------------------------
select tests.login_as(tests.uid('owner_a'));
select is(storage_meta.can_access(
  (select id from storage_meta.files where tenant_id=tests.uid('tenant_a') and status='stored'
     order by created_at limit 1)), true, 't_owner_can_access_own_stored_file');
select tests.logout();
select tests.login_as(tests.uid('owner_b'));
select is(storage_meta.can_access(
  (select id from storage_meta.files where tenant_id=tests.uid('tenant_a') and status='stored'
     order by created_at limit 1)), false, 't_other_tenant_cannot_access');
select is((select count(*)::int from storage_meta.files where tenant_id=tests.uid('tenant_a')), 0,
  't_other_tenant_cannot_read_files');
select tests.logout();

-- --- soft delete + restore + audit -----------------------------------------
-- owner_a holds storage.file.delete, so it may both delete AND (per the policy)
-- list deleted files to restore them. Event/audit reads happen after logout,
-- since events.outbox is platform-observability only (RLS hides it from tenants).
select tests.login_as(tests.uid('owner_a'));
select lives_ok(
  $$ select storage_meta.soft_delete_file(
       (select id from storage_meta.files where tenant_id=tests.uid('tenant_a') and status='stored'
          order by created_at limit 1)) $$,
  't_soft_delete');
select lives_ok(
  $$ select storage_meta.restore_file(
       (select id from storage_meta.files where tenant_id=tests.uid('tenant_a') and status='deleted'
          order by created_at limit 1)) $$,
  't_restore');
select tests.logout();

select ok((select count(*) from events.outbox where topic='file.deleted') >= 1,
  't_file_deleted_event_emitted');
select ok((select count(*) from audit.events
           where resource_type='storage_meta.files' and tenant_id=tests.uid('tenant_a')) >= 1,
  't_storage_writes_are_audited');

select * from finish();
rollback;
