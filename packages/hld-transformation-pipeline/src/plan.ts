/**
 * Stage 6 — Transformation Plan: turn the BTI output into EXECUTABLE tasks.
 *
 * This is where "the transformation, not the report, is the product" becomes
 * real: every recommendation (or, honestly, every provisional lead + evidence
 * appetite when the output is COLLECT_MORE_EVIDENCE) is decomposed into concrete
 * implementation tasks with acceptance criteria, dependencies, and the HLD
 * capability that would execute each. No task is executed here.
 */

import { capabilityForOutcome } from "./capabilities.ts";
import type {
  CapabilityId,
  ExecutiveReview,
  ImplementationTask,
  StartupLedger,
} from "./types.ts";

interface SubTask {
  readonly title: string;
  readonly acceptance: string;
  readonly capability?: CapabilityId;
  readonly feeds?: boolean;
}

/** How to decompose a specific transformation OUTCOME into executable steps. */
const DECOMPOSITIONS: { readonly match: RegExp; readonly steps: readonly SubTask[] }[] =
  [
    {
      match: /package|focused commercial offer/i,
      steps: [
        {
          title: "Choose ONE first offer and ONE first customer segment",
          acceptance:
            "A single named offer and a single named customer segment are written down and agreed.",
          capability: "consulting_strategy",
        },
        {
          title: "Package the offer: name, scope, and price",
          acceptance: "A one-page offer with a specific price exists.",
          capability: "pricing_finance",
        },
        {
          title: "Put the priced offer in front of ≥3 real prospects",
          acceptance:
            "≥3 qualified prospects have seen the priced offer and responded.",
          capability: "market_validation",
          feeds: true,
        },
      ],
    },
    {
      match: /design partner|product-market fit|validate/i,
      steps: [
        {
          title: "Identify 3–5 candidate paid design partners",
          acceptance: "A named shortlist of real prospects exists.",
          capability: "market_validation",
        },
        {
          title: "Run a repeatable onboarding for the first partner",
          acceptance: "One partner is onboarded without bespoke engineering.",
          capability: "onboarding_ops",
          feeds: true,
        },
        {
          title: "Secure a paid pilot or an evidenced 'no'",
          acceptance: "A signed paid pilot, or a documented rejection with the reason.",
          capability: "sales_enablement",
          feeds: true,
        },
      ],
    },
    {
      match: /acquisition|repeatable.*channel/i,
      steps: [
        {
          title: "Test one acquisition channel to a measurable lead",
          acceptance: "One channel has produced ≥1 real, attributable lead.",
          capability: "marketing",
          feeds: true,
        },
        {
          title: "Define the interest→signed path",
          acceptance: "A written, repeatable path with stages exists.",
          capability: "sales_enablement",
        },
      ],
    },
  ];

const GENERIC = (name: string): readonly SubTask[] => [
  {
    title: `Define the concrete first step for: ${name}`,
    acceptance: "A single, specific, executable first action is written down.",
    capability: "consulting_strategy",
  },
  {
    title: `Produce the first evidence that ${name.toLowerCase()} is working`,
    acceptance: "One real datum showing early movement exists.",
    feeds: true,
  },
];

export function buildTasks(
  ledger: StartupLedger,
  review: ExecutiveReview,
): ImplementationTask[] {
  if (review.decision === "decline" || review.decision === "defer") return [];

  const tasks: ImplementationTask[] = [];
  const add = (t: Omit<ImplementationTask, "status">) =>
    tasks.push({ ...t, status: "not_started" });

  // 1) The transformation itself (recommendation, else the provisional lead).
  const leadId = ledger.recommendation?.optionId ?? ledger.provisionalLeadId;
  const lead = ledger.options.find((o) => o.id === leadId);
  if (lead) {
    const rule = DECOMPOSITIONS.find((d) => d.match.test(lead.name));
    const steps = rule?.steps ?? GENERIC(lead.name);
    let prev: string | null = null;
    steps.forEach((s, i) => {
      const id = `t-${lead.id}-${i + 1}`;
      add({
        id,
        title: s.title,
        source: "transformation",
        capability: s.capability ?? capabilityForOutcome(s.title),
        objective: lead.objective,
        acceptanceCriteria: s.acceptance,
        dependsOn: prev ? [prev] : [],
        feedsReanalysis: s.feeds ?? false,
      });
      prev = id;
    });
  }

  // 2) Evidence-collection tasks from the appetite (highest information value
  //    first). These produce the facts that let BTI rerun toward a firm rec.
  ledger.appetite
    .filter((a) => a.effect === "transform" || a.effect === "invalidate")
    .slice(0, 5)
    .forEach((a, i) => {
      add({
        id: `t-ev-${i + 1}`,
        title: `Collect: ${a.fact}`,
        source: "evidence",
        capability: capabilityForOutcome(a.fact),
        objective: `Answer a load-bearing question so BTI can confirm the binding constraint. ${a.why}`,
        acceptanceCriteria: `The fact is obtained and recorded with its source (${a.source ?? "CEO"}).`,
        dependsOn: [],
        feedsReanalysis: true,
      });
    });

  // 3) The measurement baseline task (always — the truth layer before any change).
  if (ledger.measurementContract) {
    add({
      id: "t-baseline",
      title: "Capture the pre-commercial baseline",
      source: "measurement",
      capability: "analytics_measurement",
      objective:
        "Lock the baseline before any change so success can be judged honestly.",
      acceptanceCriteria:
        "Current paying customers/revenue recorded, excluding family/internal accounts.",
      dependsOn: [],
      feedsReanalysis: false,
    });
  }

  return tasks;
}
