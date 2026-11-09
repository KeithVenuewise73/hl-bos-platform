// Google connectors: what each needs, what it unlocks, and whether it is
// actually connected.
//
// "Connected" is computed from evidence — a stored credential reference AND a
// successful test call — never assumed from configuration. A connector with no
// credential says so, and says exactly who has to grant what.
//
// Credentials never live in source control. HL-BOS stores them as Vault
// references in integrations.connections (migration 0011); the console stores
// local tokens in .env.local, which is git-ignored.
//
// The connector keys match integrations.connectors in HL-BOS Core
// (google_business, google_search_console, pagespeed are seeded there).
// google_analytics_4 and google_ads are not yet seeded — adding them is a row
// insert, listed in the plan, not done here.

export type GoogleConnectorKey =
  | "google_business"
  | "google_search_console"
  | "google_analytics_4"
  | "google_ads"
  | "pagespeed";

export interface GoogleConnector {
  key: GoogleConnectorKey;
  name: string;
  /** OAuth scopes requested — the narrowest that does the job. */
  scopes: string[];
  /** What else Google requires before the API answers. */
  prerequisites: string[];
  unlocks: string[];
  /** In HL-BOS Core integrations.connectors today (verified read-only, 2026-11-05). */
  seededInHlbos: boolean;
  /** Money involved in using it at all. */
  cost: string;
}

export const GOOGLE_CONNECTORS: readonly GoogleConnector[] = [
  {
    key: "google_business",
    name: "Google Business Profile",
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    prerequisites: [
      "Google must approve HLG's project for Business Profile API access (application form).",
      "The profile owner signs in and grants access; HLG only manages profiles it is authorised for.",
    ],
    unlocks: [
      "Profile performance (searches, views, calls, direction requests, website clicks).",
      "Reading and replying to reviews — replies only with approval.",
      "Proposing profile edits — applied only with the owner's approval.",
    ],
    seededInHlbos: true,
    cost: "No API charge.",
  },
  {
    key: "google_search_console",
    name: "Google Search Console",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    prerequisites: ["The site must be verified in Search Console by its owner."],
    unlocks: ["Search queries, impressions, clicks and positions for HLG's own sites."],
    seededInHlbos: true,
    cost: "No API charge.",
  },
  {
    key: "google_analytics_4",
    name: "Google Analytics 4",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    prerequisites: [
      "A GA4 property per website, with the measurement tag installed.",
      "A cookie/consent banner where visitors' consent is required (Consent Mode).",
    ],
    unlocks: [
      "Visits, lead events (generate_lead, qualify_lead, close_convert_lead) by channel.",
    ],
    seededInHlbos: false,
    cost: "No charge for the standard property.",
  },
  {
    key: "google_ads",
    name: "Google Ads",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    prerequisites: [
      "A Google Ads account and an approved developer token.",
      "Ad spend is a budget decision for the owner; nothing here starts a campaign.",
    ],
    unlocks: [
      "Ad spend and conversions, and importing signed deals as offline conversions.",
    ],
    seededInHlbos: false,
    cost: "API free; advertising is billed by Google at the budget the owner sets.",
  },
  {
    key: "pagespeed",
    name: "PageSpeed Insights",
    scopes: [],
    prerequisites: ["An API key (no user sign-in)."],
    unlocks: ["Technical speed and accessibility measurements for any public page."],
    seededInHlbos: true,
    cost: "No charge within Google's quota.",
  },
];

export interface ConnectionEvidence {
  key: GoogleConnectorKey;
  /** A stored credential reference exists (a Vault id, or a saved console token). */
  hasCredential: boolean;
  /** ISO timestamp of the last successful test call, if any. */
  lastSuccessAt: string | undefined;
  /** Plain-English error from the last attempt, if it failed. */
  lastError: string | undefined;
}

export type ConnectorStatus = "connected" | "failing" | "not_tested" | "not_connected";

export interface ConnectorReadiness {
  connector: GoogleConnector;
  status: ConnectorStatus;
  explanation: string;
}

export function connectorReadiness(
  evidence: readonly ConnectionEvidence[],
  now: Date,
  staleAfterDays = 7,
): ConnectorReadiness[] {
  return GOOGLE_CONNECTORS.map((c) => {
    const e = evidence.find((x) => x.key === c.key);
    if (!e || !e.hasCredential)
      return {
        connector: c,
        status: "not_connected",
        explanation: `Not connected. Needs: ${c.prerequisites.join(" ")}`,
      };
    if (e.lastError)
      return {
        connector: c,
        status: "failing",
        explanation: `Last attempt failed: ${e.lastError}`,
      };
    if (!e.lastSuccessAt)
      return {
        connector: c,
        status: "not_tested",
        explanation:
          "A credential is saved but has never been tested, so it is not counted as connected.",
      };
    const ageDays = (now.getTime() - Date.parse(e.lastSuccessAt)) / 86_400_000;
    if (ageDays > staleAfterDays)
      return {
        connector: c,
        status: "not_tested",
        explanation: `Last successful call was ${Math.floor(ageDays)} days ago; re-test before relying on it.`,
      };
    return {
      connector: c,
      status: "connected",
      explanation: `Working as of ${e.lastSuccessAt}.`,
    };
  });
}

// ---- Business Profile creation eligibility -------------------------------

/**
 * Google's guidelines: a Business Profile is for a business that makes
 * in-person contact with customers during stated hours — at its own location,
 * or at the customer's (a service-area business). Virtual offices, mailboxes
 * and online-only businesses are not eligible. Every answer must come from the
 * owner; an unanswered question blocks creation.
 */
export interface GbpEligibilityAnswers {
  inPersonContact: boolean | undefined;
  hasStaffedLocationOrServiceArea: boolean | undefined;
  isVirtualOfficeOrMailbox: boolean | undefined;
  ownerAuthorisesCreation: boolean | undefined;
  /** Who answered, for the audit trail. */
  answeredBy: string | undefined;
}

export type GbpEligibility =
  | { eligible: true; basis: string[] }
  | { eligible: false; reasons: string[]; unanswered: string[] };

export function gbpCreationEligibility(a: GbpEligibilityAnswers): GbpEligibility {
  const unanswered: string[] = [];
  const reasons: string[] = [];
  if (a.inPersonContact === undefined)
    unanswered.push("Does the business meet customers in person?");
  else if (!a.inPersonContact) reasons.push("Online-only businesses are not eligible.");
  if (a.hasStaffedLocationOrServiceArea === undefined)
    unanswered.push("Is there a staffed location, or a defined service area?");
  else if (!a.hasStaffedLocationOrServiceArea)
    reasons.push("There must be a staffed location or a service area.");
  if (a.isVirtualOfficeOrMailbox === undefined)
    unanswered.push("Is the address a virtual office or mailbox?");
  else if (a.isVirtualOfficeOrMailbox)
    reasons.push("Virtual offices and mailboxes are not eligible.");
  if (a.ownerAuthorisesCreation !== true)
    unanswered.push("Has the business owner authorised HLG to create the profile?");
  if (!a.answeredBy) unanswered.push("Who answered these questions?");
  if (unanswered.length === 0 && reasons.length === 0)
    return {
      eligible: true,
      basis: [
        `Answers confirmed by ${a.answeredBy ?? ""}.`,
        "In-person contact; staffed location or service area; not a virtual office; owner authorised.",
      ],
    };
  return { eligible: false, reasons, unanswered };
}
