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

export type Recommendation =
  | {
      mode: "selected";
      optionTitle: string;
      why: string;
      whyNotOthers: string;
      dependencies: string;
      unknowns: string;
      changeTrigger: string;
      capabilities: string[];
      expectedOutcome: string;
    }
  | { mode: "single"; note: string; capabilities: string[]; expectedOutcome: string }
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

const SEVERITY_WORD = (severity: number): string =>
  severity >= 4 ? "critical" : severity === 3 ? "high" : "moderate";

// Choose the recommended transformation — only when the evidence supports it.
export function recommend(
  options: TransformationOption[],
  severity: number,
  confidence: "High" | "Moderate" | "Low",
  goalAligned: boolean,
  goalObservable: boolean,
  fallbackAction: string,
): Recommendation {
  if (options.length === 0) {
    return {
      mode: "single",
      note: `A single credible correction applies here: ${fallbackAction.toLowerCase()}.`,
      capabilities: [],
      expectedOutcome: "Improvement measured against the benchmark for this dimension.",
    };
  }

  // Insufficient evidence to choose responsibly.
  if (confidence === "Low") {
    return {
      mode: "discovery",
      note: "Recommendation pending additional executive or operational discovery — the current evidence isn't strong enough to choose responsibly.",
    };
  }

  if (options.length === 1) {
    const o = options[0]!;
    return {
      mode: "selected",
      optionTitle: o.title,
      why: `This is the only credible approach the evidence supports — ${o.whyFit.toLowerCase()}`,
      whyNotOthers:
        "No materially different alternative is warranted by what the scan can see.",
      dependencies: o.dependencies,
      unknowns: goalObservable
        ? "None material from the website evidence."
        : "The underlying business cause needs operational discovery to confirm.",
      changeTrigger:
        "New evidence — e.g., an existing system already in place — would change this.",
      capabilities: o.capabilities,
      expectedOutcome: o.expectedOutcome,
    };
  }

  // Multiple options: pick a depth that matches severity, nudged by the goal.
  const maxDepth = Math.max(...options.map((o) => o.depth));
  let target = severity >= 4 ? 3 : severity === 3 ? 2 : 1;
  if (goalAligned) target = Math.max(target, 2); // a stated goal warrants a connected approach
  target = Math.min(target, maxDepth);

  const sorted = options.slice().sort((a, b) => a.depth - b.depth);
  // Nearest option at or below target; else the smallest available.
  const atOrBelow = sorted.filter((o) => o.depth <= target);
  const chosen = (atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : sorted[0])!;
  const lighter = sorted.find((o) => o.depth < chosen.depth);
  const heavier = sorted.find((o) => o.depth > chosen.depth);

  const why =
    `${goalAligned ? "This bears directly on the outcome you told us you want, and " : ""}` +
    `it matches the ${SEVERITY_WORD(severity)} severity and ${confidence.toLowerCase()} confidence of this finding — ${chosen.whyFit.toLowerCase()}`;
  const whyParts: string[] = [];
  if (lighter)
    whyParts.push(
      `“${lighter.title}” would leave part of the gap open given the ${SEVERITY_WORD(severity)} severity.`,
    );
  if (heavier)
    whyParts.push(
      `“${heavier.title}” adds dependencies (${heavier.dependencies.toLowerCase().replace(/\.$/, "")}) the current evidence doesn't yet justify.`,
    );

  return {
    mode: "selected",
    optionTitle: chosen.title,
    why,
    whyNotOthers:
      whyParts.length > 0
        ? whyParts.join(" ")
        : "No materially different alternative is warranted by the current evidence.",
    dependencies: chosen.dependencies,
    unknowns: goalObservable
      ? "None material from the website evidence; operational discovery would refine scope."
      : "Part of this goal lives in operations a website can't see — discovery would confirm scope.",
    changeTrigger:
      "New evidence from operational discovery — e.g., an existing CRM, booking system, or team process — would change this recommendation.",
    capabilities: chosen.capabilities,
    expectedOutcome: chosen.expectedOutcome,
  };
}
