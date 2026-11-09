-- S-B2 (owner-authorized, Phase 9). Closes public (anon) read access to the JobScout
-- shortlist and run reports. Only the two views change; no data, function or auth flow.
-- Rollback:
--   alter view jobscout.v_shortlist reset (security_invoker);
--   alter view jobscout.v_last_runs reset (security_invoker);
--   grant select on jobscout.v_shortlist, jobscout.v_last_runs to anon;
alter view jobscout.v_shortlist set (security_invoker = true);
alter view jobscout.v_last_runs set (security_invoker = true);
revoke select on jobscout.v_shortlist, jobscout.v_last_runs from anon, authenticated;
