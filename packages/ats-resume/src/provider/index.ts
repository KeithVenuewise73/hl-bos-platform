/**
 * Provider selection, and the gate every AI proposal passes through.
 *
 * `applyRewriteProposals()` is the important function in this file. It takes
 * whatever a model returned and admits a rewrite only if the claim validator
 * clears it against the same evidence the rules engine uses. A model cannot
 * talk its way past this: the check does not read the model's rationale, it
 * reads the sentence.
 */

import { validateClaim } from "../claims.ts";
import { createDeterministicProvider } from "./deterministic.ts";
import type { AiProvider, BulletRewriteProposal } from "./types.ts";
import type { CareerFact, GeneratedLine } from "../types.ts";

export { createDeterministicProvider } from "./deterministic.ts";
export { createClaudeProvider } from "./claude.ts";
export type {
  AiProvider,
  BulletRewriteProposal,
  BulletRewriteRequest,
  RewriteContext,
} from "./types.ts";

export interface ProviderSelection {
  readonly provider: AiProvider;
  /** Plain-English statement of what is producing results, for the UI. */
  readonly description: string;
}

export interface SelectProviderOptions {
  readonly claude?: AiProvider;
}

export function selectProvider(options: SelectProviderOptions = {}): ProviderSelection {
  if (options.claude !== undefined && options.claude.available) {
    return {
      provider: options.claude,
      description: `${options.claude.name}. Every suggestion it makes is re-checked against your own evidence before it can appear in a resume.`,
    };
  }
  const provider = createDeterministicProvider();
  return {
    provider,
    description:
      "Built-in rules engine. No AI key is configured, so analysis, scoring and generation run entirely on this machine — every feature works, phrasing is more literal.",
  };
}

export interface AppliedRewrite {
  readonly line: GeneratedLine;
  readonly accepted: boolean;
  readonly reason: string;
}

/**
 * Admit or reject each proposal.
 *
 * A rejected proposal is not an error and is not shown as one: the original
 * line stands, and the reason is recorded so the review screen can show it.
 */
export function applyRewriteProposals(
  lines: readonly GeneratedLine[],
  proposals: readonly BulletRewriteProposal[],
  evidenceById: ReadonlyMap<string, CareerFact>,
  licensedTerms: readonly string[],
): AppliedRewrite[] {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  return lines.map((line) => {
    const proposal = byId.get(line.id);
    if (proposal === undefined) {
      return {
        line,
        accepted: false,
        reason: "No AI rewrite was proposed for this line.",
      };
    }

    const evidence = line.evidenceFactIds
      .map((id) => evidenceById.get(id))
      .filter((f): f is CareerFact => f !== undefined);

    const verdict = validateClaim(proposal.rewritten, { evidence, licensedTerms });
    if (verdict.status !== "verified" && verdict.status !== "user_confirmed") {
      return {
        line,
        accepted: false,
        reason: `AI rewrite rejected: ${verdict.notes.join(" ")} The original wording was kept.`,
      };
    }

    return {
      line: {
        ...line,
        text: proposal.rewritten,
        originalText: line.originalText ?? line.text,
        rationale: proposal.rationale.length > 0 ? proposal.rationale : line.rationale,
        validation: verdict.status,
        validationNotes: verdict.notes,
      },
      accepted: true,
      reason: "AI rewrite accepted: every claim in it is traceable to your evidence.",
    };
  });
}
