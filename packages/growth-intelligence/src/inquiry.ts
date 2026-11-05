// Website inquiries: HLD and HSCS site forms -> the Revenue Center.
//
//   website server -> buildInquiry (validate, spam checks, routing, attribution)
//                  -> submitInquiry -> revenue.ingest_inquiry (one transaction)
//
// The website's server calls this with its own service-account session
// (role service_account in that business's tenant), never a service-role key
// and never from the browser. revenue.ingest_inquiry is idempotent, so a
// retried submission cannot create a second record.
//
// Routing: the website a form is on decides the business, unless the
// visitor's industry points at the other business — then the inquiry waits
// for a person (status needs_review). It is never moved automatically.
//
// Consent: "you may contact me about this inquiry" is NOT marketing consent.
// Only an explicit, separate marketing opt-in is recorded as consent.

import { classifyTouch } from "./attribution.ts";
import { INDUSTRIES } from "./industries.ts";
import { identityKeys, normaliseEmail, normalisePhone } from "./identity.ts";
import { routeLead, type RoutingResult } from "./routing.ts";
import type { HlbosRpc } from "./revenue-center.ts";
import { sha256 } from "./revenue-center.ts";
import type { BusinessLine } from "./types.ts";

export interface InquiryInput {
  site: BusinessLine;
  contactName: string;
  email?: string | undefined;
  phone?: string | undefined;
  company?: string | undefined;
  /** What the visitor said their business is. */
  industryText?: string | undefined;
  message?: string | undefined;
  /** Customer-provided operating facts (HSCS: routes and vehicles). Stored as said, never scored as observed. */
  customerProvided?: Record<string, string> | undefined;
  /** Agreed to be contacted about THIS inquiry. */
  contactConsent: boolean;
  /** Separately opted in to marketing. Absent or false = no marketing consent. */
  marketingConsent?: boolean | undefined;
  consentTextVersion?: string | undefined;
  /** Honeypot field: real visitors never fill it. */
  honeypot?: string | undefined;
  /** ms between the form rendering and the submit. */
  fillTimeMs?: number | undefined;
  landingUrl?: string | undefined;
  referrer?: string | undefined;
  /** A per-submission id from the form, for idempotent retries. */
  submissionId?: string | undefined;
  submittedAt: string;
  isSynthetic: boolean;
}

export interface InquiryPayload {
  idempotency_key: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry_text: string | null;
  industry_key: string | null;
  message: string | null;
  attribution: Record<string, unknown>;
  consent_marketing: boolean;
  consent_text_version: string | null;
  consent_evidence: Record<string, unknown>;
  spam_reasons: string[];
  routing: {
    status: "routed" | "needs_review";
    line: BusinessLine | null;
    reasons: string[];
  };
  identity_keys: string[];
  is_synthetic: boolean;
}

export class InquiryValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InquiryValidationError";
  }
}

const MAX = { name: 200, company: 200, industry: 200, message: 5000 };

export function spamReasons(i: InquiryInput): string[] {
  const r: string[] = [];
  if ((i.honeypot ?? "").trim() !== "") r.push("honeypot field filled");
  if (i.fillTimeMs !== undefined && i.fillTimeMs < 2500)
    r.push("form submitted faster than a person can type");
  const links =
    ((i.message ?? "") + " " + (i.company ?? "")).match(/https?:\/\//gi)?.length ?? 0;
  if (links > 3) r.push(`${links} links in the message`);
  if (
    /\b(viagra|casino|crypto ?airdrop|seo backlinks?|guest post)\b/i.test(
      i.message ?? "",
    )
  )
    r.push("spam phrase");
  return r;
}

function industryKeyFor(site: BusinessLine, text: string | undefined): string | null {
  const t = ` ${(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const hit = INDUSTRIES.filter((i) => i.core && i.line === site).find((i) =>
    i.routingLabel.split(" ").some((w) => w.length > 2 && t.includes(` ${w} `)),
  );
  return hit?.key ?? null;
}

/** Validate, check for spam, route and attribute. Throws InquiryValidationError for bad input. */
export function buildInquiry(i: InquiryInput): InquiryPayload {
  const problems: string[] = [];
  const email = i.email ? normaliseEmail(i.email) : undefined;
  if (i.email && !email) problems.push("The email address is not valid.");
  const phone = i.phone ? normalisePhone(i.phone) : undefined;
  if (i.phone && !phone) problems.push("The phone number is not a 10-digit number.");
  if (!email && !phone) problems.push("An email address or a phone number is needed.");
  if (!i.contactName.trim()) problems.push("A name is needed.");
  if (!i.contactConsent)
    problems.push("The visitor must agree to be contacted about the inquiry.");
  if (i.contactName.length > MAX.name) problems.push("The name is too long.");
  if ((i.company ?? "").length > MAX.company)
    problems.push("The company name is too long.");
  if ((i.industryText ?? "").length > MAX.industry)
    problems.push("The industry is too long.");
  if ((i.message ?? "").length > MAX.message) problems.push("The message is too long.");
  if (problems.length) throw new InquiryValidationError(problems);

  const routing: RoutingResult = routeLead(
    {
      origin: "inbound_inquiry",
      campaignKey: undefined,
      inboundSite: i.site,
      vertical: undefined,
      industry: i.industryText,
    },
    [],
  );
  const touch = classifyTouch({
    landingUrl: i.landingUrl,
    referrer: i.referrer,
    at: i.submittedAt,
  });
  const customer = Object.entries(i.customerProvided ?? {}).filter(
    ([, v]) => v.trim() !== "",
  );
  const message = [
    (i.message ?? "").trim(),
    ...customer.map(([k, v]) => `[customer-provided] ${k}: ${v.trim()}`),
  ]
    .filter(Boolean)
    .join("\n");
  const idem = i.submissionId
    ? `form:${i.site}:${i.submissionId}`
    : `form:${i.site}:${sha256([email ?? "", phone ?? "", i.message ?? "", i.submittedAt.slice(0, 16)].join("|")).slice(0, 32)}`;

  return {
    idempotency_key: idem,
    contact_name: i.contactName.trim(),
    email: email ?? null,
    phone: phone ?? null,
    company: i.company?.trim() || null,
    industry_text: i.industryText?.trim() || null,
    industry_key: industryKeyFor(i.site, i.industryText),
    message: message || null,
    attribution: {
      channel: touch.channel,
      source: touch.source ?? null,
      medium: touch.medium ?? null,
      campaign: touch.campaign ?? null,
      gclid: touch.gclid ?? null,
      evidence: touch.evidence,
    },
    consent_marketing: i.marketingConsent === true,
    consent_text_version: i.consentTextVersion ?? null,
    consent_evidence: {
      contact_about_inquiry: i.contactConsent,
      marketing_opt_in: i.marketingConsent === true,
      text_version: i.consentTextVersion ?? null,
      at: i.submittedAt,
      site: i.site,
    },
    spam_reasons: spamReasons(i),
    routing:
      routing.status === "routed"
        ? { status: "routed", line: routing.line, reasons: routing.reasons }
        : { status: "needs_review", line: null, reasons: routing.reasons },
    identity_keys: identityKeys({
      name: i.company?.trim() || i.contactName,
      email,
      phone,
    }).filter((k) => !k.startsWith("name:")),
    is_synthetic: i.isSynthetic,
  };
}

export interface IngestResult {
  inquiry_id: string;
  status: "routed" | "needs_review" | "spam" | "duplicate";
  prospect_id?: string | null;
  replayed: boolean;
}

/**
 * Send to revenue.ingest_inquiry. Retries transient failures; safe because
 * the database deduplicates on the idempotency key.
 */
export async function submitInquiry(
  rpc: HlbosRpc,
  serviceActor: string,
  siteTenant: string,
  payload: InquiryPayload,
  opts: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<IngestResult> {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let n = 1; n <= attempts; n++) {
    try {
      return await rpc.call<IngestResult>(serviceActor, "revenue.ingest_inquiry", {
        p_site_tenant: siteTenant,
        p_payload: payload,
      });
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Permission, validation and constraint errors will not succeed on retry.
      if (/privilege|required|violat|invalid|not an HLG/i.test(msg) || n === attempts)
        break;
      await sleep(200 * 2 ** (n - 1));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// ---- Site form mappings --------------------------------------------------

/** The HLD site's LeadRecord (apps/herman-legacy-digital/src/lib/intake.ts). */
export interface HldLeadRecord {
  organization: { name: string; website: string | null; industry: string | null };
  contact: { name: string; email: string; phone: string | null };
  intent: { goals: string | null; challenges: string | null };
  attribution: Record<string, string>;
  consentAcknowledged: true;
}

export function fromHldLeadRecord(
  r: HldLeadRecord,
  meta: {
    submittedAt: string;
    isSynthetic: boolean;
    submissionId?: string;
    honeypot?: string;
    fillTimeMs?: number;
  },
): InquiryInput {
  return {
    site: "hld",
    contactName: r.contact.name,
    email: r.contact.email,
    phone: r.contact.phone ?? undefined,
    company: r.organization.name,
    industryText: r.organization.industry ?? undefined,
    message: [
      r.intent.goals && `Goals: ${r.intent.goals}`,
      r.intent.challenges && `Challenges: ${r.intent.challenges}`,
    ]
      .filter(Boolean)
      .join("\n"),
    contactConsent: r.consentAcknowledged === true,
    // The HLD form asks for consent to be contacted about the inquiry only.
    marketingConsent: false,
    landingUrl: r.attribution["landing"] ?? r.attribution["landingUrl"],
    referrer: r.attribution["referrer"],
    submissionId: meta.submissionId,
    honeypot: meta.honeypot,
    fillTimeMs: meta.fillTimeMs,
    submittedAt: meta.submittedAt,
    isSynthetic: meta.isSynthetic,
  };
}

/** The HSCS assessment request (public.hscs_assessment_requests columns). */
export interface HscsAssessmentRequest {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  business_type?: string;
  routes_vehicles?: string;
  main_challenge?: string;
  message?: string;
  hp_field?: string;
  contact_consent: boolean;
  marketing_consent?: boolean;
  consent_text_version?: string;
}

export function fromHscsAssessmentRequest(
  r: HscsAssessmentRequest,
  meta: {
    submittedAt: string;
    isSynthetic: boolean;
    submissionId?: string;
    fillTimeMs?: number;
    landingUrl?: string;
    referrer?: string;
  },
): InquiryInput {
  return {
    site: "hscs",
    contactName: r.name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    industryText: r.business_type,
    message: [r.main_challenge && `Main challenge: ${r.main_challenge}`, r.message]
      .filter(Boolean)
      .join("\n"),
    customerProvided: r.routes_vehicles
      ? { routes_and_vehicles: r.routes_vehicles }
      : undefined,
    contactConsent: r.contact_consent,
    marketingConsent: r.marketing_consent === true,
    consentTextVersion: r.consent_text_version,
    honeypot: r.hp_field,
    fillTimeMs: meta.fillTimeMs,
    landingUrl: meta.landingUrl,
    referrer: meta.referrer,
    submissionId: meta.submissionId,
    submittedAt: meta.submittedAt,
    isSynthetic: meta.isSynthetic,
  };
}
