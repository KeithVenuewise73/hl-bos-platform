-- ===========================================================================
-- SECURITY PACKAGE A — PROPOSED, NOT APPLIED. Separate approval; NOT part of PR #115's release.
-- 23 SECURITY DEFINER functions are executable by `anon` through the default
-- PUBLIC grant (production, read-only, 2026-11-05). anon has no USAGE on these
-- schemas, so none is reachable today; this removes the latent exposure (e.g.
-- graph.publish_projection, dma.verify_fact) without changing anyone else's
-- access: whoever (authenticated, service_role) can execute now keeps it,
-- re-granted explicitly; only PUBLIC/anon lose it.
-- Deliberately excluded (anon-reachable by design, public schema):
--   public.barberos_published_site, public.barberos_published_sitemap,
--   public.submit_business_transformation_intake — review separately.
-- Rollback: grant execute on function <each> to public;
-- ===========================================================================
do $$
declare f text; r text;
begin
  foreach f in array array[
    'barberos.enforce_locked_config()','barberos.enforce_no_orphan_dependents()','barberos.enforce_prerequisites()',
    'barberos.enforce_publishable()','barberos.require_capability()','disco.render_builder_prompt(uuid)',
    'dma.client_completeness(uuid)','dma.client_fact_stats(uuid)','dma.compute_visibility_score(uuid)',
    'dma.get_client_context(uuid)','dma.get_client_context_by_slug(text)','dma.market_opportunity_map(uuid)',
    'dma.request_recommendation_approval(uuid)','dma.rescore_segment(uuid)','dma.search_opportunity_map(uuid)',
    'dma.verify_fact(text,uuid,text,text)','dma.visibility_opportunity_map(uuid)','graph._active_id()',
    'graph._can_see(text,uuid)','graph._require_manage()','graph.activate_projection(integer)',
    'graph.cleanup_superseded(integer)',
    'graph.publish_projection(integer,text,text,text,boolean,jsonb,jsonb)',
    'graph.record_failed_projection(integer,text,text,jsonb)','graph.rollback_projection()',
    'platform.enforce_tenant_class_managed()','playtime.handle_new_user()',
    'transform_audit.deny_derived_write()','transform_audit.deny_finding_mutation()','transform_audit.enforce_competitor_distinct()',
    'transform_audit.enforce_hook_provenance()','transform_audit.enforce_profile_tenant()','transform_audit.enforce_proposal_honesty()',
    'transform_audit.enforce_proposal_lifecycle()','transform_audit.enforce_verified_has_evidence()']
  loop
    if to_regprocedure(f) is null then raise notice 'skipped (absent): %', f; continue; end if;
    foreach r in array array['authenticated','service_role'] loop
      if has_function_privilege(r, f, 'execute') then execute format('grant execute on function %s to %I', f, r); end if;
    end loop;
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
