/**
 * The built-in provider: the rules engine, with no network and no key.
 *
 * This is the default, and it is a complete product rather than a stub. If
 * every AI vendor in the world went dark, the app would keep parsing resumes,
 * building evidence matrices, scoring, generating and exporting — which is the
 * reason it was built this way round.
 */

import type {
  AiProvider,
  BulletRewriteProposal,
  BulletRewriteRequest,
  RewriteContext,
} from "./types.ts";
import type { JobRequirement } from "../types.ts";

export function createDeterministicProvider(): AiProvider {
  return {
    name: "Built-in rules engine",
    available: true,
    refineRequirements(_rawText, draft) {
      return Promise.resolve(draft);
    },
    proposeBulletRewrites(
      _bullets: readonly BulletRewriteRequest[],
      _context: RewriteContext,
    ): Promise<readonly BulletRewriteProposal[]> {
      // Terminology rewrites are produced by the evidence matcher, which is
      // evidence-gated by construction. The rules engine proposes nothing here.
      return Promise.resolve([]);
    },
  };
}

export type { JobRequirement };
