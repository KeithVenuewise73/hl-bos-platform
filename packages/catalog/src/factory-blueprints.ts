/**
 * Factory Assembly Blueprints + the 12-step Factory Order Process (Factory
 * Execution Phase, CP4/CP5).
 *
 * This is the reasoning layer the Factory promises: given a product idea and the
 * capabilities it needs, resolve each need to the BEST available implementation
 * across every source platform, decide reuse / reuse-cross-platform / extend /
 * net-new, and emit a deterministic assembly blueprint plus the commercialization
 * layers the assembled product could support.
 *
 * It REUSES the existing assembler where the product is pure-HL-BOS: `factory.ts`
 * `assembleProduct` still answers "is this buildable from HL-BOS modules today".
 * This file adds the CROSS-PLATFORM view the single-platform assembler can't.
 *
 * Nothing is asserted. `assemblableFromExisting` is true only when every required
 * capability resolves to a built implementation on some platform. Net-new work is
 * counted, never hidden (Principle 10).
 */

import {
  CAPABILITY_IMPLEMENTATIONS,
  findImplementations,
  platformsProviding,
  independentlySellable,
  implementationsSupportingLayer,
  mostMatureImplementation,
  type CapabilityImplementation,
  type CommercializationLayer,
  type ImplMaturity,
  type SourcePlatformId,
} from "./factory-registry";

// ==========================================================================
// The 12-step Factory Order Process
// ==========================================================================

export interface FactoryOrderStep {
  step: number;
  name: string;
  description: string;
  /** The existing HL-BOS mechanism that performs this step (reuse, not rebuild). */
  mechanism: string;
  /** A human gate is required to pass this step. */
  gated: boolean;
}

export const FACTORY_ORDER_PROCESS: FactoryOrderStep[] = [
  {
    step: 1,
    name: "Capture product idea",
    description: "Record the product idea, its market, and the capabilities it needs.",
    mechanism: "FactoryProductSpec (this module)",
    gated: false,
  },
  {
    step: 2,
    name: "Reuse-before-rebuild check",
    description:
      "Run each proposed capability through the deterministic duplicate check to avoid rebuilding what exists.",
    mechanism: "capability-reuse.ts evaluateReuse/duplicateCheck",
    gated: false,
  },
  {
    step: 3,
    name: "Resolve capabilities to implementations",
    description:
      "For each required capability, find the best implementation across all source platforms.",
    mechanism: "factory-registry.ts findImplementations / mostMatureImplementation",
    gated: false,
  },
  {
    step: 4,
    name: "Classify each slot",
    description:
      "Reuse (HL-BOS) · reuse cross-platform (e.g. Venuewise) · extend · net-new.",
    mechanism: "resolveCapabilitySlot (this module)",
    gated: false,
  },
  {
    step: 5,
    name: "Identify net-new work",
    description:
      "List capabilities with no built implementation anywhere — the real build queue.",
    mechanism: "FactoryAssemblyBlueprint.netNewCapabilities",
    gated: false,
  },
  {
    step: 6,
    name: "Single-platform assembly check",
    description:
      "If the product targets HL-BOS only, confirm buildability from HL-BOS modules today.",
    mechanism: "factory.ts assembleProduct (reused)",
    gated: false,
  },
  {
    step: 7,
    name: "Determine commercialization layers",
    description: "Compute which of L1–L5 the assembled product could support.",
    mechanism: "FactoryAssemblyBlueprint.commercializationLayers",
    gated: false,
  },
  {
    step: 8,
    name: "Resolve cross-platform decisions",
    description:
      "For any capability drawn from a non-canonical platform, record adopt / port / re-implement.",
    mechanism: "contestedCapabilities + canonicalDecision",
    gated: true,
  },
  {
    step: 9,
    name: "CEO commercialization approval",
    description:
      "Set pricing, licensing, ownership, and the launch layer — a CEO decision.",
    mechanism: "compositions.ts CommercialMetadata (pending-ceo)",
    gated: true,
  },
  {
    step: 10,
    name: "Create the build order",
    description:
      "Emit the governed creation order for net-new work through the Software Factory.",
    mechanism: "hlvs_factory (software_factory capability)",
    gated: true,
  },
  {
    step: 11,
    name: "Assemble & deploy",
    description:
      "Provision on the HL-BOS spine, activate modules, apply industry template, deploy.",
    mechanism: "factory.ts blueprint + app-registry.ts + gated db-migrate",
    gated: true,
  },
  {
    step: 12,
    name: "Return to catalog",
    description:
      "Register anything net-new as a new capability implementation so the next product reuses it.",
    mechanism: "factory-registry.ts (register new CapabilityImplementation)",
    gated: true,
  },
];

// ==========================================================================
// Cross-platform assembly blueprint
// ==========================================================================

export type Market = "logistics" | "service" | "sports" | "consulting";

export interface FactoryProductSpec {
  productKey: string;
  name: string;
  market: Market;
  /** Where the product will deploy (the canonical platform by default). */
  targetPlatform: SourcePlatformId;
  /** Capability terms the product needs (matched via findImplementations). */
  requiredCapabilities: string[];
  /** Capabilities the team already knows are net-new (no implementation anywhere). */
  knownNetNew?: string[];
}

export type SlotDisposition =
  | "reuse" // built on the target platform
  | "reuse_cross_platform" // built on another platform; adopt/port/reference
  | "extend" // exists but only partial/needs work
  | "net_new"; // no built implementation anywhere

export interface ResolvedCapabilitySlot {
  requested: string;
  disposition: SlotDisposition;
  platform: SourcePlatformId | null;
  maturity: ImplMaturity | "net_new";
  implementationId: string | null;
  crossPlatform: boolean;
  note: string;
}

export interface FactoryAssemblyBlueprint {
  productKey: string;
  name: string;
  market: Market;
  targetPlatform: SourcePlatformId;
  slots: ResolvedCapabilitySlot[];
  reuseCount: number;
  crossPlatformCount: number;
  extendCount: number;
  netNewCount: number;
  netNewCapabilities: string[];
  /** True iff every required capability resolves to a built implementation somewhere. */
  assemblableFromExisting: boolean;
  /** Layers the assembled product could support (intersection is not required; union of slots). */
  commercializationLayers: CommercializationLayer[];
  /** Ordered, deterministic assembly narrative. */
  steps: string[];
}

const BUILT: ReadonlySet<ImplMaturity> = new Set<ImplMaturity>([
  "production",
  "functional",
  "partial",
]);

function resolveCapabilitySlot(
  requested: string,
  targetPlatform: SourcePlatformId,
  knownNetNew: Set<string>,
): ResolvedCapabilitySlot {
  if (knownNetNew.has(requested.toLowerCase())) {
    return {
      requested,
      disposition: "net_new",
      platform: null,
      maturity: "net_new",
      implementationId: null,
      crossPlatform: false,
      note: "Declared net-new: no implementation exists on any platform.",
    };
  }

  const hits = findImplementations(requested).filter((i) => BUILT.has(i.maturity));
  if (hits.length === 0) {
    return {
      requested,
      disposition: "net_new",
      platform: null,
      maturity: "net_new",
      implementationId: null,
      crossPlatform: false,
      note: "No built implementation found on any platform — net-new work.",
    };
  }

  // Prefer the target platform; otherwise the most-mature cross-platform impl.
  const onTarget = hits
    .filter((i) => i.platform === targetPlatform)
    .sort((a, b) => rank(b.maturity) - rank(a.maturity))[0];
  const chosen =
    onTarget ?? hits.slice().sort((a, b) => rank(b.maturity) - rank(a.maturity))[0];

  // `hits` is non-empty here (net-new returned above), so `chosen` is defined;
  // this guard satisfies the type checker without changing behavior.
  if (!chosen) {
    return {
      requested,
      disposition: "net_new",
      platform: null,
      maturity: "net_new",
      implementationId: null,
      crossPlatform: false,
      note: "No built implementation found on any platform — net-new work.",
    };
  }

  const crossPlatform = chosen.platform !== targetPlatform;
  const disposition: SlotDisposition = crossPlatform
    ? "reuse_cross_platform"
    : chosen.maturity === "partial"
      ? "extend"
      : "reuse";

  return {
    requested,
    disposition,
    platform: chosen.platform,
    maturity: chosen.maturity,
    implementationId: chosen.id,
    crossPlatform,
    note: crossPlatform
      ? `Built on ${chosen.platform} (${chosen.maturity}); adopt/port/reference — cross-platform decision required.`
      : chosen.maturity === "partial"
        ? `Exists on ${chosen.platform} but partial — extend before launch.`
        : `Reuse ${chosen.platform} implementation (${chosen.maturity}).`,
  };
}

function rank(m: ImplMaturity): number {
  const R: Record<ImplMaturity, number> = {
    production: 5,
    functional: 4,
    partial: 3,
    planned: 1,
    unknown: 0,
    retired: 0,
  };
  return R[m];
}

export function assembleBlueprint(spec: FactoryProductSpec): FactoryAssemblyBlueprint {
  const knownNetNew = new Set((spec.knownNetNew ?? []).map((s) => s.toLowerCase()));
  const slots = spec.requiredCapabilities.map((r) =>
    resolveCapabilitySlot(r, spec.targetPlatform, knownNetNew),
  );

  const reuseCount = slots.filter((s) => s.disposition === "reuse").length;
  const crossPlatformCount = slots.filter(
    (s) => s.disposition === "reuse_cross_platform",
  ).length;
  const extendCount = slots.filter((s) => s.disposition === "extend").length;
  const netNew = slots.filter((s) => s.disposition === "net_new");
  const netNewCapabilities = netNew.map((s) => s.requested);
  const assemblableFromExisting = netNew.length === 0;

  // Commercialization layers: the layers common to all resolved (built) slots —
  // a product can only be sold at a layer every one of its capabilities supports.
  const builtSlots = slots.filter((s) => s.implementationId !== null);
  const layerSets = builtSlots
    .map((s) => CAPABILITY_IMPLEMENTATIONS.find((i) => i.id === s.implementationId))
    .filter((i): i is CapabilityImplementation => i !== undefined)
    .map((i) => new Set(i.commercializationLayers));
  const allLayers: CommercializationLayer[] = ["L1", "L2", "L3", "L4", "L5"];
  const commercializationLayers =
    layerSets.length === 0
      ? []
      : allLayers.filter((L) => layerSets.every((set) => set.has(L)));

  const steps: string[] = [
    `1. Provision the product tenant on ${spec.targetPlatform} (the canonical spine).`,
    `2. Reuse (${reuseCount}) HL-BOS implementations: ${slotList(slots, "reuse")}.`,
    crossPlatformCount > 0
      ? `3. Cross-platform (${crossPlatformCount}) — adopt/port from another platform: ${slotList(slots, "reuse_cross_platform")}.`
      : `3. No cross-platform capabilities required.`,
    extendCount > 0
      ? `4. Extend (${extendCount}) partial implementations: ${slotList(slots, "extend")}.`
      : `4. No partial implementations to extend.`,
    netNew.length > 0
      ? `5. ⚠️ Net-new (${netNew.length}) — must be built: ${netNewCapabilities.join(", ")}.`
      : `5. ✅ No net-new capabilities — assemblable entirely from existing implementations.`,
    `6. Commercialization layers supported by the whole product: ${commercializationLayers.join(", ") || "none (a required capability supports no shared layer)"}.`,
    `7. Return any net-new capability to the Factory registry so the next product reuses it.`,
  ];

  return {
    productKey: spec.productKey,
    name: spec.name,
    market: spec.market,
    targetPlatform: spec.targetPlatform,
    slots,
    reuseCount,
    crossPlatformCount,
    extendCount,
    netNewCount: netNew.length,
    netNewCapabilities,
    assemblableFromExisting,
    commercializationLayers,
    steps,
  };
}

function slotList(
  slots: ResolvedCapabilitySlot[],
  disposition: SlotDisposition,
): string {
  const list = slots
    .filter((s) => s.disposition === disposition)
    .map((s) => s.requested);
  return list.length ? list.join(", ") : "none";
}

// ==========================================================================
// The three market blueprints (+ HockeyIQ) — the DoD demonstration set
// ==========================================================================

export const MARKET_BLUEPRINTS: FactoryProductSpec[] = [
  {
    productKey: "transportation_ai",
    name: "TransportationAI (Logistics)",
    market: "logistics",
    targetPlatform: "hlbos_core",
    requiredCapabilities: [
      "identity",
      "billing",
      "business discovery",
      "deterministic scoring",
      "communications",
      "route assessment",
    ],
    knownNetNew: ["route assessment"],
  },
  {
    productKey: "salon_ai",
    name: "SalonAI (Service)",
    market: "service",
    targetPlatform: "hlbos_core",
    requiredCapabilities: [
      "identity",
      "billing",
      "scheduling",
      "communications",
      "reputation",
      "digital visibility",
      "ai receptionist",
    ],
    knownNetNew: ["ai receptionist"],
  },
  {
    productKey: "venuewise_sports",
    name: "Venuewise Sports (Sports)",
    market: "sports",
    targetPlatform: "hlbos_core",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "payments",
      "family management",
      "athlete development",
      "coach management",
      "team roster",
      "facility booking",
      "media operation",
    ],
  },
  {
    productKey: "hockey_iq",
    name: "HockeyIQ (Sports)",
    market: "sports",
    targetPlatform: "hlbos_core",
    requiredCapabilities: [
      "identity",
      "scheduling",
      "messaging",
      "payments",
      "team roster",
      "athlete development",
      "coach management",
      "facility booking",
      "hockey analytics engine",
      "player development index",
    ],
    knownNetNew: ["hockey analytics engine", "player development index"],
  },
];

export function allMarketBlueprints(): FactoryAssemblyBlueprint[] {
  return MARKET_BLUEPRINTS.map(assembleBlueprint);
}

// ==========================================================================
// CP5 — the seven validation questions, answered in code
// ==========================================================================

export interface FactoryValidation {
  q1_crmProviders: Array<{
    platform: SourcePlatformId;
    maturity: ImplMaturity;
    label: string;
  }>;
  q2_billingImplementations: Array<{
    id: string;
    platform: SourcePlatformId;
    maturity: ImplMaturity;
  }>;
  q3_matureScheduling: { platform: SourcePlatformId; maturity: ImplMaturity } | null;
  q4_hockeyAvailableCapabilities: string[];
  q5_hockeyNetNew: string[];
  q6_independentlySellable: string[];
  q7_layerSupport: Record<CommercializationLayer, string[]>;
}

/** Run all seven validation questions against the live registry. */
export function factoryValidation(): FactoryValidation {
  const crm = platformsProviding("crm");

  const billing = findImplementations("billing").map((i) => ({
    id: i.id,
    platform: i.platform,
    maturity: i.maturity,
  }));

  const sched = mostMatureImplementation("scheduling");
  const q3 = sched ? { platform: sched.platform, maturity: sched.maturity } : null;

  const hockey = assembleBlueprint(
    MARKET_BLUEPRINTS.find((b) => b.productKey === "hockey_iq")!,
  );
  const available = hockey.slots
    .filter((s) => s.disposition !== "net_new")
    .map((s) => `${s.requested} (${s.platform}, ${s.maturity})`);

  const sellable = [
    ...new Set(independentlySellable().map((i) => i.capabilityLabel)),
  ].sort();

  const layers: CommercializationLayer[] = ["L1", "L2", "L3", "L4", "L5"];
  const q7 = {} as Record<CommercializationLayer, string[]>;
  for (const L of layers) {
    q7[L] = [
      ...new Set(implementationsSupportingLayer(L).map((i) => i.capabilityLabel)),
    ].sort();
  }

  return {
    q1_crmProviders: crm,
    q2_billingImplementations: billing,
    q3_matureScheduling: q3,
    q4_hockeyAvailableCapabilities: available,
    q5_hockeyNetNew: hockey.netNewCapabilities,
    q6_independentlySellable: sellable,
    q7_layerSupport: q7,
  };
}
