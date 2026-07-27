// discovery-blueprint-worker — the Business Transformation Blueprint runtime.
//
// STATUS: STRUCTURAL SCAFFOLDING, not deployed. Nothing here runs against a
// remote project or a live AI provider in Checkpoint 6. It documents the exact
// production wiring and reuses the shared, fully-tested pieces:
//
//   * events.claim_deliveries / events.complete_delivery — the CP5 SHARED
//     dispatcher handler-invocation (migration 0021). This worker is one more
//     handler; no new queue or worker framework is introduced.
//   * discovery.start_blueprint_generation / add_blueprint_section /
//     add_blueprint_finding / recommend / add_roadmap_item /
//     add_impact_estimate / mark_blueprint_generated — the blueprint RPCs
//     (migration 0023, validated by supabase/tests/25_blueprint_engine.sql).
//   * assembleBlueprint (../_shared/blueprint/assemble.ts) — the deterministic,
//     AI-non-blocking assembler (validated by ../tests/blueprint_engine.test.ts).
//
// The deterministic assembler is exercised directly by the local test suite; it
// needs no deployment to be proven. This worker only adds production plumbing,
// inert until a separate, explicitly CEO-authorized deployment checkpoint. The
// AI narrative uses the shared ai-gateway (mock locally); an AI failure yields a
// partially_generated blueprint — it never blocks the deterministic plan, and
// it can NEVER approve a blueprint (approval is a human, workflow-gated step).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assembleBlueprint } from "../_shared/blueprint/assemble.ts";

const HANDLER_REF = "discovery-blueprint-worker";

interface BlueprintDelivery {
  delivery_id: number;
  payload: { blueprint: string; assessment: string; version?: number };
}

// Inputs (evidence, scores, catalogs, rules) are loaded from the DB in a
// deployed build; a real AI `analyze` adapter routes through the ai-gateway.
type Loaded = Parameters<typeof assembleBlueprint>[0];

export async function handleDelivery(
  admin: ReturnType<typeof createClient>,
  delivery: BlueprintDelivery,
  load: (assessmentId: string) => Promise<Loaded>,
): Promise<void> {
  const { blueprint, assessment } = delivery.payload;
  try {
    await admin
      .schema("discovery")
      .rpc("start_blueprint_generation", { p_blueprint: blueprint });
    const draft = await assembleBlueprint(await load(assessment));

    await admin.schema("discovery").rpc("add_blueprint_section", {
      p_blueprint: blueprint,
      p_kind: "current_state",
      p_content: { title: "Current State", dimensions: draft.currentState },
      p_origin: "deterministic",
    });
    for (const f of draft.findings) {
      await admin.schema("discovery").rpc("add_blueprint_finding", {
        p_blueprint: blueprint,
        p_category: f.category,
        p_title: f.title,
        p_severity: f.severity,
        p_attrs: {
          urgency: f.urgency,
          confidence: f.confidence,
          origin: f.origin,
          evidence_refs: f.evidenceRefs,
          affected_dimensions: f.affectedDimensions,
        },
      });
    }
    for (const r of draft.recommendations) {
      await admin.schema("discovery").rpc("recommend", {
        p_blueprint: blueprint,
        p_kind: r.kind,
        p_title: r.title,
        p_attrs: {
          origin: r.origin,
          service_key: r.serviceKey,
          module_key: r.moduleKey,
          rule_key: r.ruleKey,
          rule_version: r.ruleVersion,
          severity: r.severity,
          priority_band: r.priorityBandResolved,
          effort_band: r.effortBand,
          cost_band: r.costBand,
          confidence: r.confidence,
          evidence_refs: r.evidenceRefs,
          affected_dimensions: r.affectedDimensions,
          dedupe_group: r.dedupeGroup,
        },
      });
    }
    for (const item of draft.roadmap) {
      await admin.schema("discovery").rpc("add_roadmap_item", {
        p_blueprint: blueprint,
        p_sequence: item.sequence,
        p_phase: item.phaseKey,
        p_objective: item.objective,
        p_attrs: {
          recommended_action: item.recommendedAction,
          estimated_effort: item.estimatedEffort,
          dependencies: item.dependsOnSequences,
        },
      });
    }
    for (const im of draft.impacts) {
      await admin.schema("discovery").rpc("add_impact_estimate", {
        p_blueprint: blueprint,
        p_category: im.category,
        p_assumption: im.assumption,
        p_input_source: im.inputSource,
        p_attrs: {
          calculation_method: im.calculationMethod,
          scenario_low: im.scenarioLow,
          scenario_expected: im.scenarioExpected,
          scenario_high: im.scenarioHigh,
          confidence: im.confidence,
          illustrative: im.illustrative,
          caveats: im.caveats,
        },
      });
    }

    await admin.schema("discovery").rpc("mark_blueprint_generated", {
      p_blueprint: blueprint,
      p_partial: draft.partial, // AI failure ⇒ partially_generated; deterministic plan stands
      p_rule_version: draft.ruleVersion,
      p_priority_model_version: draft.priorityModelVersion,
      p_impact_model_version: draft.impactModelVersion,
    });

    await admin.schema("events").rpc("complete_delivery", {
      p_delivery: delivery.delivery_id,
      p_success: true,
      p_error: null,
    });
  } catch (e) {
    await admin.schema("events").rpc("complete_delivery", {
      p_delivery: delivery.delivery_id,
      p_success: false,
      p_error: `worker_error:${String(e).slice(0, 200)}`,
    });
  }
}

// Production entrypoint. Scheduled invocation (CEO-gated pg_cron → pg_net) is
// off; no loader/AI adapters are wired here, so this processes nothing.
Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: claimed, error } = await admin
    .schema("events")
    .rpc("claim_deliveries", { p_handler_ref: HANDLER_REF, p_limit: 3 });
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(
    JSON.stringify({
      claimed: (claimed as unknown[])?.length ?? 0,
      processed: 0,
      note: "inert: loader/ai not wired",
    }),
    { headers: { "content-type": "application/json" } },
  );
});

export { HANDLER_REF };
