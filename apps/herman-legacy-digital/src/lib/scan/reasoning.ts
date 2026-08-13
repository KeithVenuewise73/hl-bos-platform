// BTI options-based reasoning — the layer that turns a finding from "here's the
// fix" into a consultant's reasoning: root cause (honestly classified),
// materially-different transformation OPTIONS, and a comparative RECOMMENDATION.
//
// GUARDRAILS (from the executive directive):
//   • Options must be materially different and genuinely applicable — never
//     canned choices manufactured so every finding looks like it has three.
//     Several dimensions have exactly one credible path; that is stated.
//   • A Herman Legacy capability appears on an option only when the option
//     genuinely requires it — implementation is the consequence of the
//     transformation, not an upsell list.
//   • No fabricated numbers anywhere. Outcomes are qualitative.
//   • Where the evidence can't support a responsible choice, we say so
//     ("discovery required") rather than force a recommendation.

export type Effort = "Low" | "Medium" | "High" | "Unknown";
export type Delivery = "One-time" | "Recurring" | "Hybrid";
export type RootCauseCertainty = "Verified" | "Inferred" | "Discovery required";

export interface TransformationOption {
  title: string;
  depth: 1 | 2 | 3; // 1 focused correction · 2 connected workflow · 3 broad operating-system
  whatChanges: string;
  whyFit: string; // the condition under which this option fits
  effort: Effort;
  delivery: Delivery;
  dependencies: string;
  capabilities: string[]; // HL capabilities this option genuinely requires
  expectedOutcome: string; // qualitative
  tradeoffs: string;
}

// How a success metric can be observed — honest about what's available today.
export type MeasurementSource =
  "Available now" | "Instrumentation required" | "Client data required";
export interface Measurement {
  metric: string;
  source: MeasurementSource;
}

export type Recommendation =
  | {
      mode: "selected";
      optionTitle: string;
      why: string;
      whyNotLighter: string; // "" when no lighter option exists
      whyNotHeavier: string; // "" when no heavier option exists
      dependencies: string;
      unknowns: string;
      changeTrigger: string;
      capabilities: string[];
      expectedOutcome: string;
      measurement: Measurement[];
    }
  | {
      mode: "single";
      note: string;
      capabilities: string[];
      expectedOutcome: string;
      measurement: Measurement[];
    }
  | { mode: "discovery"; note: string };

export interface FindingReasoning {
  rootCause: { statement: string; certainty: RootCauseCertainty };
  options: TransformationOption[];
  recommendation: Recommendation;
}

// ---- Authored option catalog, keyed by website dimension -------------------
// Each list holds only options that are genuinely credible for that dimension.
// Lengths vary on purpose (security has one path; lead generation has three).

const OPTIONS_BY_DIM: Record<string, TransformationOption[]> = {
  security: [
    {
      title: "Secure the site with HTTPS",
      depth: 1,
      whatChanges: "Enable TLS/HTTPS across every page so traffic is encrypted.",
      whyFit: "The site was served without HTTPS — this is the single correct fix.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "Access to the site's hosting/DNS.",
      capabilities: ["Website Modernization"],
      expectedOutcome: "Browsers and buyers see a trusted, secure site.",
      tradeoffs: "None material — this is table stakes.",
    },
  ],
  seo: [
    {
      title: "On-page SEO foundation",
      depth: 1,
      whatChanges: "Fix titles, meta descriptions, heading structure, and basics.",
      whyFit: "The page is missing the on-page fundamentals search engines read.",
      effort: "Medium",
      delivery: "One-time",
      dependencies: "None beyond content access.",
      capabilities: ["SEO Intelligence"],
      expectedOutcome: "Clearer search-engine understanding of what you offer.",
      tradeoffs: "A baseline; it doesn't sustain ranking on its own.",
    },
    {
      title: "Ongoing SEO program",
      depth: 2,
      whatChanges: "The foundation plus a content cadence and technical monitoring.",
      whyFit: "Fits when search visibility is a durable priority, not a one-off.",
      effort: "High",
      delivery: "Recurring",
      dependencies: "A steady flow of publishable content.",
      capabilities: ["SEO Intelligence", "Marketing"],
      expectedOutcome: "Compounding organic visibility for the terms buyers use.",
      tradeoffs: "An ongoing commitment, not a fix-and-forget.",
    },
  ],
  ai_search_optimization: [
    {
      title: "Structured-data & answer readiness",
      depth: 1,
      whatChanges: "Add validated schema and an answer-ready services page.",
      whyFit: "No structured data was found — AI engines have nothing to cite.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "None beyond content access.",
      capabilities: ["VisibilityAI", "SEO Intelligence"],
      expectedOutcome: "Eligibility to be cited in AI answers and rich results.",
      tradeoffs: "Durable, but doesn't track AI visibility over time.",
    },
    {
      title: "AI visibility program",
      depth: 2,
      whatChanges:
        "Structured data plus ongoing AI-answer optimization and monitoring.",
      whyFit: "Fits when being present in AI search is a strategic priority.",
      effort: "Medium",
      delivery: "Recurring",
      dependencies: "Content updates as buyer questions evolve.",
      capabilities: ["VisibilityAI"],
      expectedOutcome: "Sustained presence as AI-assisted search grows.",
      tradeoffs: "Ongoing; value depends on category adoption of AI search.",
    },
  ],
  google_business_profile: [
    {
      title: "Complete & verify your local profile",
      depth: 1,
      whatChanges: "Reinforce phone, address, and local signals; verify the profile.",
      whyFit: "No local/GBP signal was detected on the pages analyzed.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "Confirmed business details and profile access.",
      capabilities: ["VisibilityAI"],
      expectedOutcome: "Stronger presence when local buyers search.",
      tradeoffs: "Static unless actively managed.",
    },
    {
      title: "Managed local presence",
      depth: 2,
      whatChanges: "Profile plus ongoing reviews prompts and local content.",
      whyFit: "Fits when local buyers are a primary channel.",
      effort: "Medium",
      delivery: "Recurring",
      dependencies: "A steady stream of completed jobs to request reviews from.",
      capabilities: ["VisibilityAI", "Marketing"],
      expectedOutcome: "Consistent local visibility and social proof.",
      tradeoffs: "Ongoing effort to sustain.",
    },
  ],
  social_media: [
    {
      title: "Establish core social profiles",
      depth: 1,
      whatChanges: "Stand up and link the core social profiles buyers check.",
      whyFit: "Few or no social signals were found on the site.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "None material.",
      capabilities: ["Marketing"],
      expectedOutcome: "Basic social proof at the research stage.",
      tradeoffs: "Presence without cadence fades in relevance.",
    },
    {
      title: "Managed social presence",
      depth: 2,
      whatChanges: "A consistent posting and engagement cadence.",
      whyFit: "Fits when reach and trust-building matter to acquisition.",
      effort: "Medium",
      delivery: "Recurring",
      dependencies: "Material to post (work, results, updates).",
      capabilities: ["Marketing"],
      expectedOutcome: "Sustained reach and trust while buyers decide.",
      tradeoffs: "Ongoing; needs a content source.",
    },
  ],
  content: [
    {
      title: "Core content & structure",
      depth: 1,
      whatChanges: "Rewrite key pages with depth, structure, and clear value.",
      whyFit: "Content depth was thin on the pages analyzed.",
      effort: "Medium",
      delivery: "One-time",
      dependencies: "Input on your services and differentiators.",
      capabilities: ["Marketing", "SEO Intelligence"],
      expectedOutcome: "Clearer reasons to choose you; better indexing.",
      tradeoffs: "A baseline; authority builds with cadence.",
    },
    {
      title: "Evidence-led content engine",
      depth: 2,
      whatChanges: "Ongoing publishing tied to the questions buyers actually ask.",
      whyFit: "Fits when authority and inbound are strategic goals.",
      effort: "High",
      delivery: "Recurring",
      dependencies: "Subject-matter input on a regular basis.",
      capabilities: ["Marketing", "SEO Intelligence"],
      expectedOutcome: "Growing authority and inbound interest over time.",
      tradeoffs: "Ongoing commitment; slower to show results.",
    },
  ],
  conversion: [
    {
      title: "Add clear conversion paths",
      depth: 1,
      whatChanges: "Add strong calls-to-action and a simple path to act.",
      whyFit: "Visitors have no clear next step on the pages analyzed.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "None beyond site access.",
      capabilities: ["Website Modernization"],
      expectedOutcome: "More of the traffic you already earn takes action.",
      tradeoffs: "Captures intent but doesn't manage follow-up.",
    },
    {
      title: "Conversion + follow-up workflow",
      depth: 2,
      whatChanges: "Conversion paths plus fast, automated first response.",
      whyFit: "Fits when leads are being earned but lost after the click.",
      effort: "Medium",
      delivery: "Hybrid",
      dependencies: "Somewhere to route and answer inquiries.",
      capabilities: ["Website Modernization", "Automation"],
      expectedOutcome: "Fewer inquiries slip between visit and response.",
      tradeoffs: "Needs an owner for follow-up.",
    },
  ],
  lead_generation: [
    {
      title: "Add an inquiry or booking path",
      depth: 1,
      whatChanges: "Put a simple form or booking option on the key pages.",
      whyFit: "Fits if the only gap is that visitors can't raise their hand.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "None beyond site access.",
      capabilities: ["Website Modernization"],
      expectedOutcome: "Interested visitors can become inquiries.",
      tradeoffs: "Captures leads but doesn't manage or follow up on them.",
    },
    {
      title: "Capture with automated follow-up",
      depth: 2,
      whatChanges: "Capture plus instant response, routing, and reminders.",
      whyFit: "Fits when speed-to-lead and missed follow-up are the real problem.",
      effort: "Medium",
      delivery: "Hybrid",
      dependencies: "A person or system to receive and act on leads.",
      capabilities: ["Website Modernization", "Automation", "Scheduling"],
      expectedOutcome: "Faster response and fewer leads lost after capture.",
      tradeoffs: "Requires a defined follow-up owner and process.",
    },
    {
      title: "Full customer-acquisition system",
      depth: 3,
      whatChanges: "Capture, CRM, nurture, and reporting as one connected system.",
      whyFit: "Fits when the goal is a repeatable, measurable pipeline, not a form.",
      effort: "High",
      delivery: "Recurring",
      dependencies: "CRM adoption and a sales process the team will follow.",
      capabilities: ["CRM", "Automation", "Marketing"],
      expectedOutcome: "A repeatable, measurable flow of qualified inquiries.",
      tradeoffs: "Change management and an ongoing commitment.",
    },
  ],
  website: [
    {
      title: "Targeted website fixes",
      depth: 1,
      whatChanges: "Fix mobile viewport, image alt text, and clarity/speed issues.",
      whyFit: "Fits when the site is sound but has specific quality gaps.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "Site access.",
      capabilities: ["Website Modernization"],
      expectedOutcome: "Better experience, accessibility, and first impression.",
      tradeoffs: "Improves the existing site rather than reimagining it.",
    },
    {
      title: "Website modernization",
      depth: 2,
      whatChanges: "Rebuild the site for speed, clarity, and conversion.",
      whyFit: "Fits when the site materially underperforms as a sales asset.",
      effort: "High",
      delivery: "One-time",
      dependencies: "Content and brand input; hosting.",
      capabilities: ["Website Modernization"],
      expectedOutcome: "A site that actively converts, not just informs.",
      tradeoffs: "A larger up-front effort than targeted fixes.",
    },
  ],
  technology_stack: [
    {
      title: "Add measurement",
      depth: 1,
      whatChanges: "Install analytics and basic attribution.",
      whyFit: "No analytics/measurement tag was detected — decisions run blind.",
      effort: "Low",
      delivery: "One-time",
      dependencies: "Site access.",
      capabilities: ["Marketing"],
      expectedOutcome: "You can finally see what's working.",
      tradeoffs: "Measurement alone doesn't fix the underlying stack.",
    },
    {
      title: "Rationalize the growth stack",
      depth: 2,
      whatChanges: "Integrate the tools you run and connect attribution end-to-end.",
      whyFit: "Fits when a fragmented stack is hiding what actually drives results.",
      effort: "Medium",
      delivery: "Hybrid",
      dependencies: "An audit of current tools — operational discovery required.",
      capabilities: ["Automation", "CRM"],
      expectedOutcome: "A coherent, measurable stack you can act on.",
      tradeoffs: "Needs a tools audit before scoping.",
    },
  ],
};

export function optionsFor(dimension: string): TransformationOption[] {
  return OPTIONS_BY_DIM[dimension] ?? [];
}

// Classify the root cause honestly. The engine's rootCause is a business-cause
// HYPOTHESIS inferred from an observed signal — so it is "Inferred" when the
// finding carries direct site evidence, and "Discovery required" when it rests on
// a bare rating with nothing corroborating. It is never presented as "Verified":
// a website scan can verify a missing form, not why the business operates as it
// does. ("Verified" remains in the type for facts a future evidence source can
// establish outright.)
export function classifyRootCause(
  rootCause: string,
  hasAttachedEvidence: boolean,
): { statement: string; certainty: RootCauseCertainty } {
  return {
    statement: rootCause,
    certainty: hasAttachedEvidence ? "Inferred" : "Discovery required",
  };
}

// The context each recommendation is assembled from — real, finding-specific
// inputs so the prose is reasoning, not a reused wrapper.
export interface RecommendContext {
  evidenceHint?: string; // the top specific evidence line for this finding
  rootCause: string;
  successMetrics: string[]; // the engine's kb metrics for this dimension
  fallbackAction: string;
  goal?: { desiredState: string; observable: boolean; aligned: boolean };
}

// Lowercase the first letter so a sentence fragment can flow mid-sentence —
// but leave a leading acronym (CRM, HTTPS, SEO, AI) intact: "cRM" reads as a typo.
function lcFirst(s: string): string {
  if (!s.length) return s;
  if (/^[A-Z]{2,}/.test(s)) return s; // leading all-caps acronym — don't touch
  return s[0]!.toLowerCase() + s.slice(1);
}
function noPeriod(s: string): string {
  return s.replace(/\s*\.\s*$/, "");
}

// Turn an option's `whyFit` into a clause that reads correctly after "because".
// Many are phrased "Fits when …" — a bare verb that needs a subject ("it fits
// when …"); the rest are observations ("No structured data was found …") that
// already flow after "because". Nothing is invented — only the connector adapts.
function fitReason(whyFit: string): string {
  const s = noPeriod(whyFit);
  if (/^Fits\b/.test(s)) return "it " + lcFirst(s);
  return lcFirst(s);
}

// Classify a success metric by how it can actually be observed. Honest by
// design: most business KPIs need instrumentation or client data; only signals
// we can re-read from the site itself are "Available now". Metrics are the
// engine's own — none are invented here.
export function classifyMetric(metric: string): MeasurementSource {
  const s = metric.toLowerCase();
  if (/\bcost\b|revenue|\broi\b|margin|per month|\/\s*month|per lead|per unit/.test(s))
    return "Client data required";
  if (/structured[-\s]?data|schema|https|core web vitals/.test(s))
    return "Available now";
  return "Instrumentation required";
}
function measurementsFrom(metrics: string[]): Measurement[] {
  return metrics.map((m) => ({ metric: m, source: classifyMetric(m) }));
}

// A discovery caveat, added only when the client's stated goal lives beyond what
// a website can evaluate — we never manufacture relevance to an operational goal.
function goalCaveat(goal?: RecommendContext["goal"]): string {
  if (goal && !goal.observable) {
    return " This recommendation addresses the observable digital condition, but operational discovery is required before determining its contribution to your stated goal.";
  }
  return "";
}

// Choose the recommended transformation — only when the evidence supports it.
export function recommend(
  options: TransformationOption[],
  severity: number,
  confidence: "High" | "Moderate" | "Low",
  ctx: RecommendContext,
): Recommendation {
  const measurement = measurementsFrom(ctx.successMetrics);

  if (options.length === 0) {
    return {
      mode: "single",
      note: `A single credible correction applies here: ${lcFirst(noPeriod(ctx.fallbackAction))}.${goalCaveat(ctx.goal)}`,
      capabilities: [],
      expectedOutcome: "Improvement measured against the benchmark for this dimension.",
      measurement,
    };
  }

  // Insufficient evidence to choose responsibly.
  if (confidence === "Low") {
    return {
      mode: "discovery",
      note: "Recommendation pending additional executive or operational discovery — the current evidence isn't strong enough to choose responsibly.",
    };
  }

  const evidence = ctx.evidenceHint ? noPeriod(ctx.evidenceHint) : ctx.rootCause;

  if (options.length === 1) {
    const o = options[0]!;
    return {
      mode: "selected",
      optionTitle: o.title,
      why: `${evidence} — ${lcFirst(noPeriod(o.whatChanges))} is the one correct response, and ${lcFirst(noPeriod(o.whyFit))}.${goalCaveat(ctx.goal)}`,
      whyNotLighter: "",
      whyNotHeavier: `There is no lighter or heavier alternative worth weighing: ${lcFirst(noPeriod(o.tradeoffs))}.`,
      dependencies: o.dependencies,
      unknowns:
        ctx.goal && !ctx.goal.observable
          ? "How much this moves your stated goal needs operational discovery to confirm."
          : "None material from the website evidence for this specific fix.",
      changeTrigger: `Nothing the scan could add would change this — ${lcFirst(noPeriod(o.whyFit))}, and that condition is already met.`,
      capabilities: o.capabilities,
      expectedOutcome: o.expectedOutcome,
      measurement,
    };
  }

  // Multiple options: pick a depth that matches severity, nudged by the goal.
  const maxDepth = Math.max(...options.map((o) => o.depth));
  let target = severity >= 4 ? 3 : severity === 3 ? 2 : 1;
  if (ctx.goal?.aligned) target = Math.max(target, 2); // a stated, aligned goal warrants a connected approach
  target = Math.min(target, maxDepth);

  const sorted = options.slice().sort((a, b) => a.depth - b.depth);
  const atOrBelow = sorted.filter((o) => o.depth <= target);
  const chosen = (atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : sorted[0])!;
  const lighter = sorted.find((o) => o.depth < chosen.depth);
  const heavier = sorted.find((o) => o.depth > chosen.depth);

  // WHY THIS — assembled from the finding's own evidence + the chosen option,
  // and tied to the client's desired state when the goal actually aligns.
  const goalLead =
    ctx.goal?.aligned && ctx.goal.observable
      ? `You want ${noPeriod(ctx.goal.desiredState)}. `
      : "";
  const why = `${goalLead}${evidence} — ${lcFirst(noPeriod(chosen.whatChanges))} because ${fitReason(chosen.whyFit)}.${goalCaveat(ctx.goal)}`;

  // WHY NOT LIGHTER — the lighter option's own trade-off, not a universal line.
  const whyNotLighter = lighter
    ? `“${lighter.title}” ${lcFirst(noPeriod(lighter.tradeoffs))} — it would ${lighter.delivery === "One-time" ? "correct the surface issue without the connected follow-through this needs" : "start the motion but stop short of the workflow this finding calls for"}.`
    : "";

  // WHY NOT HEAVIER — the heavier option's actual added requirement, not "too heavy".
  const whyNotHeavier = heavier
    ? `“${heavier.title}” would go further, but it requires ${lcFirst(noPeriod(heavier.dependencies))} — a commitment the current website evidence doesn't yet justify.`
    : "";

  // WHAT COULD CHANGE IT — tied to specific, nameable evidence.
  const changeTrigger = heavier
    ? `Evidence that ${lcFirst(noPeriod(heavier.dependencies))} is already in place would justify escalating to “${heavier.title}”.`
    : ctx.goal && !ctx.goal.observable
      ? "Operational discovery — your current tools, staffing, and response times — could change how far this needs to go."
      : `Evidence that the lighter “${lighter?.title ?? "focused"}” step was already tried and fell short would confirm this depth; otherwise it is already the proportionate call.`;

  return {
    mode: "selected",
    optionTitle: chosen.title,
    why,
    whyNotLighter,
    whyNotHeavier,
    dependencies: chosen.dependencies,
    unknowns:
      ctx.goal && !ctx.goal.observable
        ? "Part of your stated goal lives in operations a website can't see — discovery would confirm scope."
        : "None material from the website evidence; a short operational review would refine scope.",
    changeTrigger,
    capabilities: chosen.capabilities,
    expectedOutcome: chosen.expectedOutcome,
    measurement,
  };
}
