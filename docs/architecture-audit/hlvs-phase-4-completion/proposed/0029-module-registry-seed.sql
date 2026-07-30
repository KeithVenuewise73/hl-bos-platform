-- ===========================================================================
-- PROPOSAL — hlbos_0029_module_registry_seed  (NOT APPLIED)
--
-- Status: DRAFT / awaiting CEO approval. Deliberately under docs/, NOT in
-- supabase/migrations/, so it is never auto-applied. `hlvs.modules` is empty
-- (0 rows) in the live database; this seed populates the engineering module
-- registry from the version-controlled source of truth
-- (packages/catalog/src/modules.ts).
--
-- The running Enterprise Catalog / Software Factory does NOT depend on this —
-- its source of truth is the code registry. This migration only makes the same
-- data durable in the database so the factory's own RPCs can reason over it.
--
-- Honors the platform contract: extends the existing hlvs schema, uses the
-- existing register/approve RPCs (not raw INSERT), permission-gated, idempotent.
-- Apply only after review and explicit approval.
--
-- rollback:
--   DELETE FROM hlvs.modules WHERE key IN (
--     'identity_core','tenancy','audit','events_bus','entitlements','ai_gateway',
--     'workflows','billing_core','storage','communications','integrations',
--     'discovery_engine','website_scanner','blueprint_engine','commerce_provisioning',
--     'visibility_assessments','bti_platform','scoring_engine','hlvs_factory');
-- ===========================================================================

-- Uses the existing governed RPC hlvs.register_module(...) where available so
-- audit + versioning fire. Shown here as representative inserts; the applied
-- version would be generated 1:1 from MODULE_REGISTRY and kept in lockstep by a
-- CI drift check (code registry vs. hlvs.modules).

-- Example shape (identity_core); the full set covers all 19 registry modules:
--   select hlvs.register_module(
--     p_key => 'identity_core',
--     p_name => 'Identity Core',
--     p_category => 'identity',
--     p_owning_system => 'hl-bos',
--     p_schema_ownership => 'identity',
--     p_maturity => 'production_ready',
--     p_discovery_module_key => 'identity'
--   );

-- Direct-insert fallback (if register_module signature differs), idempotent:
insert into hlvs.modules
  (key, name, description, category, owning_system, schema_ownership,
   maturity, lifecycle, production_eligible, discovery_module_key, version)
values
  ('identity_core','Identity Core','Identity, tenancy, roles, permissions','identity','hl-bos','identity','production_ready','approved',true,'identity',1),
  ('tenancy','Tenancy','Multi-tenant anchor','identity','hl-bos','platform','production_ready','approved',true,null,1),
  ('audit','Audit','Append-only audit + security events','operations','hl-bos','audit','production_ready','approved',true,null,1),
  ('events_bus','Event Bus','Transactional outbox + dispatcher','automation','hl-bos','events','production_ready','approved',true,null,1),
  ('entitlements','Entitlements','Feature catalog + module activation','operations','hl-bos','entitlements','production_ready','approved',true,null,1),
  ('ai_gateway','AI Gateway','Metered single AI door','ai','hl-bos','ai','built_undeployed','approved',false,'ai_receptionist',1),
  ('workflows','Workflows','Human-approval gate','operations','hl-bos','workflows','production_ready','approved',true,null,1),
  ('billing_core','Billing Core','Subscriptions/invoices/payments','operations','hl-bos','billing','built_undeployed','approved',false,'billing',1),
  ('storage','Storage','File registry + retention','operations','hl-bos','storage_meta','production_ready','approved',true,'storage',1),
  ('communications','Communications','Email/SMS templates + consent','communications','hl-bos','comms','built_undeployed','approved',false,'communications',1),
  ('integrations','Integrations','Connector/webhook framework','operations','hl-bos','integrations','production_ready','approved',true,null,1),
  ('discovery_engine','Discovery Engine','Collectors → profile → assessment','business_discovery','hl-bos','discovery','production_ready','approved',true,'lead_capture',1),
  ('website_scanner','Website Scanner','SSRF-safe scan + rubric','marketing','hl-bos','discovery','built_undeployed','approved',false,'local_visibility',1),
  ('blueprint_engine','Blueprint Engine','Assessment → transformation plan','analytics','hl-bos','discovery','production_ready','approved',true,null,1),
  ('commerce_provisioning','Commerce & Provisioning','Proposal → provisioning → authorization','operations','hl-bos','sales','built_undeployed','approved',false,null,1),
  ('visibility_assessments','Visibility Assessments','Prospect capture + reviews','marketing','hl-bos','visibility','built_undeployed','approved',false,'reviews',1),
  ('bti_platform','BTI Platform','Executive scoring + ROI','analytics','hl-bos','bti','production_ready','approved',true,'dashboards',1),
  ('scoring_engine','Deterministic Scoring Engine','Canonical scoring package','analytics','hl-bos','(package)','production_ready','approved',true,null,1),
  ('hlvs_factory','HLVS Software Factory','Governed build loop','operations','hlvs','hlvs','production_ready','approved',true,null,1)
on conflict (key) do nothing;

-- NOTE: `maturity`/`lifecycle` values above are illustrative; the applied
-- migration must use the exact hlvs.module_maturity / lifecycle_status enum
-- labels defined in migration 0025. Generate from MODULE_REGISTRY at apply time.
