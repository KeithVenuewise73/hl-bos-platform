/**
 * Software Factory — assembler + executive readiness.
 *
 * The assembler answers the mission's core question: can a product be assembled
 * ENTIRELY from registered modules? It resolves a product's required modules
 * against the registry, reports which are built vs missing, computes a
 * foundation-readiness %, and emits a deterministic Factory Assembly Blueprint.
 *
 * Everything is counted, never asserted. `assemblable` is true only when every
 * required module is registered AND built.
 */

import { MODULE_REGISTRY, moduleByKey, moduleIsBuilt } from "./modules";
import {
  PRODUCT_COMPOSITIONS,
  sharedSpineOf,
  type ProductComposition,
} from "./compositions";

export interface ResolvedModule {
  key: string;
  name: string;
  maturity: string;
  built: boolean;
  /** True if the key isn't in the registry at all. */
  unregistered: boolean;
}

export interface AssemblyResult {
  productKey: string;
  name: string;
  requiredCount: number;
  builtCount: number;
  sharedSpineCount: number;
  resolved: ResolvedModule[];
  missingModules: string[];
  unregisteredModules: string[];
  /** True iff every required module is registered and built. */
  assemblable: boolean;
  foundationReadinessPct: number;
  /** Deterministic, ordered assembly steps. */
  blueprint: string[];
  deploymentRequirements: string[];
}

export function assembleProduct(c: ProductComposition): AssemblyResult {
  const resolved: ResolvedModule[] = c.requiredModules.map((key) => {
    const m = moduleByKey(key);
    if (!m) {
      return {
        key,
        name: key,
        maturity: "unregistered",
        built: false,
        unregistered: true,
      };
    }
    return {
      key,
      name: m.name,
      maturity: m.maturity,
      built: moduleIsBuilt(m),
      unregistered: false,
    };
  });

  const unregisteredModules = resolved.filter((r) => r.unregistered).map((r) => r.key);
  const missingModules = resolved.filter((r) => !r.built).map((r) => r.key);
  const builtCount = resolved.filter((r) => r.built).length;
  const assemblable = missingModules.length === 0 && unregisteredModules.length === 0;

  const spine = sharedSpineOf(c);
  const productModules = c.requiredModules.filter((k) => !spine.includes(k));

  const blueprint: string[] = [
    `1. Provision tenant on the shared spine (${spine.length} shared modules: ${spine.join(", ")}).`,
    `2. Activate product modules (${productModules.join(", ") || "none"}).`,
    c.industryTemplate
      ? `3. Apply industry template "${c.industryTemplate}".`
      : `3. (No industry template.)`,
    `4. Configure edition "${c.edition}" + entitlements.`,
    `5. Wire AI services (${c.aiServices.join(", ") || "none"}) through the gateway.`,
    `6. Deploy: ${c.deploymentRequirements.join("; ")}.`,
    assemblable
      ? `7. ✅ Every required module is built — no new foundational module needed. Remaining work is composition/config/UI.`
      : `7. ⚠️ Blocked: ${missingModules.join(", ")} not built/registered.`,
  ];

  return {
    productKey: c.productKey,
    name: c.name,
    requiredCount: c.requiredModules.length,
    builtCount,
    sharedSpineCount: spine.length,
    resolved,
    missingModules,
    unregisteredModules,
    assemblable,
    foundationReadinessPct:
      c.requiredModules.length === 0
        ? 0
        : Math.round((builtCount / c.requiredModules.length) * 100),
    blueprint,
    deploymentRequirements: c.deploymentRequirements,
  };
}

export function assembleAll(): AssemblyResult[] {
  return PRODUCT_COMPOSITIONS.map(assembleProduct);
}

// ==========================================================================
// Executive readiness (Objective 6)
// ==========================================================================

export interface FactoryChecklistItem {
  capability: string;
  /** 1 = in place, 0.5 = code-done/gated, 0 = not done. */
  score: number;
  note: string;
}

/** The Software Factory core-capability checklist (from Phase III, updated). */
export const FACTORY_CHECKLIST: FactoryChecklistItem[] = [
  {
    capability: "Catalog of owned assets",
    score: 1,
    note: "hlvs.* + Enterprise Catalog",
  },
  { capability: "Duplicate-risk prevention", score: 1, note: "hlvs.duplicate_check" },
  {
    capability: "Blueprint → creation order → prompt package",
    score: 1,
    note: "migration 0025",
  },
  {
    capability: "Governed development run tracking",
    score: 1,
    note: "hlvs.development_runs",
  },
  { capability: "Conformance validation", score: 1, note: "deterministic engine" },
  {
    capability: "Readiness gate → build package → intake",
    score: 1,
    note: "hlvs factory tables",
  },
  { capability: "Shared spine to assemble from", score: 1, note: "14 domains live" },
  { capability: "Human approval gates", score: 1, note: "workflows" },
  {
    capability: "Reuse governance surface (catalog)",
    score: 1,
    note: "Phase II console",
  },
  {
    capability: "Assembler + product compositions",
    score: 1,
    note: "Phase IV (this package)",
  },
  {
    capability: "Engineering module registry populated",
    score: 0.5,
    note: "populated in code (this package); DB seed proposed, awaiting approval",
  },
  {
    capability: "Runtime switched on",
    score: 0,
    note: "0 edge functions deployed — CEO/ops gate",
  },
  {
    capability: "Development agent wired",
    score: 0,
    note: "external_execution off — CEO decision",
  },
  {
    capability: "Commercial terms set (pricing/licensing/ownership)",
    score: 0,
    note: "pending-ceo",
  },
  { capability: "Reporting on factory output", score: 0, note: "no reporting service" },
];

export interface ExecutiveReadiness {
  platformCompletionPct: number;
  factoryCompletionPct: number;
  commercialReadinessPct: number;
  moduleCounts: { total: number; live: number; builtUndeployed: number; other: number };
  productsReadyForLaunch: string[];
  productsAssemblable: number;
  remainingCriticalWork: string[];
}

export function executiveReadiness(): ExecutiveReadiness {
  const total = MODULE_REGISTRY.length;
  const live = MODULE_REGISTRY.filter((m) => m.maturity === "live").length;
  const builtUndeployed = MODULE_REGISTRY.filter(
    (m) => m.maturity === "built_undeployed",
  ).length;
  const other = total - live - builtUndeployed;

  // Platform completion: live = 1.0, built-undeployed = 0.75 (code done, needs runtime).
  const platformCompletionPct = Math.round(
    ((live + builtUndeployed * 0.75) / total) * 100,
  );

  const factoryScore = FACTORY_CHECKLIST.reduce((s, i) => s + i.score, 0);
  const factoryCompletionPct = Math.round(
    (factoryScore / FACTORY_CHECKLIST.length) * 100,
  );

  const assemblies = assembleAll();
  const productsAssemblable = assemblies.filter((a) => a.assemblable).length;
  const readyForLaunch = PRODUCT_COMPOSITIONS.filter(
    (c) => c.commercial.commercialAvailability === "ready_to_launch",
  ).map((c) => c.name);

  // Commercial readiness is GATED by terms being set. No product has terms set
  // (all pending-ceo), so commercial readiness is deliberately low regardless of
  // how assemblable the products are. We do not flatter this number.
  const termsSet = PRODUCT_COMPOSITIONS.filter(
    (c) => c.commercial.pricing.status === "set",
  ).length;
  const commercialReadinessPct = Math.round(
    (termsSet / PRODUCT_COMPOSITIONS.length) * 100,
  );

  const remainingCriticalWork = [
    "Grant the Anthropic key + deploy the edge runtime (gateway, dispatcher, workers, scheduler) — CEO/ops gate.",
    "Set pricing, licensing, and module ownership — CEO decision (blocks all commercial readiness).",
    "Implement the Stripe adapter + deploy the billing webhook.",
    "Approve & apply the module-registry seed migration (persist hlvs.modules).",
    "Decide development-agent wiring (governed vs automated builds).",
    "Build the reporting/analytics shared service.",
  ];

  return {
    platformCompletionPct,
    factoryCompletionPct,
    commercialReadinessPct,
    moduleCounts: { total, live, builtUndeployed, other },
    productsReadyForLaunch: readyForLaunch,
    productsAssemblable,
    remainingCriticalWork,
  };
}
