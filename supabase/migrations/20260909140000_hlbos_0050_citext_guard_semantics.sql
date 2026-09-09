-- ===========================================================================
-- hlbos_0050_citext_guard_semantics — forward-repair for 0048 and 0049
--
-- WHAT WENT WRONG
--
-- 0048 and 0049 write their format guards the way every HL-BOS migration
-- before them does:
--
--     key extensions.citext ... check (key ~ '^[a-z][a-z0-9_]{2,63}$')
--
-- That expression does not mean the same thing in every environment, because
-- `~` is resolved from the search_path in force when the constraint is PARSED:
--
--   * Canonical production's search_path is `"$user", public, extensions`, so
--     the citext `~` operator resolves and the match is CASE-INSENSITIVE.
--     `Booking_Upper` PASSES a check that reads as "lowercase only".
--   * The local sandbox harness's search_path is `"$user", public`, so the
--     citext operator does not resolve, the argument falls back to text, and
--     the same match is CASE-SENSITIVE. `Booking_Upper` is REJECTED.
--
-- So the local pgTAP suite proved a stricter guard than production actually
-- has. Verified directly, not inferred:
--
--     select 'Booking_Upper'::extensions.citext ~ '^[a-z][a-z0-9_]{2,63}$'::extensions.citext;  -- t (production)
--     select ('Booking_Upper'::extensions.citext)::text ~ '^[a-z][a-z0-9_]{2,63}$';             -- f
--
-- This is the "control that does not control anything" failure: a constraint
-- that reads as protection stronger than it is. It is also PRE-EXISTING and
-- platform-wide -- 40 CHECK constraints across 16 schemas share the shape.
-- This migration repairs ONLY the five in the two schemas it owns. The other
-- 35 are named in the session report and are a separate, owner-approved
-- change; silently rewriting deployed constraints across the whole platform
-- is not a repair, it is a second incident.
--
-- WHAT IS NOT AFFECTED, and why
--
-- Behaviour driven by the TYPE rather than by operator lookup is identical in
-- both environments -- a citext unique index is case-insensitive in both,
-- confirmed by test. So `shop_profiles_dedupe_unique` never diverged, and the
-- import path's idempotency was never at risk.
--
-- Function bodies are also unaffected: every function in these schemas sets
-- `search_path = ''`, so citext operators do not resolve inside them in EITHER
-- environment and their comparisons are consistently text-based. The
-- divergence is confined to expressions parsed at DDL time -- CHECK
-- constraints and index predicates.
--
-- THE FIX
--
-- Say which semantics are intended, so the guard cannot be re-interpreted by
-- an environment's search_path:
--
--   * The key/code format guards mean LOWERCASE SNAKE CASE. They are cast to
--     text explicitly, making them case-sensitive everywhere.
--   * `capability_requires_not_self` means "a capability cannot require
--     itself". Because the columns are citext foreign keys onto the same
--     citext primary key, `Booking` and `booking` ARE the same row -- so
--     case-INSENSITIVE is the correct reading here, and production was right
--     while the sandbox was wrong. It is made explicit in the other
--     direction, with lower().
--
-- Both repairs are chosen so the two environments agree, and so the pgTAP
-- suite now proves the same thing wherever it runs.
--
-- No data is touched. Every existing row already satisfies both constraints
-- (all seeded keys are lowercase), so ADD CONSTRAINT validates and passes.
--
-- rollback:
--   ALTER TABLE barberos.capabilities        DROP CONSTRAINT IF EXISTS capabilities_key_format;
--   ALTER TABLE barberos.capabilities        ADD  CONSTRAINT capabilities_key_format
--     CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$');
--   ALTER TABLE barberos.bundles             DROP CONSTRAINT IF EXISTS bundles_key_format;
--   ALTER TABLE barberos.bundles             ADD  CONSTRAINT bundles_key_format
--     CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$');
--   ALTER TABLE barberos.capability_requires DROP CONSTRAINT IF EXISTS capability_requires_not_self;
--   ALTER TABLE barberos.capability_requires ADD  CONSTRAINT capability_requires_not_self
--     CHECK (capability_key <> requires_key);
--   ALTER TABLE transform_audit.campaigns    DROP CONSTRAINT IF EXISTS campaigns_key_format;
--   ALTER TABLE transform_audit.campaigns    ADD  CONSTRAINT campaigns_key_format
--     CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$');
--   ALTER TABLE transform_audit.findings     DROP CONSTRAINT IF EXISTS findings_code_format;
--   ALTER TABLE transform_audit.findings     ADD  CONSTRAINT findings_code_format
--     CHECK (code ~ '^[a-z][a-z0-9_]{2,63}$');
--   (Restores the ambient-search_path form. Reverting reinstates the
--    divergence, so this rollback is documented rather than recommended.)
-- ===========================================================================

-- --- barberos.capabilities.key: lowercase snake case, case-SENSITIVE --------
alter table barberos.capabilities
  drop constraint if exists capabilities_key_format;
alter table barberos.capabilities
  add constraint capabilities_key_format
  check ((key)::text ~ '^[a-z][a-z0-9_]{2,63}$');

-- --- barberos.bundles.key ---------------------------------------------------
alter table barberos.bundles
  drop constraint if exists bundles_key_format;
alter table barberos.bundles
  add constraint bundles_key_format
  check ((key)::text ~ '^[a-z][a-z0-9_]{2,63}$');

-- --- barberos.capability_requires: self-reference, case-INSENSITIVE ---------
-- Deliberately the other direction. These are citext foreign keys onto a
-- citext primary key, so 'Booking' and 'booking' resolve to the same catalog
-- row; a self-requirement written with different capitalisation is still a
-- self-requirement, and must still be refused.
alter table barberos.capability_requires
  drop constraint if exists capability_requires_not_self;
alter table barberos.capability_requires
  add constraint capability_requires_not_self
  check (pg_catalog.lower((capability_key)::text)
         <> pg_catalog.lower((requires_key)::text));

-- --- transform_audit.campaigns.key ------------------------------------------
alter table transform_audit.campaigns
  drop constraint if exists campaigns_key_format;
alter table transform_audit.campaigns
  add constraint campaigns_key_format
  check ((key)::text ~ '^[a-z][a-z0-9_]{2,63}$');

-- --- transform_audit.findings.code ------------------------------------------
-- Finding codes are compared across shops and over time. A code that differs
-- only by capitalisation would read as two different findings in a report
-- while being one finding in the catalog.
alter table transform_audit.findings
  drop constraint if exists findings_code_format;
alter table transform_audit.findings
  add constraint findings_code_format
  check ((code)::text ~ '^[a-z][a-z0-9_]{2,63}$');
