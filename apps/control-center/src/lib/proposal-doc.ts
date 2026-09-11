/**
 * The proposal document: its shape, and how it is set on a page.
 *
 * WHY THIS IS A STRING RENDERER AND NOT A REACT COMPONENT
 *
 * A proposal is printed. It goes out as a PDF or a link, and what matters is
 * how it looks on paper and in a browser with no stylesheet of ours loaded
 * around it. A self-contained HTML document with its own `@page` rules gives
 * that; a React tree inside the console's chrome does not.
 *
 * It is also the shape `site_render.ts` already uses for shop pages, which
 * means that if a proposal ever needs to be served from the shop-pages host
 * rather than printed from the console, this file moves rather than being
 * rewritten.
 *
 * ---------------------------------------------------------------------------
 * SNAKE_CASE ON PURPOSE
 *
 * `ProposalDocument` is a STORAGE format, not an app object: it is written to
 * `transform_audit.proposals.document` verbatim, and the migration's honesty
 * trigger reads `offer[].capability` and `offer[].deliverable_today` out of it
 * in SQL. Two spellings of the same field is how a guard silently stops
 * guarding, so the whole document is spelled the way the database reads it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS RENDERER WILL NOT DO
 *
 * Every section below has an EMPTY state that says what is missing and why.
 * None of them omits itself. A proposal with no audit says no audit was run; a
 * proposal with no call says nobody has spoken to the shop; a proposal with no
 * prices says pricing is not in this document. An omitted section reads as
 * "nothing to report there", which is a claim, and usually a false one.
 *
 * There is no branch here that invents a number, a finding, a price or a
 * benefit. Everything on the page came out of the database or was typed by the
 * person who built it.
 */

import type { Gap, ShopStack } from "./capability-match";
import { TOPICS } from "./discovery-sql";

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** One thing we are offering, frozen. Mirrors a `Gap` from capability-match. */
export interface OfferLine {
  capability: string;
  name: string;
  /** Why THIS shop, citing what we actually observed or were told. */
  because: string;
  /** The downtime or lost income it addresses, in the owner's terms. */
  recovers: string;
  /** Only ever true when the catalog said `available`. The trigger checks it. */
  deliverable_today: boolean;
  /** We could not observe the signal, so the line is a question, not a claim. */
  needs_confirming: boolean;
}

export interface AuditSnapshot {
  run_at: string | null;
  /** Null is a real answer: nothing was scoreable. */
  composite: number | null;
  /** Stated, never implied -- "over 2 of 4 dimensions" is part of the claim. */
  coverage: { scored: number; possible: number };
  findings: {
    code: string;
    dimension: string;
    statement: string;
    evidence_url: string | null;
    confidence: string;
    severity: string;
  }[];
}

export interface CallSnapshot {
  answered_at: string | null;
  /** What they actually said, in the words we will read back to them. */
  said: { label: string; answer: "yes" | "no"; detail?: string }[];
  /** What nobody got to. NAMED, so the shop can see the limits of the picture. */
  not_asked: string[];
  notes: string;
}

export interface InvestmentLine {
  label: string;
  /** Free text, typed by a person. Never computed, never a default. */
  amount: string;
  cadence: "once" | "monthly";
}

export interface ProposalDocument {
  shop: {
    name: string;
    locality: string | null;
    website_url: string | null;
    phone: string | null;
  };
  prepared_by: string;
  prepared_at: string;
  /** The covering paragraph, written by whoever made the call. */
  message: string;
  audit: AuditSnapshot | null;
  call: CallSnapshot | null;
  offer: OfferLine[];
  investment: { lines: InvestmentLine[]; note: string };
  next_steps: string[];
}

/** Escapes text for HTML. Every interpolation below goes through it. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null): string {
  if (iso === null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * A short human reference for a proposal.
 *
 * The first block of the uuid. Enough to quote on a phone call, and it is not
 * a second identifier that could disagree with the first.
 */
export function referenceOf(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const CSS = `
:root{
  --ink:#15171a; --muted:#5d646e; --faint:#8b939e;
  --rule:#e2e5ea; --accent:#8a2b1f; --wash:#faf9f7;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--wash); color:var(--ink);
  font:16px/1.62 Georgia,'Iowan Old Style','Times New Roman',serif;
}
.sheet{max-width:46rem;margin:0 auto;padding:3.5rem 2rem 5rem}
h1,h2,h3,.eyebrow,.meta,th,.tag,.stamp,.btn{
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
}
.eyebrow{
  font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;
  color:var(--accent);font-weight:700;margin:0 0 .6rem;
}
h1{font-size:2.3rem;line-height:1.14;margin:0 0 .4rem;letter-spacing:-.01em}
.meta{font-size:.8rem;color:var(--faint);margin:0;letter-spacing:.02em}
.stamp{
  display:inline-block;margin:0 0 1.4rem;padding:.3rem .7rem;
  border:1px solid var(--accent);color:var(--accent);
  font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;
}
.lede{font-size:1.08rem;margin:1.6rem 0 0;white-space:pre-wrap}
section{margin:3rem 0 0;page-break-inside:auto}
h2{
  font-size:.74rem;letter-spacing:.2em;text-transform:uppercase;
  color:var(--muted);font-weight:700;margin:0 0 1rem;
  padding-bottom:.5rem;border-bottom:1px solid var(--rule);
}
h3{font-size:1.02rem;margin:0 0 .2rem;line-height:1.35}
p{margin:0 0 .85rem}
.none{color:var(--faint);font-style:italic;margin:0}
.card{
  background:#fff;border:1px solid var(--rule);border-radius:3px;
  padding:1.1rem 1.2rem;margin:0 0 .7rem;page-break-inside:avoid;
}
.card.today{border-left:3px solid var(--accent)}
.card.later{border-left:3px solid var(--rule)}
.card p{margin:.45rem 0 0;font-size:.95rem;color:var(--muted)}
.card p.recovers{color:var(--ink)}
.tag{
  float:right;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;
  font-weight:700;color:var(--faint);padding-top:.25rem;
}
.lead-in{font-size:.92rem;color:var(--muted);margin:0 0 1rem}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th{
  text-align:left;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-weight:700;padding:0 0 .5rem;border-bottom:1px solid var(--rule);
}
td{padding:.62rem 0;border-bottom:1px solid var(--rule);vertical-align:top}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.said{margin:0;padding:0;list-style:none}
.said li{padding:.42rem 0;border-bottom:1px solid var(--rule);font-size:.95rem}
.said .a{float:right;font-size:.8rem;color:var(--muted)}
ol.steps{margin:0;padding-left:1.15rem}
ol.steps li{margin:0 0 .45rem}
.evidence{font-size:.82rem;color:var(--faint);word-break:break-all}
a{color:var(--accent)}
footer{
  margin:3.5rem 0 0;padding-top:1.2rem;border-top:1px solid var(--rule);
  font-size:.82rem;color:var(--faint);
}
@media print{
  body{background:#fff;font-size:11.5pt}
  .sheet{max-width:none;padding:0}
  .card{break-inside:avoid}
  section{break-inside:auto}
  h2{break-after:avoid}
  @page{margin:18mm 16mm}
}
@media (max-width:34rem){
  .sheet{padding:2rem 1.15rem 3rem}
  h1{font-size:1.75rem}
  .tag{float:none;display:block;padding:0 0 .3rem}
  .said .a{float:none;display:block;color:var(--ink)}
}
`.trim();

function offerCard(o: OfferLine): string {
  return `<div class="card ${o.deliverable_today ? "today" : "later"}">
${o.needs_confirming ? `<span class="tag">to confirm with you</span>` : ""}
<h3>${esc(o.name)}</h3>
<p>${esc(o.because)}</p>
<p class="recovers">${esc(o.recovers)}</p>
</div>`;
}

function auditSection(a: AuditSnapshot | null): string {
  if (a === null) {
    return `<section><h2>What we looked at</h2>
<p class="none">No audit of this shop's online presence has been run, so nothing in this proposal rests on one.</p></section>`;
  }

  // Coverage is part of the claim, not a caveat. "72 out of 100" means
  // something different when it is 72 over two of four dimensions.
  const left = a.coverage.possible - a.coverage.scored;
  const cov =
    a.composite === null
      ? `We could not score this shop's online presence: none of the ${a.coverage.possible} dimensions we weigh could be assessed from outside.`
      : `We scored it <strong>${a.composite} out of 100</strong>, over ${a.coverage.scored} of the ${a.coverage.possible} dimensions we weigh. ` +
        (left > 0
          ? `The remaining ${left} ${left === 1 ? "dimension" : "dimensions"} could not be assessed from outside, so ${left === 1 ? "it is" : "they are"} not in that number.`
          : `All of them could be assessed.`);

  const when = fmtDate(a.run_at);
  const findings =
    a.findings.length === 0
      ? `<p class="none">The audit recorded no findings.</p>`
      : a.findings
          .map(
            (f) => `<div class="card">
${f.confidence === "unknown" ? `<span class="tag">could not verify</span>` : ""}
<h3>${esc(f.statement)}</h3>
${
  f.evidence_url === null
    ? ""
    : `<p class="evidence">Seen at ${esc(f.evidence_url)}</p>`
}
</div>`,
          )
          .join("\n");

  return `<section><h2>What we looked at</h2>
<p class="lead-in">${when === "" ? "We reviewed" : `On ${esc(when)} we reviewed`} what anyone can see of this shop online — the website, how it is found, and what a customer meets when they get there. ${cov}</p>
${findings}
</section>`;
}

function callSection(c: CallSnapshot | null): string {
  if (c === null || c.answered_at === null) {
    return `<section><h2>What you told us</h2>
<p class="none">We have not spoken to you yet. Everything in this proposal comes from what can be seen from outside, which is a partial picture by definition.</p></section>`;
  }

  const said =
    c.said.length === 0
      ? `<p class="none">Nothing was recorded from the call.</p>`
      : `<ul class="said">${c.said
          .map(
            (s) =>
              `<li><span class="a">${s.answer === "yes" ? "Yes" : "No"}${
                s.detail === undefined || s.detail === "" ? "" : ` — ${esc(s.detail)}`
              }</span>${esc(s.label)}</li>`,
          )
          .join("")}</ul>`;

  // The limits of the picture, stated by us before the shop finds them. A
  // proposal that quietly treats "we never asked" as "they do not have it" is
  // the failure this whole system is built to avoid.
  const gaps =
    c.not_asked.length === 0
      ? ""
      : `<p class="lead-in" style="margin-top:1rem">We did not get to: ${esc(
          c.not_asked.join("; "),
        )}. Nothing below assumes an answer to those.</p>`;

  return `<section><h2>What you told us</h2>
<p class="lead-in">From our conversation on ${esc(fmtDate(c.answered_at))}. If any of this is wrong, tell us and the rest of the document changes with it.</p>
${said}
${gaps}
${c.notes === "" ? "" : `<p class="lead-in" style="margin-top:1rem">${esc(c.notes)}</p>`}
</section>`;
}

function offerSection(offer: OfferLine[]): string {
  const today = offer.filter((o) => o.deliverable_today);
  const later = offer.filter((o) => !o.deliverable_today);

  const todayBlock =
    today.length === 0
      ? `<p class="none">Nothing in this proposal is deliverable today.</p>`
      : today.map(offerCard).join("\n");

  // The label is the point. A roadmap item may be shown -- a shop buying an
  // operating system is entitled to know where it is going -- but it can never
  // be the thing that closes the deal, and it is never quietly mixed in above.
  const laterBlock =
    later.length === 0
      ? ""
      : `<section><h2>Where this goes next</h2>
<p class="lead-in">These are built or being built into BarberOS but are <strong>not available yet</strong>. They are here so you can see the direction, and nothing in this proposal's price depends on them.</p>
${later.map(offerCard).join("\n")}
</section>`;

  return `<section><h2>What we would do</h2>
<p class="lead-in">Each of these answers something specific about your shop, not a feature list.</p>
${todayBlock}
</section>
${laterBlock}`;
}

function investmentSection(inv: { lines: InvestmentLine[]; note: string }): string {
  if (inv.lines.length === 0) {
    return `<section><h2>Investment</h2>
<p class="none">Pricing is not stated in this document.${
      inv.note === "" ? "" : ` ${esc(inv.note)}`
    }</p></section>`;
  }
  const once = inv.lines.filter((l) => l.cadence === "once");
  const monthly = inv.lines.filter((l) => l.cadence === "monthly");
  const rows = (ls: InvestmentLine[], head: string) =>
    ls.length === 0
      ? ""
      : `<table><thead><tr><th>${head}</th><th class="num">Amount</th></tr></thead><tbody>
${ls.map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${esc(l.amount)}</td></tr>`).join("\n")}
</tbody></table>`;

  return `<section><h2>Investment</h2>
${rows(once, "One-off")}
${once.length > 0 && monthly.length > 0 ? '<div style="height:1.4rem"></div>' : ""}
${rows(monthly, "Monthly")}
${inv.note === "" ? "" : `<p class="lead-in" style="margin-top:1rem">${esc(inv.note)}</p>`}
</section>`;
}

/**
 * The whole document, as one standalone page.
 *
 * `isDraft` puts a visible stamp on it. A draft that reached a shop's inbox
 * looking identical to a sent one is a real way to lose an argument about what
 * was offered, and the console can only prevent it here.
 */
export function renderProposal(
  doc: ProposalDocument,
  opts: { reference: string; isDraft: boolean },
): string {
  const steps =
    doc.next_steps.length === 0
      ? `<p class="none">No next steps are set out in this document.</p>`
      : `<ol class="steps">${doc.next_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;

  const where = doc.shop.locality === null ? "" : ` · ${esc(doc.shop.locality)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Proposal — ${esc(doc.shop.name)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="sheet">
<p class="eyebrow">${esc(doc.prepared_by)}</p>
${opts.isDraft ? `<div class="stamp">Draft — not sent</div>` : ""}
<h1>${esc(doc.shop.name)}</h1>
<p class="meta">${esc(fmtDate(doc.prepared_at))}${where} · Reference ${esc(opts.reference)}</p>
${doc.message === "" ? "" : `<p class="lede">${esc(doc.message)}</p>`}

${auditSection(doc.audit)}
${callSection(doc.call)}
${offerSection(doc.offer)}
${investmentSection(doc.investment)}

<section><h2>What happens next</h2>
${steps}
</section>

<footer>
Everything in this document comes from what we could see of ${esc(doc.shop.name)} online
or from what you told us directly. Where we could not see something, it says so
rather than assuming. Nothing here is an estimate of your figures.
</footer>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Assembly
//
// Turning what we know into what we say. Every function below is pure and
// tested, because this is the join where an honest database could still
// produce a dishonest document.
// ---------------------------------------------------------------------------

/** Who the proposal is from. A fact about the business, so it lives in code. */
export const PREPARED_BY = "Herman Legacy Digital";

/**
 * What the shop told us, in the form it will be read back to them.
 *
 * Returns null when nobody has called. NOT an empty snapshot: "we have not
 * spoken to you" and "we spoke to you and you said nothing" are different
 * sentences, and the renderer prints different ones.
 *
 * The three-state discipline survives to its last hop here. A topic whose
 * answer is null goes into `not_asked` -- printed in the document as a limit
 * on the picture -- and never into `said` as a "no".
 */
export function callSnapshotOf(
  stack: ShopStack,
  answeredAt: string | null,
  notes: string,
): CallSnapshot | null {
  if (answeredAt === null) return null;

  const said: CallSnapshot["said"] = [];
  const notAsked: string[] = [];
  for (const t of TOPICS) {
    const v = stack[t.stack];
    if (v === true || v === false) {
      // The platform they book on is the difference between "you can be booked
      // online" and "GlossGenius can be booked online", which is the whole
      // pitch for a shop that already books fine.
      const detail =
        t.key === "online_booking" && v === true && stack.bookingPlatform !== null
          ? stack.bookingPlatform
          : null;
      said.push({
        label: t.topic,
        answer: v ? "yes" : "no",
        ...(detail === null ? {} : { detail }),
      });
    } else {
      notAsked.push(t.topic.toLowerCase());
    }
  }
  return { answered_at: answeredAt, said, not_asked: notAsked, notes };
}

/**
 * The matched gaps as offer lines.
 *
 * A straight mapping, deliberately: `deliverable_today` carries through exactly
 * as capability-match computed it, and the migration's honesty trigger checks
 * it again against the catalog before the document is stored. Two independent
 * checks of the same promise, which is the right number for a promise.
 */
export function offerOf(gaps: Gap[]): OfferLine[] {
  return gaps.map((g) => ({
    capability: g.capability,
    name: g.name,
    because: g.because,
    recovers: g.recovers,
    deliverable_today: g.deliverableToday,
    needs_confirming: g.needsConfirming,
  }));
}

/**
 * Suggested next steps, DERIVED rather than written.
 *
 * These describe what we would do, so they are not a claim about the shop --
 * but they are still only produced from real state: a build step exists only if
 * something is actually deliverable, and a confirmation step exists only if
 * something genuinely went unanswered. They are editable, and an empty list
 * prints as "no next steps are set out" rather than as nothing.
 */
export function suggestedNextSteps(
  offer: OfferLine[],
  call: CallSnapshot | null,
): string[] {
  const steps: string[] = [];
  const today = offer.filter((o) => o.deliverable_today);
  if (today.length > 0) {
    steps.push(
      `A short call to confirm the details we would need for ${today
        .map((o) => o.name.toLowerCase())
        .join(" and ")}.`,
    );
    steps.push("We build it and you review it before anything goes live.");
  }
  const open = offer.filter((o) => o.needs_confirming).length;
  if (open > 0 || (call !== null && call.not_asked.length > 0)) {
    steps.push(
      "We go through the questions this document could not answer, so the next version of it is complete.",
    );
  }
  return steps;
}

/**
 * The whole document, ready to be stored.
 *
 * `message`, `investment` and `next_steps` are the parts a person writes; the
 * rest is the snapshot. Once this is drafted the snapshot stops moving, so the
 * wording can be worked on without the evidence shifting underneath it.
 */
export function assembleDocument(input: {
  shop: ProposalDocument["shop"];
  audit: AuditSnapshot | null;
  stack: ShopStack;
  answeredAt: string | null;
  notes: string;
  gaps: Gap[];
  preparedAt: string;
  message?: string;
  investment?: ProposalDocument["investment"];
  nextSteps?: string[];
}): ProposalDocument {
  const call = callSnapshotOf(input.stack, input.answeredAt, input.notes);
  const offer = offerOf(input.gaps);
  return {
    shop: input.shop,
    prepared_by: PREPARED_BY,
    prepared_at: input.preparedAt,
    message: input.message ?? "",
    audit: input.audit,
    call,
    offer,
    investment: input.investment ?? { lines: [], note: "" },
    next_steps: input.nextSteps ?? suggestedNextSteps(offer, call),
  };
}
