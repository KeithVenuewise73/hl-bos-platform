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