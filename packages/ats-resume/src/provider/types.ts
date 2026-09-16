/**
 * The AI provider boundary.
 *
 * Read this before adding an AI call anywhere in the product.
 *
 * The rules engine in this package is complete on its own: every screen works,
 * every export works, and every number is computed with no API key present.
 * An AI provider is an ENHANCEMENT layer bolted onto two specific jobs where a
 * language model is genuinely better than heuristics — reading a badly written
 * job posting, and phrasing a bullet well.
 *
 * Two properties are non-negotiable, and they are enforced by the callers in
 * `provider/index.ts` rather than trusted to a prompt:
 *
 *   1. AI OUTPUT IS A PROPOSAL, NOT A FACT. Every rewrite a model returns goes
 *      back through `validateClaim()` against the same evidence as everything
 *      else. A proposal that introduces a number, a skill, an employer or a
 *      scope the evidence does not contain is discarded, silently and always.
 *
 *   2. FAILURE IS NOT AN OUTAGE. No key, a rate limit, a timeout, a malformed
 *      response — all of them fall back to the deterministic result. The user
 *      sees a slightly less polished sentence, never an error page.
 *
 * Swapping vendors means writing one more file in this directory.
 */

import type { JobRequirement } from "../types.ts";

export interface BulletRewriteRequest {
  /** Stable id so a proposal can be matched back to the bullet it rewrites. */
  readonly id: string;
  readonly original: string;
  /** Requirement texts this bullet is being pointed at. */
  readonly targets: readonly string[];
}

export interface BulletRewriteProposal {
  readonly id: string;
  readonly rewritten: string;
  readonly rationale: string;
}

export interface RewriteContext {
  readonly jobTitle: string;
  readonly company: string;
  /** Terminology the analysis licensed. Nothing else may be introduced. */
  readonly licensedTerms: readonly string[];
}

export interface AiProvider {
  /** Shown in the UI so the user always knows what produced a result. */
  readonly name: string;
  /** False means every call falls through to the deterministic path. */
  readonly available: boolean;

  /**
   * Improve a draft requirement list read out of a posting. The model may
   * merge, split, re-word for clarity and re-classify importance — it may not
   * invent a requirement the posting does not contain, and anything it returns
   * that is not present in the source text is dropped by the caller.
   */
  refineRequirements(
    rawText: string,
    draft: readonly JobRequirement[],
  ): Promise<readonly JobRequirement[]>;

  /**
   * Propose stronger phrasings of real bullets. Proposals are validated
   * against the candidate's evidence before any of them is used.
   */
  proposeBulletRewrites(
    bullets: readonly BulletRewriteRequest[],
    context: RewriteContext,
  ): Promise<readonly BulletRewriteProposal[]>;
}
