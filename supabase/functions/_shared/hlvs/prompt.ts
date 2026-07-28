// Deterministic Claude prompt-package generator (HLVS Factory).
//
// Produces a complete, versioned development package from an APPROVED Software
// Creation Order. It is deterministic (same order → same package) and exports
// plain text, Markdown, and structured JSON. It NEVER invents prices, customer
// acceptance, or architecture approvals; never selects an AI provider; never
// authorizes production; never exposes secrets; never modifies source; and
// never calls Claude. `live_execution` is always false.

export const PROMPT_GENERATOR_VERSION = "hlvs-prompt-0.1.0";

export interface CreationOrderView {
  orderId: string;
  blueprintId: string;
  productKey: string;
  buildScope: {
    modules_reuse?: string[];
    modules_configure?: string[];
    modules_extend?: string[];
    adapters?: string[];
    new_modules_authorized?: string[];
    excluded?: string[];
    prohibited?: string[];
    required_modules?: string[];
  };
  technicalContext: {
    repository?: string;
    branch?: string;
    supabase_project_classification?: string;
    schemas?: string[];
    shared_services?: string[];
  };
  executionPlan: { checkpoints?: { number: number; objective: string }[] };
}

export interface PromptPackage {
  version: string;
  content: Record<string, unknown>;
  textExport: string;
  markdownExport: string;
  jsonExport: Record<string, unknown>;
}

// A prompt package must never carry a secret. This scrubs any accidental value.
function assertNoSecrets(obj: unknown): void {
  const s = JSON.stringify(obj);
  if (/sk-ant-|sb_secret_|sk_live_|whsec_|password\s*[:=]/i.test(s)) {
    throw new Error("prompt_generation_refused:secret_detected");
  }
}

export function generatePromptPackage(order: CreationOrderView): PromptPackage {
  assertNoSecrets(order);
  const scope = order.buildScope ?? {};
  const tech = order.technicalContext ?? {};
  const checkpoints = order.executionPlan?.checkpoints ?? [];

  const content = {
    generator_version: PROMPT_GENERATOR_VERSION,
    architectural_context:
      "HLVS governs software creation; HL-BOS operates production. This is a governed development order.",
    product_objective: { product: order.productKey, blueprint: order.blueprintId },
    mandatory_reuse_analysis: true,
    exact_scope: {
      reuse: scope.modules_reuse ?? [],
      configure: scope.modules_configure ?? [],
      extend: scope.modules_extend ?? [],
      adapters: scope.adapters ?? [],
      new_modules_authorized: scope.new_modules_authorized ?? [],
      required_modules: scope.required_modules ?? [],
    },
    prohibited_duplication: scope.prohibited ?? [],
    excluded_work: scope.excluded ?? [],
    repository_and_branch_restrictions: {
      repository: tech.repository ?? null,
      branch: tech.branch ?? null,
    },
    supabase_hlbos_requirements: {
      project_classification: tech.supabase_project_classification ?? "local_only",
      schemas: tech.schemas ?? [],
      shared_services: tech.shared_services ?? [],
    },
    checkpoint_instructions: checkpoints,
    test_requirements:
      "pgTAP + Deno; run the full repository gate suite; no regressions.",
    required_documentation:
      "reuse analysis + per-checkpoint reports + completion report.",
    human_review_gates: true,
    live_production_restrictions:
      "No production deploy, no migration to the canonical project, no secrets, no external calls.",
    required_completion_report_format: "hlvs.checkpoint_report.v1",
    live_execution: false,
  };
  assertNoSecrets(content);

  const md =
    `# HLVS Prompt Package (${PROMPT_GENERATOR_VERSION})\n\n` +
    `**Product:** ${order.productKey} · **Blueprint:** ${order.blueprintId} · **Order:** ${order.orderId}\n\n` +
    `## Mandatory reuse analysis\nComplete a reuse analysis before writing code.\n\n` +
    `## Exact scope\n` +
    `- Reuse: ${(scope.modules_reuse ?? []).join(", ") || "(none)"}\n` +
    `- Extend: ${(scope.modules_extend ?? []).join(", ") || "(none)"}\n` +
    `- New modules authorized: ${(scope.new_modules_authorized ?? []).join(", ") || "(none)"}\n\n` +
    `## Prohibited duplication\n${(scope.prohibited ?? []).join(", ") || "(none)"}\n\n` +
    `## Repository / branch\n${tech.repository ?? "(unset)"} @ ${tech.branch ?? "(unset)"}\n\n` +
    `## Live production restrictions\nNo production deploy, no canonical migration, no secrets, no external calls. live_execution=false.\n`;

  const text =
    `HLVS PROMPT PACKAGE ${PROMPT_GENERATOR_VERSION}\n` +
    `Product=${order.productKey} Blueprint=${order.blueprintId} Order=${order.orderId}\n` +
    `Mandatory reuse analysis: yes\n` +
    `Prohibited duplication: ${(scope.prohibited ?? []).join(", ") || "(none)"}\n` +
    `Repository: ${tech.repository ?? "(unset)"} Branch: ${tech.branch ?? "(unset)"}\n` +
    `live_execution: false\n`;

  return {
    version: PROMPT_GENERATOR_VERSION,
    content,
    textExport: text,
    markdownExport: md,
    jsonExport: content,
  };
}
