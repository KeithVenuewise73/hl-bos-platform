/**
 * ClaimValidator — the guardrail the whole product rests on.
 *
 * Every sentence the app generates passes through here before it can be shown
 * as final and before it can be exported. The validator answers one question:
 * is this sentence supported by evidence the candidate actually has?
 *
 * Three checks, in increasing strictness:
 *
 *   1. ATTACHMENT — a generated line must name the facts it came from. A line
 *      with no evidence is `unsupported`, no matter how plausible it reads.
 *
 *   2. NUMBERS — every quantity in the sentence must appear in the evidence.
 *      This is the check that stops "85 routes" quietly becoming "120 routes",
 *      and it is why `CareerFact.numbers` is extracted at write time.
 *
 *   3. VOCABULARY — every substantive word must come from the evidence, from
 *      the terminology the analysis explicitly licensed (a job phrase whose
 *      underlying work IS evidenced), or from a small closed list of connective
 *      words that carry no factual weight. Anything else is flagged for the
 *      user to confirm; it is never assumed true.
 *
 * `EXPORTABLE_STATUSES` is the boundary: `buildExportDocument()` drops
 * everything else, so an unsupported claim cannot reach a DOCX or a PDF even
 * if a UI bug let it reach the screen.
 */

import { extractNumbers, stem, tokenize, unique } from "./text.ts";
import type {
  CareerFact,
  GeneratedLine,
  ValidationStatus,
  ValidationStatus as Status,
} from "./types.ts";

/**
 * Words that structure a sentence without asserting anything.
 *
 * Adding a word here is a decision to let the generator use it unchecked —
 * so nothing that names a skill, a system, a scale or an outcome belongs in
 * this list. It is deliberately short.
 */
const CONNECTIVE_WORDS: ReadonlySet<string> = new Set(
  [
    "including",
    "include",
    "across",
    "while",
    "maintaining",
    "supporting",
    "spanning",
    "through",
    "via",
    "plus",
    "alongside",
    "covering",
    "ranging",
    "daily",
    "weekly",
    "monthly",
    "annual",
    "annually",
    "team",
    "teams",
    "role",
    "roles",
    "responsible",
    "responsibility",
    "experience",
    "work",
    "working",
    "year",
    "years",
    "level",
    "and",
    "with",
    "for",
    "the",
  ].map(stem),
);

export interface ClaimContext {
  /** The facts this line is derived from. */
  readonly evidence: readonly CareerFact[];
  /**
   * Terminology the analysis licensed for this candidate: job phrasings whose
   * underlying work is evidenced, plus keywords already present or supported.
   */
  readonly licensedTerms?: readonly string[];
}

export interface ClaimVerdict {
  readonly status: ValidationStatus;
  readonly notes: readonly string[];
}

function evidenceStems(evidence: readonly CareerFact[]): Set<string> {
  const out = new Set<string>();
  for (const fact of evidence) {
    for (const token of tokenize(`${fact.text} ${fact.context ?? ""}`))
      out.add(stem(token));
  }
  return out;
}

function evidenceNumbers(evidence: readonly CareerFact[]): Set<string> {
  const out = new Set<string>();
  for (const fact of evidence) {
    for (const n of fact.numbers) out.add(n);
    // Numbers are re-derived as well as read, so a fact written before the
    // extractor changed is still checked correctly.
    for (const n of extractNumbers(fact.text)) out.add(n);
  }
  return out;
}

/** Validate one generated sentence against its evidence. */
export function validateClaim(text: string, context: ClaimContext): ClaimVerdict {
  const notes: string[] = [];

  if (context.evidence.length === 0) {
    return {
      status: "unsupported",
      notes: [
        "No source evidence is attached to this sentence, so it cannot be verified.",
      ],
    };
  }

  const numbersInClaim = extractNumbers(text);
  const supportedNumbers = evidenceNumbers(context.evidence);
  const inventedNumbers = numbersInClaim.filter((n) => !supportedNumbers.has(n));
  if (inventedNumbers.length > 0) {
    return {
      status: "unsupported",
      notes: [
        `These figures do not appear in the source evidence: ${inventedNumbers.join(", ")}. A number that is not in your own material will never be written into your resume.`,
      ],
    };
  }

  const allowed = evidenceStems(context.evidence);
  for (const term of context.licensedTerms ?? []) {
    for (const token of tokenize(term)) allowed.add(stem(token));
  }

  const unknown = unique(
    tokenize(text)
      .map(stem)
      .filter((token) => !allowed.has(token) && !CONNECTIVE_WORDS.has(token)),
  );

  if (unknown.length > 0) {
    notes.push(
      `These words are not traceable to your evidence: ${unknown.join(", ")}. Confirm them, edit the sentence, or leave them out.`,
    );
    return { status: "needs_confirmation", notes };
  }

  const anyUserConfirmed = context.evidence.some((f) => f.source === "user_confirmed");
  const status: Status = anyUserConfirmed ? "user_confirmed" : "verified";
  return { status, notes };
}

/** Apply the validator to a line, returning a line with its verdict stamped. */
export function validateLine(
  line: GeneratedLine,
  context: ClaimContext,
): GeneratedLine {
  const verdict = validateClaim(line.text, context);
  return { ...line, validation: verdict.status, validationNotes: verdict.notes };
}

export function isExportable(line: GeneratedLine): boolean {
  return line.validation === "verified" || line.validation === "user_confirmed";
}

/** Lines the user must look at before the document can be called finished. */
export function requiresConfirmation(lines: readonly GeneratedLine[]): GeneratedLine[] {
  return lines.filter((l) => l.validation === "needs_confirmation");
}

export function unsupportedLines(lines: readonly GeneratedLine[]): GeneratedLine[] {
  return lines.filter((l) => l.validation === "unsupported");
}
