/**
 * The vocabulary the rules engine reasons with.
 *
 * This file is data, not logic, and that is deliberate: a recruiter or the
 * product owner can extend a list here without touching an algorithm. Two
 * things matter about how it is used elsewhere:
 *
 *   1. A term in `TERMINOLOGY_GROUPS` never creates a fact. It only says
 *      "these two phrasings describe the same underlying work" — and a rewrite
 *      is offered ONLY when the candidate's own evidence already contains one
 *      side of the pair.
 *   2. Nothing here is a skill the candidate has. It is a dictionary for
 *      reading a job posting, not a source of claims.
 */

import { normalize, stem, tokenize } from "./text.ts";

/** Section headings a resume might use, mapped to our canonical sections. */
export const SECTION_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["summary", "summary"],
  ["professional summary", "summary"],
  ["executive summary", "summary"],
  ["career summary", "summary"],
  ["profile", "summary"],
  ["professional profile", "summary"],
  ["objective", "summary"],
  ["career objective", "summary"],
  ["about", "summary"],
  ["skills", "skills"],
  ["core competencies", "skills"],
  ["competencies", "skills"],
  ["areas of expertise", "skills"],
  ["core skills", "skills"],
  ["key skills", "skills"],
  ["technical skills", "skills"],
  ["skills and expertise", "skills"],
  ["expertise", "skills"],
  ["experience", "experience"],
  ["work experience", "experience"],
  ["professional experience", "experience"],
  ["employment", "experience"],
  ["employment history", "experience"],
  ["career history", "experience"],
  ["work history", "experience"],
  ["relevant experience", "experience"],
  ["education", "education"],
  ["education and training", "education"],
  ["academic background", "education"],
  ["certifications", "certifications"],
  ["certifications and licenses", "certifications"],
  ["licenses", "certifications"],
  ["licenses and certifications", "certifications"],
  ["credentials", "certifications"],
  ["projects", "projects"],
  ["key projects", "projects"],
  ["selected projects", "projects"],
  ["additional information", "additional"],
  ["additional", "additional"],
  ["awards", "additional"],
  ["honors", "additional"],
  ["awards and honors", "additional"],
  ["volunteer", "additional"],
  ["volunteer experience", "additional"],
  ["community involvement", "additional"],
  ["military", "additional"],
  ["military service", "additional"],
  ["affiliations", "additional"],
  ["professional affiliations", "additional"],
  ["languages", "additional"],
]);

/** Headings a job posting uses, mapped to how we weight what follows. */
export const JOB_SECTION_CUES: readonly {
  readonly match: RegExp;
  readonly section: string;
}[] = [
  {
    match: /^(minimum|basic|required)\s+(qualifications|requirements)/i,
    section: "required",
  },
  {
    match: /^(qualifications|requirements|what you.?ll need|who you are)/i,
    section: "required",
  },
  { match: /^(preferred|desired|nice to have|bonus|plus)/i, section: "preferred" },
  {
    match: /^(responsibilities|duties|what you.?ll do|the role|key accountabilities)/i,
    section: "responsibilities",
  },
  {
    match: /^(about|who we are|our company|company overview|why join)/i,
    section: "informational",
  },
  {
    match: /^(benefits|compensation|pay|salary|perks|what we offer)/i,
    section: "informational",
  },
  {
    match: /^(equal opportunity|eeo|diversity|disclaimer|legal)/i,
    section: "informational",
  },
  {
    match: /^(physical (requirements|demands)|working conditions|work environment)/i,
    section: "physical",
  },
  { match: /^(travel)/i, section: "travel" },
];

/** Phrases that make a requirement non-negotiable. */
export const CRITICAL_CUES: readonly RegExp[] = [
  /\brequired\b/i,
  /\bmust have\b/i,
  /\bmust be\b/i,
  /\bminimum of\b/i,
  /\bat least\b/i,
  /\bmandatory\b/i,
  /\bessential\b/i,
  /\bproven\b/i,
];

/** Phrases that make a requirement optional. */
export const PREFERRED_CUES: readonly RegExp[] = [
  /\bpreferred\b/i,
  /\bnice to have\b/i,
  /\ba plus\b/i,
  /\bdesirable\b/i,
  /\bideally\b/i,
  /\bbonus\b/i,
  /\bhelpful\b/i,
];

export const SOFTWARE_VOCAB: readonly string[] = [
  "excel",
  "microsoft excel",
  "microsoft office",
  "outlook",
  "powerpoint",
  "word",
  "google workspace",
  "google sheets",
  "sharepoint",
  "smartsheet",
  "sap",
  "oracle",
  "netsuite",
  "workday",
  "adp",
  "kronos",
  "ukg",
  "salesforce",
  "hubspot",
  "zendesk",
  "servicenow",
  "jira",
  "confluence",
  "asana",
  "monday.com",
  "slack",
  "teams",
  "tableau",
  "power bi",
  "looker",
  "qlik",
  "sql",
  "python",
  "r",
  "snowflake",
  "wms",
  "tms",
  "erp",
  "crm",
  "epicor",
  "manhattan associates",
  "blue yonder",
  "roadnet",
  "descartes",
  "omnitracs",
  "samsara",
  "netradyne",
  "lytx",
  "geotab",
  "fleetio",
  "verizon connect",
  "dispatch software",
  "routing software",
  "amazon logistics",
  "flex",
  "dsp",
  "edi",
  "quickbooks",
  "great plains",
  "dynamics 365",
  "visio",
  "autocad",
  "minitab",
  "six sigma toolkit",
];

export const CERTIFICATION_VOCAB: readonly string[] = [
  "pmp",
  "capm",
  "six sigma",
  "lean six sigma",
  "green belt",
  "black belt",
  "lean",
  "cscp",
  "cpim",
  "cltd",
  "ctl",
  "ctp",
  "cdl",
  "class a cdl",
  "class b cdl",
  "osha",
  "osha 30",
  "osha 10",
  "hazmat",
  "dot",
  "iso 9001",
  "apics",
  "shrm-cp",
  "phr",
  "sphr",
  "cpa",
  "cfa",
  "itil",
  "scrum master",
  "csm",
  "safe",
  "cissp",
  "comptia",
  "forklift certification",
  "tsa",
  "twic",
  "haccp",
  "servsafe",
];

export const LEADERSHIP_TERMS: readonly string[] = [
  "lead",
  "leadership",
  "manage",
  "management",
  "supervise",
  "supervision",
  "direct",
  "director",
  "mentor",
  "coach",
  "develop talent",
  "hire",
  "hiring",
  "staffing",
  "performance management",
  "team building",
  "cross-functional",
  "stakeholder",
  "influence",
  "succession planning",
  "span of control",
  "direct reports",
  "people leader",
  "p&l",
  "budget ownership",
];

export const SOFT_SKILL_TERMS: readonly string[] = [
  "communication",
  "collaboration",
  "problem solving",
  "adaptability",
  "attention to detail",
  "time management",
  "customer service",
  "teamwork",
  "critical thinking",
  "decision making",
  "conflict resolution",
  "negotiation",
  "presentation",
  "written communication",
  "verbal communication",
  "organized",
  "self-starter",
  "ownership",
  "accountability",
  "initiative",
];

export const COMPLIANCE_TERMS: readonly string[] = [
  "dot",
  "fmcsa",
  "osha",
  "hos",
  "hours of service",
  "eld",
  "safety compliance",
  "regulatory",
  "compliance",
  "audit",
  "sox",
  "hipaa",
  "gdpr",
  "iso",
  "haccp",
  "food safety",
  "background check",
  "drug screen",
  "mvr",
];

export const ACTION_VERBS: readonly string[] = [
  "led",
  "managed",
  "directed",
  "built",
  "launched",
  "delivered",
  "drove",
  "improved",
  "reduced",
  "increased",
  "streamlined",
  "standardized",
  "implemented",
  "designed",
  "coordinated",
  "negotiated",
  "recruited",
  "trained",
  "coached",
  "owned",
  "oversaw",
  "scaled",
  "turned around",
  "consolidated",
  "automated",
  "resolved",
  "eliminated",
  "grew",
  "achieved",
  // Added after the first end-to-end run: without these, real bullets
  // ("Cut dock dwell time by 27%...") were not recognised as verb-led and
  // fell back to a clumsier rewrite form.
  "cut",
  "ran",
  "held",
  "rebuilt",
  "restructured",
  "resequenced",
  "supervised",
  "hired",
  "promoted",
  "supported",
  "partnered",
  "established",
  "created",
  "developed",
  "introduced",
  "expanded",
  "maintained",
  "planned",
  "executed",
  "monitored",
  "reported",
  "saved",
  "rolled",
  "opened",
  "closed",
  "recovered",
  "simplified",
  "redesigned",
  "staffed",
  "onboarded",
  "audited",
  "secured",
];

/**
 * Terminology equivalence.
 *
 * `job` — how a posting tends to phrase it.
 * `evidence` — how a candidate tends to phrase the same work on a resume.
 * `preferred` — the phrasing to use in a rewrite, taken from the job's side.
 *
 * A group only fires when BOTH sides are present: the job asks in its wording
 * and the candidate's own material shows the work in theirs. That is the whole
 * safety property — this can rename real experience, never invent it.
 */
export interface TerminologyGroup {
  readonly id: string;
  readonly preferred: string;
  readonly job: readonly string[];
  readonly evidence: readonly string[];
}

export const TERMINOLOGY_GROUPS: readonly TerminologyGroup[] = [
  {
    id: "fleet-operations",
    preferred: "fleet and transportation operations",
    job: ["fleet management", "fleet operations", "transportation operations", "fleet"],
    evidence: [
      "delivery routes",
      "drivers",
      "route management",
      "daily routes",
      "vehicles",
      "van fleet",
      "tractor trailer",
      "last mile",
      "final mile",
      "middle mile",
      "dispatch",
    ],
  },
  {
    id: "route-planning",
    preferred: "route planning and optimization",
    job: ["route optimization", "route planning", "dispatch planning", "load planning"],
    evidence: [
      "routes",
      "routing",
      "dispatch",
      "route density",
      "sequencing",
      "load plan",
    ],
  },
  {
    id: "contractor-management",
    preferred: "third-party and contractor management",
    job: [
      "vendor management",
      "third party management",
      "3pl management",
      "carrier management",
      "contractor management",
      "supplier management",
    ],
    evidence: [
      "independent contractors",
      "contractors",
      "subcontractors",
      "dsp",
      "delivery service partners",
      "carriers",
      "vendors",
      "3pl",
    ],
  },
  {
    id: "continuous-improvement",
    preferred: "continuous improvement",
    // "lean" and "six sigma" are deliberately NOT on the job side. They are
    // methodologies people are certified in, and inferring them from
    // "streamlined a process" would hand the candidate a credential.
    job: ["continuous improvement", "process improvement", "operational excellence"],
    evidence: [
      "streamlined",
      "standardized",
      "reduced waste",
      "improved process",
      "eliminated",
      "root cause",
      "process redesign",
      "efficiency",
    ],
  },
  {
    id: "workforce-leadership",
    preferred: "workforce leadership",
    job: [
      "people leadership",
      "team leadership",
      "workforce management",
      "labor management",
      "staff management",
      "direct reports",
    ],
    evidence: [
      "supervised",
      "managed a team",
      "led a team",
      "drivers",
      "associates",
      "employees",
      "staff",
      "direct reports",
      "hired",
      "coached",
      "trained",
    ],
  },
  {
    id: "safety-program",
    preferred: "safety program management",
    // Narrowed after review: "dot compliance" and "fmcsa" were on the job side
    // and fired on generic safety wording. A regulatory compliance claim has
    // to be evidenced literally, so those now fall through to a literal match.
    job: ["safety management", "safety program", "safety leadership"],
    evidence: [
      "safety",
      "accident",
      "incident rate",
      "injury",
      "preventable incidents",
      "safety program",
      "audits",
    ],
  },
  {
    id: "warehouse-operations",
    preferred: "warehouse and distribution operations",
    job: [
      "warehouse operations",
      "distribution center",
      "dc operations",
      "fulfillment",
    ],
    evidence: [
      "warehouse",
      "dock",
      "inbound",
      "outbound",
      "inventory",
      "sortation",
      "cross-dock",
      "receiving",
      "staging",
    ],
  },
  {
    id: "customer-experience",
    preferred: "customer experience management",
    job: ["customer experience", "customer satisfaction", "client relationship"],
    evidence: [
      "customer",
      "client",
      "complaints",
      "escalations",
      "service level",
      "on-time",
      "nps",
      "satisfaction",
    ],
  },
  {
    id: "kpi-management",
    preferred: "KPI and performance management",
    // Evidence narrowed: a bare "%" used to qualify, so any bullet containing
    // a percentage looked like performance management.
    job: ["kpi", "performance management", "scorecard", "sla"],
    evidence: [
      "on-time",
      "scorecard",
      "service level",
      "productivity",
      "metrics",
      "targets",
      "performance",
    ],
  },
  {
    id: "capacity-planning",
    preferred: "capacity and demand planning",
    job: ["capacity planning", "demand planning", "forecasting", "volume planning"],
    evidence: [
      "peak",
      "volume",
      "forecast",
      "staffing plan",
      "headcount plan",
      "seasonal",
    ],
  },
  {
    id: "technology-adoption",
    preferred: "operational technology adoption",
    job: ["technology implementation", "system implementation", "automation"],
    evidence: [
      "rolled out",
      "implemented",
      "deployed",
      "adopted",
      "migrated",
      "new system",
      "telematics",
      "scanners",
    ],
  },
  {
    id: "budget-management",
    preferred: "budget management",
    job: ["budget management", "cost control", "expense management"],
    evidence: ["budget", "cost", "expense", "spend", "savings", "reduced cost"],
  },
  {
    id: "branch-operations",
    preferred: "multi-site operations",
    job: [
      "multi-site",
      "multi site",
      "branch operations",
      "regional operations",
      "district",
    ],
    evidence: [
      "branch",
      "sites",
      "locations",
      "facilities",
      "region",
      "district",
      "stations",
    ],
  },
];

/**
 * ADJACENT, NOT EQUIVALENT.
 *
 * These are the pairs where a candidate has done something CLOSE to what the
 * posting asks for, and where relabelling it would quietly upgrade the claim.
 * P&L is the example that made this list necessary: running an $18M operating
 * BUDGET is not owning a P&L — a P&L has a revenue line — and an earlier draft
 * of this file happily rewrote one into the other.
 *
 * An adjacent hit produces a PARTIAL match carrying the warning below. It
 * never produces a rewrite, and it never counts as a strong match.
 */
export interface AdjacentConcept {
  readonly id: string;
  readonly job: readonly string[];
  readonly evidence: readonly string[];
  /** Said to the user, verbatim, on the evidence matrix row. */
  readonly warning: string;
}

export const ADJACENT_CONCEPTS: readonly AdjacentConcept[] = [
  {
    id: "budget-is-not-pnl",
    job: ["p&l", "profit and loss", "p&l responsibility", "p&l ownership"],
    evidence: ["budget", "operating budget", "cost center", "expense", "spend"],
    warning:
      "You can evidence budget ownership, which is not the same as P&L ownership — a P&L carries a revenue line. State the budget figure you actually owned; do not claim P&L unless you owned revenue as well.",
  },
  {
    id: "improvement-is-not-certification",
    job: ["lean", "six sigma", "lean six sigma", "black belt", "green belt", "kaizen"],
    evidence: [
      "streamlined",
      "standardized",
      "reduced waste",
      "process improvement",
      "root cause",
    ],
    warning:
      "You can evidence process improvement work. Lean and Six Sigma are certifications — claim the certification only if you hold it, and describe the improvement work on its own terms otherwise.",
  },
  {
    id: "compliance-is-specific",
    job: ["dot compliance", "fmcsa", "hours of service", "osha compliance", "hazmat"],
    evidence: ["safety", "training", "audit", "compliance"],
    warning:
      "Named regulatory frameworks are matched literally, not inferred from general safety work. If you have operated under this specific framework, add it to your profile as a confirmed fact.",
  },
  {
    id: "support-is-not-ownership",
    job: ["own", "ownership", "accountable for", "full responsibility"],
    evidence: ["supported", "assisted", "helped", "participated", "contributed"],
    warning:
      "Your evidence describes supporting this work rather than owning it. Keep the verb you earned — an interviewer will ask who made the decisions.",
  },
];

/**
 * Abbreviations that mean exactly the same thing as the word a posting uses.
 *
 * This list is short and it stays short. Expanding "B.S." to "bachelor" is
 * reading the same fact in different letters; expanding "supervised" to
 * "director" would be inventing one. Only unambiguous, credential-preserving
 * equivalences belong here — found because the demo candidate holds a B.S. and
 * the matrix reported his bachelor's degree as not evidenced.
 */
export const ABBREVIATION_EXPANSIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["bs", ["bachelor", "degree"]],
  ["b.s", ["bachelor", "degree"]],
  ["ba", ["bachelor", "degree"]],
  ["b.a", ["bachelor", "degree"]],
  ["bsc", ["bachelor", "degree"]],
  ["bachelors", ["bachelor", "degree"]],
  ["ms", ["master", "degree"]],
  ["m.s", ["master", "degree"]],
  ["ma", ["master", "degree"]],
  ["msc", ["master", "degree"]],
  ["mba", ["master", "degree"]],
  ["masters", ["master", "degree"]],
  ["phd", ["doctorate", "degree"]],
  ["aa", ["associate", "degree"]],
  ["as", ["associate", "degree"]],
]);

/** Every phrase that can trigger a terminology group, for quick scanning. */
export const TERMINOLOGY_JOB_INDEX: ReadonlyMap<string, TerminologyGroup> = (() => {
  const index = new Map<string, TerminologyGroup>();
  for (const group of TERMINOLOGY_GROUPS) {
    for (const phrase of group.job) index.set(normalize(phrase), group);
  }
  return index;
})();

/** Match a vocabulary list against free text, returning the terms present. */
export function findVocabulary(text: string, vocabulary: readonly string[]): string[] {
  const haystack = ` ${normalize(text)} `;
  const found: string[] = [];
  for (const term of vocabulary) {
    const needle = ` ${normalize(term)} `;
    if (haystack.includes(needle) && !found.includes(term)) found.push(term);
  }
  return found;
}

/** Stem set for a vocabulary phrase, memoised per call site by the caller. */
export function phraseStems(phrase: string): Set<string> {
  return new Set(tokenize(phrase).map(stem));
}
