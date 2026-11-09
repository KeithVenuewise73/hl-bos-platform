-- ===========================================================================
-- SECURITY PACKAGE C — PROPOSED, NOT APPLIED. Separate approval.
-- Six functions have a role-mutable search_path (Supabase advisor 0011). Pin
-- each to the search_path production sessions use today, so name resolution
-- is unchanged but can no longer be redirected by a caller; pg_temp last.
-- Rollback: alter function … reset search_path;
-- ===========================================================================
alter function disco.assert_weights_total()                          set search_path = public, extensions, pg_temp;
alter function disco.compute_opportunity_score(jsonb, numeric)       set search_path = public, extensions, pg_temp;
alter function disco.counter_evidence_penalty(uuid)                  set search_path = public, extensions, pg_temp;
alter function disco.derive_search_pattern(text)                     set search_path = public, extensions, pg_temp;
alter function hlvs.non_exceptionable_rules()                        set search_path = public, extensions, pg_temp;
alter function vstudio.portfolio_domain_value(text, text, jsonb)     set search_path = public, extensions, pg_temp;
