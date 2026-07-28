// CEO Review package. For every finding it states the confidence, the evidence
// used, what information is missing, and the exact next questions to ask — so the
// CEO can validate a finding before presenting it to a customer. This is the
// honesty mechanism: low-confidence or thinly-evidenced findings are flagged,
// not hidden.

import type { AssessmentInput, Finding, ReviewItem } from "./types.ts";
import { confidenceOf } from "./priority.ts";

export function buildReview(input: AssessmentInput, findings: Finding[]): ReviewItem[] {
  return findings.map((f) => {
    const attached = f.supportingEvidence.filter((e) =>
      e.startsWith("Attached evidence"),
    );
    const confidence = confidenceOf(f.rating, attached.length);

    const missing: string[] = [];
    if (attached.length === 0)
      missing.push(
        `No corroborating evidence attached for ${f.label} beyond the rating.`,
      );
    if (f.domain === "financial" && !input.financial)
      missing.push(
        "No financial figures supplied — financial impact cannot be quantified.",
      );
    if (f.rating === 0)
      missing.push(
        `Rating of 0/5 is extreme; confirm it reflects reality, not a data gap.`,
      );

    const nextQuestions = [
      `What specifically drives the low ${f.label} rating today?`,
      `What have you already tried to improve ${f.label}?`,
      f.domain === "financial"
        ? `What is the current monthly figure behind ${f.label}?`
        : `What would "good" look like for ${f.label} in 90 days?`,
    ];

    return {
      subject: `${f.label} (${f.domain})`,
      confidence,
      evidenceUsed: f.supportingEvidence,
      missingInformation: missing.length
        ? missing
        : ["None — rating is corroborated by attached evidence."],
      nextQuestions,
    };
  });
}
