-- hlbos_0120_salon_extensions — btree_gist, needed for the no-double-booking exclusion constraint.
-- Kept in its own file so the extension enable can be reviewed/approved separately.
-- rollback: drop extension btree_gist (only if no other object uses it).
create extension if not exists btree_gist with schema extensions;
