/**
 * Business Transformation Digital Intake (BTDI) — PURE validation + record
 * construction. No I/O, no clock, no secrets. Shared by the client form, the
 * API route, and the tests.
 *
 * This is the commercial front door to a Herman Legacy Digital Business
 * Transformation. A submission is a REQUEST to begin an investigation — never a
 * completed assessment (Principle 10). Persistence is performed by a server
 * adapter (btdi-persist.ts); this module is the pure, tested core.
 *
 * The section/field catalog below is the single source of truth: the form
 * renders from it, validation is derived from it, and the documentation cites
 * it. Change a field here and every consumer stays in sync.
 */

export type BtdiFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "textarea"
  | "select"
  | "checkbox-group"
  | "consent";

export interface BtdiField {
  /** Stable machine name; also the JSON key we persist. */
  name: string;
  label: string;
  type: BtdiFieldType;
  /** Required for a valid submission. Optional fields are recorded when given. */
  required?: boolean;
  /** Options for select / checkbox-group. */
  options?: string[];
  /** Short helper text shown under the field (plain, non-technical). */
  help?: string;
  placeholder?: string;
}

export interface BtdiSection {
  key: string;
  title: string;
  /** Optional plain-language reason we ask — shown for sensitive sections. */
  intro?: string;
  fields: BtdiField[];
}

/** Maximum accepted length for any single free-text answer (server-enforced). */
export const MAX_TEXT = 4000;
/** Maximum accepted length for short single-line answers. */
export const MAX_LINE = 300;

export const BUSINESS_STAGES = [
  "Pre-launch",
  "Less than 1 year",
  "1–3 years",
  "3–10 years",
  "10–25 years",
  "25+ years",
] as const;

const DISCOVERY_CHANNELS = [
  "Referrals",
  "Google",
  "Facebook",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "Paid advertising",
  "Word of mouth",
  "Email",
  "Other",
];

const SOFTWARE_CATEGORIES = [
  "CRM",
  "Scheduling",
  "Accounting",
  "Marketing",
  "Communication",
  "Payments",
  "Other",
];

const GROWTH_PRIORITIES = [
  "Visibility",
  "Leads",
  "Sales",
  "Efficiency",
  "Customer experience",
  "Time savings",
  "Team growth",
  "Other",
];

/**
 * The ten sections. `required` follows the directive's Section 1 intent, with
 * two deliberate, documented exceptions: Website is optional (our target
 * clients often have weak or no web presence — requiring a URL would exclude
 * exactly the businesses we serve), and every digital-presence profile is
 * optional ("Do not require platforms that do not apply"). Section 9 is fully
 * optional and explains why we ask.
 */
export const BTDI_SECTIONS: BtdiSection[] = [
  {
    key: "company",
    title: "Company Information",
    fields: [
      { name: "businessName", label: "Business name", type: "text", required: true },
      {
        name: "website",
        label: "Website",
        type: "url",
        placeholder: "https://",
        help: "Optional — leave blank if you don't have one yet.",
      },
      {
        name: "primaryContact",
        label: "Primary contact",
        type: "text",
        required: true,
      },
      { name: "contactTitle", label: "Contact title", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      {
        name: "location",
        label: "Business address or primary service location",
        type: "text",
        required: true,
      },
      { name: "industry", label: "Industry", type: "text", required: true },
      {
        name: "employeeCount",
        label: "Number of employees",
        type: "text",
        required: true,
      },
      {
        name: "yearEstablished",
        label: "Year established",
        type: "text",
        required: true,
      },
      {
        name: "businessStage",
        label: "Business stage",
        type: "select",
        required: true,
        options: [...BUSINESS_STAGES],
      },
      {
        name: "businessDescription",
        label: "Brief description of the business",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    key: "mission",
    title: "Mission and Vision",
    fields: [
      { name: "whyCreated", label: "Why was the business created?", type: "textarea" },
      { name: "problemSolved", label: "What problem does it solve?", type: "textarea" },
      { name: "differentiator", label: "What makes it different?", type: "textarea" },
      {
        name: "longTermGoals",
        label: "What are the long-term goals?",
        type: "textarea",
      },
    ],
  },
  {
    key: "market",
    title: "Products, Customers and Market",
    fields: [
      {
        name: "productsServices",
        label: "Products or services offered",
        type: "textarea",
      },
      { name: "idealCustomer", label: "Ideal customer", type: "textarea" },
      {
        name: "marketsServed",
        label: "Geographic markets currently served",
        type: "textarea",
      },
      {
        name: "marketsWanted",
        label: "New markets the business wants to enter",
        type: "textarea",
      },
      {
        name: "revenueModel",
        label: "Current revenue model",
        type: "textarea",
        help: "Optional — a general description is fine; no exact figures required.",
      },
      { name: "competitors", label: "Primary competitors, if known", type: "textarea" },
    ],
  },
  {
    key: "challenges",
    title: "Challenges and Chaos",
    fields: [
      {
        name: "topChallenges",
        label: "Three biggest business challenges",
        type: "textarea",
        required: true,
      },
      {
        name: "greatestFrustration",
        label: "Owner's greatest frustration",
        type: "textarea",
      },
      {
        name: "timeLost",
        label: "Areas where the business loses the most time",
        type: "textarea",
      },
      {
        name: "repetitiveTasks",
        label: "Repetitive tasks consuming the day",
        type: "textarea",
      },
      {
        name: "highestImpactProblem",
        label: "One problem whose solution would create the greatest impact",
        type: "textarea",
      },
      {
        name: "stressAreas",
        label: "Areas causing the greatest stress",
        type: "textarea",
      },
      {
        name: "hoursToReclaim",
        label: "Hours the owner would like to reclaim each week",
        type: "text",
      },
    ],
  },
  {
    key: "marketing",
    title: "Marketing and Visibility",
    fields: [
      {
        name: "discoveryChannels",
        label: "How customers currently find the business",
        type: "checkbox-group",
        options: DISCOVERY_CHANNELS,
      },
      {
        name: "marketingActivities",
        label: "Current marketing activities",
        type: "textarea",
      },
      {
        name: "runsPaidAds",
        label: "Does the company run paid advertising?",
        type: "select",
        options: ["Yes", "No", "Not sure"],
      },
      { name: "activeSocial", label: "Active social platforms", type: "textarea" },
      {
        name: "visibilityBarriers",
        label: "What prevents more customers from finding the business?",
        type: "textarea",
      },
    ],
  },
  {
    key: "digital",
    title: "Digital Presence",
    intro: "Add only the profiles that apply — leave the rest blank.",
    fields: [
      {
        name: "digitalWebsite",
        label: "Website",
        type: "url",
        placeholder: "https://",
      },
      {
        name: "googleBusiness",
        label: "Google Business Profile",
        type: "url",
        placeholder: "https://",
      },
      { name: "facebook", label: "Facebook", type: "url", placeholder: "https://" },
      { name: "instagram", label: "Instagram", type: "url", placeholder: "https://" },
      { name: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://" },
      { name: "tiktok", label: "TikTok", type: "url", placeholder: "https://" },
      { name: "youtube", label: "YouTube", type: "url", placeholder: "https://" },
      { name: "otherProfiles", label: "Other relevant profiles", type: "textarea" },
    ],
  },
  {
    key: "operations",
    title: "Customer Journey and Operations",
    fields: [
      {
        name: "leadToCustomer",
        label: "How a new lead becomes a customer",
        type: "textarea",
      },
      { name: "onboardingProcess", label: "The onboarding process", type: "textarea" },
      {
        name: "teamTimeSink",
        label: "Where the team spends the most time",
        type: "textarea",
      },
      {
        name: "customerComms",
        label: "Current customer communication methods",
        type: "textarea",
      },
      {
        name: "commonComplaints",
        label: "Most common customer complaints or questions",
        type: "textarea",
      },
      {
        name: "softwareUsed",
        label: "Current software used",
        type: "checkbox-group",
        options: SOFTWARE_CATEGORIES,
      },
      { name: "bottlenecks", label: "Known operational bottlenecks", type: "textarea" },
    ],
  },
  {
    key: "goals",
    title: "Goals",
    fields: [
      {
        name: "goals90Day",
        label: "Goals for the next 90 days",
        type: "textarea",
        required: true,
      },
      { name: "goals12Month", label: "Goals for the next 12 months", type: "textarea" },
      {
        name: "successDefinition",
        label: "How success will be defined",
        type: "textarea",
      },
      {
        name: "growthPriority",
        label: "Current growth priority",
        type: "select",
        options: GROWTH_PRIORITIES,
      },
    ],
  },
  {
    key: "worklife",
    title: "Work-Life Transformation",
    intro:
      "These questions are optional and can feel personal. We ask because a transformation is only successful if it gives the owner back time and freedom — knowing what matters to you helps us build a plan around it. Share only what you're comfortable sharing.",
    fields: [
      {
        name: "idealDay",
        label:
          "If the business ran the way you wanted, what would a normal day look like?",
        type: "textarea",
      },
      {
        name: "freedomMeaning",
        label: "What would more freedom mean personally?",
        type: "textarea",
      },
      {
        name: "preventedActivities",
        label: "What does the current business prevent you from prioritizing?",
        type: "textarea",
      },
      {
        name: "oneYearSuccess",
        label:
          "If we met one year from now, what would need to change for this to be a success?",
        type: "textarea",
      },
    ],
  },
  {
    key: "readiness",
    title: "Readiness and Constraints",
    fields: [
      {
        name: "commitment",
        label: "Commitment to implementing evidence-supported recommendations",
        type: "textarea",
      },
      {
        name: "budgetConstraints",
        label: "Known budget constraints",
        type: "textarea",
      },
      {
        name: "operationalConstraints",
        label: "Operational constraints",
        type: "textarea",
      },
      { name: "timing", label: "Timing or deadline", type: "text" },
      { name: "additionalComments", label: "Additional comments", type: "textarea" },
      {
        name: "consentPublicReview",
        label:
          "I consent to Herman Legacy Digital reviewing publicly available information about my business as part of the assessment.",
        type: "consent",
      },
      {
        name: "consentPrivacy",
        label: "I acknowledge the Herman Legacy Digital privacy policy.",
        type: "consent",
        required: true,
      },
      {
        name: "consentContact",
        label: "I consent to being contacted about my request.",
        type: "consent",
        required: true,
      },
    ],
  },
];

/** Field names whose value must be a valid URL when present. */
const URL_FIELDS = new Set(
  BTDI_SECTIONS.flatMap((s) => s.fields)
    .filter((f) => f.type === "url")
    .map((f) => f.name),
);

/** Checkbox-group field names (values are string arrays). */
export const MULTI_FIELDS = new Set(
  BTDI_SECTIONS.flatMap((s) => s.fields)
    .filter((f) => f.type === "checkbox-group")
    .map((f) => f.name),
);

export type BtdiValue = string | string[] | boolean;

/**
 * A raw inbound submission. Field answers are keyed by their catalog `name`.
 * Two reserved keys carry non-answer data:
 *   - `company_website_hp`: anti-spam honeypot — must be empty.
 *   - `source`: attribution (utm/referrer/path), preserved end-to-end.
 */
export interface BtdiInput {
  [key: string]: BtdiValue | Record<string, string> | undefined;
}

export interface BtdiRecord {
  /** Grouped, normalized answers keyed by section key. */
  sections: Record<string, Record<string, string | string[]>>;
  contact: {
    businessName: string;
    primaryContact: string;
    email: string;
    phone: string;
  };
  /** Denormalized facts used for the internal handoff summary. */
  summary: {
    businessName: string;
    primaryContact: string;
    businessStage: string;
    mainChallenge: string;
    ninetyDayGoal: string;
  };
  consent: { publicReview: boolean; privacy: boolean; contact: boolean };
  attribution: Record<string, string>;
  /** The record is always a REQUEST to begin — never a completed assessment. */
  status: "new";
}

export interface BtdiValidation {
  ok: boolean;
  errors: string[];
  record: BtdiRecord | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate a BTDI submission and, if valid, build the normalized record.
 * Server-authoritative: every rule here runs regardless of client-side checks.
 */
export function validateBtdi(input: BtdiInput): BtdiValidation {
  const errors: string[] = [];

  // Honeypot: a filled hidden field means a bot. Reject quietly-shaped.
  if (str(input["company_website_hp"])) {
    return { ok: false, errors: ["Submission could not be processed."], record: null };
  }

  const email = str(input["email"]).toLowerCase();

  // Required fields, derived from the catalog.
  for (const section of BTDI_SECTIONS) {
    for (const f of section.fields) {
      if (!f.required) continue;
      if (f.type === "consent") {
        if (input[f.name] !== true) errors.push(`${f.label}`);
      } else {
        if (!str(input[f.name])) errors.push(`${f.label} is required.`);
      }
    }
  }

  if (email && !EMAIL_RE.test(email)) errors.push("A valid email is required.");

  // URL validation (only when a value is present — most are optional).
  for (const name of URL_FIELDS) {
    const v = str(input[name]);
    if (v && !isValidUrl(v)) {
      const field = BTDI_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name);
      errors.push(
        `${field?.label ?? name} must be a valid URL (start with http:// or https://).`,
      );
    }
  }

  // Length caps on every provided answer.
  for (const section of BTDI_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === "consent" || f.type === "checkbox-group") continue;
      const v = str(input[f.name]);
      const cap = f.type === "textarea" ? MAX_TEXT : MAX_LINE;
      if (v.length > cap)
        errors.push(`${f.label} is too long (max ${cap} characters).`);
    }
  }

  if (errors.length > 0) return { ok: false, errors, record: null };

  // Build the normalized record from the catalog.
  const sections: BtdiRecord["sections"] = {};
  for (const section of BTDI_SECTIONS) {
    const out: Record<string, string | string[]> = {};
    for (const f of section.fields) {
      if (f.type === "consent") continue;
      if (f.type === "checkbox-group") {
        const raw = input[f.name];
        const arr = Array.isArray(raw)
          ? raw.map((x) => String(x).trim()).filter(Boolean)
          : [];
        if (arr.length > 0) out[f.name] = arr;
      } else {
        const v = f.name === "email" ? email : str(input[f.name]);
        if (v) out[f.name] = v;
      }
    }
    if (Object.keys(out).length > 0) sections[section.key] = out;
  }

  const attribution: Record<string, string> = {};
  const src = input["source"];
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === "string" && k.length <= 40) attribution[k] = v.slice(0, 200);
    }
  }

  const record: BtdiRecord = {
    sections,
    contact: {
      businessName: str(input["businessName"]),
      primaryContact: str(input["primaryContact"]),
      email,
      phone: str(input["phone"]),
    },
    summary: {
      businessName: str(input["businessName"]),
      primaryContact: str(input["primaryContact"]),
      businessStage: str(input["businessStage"]),
      mainChallenge: str(input["highestImpactProblem"]) || str(input["topChallenges"]),
      ninetyDayGoal: str(input["goals90Day"]),
    },
    consent: {
      publicReview: input["consentPublicReview"] === true,
      privacy: input["consentPrivacy"] === true,
      contact: input["consentContact"] === true,
    },
    attribution,
    status: "new",
  };

  return { ok: true, errors: [], record };
}

/** Deterministic reference id from the record (no clock — safe for tests/SSR). */
export function referenceFor(record: BtdiRecord): string {
  const base = `btdi:${record.contact.email}:${record.contact.businessName}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return `HLD-BT-${h.toString(36).toUpperCase().padStart(6, "0")}`;
}

/** The internal next step created by a valid submission (canonical status). */
export const INTERNAL_NEXT_STEP = "Business Transformation Investigation Pending";

/** The honest client-facing confirmation. Never claims an assessment has run. */
export function confirmationMessage(): string {
  return (
    "Thank you — your Business Transformation intake has been received. A Herman " +
    "Legacy Digital advisor will review your information and reach out to schedule " +
    "an initial review conversation. We typically respond within two business days. " +
    "No assessment has been run yet — this begins the process."
  );
}
