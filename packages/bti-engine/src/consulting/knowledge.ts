// Consulting knowledge base — DATA, keyed to the 43 assessment dimensions.
//
// Each row supplies the consulting metadata for a dimension: a root-cause
// hypothesis (an inference), a recommended action (an opinion), the Herman
// Legacy services it supports, success metrics, and default difficulty/timeline.
// Business impact / risk / opportunity are DERIVED from these + severity by
// templates (see findings.ts), so the base stays compact and consistent.
//
// This is configuration: adding a dimension or a service is a row, never new
// logic. Nothing here is industry-hardcoded — industry templates (industry.ts)
// select and weight these rows.

import type { Difficulty, TimelineBucket } from "./types.ts";

// The Herman Legacy service vocabulary (PCO solution-mapping list).
export const HL_SERVICES = [
  "Business Transformation",
  "Operational Consulting",
  "Website Development",
  "VisibilityAI",
  "SEO",
  "Digital Marketing",
  "AI Automation",
  "Operating Systems",
  "Custom Software",
  "Managed Services",
  "Hosting",
  "Training",
] as const;
export type HlService = (typeof HL_SERVICES)[number];

export interface KbRow {
  rootCause: string;
  action: string;
  services: HlService[];
  metrics: string[];
  difficulty: Difficulty;
  timeline: TimelineBucket;
}

// Keyed by dimension key (globally unique across the 43 dimensions).
export const KNOWLEDGE: Record<string, KbRow> = {
  // ----- Business -----
  business_maturity: {
    rootCause: "Immature or undocumented operating routines",
    action: "Establish a documented operating model and management cadence",
    services: ["Business Transformation", "Operational Consulting"],
    metrics: ["Documented core processes", "Management review cadence in place"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  leadership: {
    rootCause: "Unclear ownership and decision rights",
    action: "Define leadership roles, decision rights, and accountability",
    services: ["Business Transformation", "Training"],
    metrics: ["RACI defined for key decisions", "Leadership review rhythm"],
    difficulty: "medium",
    timeline: "short_term",
  },
  processes: {
    rootCause: "Ad-hoc, person-dependent processes",
    action: "Map and standardize the highest-friction processes",
    services: ["Operational Consulting", "Operating Systems"],
    metrics: ["Top-5 processes documented", "Cycle-time reduction"],
    difficulty: "medium",
    timeline: "short_term",
  },
  customer_experience: {
    rootCause: "No consistent, measured customer journey",
    action: "Instrument the customer journey and close top friction points",
    services: ["Business Transformation", "Digital Marketing"],
    metrics: ["CSAT/NPS captured", "Response-time SLA met"],
    difficulty: "medium",
    timeline: "short_term",
  },
  growth_readiness: {
    rootCause: "Growth outpacing systems and structure",
    action: "Build the systems foundation required to scale",
    services: ["Business Transformation", "Operating Systems"],
    metrics: ["Scalable systems in place", "Onboarding time reduced"],
    difficulty: "high",
    timeline: "medium_term",
  },
  // ----- Operations -----
  operations: {
    rootCause: "Manual coordination and limited visibility",
    action: "Introduce operational KPIs and standard workflows",
    services: ["Operational Consulting", "Operating Systems"],
    metrics: ["Operational KPI dashboard live", "Throughput improvement"],
    difficulty: "medium",
    timeline: "short_term",
  },
  supply_chain: {
    rootCause: "Reactive, siloed supply-chain coordination",
    action: "Establish supplier visibility and demand planning",
    services: ["Operational Consulting", "Custom Software"],
    metrics: ["Supplier lead-time tracked", "Stockout rate reduced"],
    difficulty: "high",
    timeline: "medium_term",
  },
  scheduling: {
    rootCause: "Manual scheduling without optimization",
    action: "Deploy a scheduling system with constraints and alerts",
    services: ["Operating Systems", "AI Automation"],
    metrics: ["Schedule adherence", "Idle-time reduction"],
    difficulty: "medium",
    timeline: "short_term",
  },
  reporting: {
    rootCause: "Reports assembled by hand, late and inconsistent",
    action: "Automate a single source of operational truth",
    services: ["Custom Software", "AI Automation"],
    metrics: ["Automated daily reporting", "Report latency < 1 day"],
    difficulty: "medium",
    timeline: "short_term",
  },
  automation: {
    rootCause: "Repetitive manual tasks not yet automated",
    action: "Automate the highest-volume repetitive workflows",
    services: ["AI Automation", "Custom Software"],
    metrics: ["Manual hours automated", "Error-rate reduction"],
    difficulty: "medium",
    timeline: "short_term",
  },
  fleet: {
    rootCause: "Limited fleet visibility and utilization tracking",
    action: "Add fleet telematics and utilization reporting",
    services: ["Operating Systems", "Custom Software"],
    metrics: ["Fleet utilization %", "Maintenance-on-time %"],
    difficulty: "high",
    timeline: "medium_term",
  },
  resource_utilization: {
    rootCause: "Capacity not measured against demand",
    action: "Measure utilization and rebalance capacity",
    services: ["Operational Consulting"],
    metrics: ["Utilization %", "Overtime reduction"],
    difficulty: "medium",
    timeline: "short_term",
  },
  warehouse_operations: {
    rootCause: "Layout and pick paths not optimized",
    action: "Optimize slotting, pick paths, and receiving flow",
    services: ["Operational Consulting", "Operating Systems"],
    metrics: ["Pick rate", "Order accuracy %"],
    difficulty: "high",
    timeline: "medium_term",
  },
  transportation: {
    rootCause: "Routing and dispatch handled manually",
    action: "Introduce routing/dispatch optimization",
    services: ["Operating Systems", "AI Automation"],
    metrics: ["On-time delivery %", "Cost per mile"],
    difficulty: "high",
    timeline: "medium_term",
  },
  // ----- Growth -----
  website: {
    rootCause: "Website not built to convert or rank",
    action: "Modernize the site for speed, clarity, and conversion",
    services: ["Website Development", "Hosting"],
    metrics: ["Page speed", "Conversion rate"],
    difficulty: "medium",
    timeline: "short_term",
  },
  seo: {
    rootCause: "Weak on-page and technical SEO foundations",
    action: "Run an SEO foundation and content program",
    services: ["SEO", "VisibilityAI"],
    metrics: ["Indexed pages", "Organic sessions"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  ai_search_optimization: {
    rootCause: "Content not structured for AI answer engines",
    action: "Optimize for AI search (AEO) with structured content",
    services: ["VisibilityAI", "SEO"],
    metrics: ["AI-answer citations", "Structured-data coverage"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  google_business_profile: {
    rootCause: "Local profile incomplete or unmanaged",
    action: "Complete and actively manage the local profile",
    services: ["VisibilityAI", "Digital Marketing"],
    metrics: ["Profile completeness", "Local actions"],
    difficulty: "low",
    timeline: "immediate",
  },
  reviews: {
    rootCause: "No systematic review-generation motion",
    action: "Install a review-generation and response workflow",
    services: ["Digital Marketing", "Managed Services"],
    metrics: ["Review volume", "Average rating"],
    difficulty: "low",
    timeline: "immediate",
  },
  content: {
    rootCause: "Inconsistent, low-authority content",
    action: "Run an evidence-based content engine",
    services: ["Digital Marketing", "SEO"],
    metrics: ["Publishing cadence", "Content-driven leads"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  social_media: {
    rootCause: "Unmanaged or inconsistent social presence",
    action: "Establish a managed social cadence",
    services: ["Digital Marketing", "Managed Services"],
    metrics: ["Posting cadence", "Engagement rate"],
    difficulty: "low",
    timeline: "short_term",
  },
  competitors: {
    rootCause: "Limited competitive intelligence",
    action: "Stand up a competitive-intelligence view",
    services: ["Business Transformation", "VisibilityAI"],
    metrics: ["Competitive benchmark tracked"],
    difficulty: "medium",
    timeline: "short_term",
  },
  lead_generation: {
    rootCause: "No repeatable lead-generation system",
    action: "Build a measurable lead-generation system",
    services: ["Digital Marketing", "VisibilityAI"],
    metrics: ["Qualified leads/month", "Cost per lead"],
    difficulty: "medium",
    timeline: "short_term",
  },
  conversion: {
    rootCause: "Funnel leaks between visit and close",
    action: "Optimize the funnel and follow-up motion",
    services: ["Website Development", "AI Automation"],
    metrics: ["Conversion rate", "Speed-to-lead"],
    difficulty: "medium",
    timeline: "short_term",
  },
  brand_authority: {
    rootCause: "Thin proof of expertise and trust",
    action: "Build authority assets and proof points",
    services: ["Digital Marketing", "Business Transformation"],
    metrics: ["Authority assets published", "Branded search"],
    difficulty: "medium",
    timeline: "long_term",
  },
  technology_stack: {
    rootCause: "Fragmented or dated marketing stack",
    action: "Rationalize the growth technology stack",
    services: ["Operating Systems", "Custom Software"],
    metrics: ["Integrated stack", "Attribution coverage"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  // ----- Technology -----
  software: {
    rootCause: "Disconnected or outdated software",
    action: "Consolidate onto fit-for-purpose systems",
    services: ["Custom Software", "Operating Systems"],
    metrics: ["Systems consolidated", "License waste removed"],
    difficulty: "high",
    timeline: "medium_term",
  },
  security: {
    rootCause: "Gaps in access control and data protection",
    action: "Close priority security gaps and add monitoring",
    services: ["Managed Services", "Custom Software"],
    metrics: ["Access reviewed", "Findings remediated"],
    difficulty: "high",
    timeline: "immediate",
  },
  cloud_readiness: {
    rootCause: "Infrastructure not cloud-ready or resilient",
    action: "Move to resilient, managed cloud hosting",
    services: ["Hosting", "Managed Services"],
    metrics: ["Uptime %", "Recovery time objective"],
    difficulty: "high",
    timeline: "medium_term",
  },
  architecture: {
    rootCause: "Point solutions without a coherent architecture",
    action: "Define a target architecture and integration plan",
    services: ["Custom Software", "Operating Systems"],
    metrics: ["Target architecture approved", "Integration coverage"],
    difficulty: "high",
    timeline: "long_term",
  },
  technical_debt: {
    rootCause: "Accumulated shortcuts slowing change",
    action: "Prioritize and retire the highest-risk debt",
    services: ["Custom Software", "Managed Services"],
    metrics: ["Debt items retired", "Change lead-time"],
    difficulty: "high",
    timeline: "medium_term",
  },
  scalability: {
    rootCause: "Systems not designed to scale with demand",
    action: "Re-platform bottlenecks for scale",
    services: ["Custom Software", "Hosting"],
    metrics: ["Load headroom", "Cost-per-transaction"],
    difficulty: "high",
    timeline: "long_term",
  },
  hlbos_compatibility: {
    rootCause: "Not yet aligned to the HL-BOS platform",
    action: "Plan an HL-BOS-aligned build path",
    services: ["Operating Systems", "Business Transformation"],
    metrics: ["Compatibility assessed", "Migration path defined"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  // ----- AI Readiness -----
  automation_opportunities: {
    rootCause: "Manual work that AI could handle",
    action: "Identify and pilot high-value automations",
    services: ["AI Automation"],
    metrics: ["Automations piloted", "Hours reclaimed"],
    difficulty: "medium",
    timeline: "short_term",
  },
  ai_assistants: {
    rootCause: "No AI assistants supporting the team",
    action: "Introduce governed AI assistants for key roles",
    services: ["AI Automation", "Training"],
    metrics: ["Assistants deployed", "Task time reduced"],
    difficulty: "medium",
    timeline: "short_term",
  },
  customer_support: {
    rootCause: "Support is fully manual and reactive",
    action: "Add AI-assisted support with human oversight",
    services: ["AI Automation", "Managed Services"],
    metrics: ["First-response time", "Deflection rate"],
    difficulty: "medium",
    timeline: "short_term",
  },
  marketing_automation: {
    rootCause: "Marketing tasks done by hand",
    action: "Automate nurture and campaign workflows",
    services: ["AI Automation", "Digital Marketing"],
    metrics: ["Automated nurture live", "Marketing hours saved"],
    difficulty: "medium",
    timeline: "short_term",
  },
  internal_ai_workflows: {
    rootCause: "No internal AI workflows in operations",
    action: "Deploy internal AI workflows with guardrails",
    services: ["AI Automation", "Operating Systems"],
    metrics: ["Workflows live", "Cycle-time reduction"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  future_ai_products: {
    rootCause: "AI product opportunities unexplored",
    action: "Scope candidate AI products and a roadmap",
    services: ["Business Transformation", "Custom Software"],
    metrics: ["Product concepts scoped", "Roadmap approved"],
    difficulty: "high",
    timeline: "long_term",
  },
  // ----- Financial -----
  cost_reduction: {
    rootCause: "Cost drivers not measured or managed",
    action: "Target the largest controllable cost drivers",
    services: ["Operational Consulting", "AI Automation"],
    metrics: ["Cost baseline set", "Cost reduced %"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  revenue_growth: {
    rootCause: "Revenue levers under-exploited",
    action: "Prioritize the highest-leverage revenue plays",
    services: ["Business Transformation", "Digital Marketing"],
    metrics: ["Pipeline growth", "Revenue growth %"],
    difficulty: "medium",
    timeline: "medium_term",
  },
  automation_roi: {
    rootCause: "Automation ROI not yet captured",
    action: "Sequence automations by ROI and track savings",
    services: ["AI Automation"],
    metrics: ["Automation savings tracked", "Payback period"],
    difficulty: "medium",
    timeline: "short_term",
  },
  transformation_roi: {
    rootCause: "No mechanism to track transformation ROI",
    action: "Instrument baseline and realized ROI per initiative",
    services: ["Business Transformation"],
    metrics: ["Baseline captured", "Realized ROI tracked"],
    difficulty: "medium",
    timeline: "short_term",
  },
};

export function kbFor(dimension: string): KbRow | undefined {
  return KNOWLEDGE[dimension];
}
