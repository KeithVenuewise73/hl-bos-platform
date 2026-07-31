/**
 * THE AI MARKETING STUDIO — orchestration architecture (Execution Phase 3A).
 *
 * The Studio is ONE capability inside Herman Legacy Marketing. Its job is to
 * ORCHESTRATE best-in-class AI generation through the existing, metered AI Gateway
 * — never to build foundational generation models. Every generation call is routed
 * through the Gateway (the single guard-railed door), gated by the existing
 * approval workflow, and reviewed by a human before anything publishes.
 *
 * DEFERRED BY DESIGN (Principle 10 + the brief): NO external providers are
 * implemented here. Each generation capability is declared with `provider:
 * "deferred"` — the integration point exists, the wiring does not, and it awaits
 * explicit CEO approval before any external AI provider is connected.
 */

export type StudioProviderStatus = "deferred"; // no external providers wired yet

export interface GenerationCapability {
  kind: "script" | "image" | "video" | "voice" | "caption";
  purpose: string;
  /** Every generation call is metered + guard-railed through the existing gateway. */
  routedThroughGateway: true;
  /** Backing catalog capability that meters the call. */
  gatewayAsset: string;
  provider: StudioProviderStatus;
  note: string;
}

/** The five generation capabilities the Studio orchestrates (providers deferred). */
export const GENERATION_CAPABILITIES: GenerationCapability[] = [
  {
    kind: "script",
    purpose: "Generate scripts / copy for content.",
    routedThroughGateway: true,
    gatewayAsset: "ai.gateway-runtime",
    provider: "deferred",
    note: "Text model via gateway (deferred).",
  },
  {
    kind: "image",
    purpose: "Generate images / graphics.",
    routedThroughGateway: true,
    gatewayAsset: "ai.gateway-runtime",
    provider: "deferred",
    note: "Image model via gateway (deferred).",
  },
  {
    kind: "video",
    purpose: "Generate / assemble short and long video.",
    routedThroughGateway: true,
    gatewayAsset: "ai.gateway-runtime",
    provider: "deferred",
    note: "Video model via gateway (deferred).",
  },
  {
    kind: "voice",
    purpose: "Generate voiceover / narration.",
    routedThroughGateway: true,
    gatewayAsset: "ai.gateway-runtime",
    provider: "deferred",
    note: "Voice model via gateway (deferred).",
  },
  {
    kind: "caption",
    purpose: "Generate captions / subtitles / hashtags.",
    routedThroughGateway: true,
    gatewayAsset: "ai.gateway-runtime",
    provider: "deferred",
    note: "Text model via gateway (deferred).",
  },
];

export type IntegrationStatus = "existing" | "net_new" | "deferred";

export interface StudioIntegration {
  point: string;
  backing: string;
  status: IntegrationStatus;
}

/** The non-generation orchestration integration points, each to an existing system. */
export const STUDIO_INTEGRATIONS: StudioIntegration[] = [
  {
    point: "Content scheduling",
    backing: "Scheduling (Venuewise, cross-platform)",
    status: "existing",
  },
  {
    point: "Publishing",
    backing: "Integrations framework + channel connectors (net-new connectors)",
    status: "net_new",
  },
  {
    point: "Analytics",
    backing: "Analytics (Venuewise) + Reporting (BTI dashboards)",
    status: "existing",
  },
  {
    point: "Approval workflows",
    backing: "Workflows human-approval gate",
    status: "existing",
  },
  {
    point: "Human review",
    backing: "Workflows tasks + reviewer roles",
    status: "existing",
  },
  {
    point: "AI generation",
    backing: "AI Gateway (metered door) → external providers",
    status: "deferred",
  },
];

export interface StudioArchitecture {
  generation: GenerationCapability[];
  integrations: StudioIntegration[];
  /** The deterministic orchestration flow (brief → generate → assemble → review → publish → measure). */
  orchestrationFlow: string[];
  externalProvidersWired: boolean;
  existingIntegrations: number;
  netNewIntegrations: number;
  deferredIntegrations: number;
  summary: string;
}

/** The AI Marketing Studio orchestration architecture (deliverable 3). */
export function aiMarketingStudioArchitecture(): StudioArchitecture {
  const orchestrationFlow = [
    "1. Brief — objective, audience, message, channel (from a campaign).",
    "2. Generate — script/image/video/voice/caption via the AI Gateway (providers deferred).",
    "3. Assemble — compose generated assets into a channel-ready piece.",
    "4. Human review — reviewer task in the existing workflow engine.",
    "5. Approve — human-approval gate (nothing publishes without it).",
    "6. Schedule — content scheduling (Venuewise).",
    "7. Publish — channel connectors (net-new) — DEFERRED until CEO approval.",
    "8. Measure — analytics + reporting feed the Growth Dashboard.",
  ];
  return {
    generation: GENERATION_CAPABILITIES,
    integrations: STUDIO_INTEGRATIONS,
    orchestrationFlow,
    // Honesty: no external AI provider is wired. The architecture is defined; the
    // connections await CEO approval.
    externalProvidersWired: false,
    existingIntegrations: STUDIO_INTEGRATIONS.filter((i) => i.status === "existing")
      .length,
    netNewIntegrations: STUDIO_INTEGRATIONS.filter((i) => i.status === "net_new")
      .length,
    deferredIntegrations: STUDIO_INTEGRATIONS.filter((i) => i.status === "deferred")
      .length,
    summary:
      "The Studio orchestrates 5 generation types through the existing AI Gateway; " +
      "scheduling/analytics/approval/review reuse existing systems; publishing connectors " +
      "are net-new. No external provider is wired — deferred until CEO approval.",
  };
}
