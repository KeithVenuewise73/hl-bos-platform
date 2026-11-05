// Customer-facing proposals, built from an opportunity review.
//
// A proposal states the observable situation, the problem, the recommended
// solution, exactly what HLG provides, the one-time and monthly cost, the
// expected operational benefits, cheaper alternatives, and the assumptions and
// limits. Three things it will not do:
//
//   - Invent a price. Prices come from the CEO's price book; an offer with no
//     price makes the proposal `blocked`, and the reason says which offer.
//   - Invent savings or returns. Benefits are operational and qualitative; a
//     money or percentage promise is rejected by the validator.
//   - Send itself. A ready proposal still needs the owner's approval before it
//     leaves HLG (approval.ts).

import { offer, type Offer } from "./business-lines.ts";
import { findPromises, validateReview, type OpportunityReview } from "./review.ts";
import type { BusinessLine } from "./types.ts";

/** CEO-set prices, in cents. Absent = not decided. */
export interface PriceBook {
  line: BusinessLine;
  /** offerKey -> one-time price in cents. */
  oneTimeCents: Record<string, number>;
  /** offerKey -> monthly price in cents. */
  monthlyCents: Record<string, number>;
  /** Who set the prices and when. */
  approvedBy: string;
  approvedAt: string;
}

export interface ProposalLine {
  offerKey: string;
  name: string;
  provides: string;
  oneTimeCents: number | null;
  monthlyCents: number | null;
}

export interface Proposal {
  line: BusinessLine;
  leadId: string;
  businessName: string;
  status: "ready_for_approval" | "blocked";
  blockedReasons: string[];
  currentSituation: string[];
  problemOrOpportunity: string[];
  recommendedSolution: string;
  lines: ProposalLine[];
  totalOneTimeCents: number | null;
  totalMonthlyCents: number | null;
  expectedBenefits: string[];
  alternatives: string[];
  assumptionsAndLimitations: string[];
  /** Always true: nothing goes to a customer without the owner's approval. */
  requiresApproval: true;
}

/** Operational benefits per offer. Qualitative by design: no numbers, no promises. */
const BENEFITS: Record<string, string> = {
  "hld.website":
    "Visitors can see what the business offers and contact it from a phone.",
  "hld.hosting":
    "The site stays up to date and backed up without the owner managing it.",
  "hld.crm": "Every inquiry and follow-up is recorded in one place.",
  "hld.reputation": "Reviews are seen and answered promptly.",
  "hld.local-presence":
    "The Google Business Profile shows accurate hours, services and contact details.",
  "hld.booking": "Customers can request or book a time without a phone call.",
  "hld.automation": "Missed calls and unanswered inquiries get a timely follow-up.",
  "hscs.assessment":
    "A written picture of current dispatch, routing, fleet and safety practice, from the company's own figures.",
  "hscs.logistics-consulting":
    "An experienced second opinion on transportation operations.",
  "hscs.fleet": "Maintenance and compliance dates are tracked instead of remembered.",
  "hscs.dispatch": "Dispatch decisions are recorded and visible to the team.",
  "hscs.dvir":
    "Inspections are completed and defects followed up on a phone, with a record.",
  "hscs.driver-kpi":
    "Driver and route performance is measured the same way every week.",
  "hscs.profitability":
    "Lanes, routes and customers are compared on the company's own numbers.",
};

function priced(book: PriceBook | undefined, o: Offer): ProposalLine {
  const one = book?.oneTimeCents[o.key];
  const mon = book?.monthlyCents[o.key];
  return {
    offerKey: o.key,
    name: o.name,
    provides: o.provides,
    // A recurring offer has no one-time fee unless one is set; an
    // implementation/consulting offer has no monthly fee unless one is set.
    oneTimeCents: one ?? (o.kind === "recurring" ? 0 : null),
    monthlyCents: mon ?? (o.kind === "recurring" ? null : 0),
  };
}

function sum(xs: (number | null)[]): number | null {
  return xs.some((x) => x === null)
    ? null
    : xs.reduce<number>((a, x) => a + (x ?? 0), 0);
}

export interface ProposalOptions {
  /** Offer keys to include; default: every opportunity in the review. */
  include?: string[];
  priceBook?: PriceBook;
}

export function buildProposal(
  r: OpportunityReview,
  opts: ProposalOptions = {},
): Proposal {
  const blockedReasons: string[] = [];
  const reviewProblems = validateReview(r);
  if (reviewProblems.length > 0)
    blockedReasons.push(...reviewProblems.map((p) => `Review: ${p}`));
  if (opts.priceBook && opts.priceBook.line !== r.line)
    blockedReasons.push("The price book belongs to the other business line.");

  const keys = opts.include ?? r.opportunities.map((o) => o.offerKey);
  const offers: Offer[] = [];
  for (const k of keys) {
    const o = offer(k);
    if (!o) blockedReasons.push(`"${k}" is not an HLG offer.`);
    else if (o.line !== r.line)
      blockedReasons.push(`"${o.name}" belongs to the other business line.`);
    else offers.push(o);
  }
  if (offers.length === 0) blockedReasons.push("The proposal recommends nothing.");

  const book =
    opts.priceBook && opts.priceBook.line === r.line ? opts.priceBook : undefined;
  const lines = offers.map((o) => priced(book, o));
  for (const l of lines) {
    if (l.oneTimeCents === null || l.monthlyCents === null)
      blockedReasons.push(
        `No price has been set for "${l.name}". Prices are the owner's decision.`,
      );
  }

  const gaps = r.observed.filter((f) => f.status !== "present");
  const currentSituation = r.observed
    .slice(0, 12)
    .map(
      (f) => `${f.label}: ${f.evidence} (${f.source}, ${f.observedAt.slice(0, 10)})`,
    );
  const problemOrOpportunity = r.opportunities
    .filter((o) => keys.includes(o.offerKey))
    .map(
      (o) =>
        `${o.offerName} — ${o.rationale} (estimated opportunity, not a measured result)`,
    );
  if (problemOrOpportunity.length === 0 && gaps.length > 0)
    problemOrOpportunity.push(...gaps.map((g) => `${g.label}: ${g.evidence}`));

  const alternatives = alternativesFor(r.line, offers);
  const expectedBenefits = offers.map((o) => BENEFITS[o.key] ?? o.provides);
  for (const b of [...expectedBenefits, ...alternatives])
    for (const p of findPromises(b))
      blockedReasons.push(`A benefit makes a promise (${p}).`);

  const assumptionsAndLimitations = [
    ...r.assumptions.map((a) => `${a.statement} ${a.howToVerify}`),
    ...(r.notChecked.length > 0
      ? [`${r.notChecked.length} item(s) were not checked and are not reflected here.`]
      : []),
    "Benefits describe what the work provides. They are not a promise of revenue, savings or search ranking.",
    "Google decides search and map rankings; no one can guarantee them.",
  ];

  return {
    line: r.line,
    leadId: r.leadId,
    businessName: r.businessName,
    status: blockedReasons.length === 0 ? "ready_for_approval" : "blocked",
    blockedReasons,
    currentSituation,
    problemOrOpportunity,
    recommendedSolution:
      offers.length === 0
        ? "None yet."
        : `${offers.map((o) => o.name).join(", ")} from ${r.line === "hld" ? "Herman Legacy Digital" : "Herman Supply Chain Solutions"}.`,
    lines,
    totalOneTimeCents: sum(lines.map((l) => l.oneTimeCents)),
    totalMonthlyCents: sum(lines.map((l) => l.monthlyCents)),
    expectedBenefits,
    alternatives,
    assumptionsAndLimitations,
    requiresApproval: true,
  };
}

/** Less expensive or smaller options, always offered. */
function alternativesFor(line: BusinessLine, chosen: Offer[]): string[] {
  const out: string[] = [];
  if (chosen.length > 1)
    out.push(`Start with ${chosen[0]!.name} alone and add the rest later.`);
  if (line === "hld") {
    out.push(
      "Do-it-yourself: the owner can update the Google Business Profile free of charge.",
    );
    if (chosen.some((o) => o.key === "hld.website"))
      out.push("A one-page site instead of a full redesign, at a lower one-time cost.");
  } else {
    out.push("A single operational assessment, with no ongoing engagement.");
    out.push("Use the recommendations in-house without HLG software.");
  }
  return out;
}
