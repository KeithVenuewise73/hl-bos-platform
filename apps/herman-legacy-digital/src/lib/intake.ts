/**
 * Assessment / consultation intake — PURE validation + lead-record construction.
 *
 * This is the commercial front door. It reuses the existing customer lifecycle:
 * a submission becomes a lead/organization/contact record and an assessment
 * REQUEST (never a completed assessment). HONESTY (Principle 10): we NEVER claim
 * an AI assessment has run — the result is always a `requested` state with an
 * honest next step. Persistence is performed by a server adapter (route.ts);
 * this module is the pure, tested core.
 */

export type IntakeKind = "visibility_assessment" | "consultation";

export interface IntakeInput {
  kind: IntakeKind;
  businessName?: string;
  website?: string;
  industry?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  goals?: string;
  challenges?: string;
  consent?: boolean;
  /** Source attribution (utm/referrer/path), preserved end-to-end. */
  source?: Record<string, string>;
}

export interface LeadRecord {
  kind: IntakeKind;
  organization: { name: string; website: string | null; industry: string | null };
  contact: { name: string; email: string; phone: string | null };
  intent: { goals: string | null; challenges: string | null };
  /** The engagement/assessment record is a REQUEST — not a completed assessment. */
  assessment: { status: "requested"; type: IntakeKind };
  attribution: Record<string, string>;
  consentAcknowledged: true;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  lead: LeadRecord | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

/** Validate an intake submission and, if valid, build the normalized lead record. */
export function validateIntake(input: IntakeInput): ValidationResult {
  const errors: string[] = [];

  const businessName = clean(input.businessName);
  const contactName = clean(input.contactName);
  const email = clean(input.email);

  if (input.kind !== "visibility_assessment" && input.kind !== "consultation") {
    errors.push("Unknown request type.");
  }
  if (!businessName) errors.push("Business name is required.");
  if (!contactName) errors.push("Contact name is required.");
  if (!email) errors.push("Email is required.");
  else if (!EMAIL_RE.test(email)) errors.push("A valid email is required.");
  if (input.consent !== true)
    errors.push("Consent and privacy acknowledgment is required.");

  if (errors.length > 0) return { ok: false, errors, lead: null };

  const lead: LeadRecord = {
    kind: input.kind,
    organization: {
      name: businessName,
      website: clean(input.website) || null,
      industry: clean(input.industry) || null,
    },
    contact: {
      name: contactName,
      email,
      phone: clean(input.phone) || null,
    },
    intent: {
      goals: clean(input.goals) || null,
      challenges: clean(input.challenges) || null,
    },
    assessment: { status: "requested", type: input.kind },
    attribution: input.source ?? {},
    consentAcknowledged: true,
  };
  return { ok: true, errors: [], lead };
}

export type IntakeOutcome =
  | { status: "received"; ref: string; nextStep: string; persisted: boolean }
  | { status: "invalid"; errors: string[] };

/** The honest next step for a valid submission. Never claims an assessment ran. */
export function nextStepFor(kind: IntakeKind): string {
  return kind === "visibility_assessment"
    ? "Your visibility assessment request is in the queue. A Herman Legacy advisor will confirm scope and run the assessment — you'll be notified when results are ready."
    : "Your consultation request is received. A Herman Legacy advisor will reach out to schedule the next step.";
}

/** Deterministic reference id from the lead (no clock — safe for tests/SSR). */
export function referenceFor(lead: LeadRecord): string {
  const base = `${lead.kind}:${lead.contact.email}:${lead.organization.name}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return `HLD-${h.toString(36).toUpperCase().padStart(6, "0")}`;
}
