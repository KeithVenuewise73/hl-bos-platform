/**
 * The HSCS Operations Assessment request — the site's single primary
 * conversion (Website IA §8, Page Specifications §4.9).
 *
 * Everything in this module is PURE: vocabularies, validation, and the shape of
 * the payload handed to the database. It holds no network code and no React, so
 * the rules that decide whether a real operator's request is accepted or
 * refused are unit-testable without a browser or a database.
 *
 * VALIDATION IS DUPLICATED ON PURPOSE. These rules mirror
 * `public.submit_operations_assessment_request` in migration 0048. The database
 * check is the one that actually holds — it cannot be bypassed — and this one
 * exists so a person gets a useful message instead of a raw SQL error. Where
 * they differ, the database wins; the tests assert they agree.
 *
 * HONESTY: nothing here promises a response time, a price, or an outcome. The
 * page says what is true — the request reaches the founder — and no more,
 * because no response-time commitment has been approved.
 */

export interface Option {
  readonly value: string;
  readonly label: string;
}

/**
 * What the operator runs. Mirrors the five built industry pages plus the two
 * honest escapes, so an operator whose work does not fit is not forced to
 * mislabel it. Values are the industry slugs, so a request can be read against
 * the industry pages without a translation table.
 */
export const OPERATION_TYPES: readonly Option[] = [
  { value: "warehousing-fulfillment", label: "Warehousing & fulfillment" },
  { value: "middle-mile-logistics", label: "Middle-mile logistics" },
  { value: "final-mile-retail-delivery", label: "Final-mile retail delivery" },
  {
    value: "white-glove-high-touch-delivery",
    label: "White-glove / high-touch delivery",
  },
  { value: "direct-to-customer-cold-chain", label: "Direct-to-customer / cold chain" },
  {
    value: "manufacturing-heavy-operations",
    label: "Manufacturing with heavy operations",
  },
  { value: "other", label: "Something else" },
];

/**
 * The assessment domains, verbatim from the Operations Assessment service page
 * (`services.ts`, S0 scope). Asking which one hurts most is the single most
 * useful triage fact, and "not sure" is a real answer — an operator who cannot
 * yet name the problem is precisely who the assessment is for.
 */
export const PRIMARY_CONCERNS: readonly Option[] = [
  { value: "operations", label: "Operations overall" },
  { value: "transportation-fleet", label: "Transportation & fleet" },
  { value: "warehousing-distribution", label: "Warehousing & distribution" },
  { value: "technology", label: "Technology" },
  { value: "growth", label: "Growth" },
  { value: "financial", label: "Financial / margin" },
  { value: "ai-readiness", label: "AI readiness" },
  { value: "not-sure", label: "Not sure yet — that's part of what I need" },
];

/** Rough size, as bands. Nobody has to disclose exact numbers to ask a question. */
export const OPERATION_SCALES: readonly Option[] = [
  { value: "under-10", label: "Under 10 vehicles or 1 facility" },
  { value: "10-50", label: "10–50 vehicles, or 1–2 facilities" },
  { value: "50-200", label: "50–200 vehicles, or 3–5 facilities" },
  { value: "200-plus", label: "200+ vehicles, or 6+ facilities" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

/** Field length caps. The database caps too; these produce a civil message. */
export const LIMITS = {
  companyName: 300,
  contactName: 300,
  email: 300,
  phone: 60,
  role: 200,
  whatPrompted: 4000,
} as const;

/** The raw strings a submitted form yields, before any trust is placed in them. */
export interface RawRequest {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  role?: string;
  operationTypes?: readonly string[];
  operationScale?: string;
  primaryConcern?: string;
  whatPrompted?: string;
  consentPrivacy?: boolean;
  consentContact?: boolean;
  sourcePage?: string;
  /** Hidden field no person ever sees. A value here means an automated filler. */
  honeypot?: string;
}

export type FieldName =
  | "companyName"
  | "contactName"
  | "email"
  | "phone"
  | "role"
  | "operationScale"
  | "primaryConcern"
  | "whatPrompted"
  | "consentPrivacy"
  | "consentContact";

export type FieldErrors = Partial<Record<FieldName, string>>;

/** The payload shape `submit_operations_assessment_request(jsonb)` expects. */
export interface IntakePayload {
  readonly contact: {
    readonly companyName: string;
    readonly contactName: string;
    readonly email: string;
    readonly phone?: string;
    readonly role?: string;
  };
  readonly operation: { readonly types?: readonly string[]; readonly scale?: string };
  readonly priorities: { readonly primaryConcern?: string };
  readonly context: { readonly whatPrompted?: string };
  readonly consent: { readonly privacy: true; readonly contact: true };
  readonly sourcePage?: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly payload: IntakePayload }
  | { readonly ok: false; readonly errors: FieldErrors };

const clean = (v: string | undefined): string => (v ?? "").trim();
const values = (opts: readonly Option[]) => new Set(opts.map((o) => o.value));

/**
 * The same email shape the database enforces: something, an @, something, a
 * dot, something — no spaces. Deliberately permissive. A stricter pattern
 * rejects real addresses, and the only check that matters is whether a reply
 * actually arrives.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(raw: RawRequest): ValidationResult {
  const errors: FieldErrors = {};

  const companyName = clean(raw.companyName);
  const contactName = clean(raw.contactName);
  const email = clean(raw.email).toLowerCase();
  const phone = clean(raw.phone);
  const role = clean(raw.role);
  const whatPrompted = clean(raw.whatPrompted);
  const operationScale = clean(raw.operationScale);
  const primaryConcern = clean(raw.primaryConcern);

  if (!companyName) errors.companyName = "Tell us the company name.";
  else if (companyName.length > LIMITS.companyName)
    errors.companyName = `Please keep this under ${LIMITS.companyName} characters.`;

  if (!contactName) errors.contactName = "Tell us who you are.";
  else if (contactName.length > LIMITS.contactName)
    errors.contactName = `Please keep this under ${LIMITS.contactName} characters.`;

  if (!email) errors.email = "We need an email address to reply to.";
  else if (email.length > LIMITS.email)
    errors.email = `Please keep this under ${LIMITS.email} characters.`;
  else if (!EMAIL_RE.test(email))
    errors.email = "That doesn't look like an email address.";

  if (phone.length > LIMITS.phone)
    errors.phone = `Please keep this under ${LIMITS.phone} characters.`;
  if (role.length > LIMITS.role)
    errors.role = `Please keep this under ${LIMITS.role} characters.`;
  if (whatPrompted.length > LIMITS.whatPrompted)
    errors.whatPrompted = `Please keep this under ${LIMITS.whatPrompted} characters.`;

  // An unrecognised choice means a tampered or stale form, not a typo. Refuse it
  // rather than storing a value nothing can interpret later.
  if (operationScale && !values(OPERATION_SCALES).has(operationScale))
    errors.operationScale = "Please choose one of the listed options.";
  if (primaryConcern && !values(PRIMARY_CONCERNS).has(primaryConcern))
    errors.primaryConcern = "Please choose one of the listed options.";

  // Consent is never assumed and never pre-checked.
  if (raw.consentPrivacy !== true)
    errors.consentPrivacy =
      "Please confirm you've read how we handle your information.";
  if (raw.consentContact !== true)
    errors.consentContact = "Please confirm we may contact you about this request.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const types = (raw.operationTypes ?? [])
    .map((t) => t.trim())
    .filter((t) => values(OPERATION_TYPES).has(t));

  const payload: IntakePayload = {
    contact: {
      companyName,
      contactName,
      email,
      ...(phone ? { phone } : {}),
      ...(role ? { role } : {}),
    },
    operation: {
      ...(types.length ? { types } : {}),
      ...(operationScale ? { scale: operationScale } : {}),
    },
    priorities: { ...(primaryConcern ? { primaryConcern } : {}) },
    context: { ...(whatPrompted ? { whatPrompted } : {}) },
    consent: { privacy: true, contact: true },
    ...(clean(raw.sourcePage) ? { sourcePage: clean(raw.sourcePage) } : {}),
  };

  return { ok: true, payload };
}

/**
 * A filled honeypot means an automated filler, not a person. Handled separately
 * from validation because the response is different: there is no message worth
 * showing and nothing worth storing.
 */
export function looksAutomated(raw: RawRequest): boolean {
  return clean(raw.honeypot) !== "";
}

/** Read a submitted form into RawRequest. Checkbox absence is `false`, not undefined. */
export function fromFormData(form: {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}): RawRequest {
  const str = (n: string): string => {
    const v = form.get(n);
    return typeof v === "string" ? v : "";
  };
  return {
    companyName: str("companyName"),
    contactName: str("contactName"),
    email: str("email"),
    phone: str("phone"),
    role: str("role"),
    operationTypes: form
      .getAll("operationTypes")
      .filter((v): v is string => typeof v === "string"),
    operationScale: str("operationScale"),
    primaryConcern: str("primaryConcern"),
    whatPrompted: str("whatPrompted"),
    // An HTML checkbox sends nothing at all when unticked.
    consentPrivacy: form.get("consentPrivacy") !== null,
    consentContact: form.get("consentContact") !== null,
    sourcePage: str("sourcePage"),
    honeypot: str("companyWebsite"),
  };
}
