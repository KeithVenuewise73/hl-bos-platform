# Applied directly to production (record only — never executed from here)

SQL that was applied to HL-BOS Core (`mvvtngiopdrgiedjmhfb`) outside `supabase/migrations`,
kept byte-for-byte as applied, named by the production migration version it received.
CI and `supabase db reset` never run this directory. It belongs in the production recovery
archive (PR #113) when that is next refreshed.

| Production version | What                                                                       | Evidence                                                           |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20261105185109`   | S-B2: JobScout views → security invoker; anon/authenticated SELECT revoked | `docs/products/growth-intelligence/phase9-execution-results.md` §1 |
