/**
 * The Claude provider.
 *
 * Two calls, both returning structured JSON, both treated as untrusted input
 * by the code that consumes them:
 *
 *   refineRequirements   — re-read a job posting properly. Models are markedly
 *                          better than regexes at spotting that "you'll own the
 *                          P&L for a $40M book" is a scope requirement.
 *   proposeBulletRewrites — phrase a real accomplishment well.
 *
 * The system prompt states the anti-fabrication rule, but the rule is ENFORCED
 * in `provider/index.ts` by re-validating every proposal against the evidence.
 * A prompt is a request; the validator is the control.
 *
 * Configuration is passed in, never read from the environment here: the app
 * owns its env boundary, so this package stays pure and testable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { newId } from "../text.ts";
import type {
  JobRequirement,
  RequirementImportance,
  RequirementKind,
} from "../types.ts";
import type {
  AiProvider,
  BulletRewriteProposal,
  BulletRewriteRequest,
  RewriteContext,
} from "./types.ts";

export interface ClaudeProviderOptions {
  readonly apiKey: string;
  /** Defaults to Claude Opus 5. */
  readonly model?: string;
  readonly maxTokens?: number;
  /** Injected in tests. */
  readonly client?: Anthropic;
}

const DEFAULT_MODEL = "claude-opus-5";

const IMPORTANCE = ["critical", "important", "preferred", "informational"] as const;
const KIND = [
  "qualification",
  "experience",
  "education",
  "certification",
  "software",
  "hard_skill",
  "soft_skill",
  "leadership",
  "responsibility",
  "compliance",
  "travel",
  "physical",
  "scope",
] as const;

const RequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      text: z.string(),
      importance: z.enum(IMPORTANCE),
      kind: z.enum(KIND),
      years_required: z.number().nullable(),
    }),
  ),
});

const RewritesSchema = z.object({
  rewrites: z.array(
    z.object({
      id: z.string(),
      rewritten: z.string(),
      rationale: z.string(),
    }),
  ),
});

const REQUIREMENTS_SYSTEM = `You extract requirements from job postings for a resume-tailoring tool.

Rules:
- Every requirement you return must be stated in the posting. Never add one that a reasonable reader could not point to in the text.
- Keep the posting's own wording where you can; you may tidy grammar and split a sentence that contains two separate requirements.
- importance: critical = stated as required/must-have/minimum; important = a core responsibility of the job; preferred = explicitly optional; informational = company description, benefits, EEO boilerplate.
- Do not editorialise and do not give advice. Extract only.`;

const REWRITE_SYSTEM = `You rephrase resume bullets for a tool whose central promise is that it never fabricates.

Absolute rules:
- You may only rephrase what the original bullet already says. Never add a number, a percentage, a dollar amount, a headcount, a technology, an employer, a date, a certification, a title, or a claim of scope that is not in the original.
- Never strengthen a claim. "Supported" does not become "led". "Helped reduce" does not become "reduced".
- Every number in your rewrite must appear in the original, unchanged.
- You may use the terminology listed as licensed, because the candidate's evidence supports it.
- Prefer the structure: action, scope, result. Keep it to one sentence.
- If a bullet cannot be improved without breaking these rules, return it unchanged.

Anything you return is re-checked against the candidate's source material, and a rewrite that introduces an unsupported word is discarded.`;

export function createClaudeProvider(options: ClaudeProviderOptions): AiProvider {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 8000;

  return {
    name: `Claude (${model})`,
    available: options.apiKey.length > 0 || options.client !== undefined,

    async refineRequirements(
      rawText: string,
      draft: readonly JobRequirement[],
    ): Promise<readonly JobRequirement[]> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: maxTokens,
          system: REQUIREMENTS_SYSTEM,
          messages: [
            {
              role: "user",
              content: `Job posting:\n\n${rawText}\n\nA rules-based first pass found ${draft.length} requirements. Return the correct list.`,
            },
          ],
          output_config: { format: zodOutputFormat(RequirementsSchema) },
        });

        const parsed = response.parsed_output;
        if (parsed === null || parsed === undefined) return draft;

        const requirements = parsed.requirements
          .filter((r) => r.text.trim().length >= 8)
          .map((r) => {
            const requirement: {
              id: string;
              text: string;
              kind: RequirementKind;
              importance: RequirementImportance;
              sourceSection: string;
              terms: string[];
              yearsRequired?: number;
            } = {
              id: newId(),
              text: r.text.trim(),
              kind: r.kind,
              importance: r.importance,
              sourceSection: "claude",
              terms: [],
            };
            if (r.years_required !== null) requirement.yearsRequired = r.years_required;
            return requirement;
          });

        return requirements.length === 0 ? draft : requirements;
      } catch {
        // Every failure mode — no key, rate limit, timeout, malformed JSON —
        // lands here and falls back to the deterministic extraction.
        return draft;
      }
    },

    async proposeBulletRewrites(
      bullets: readonly BulletRewriteRequest[],
      context: RewriteContext,
    ): Promise<readonly BulletRewriteProposal[]> {
      if (bullets.length === 0) return [];
      try {
        const payload = {
          target_role: `${context.jobTitle} at ${context.company}`,
          licensed_terminology: context.licensedTerms,
          bullets: bullets.map((b) => ({
            id: b.id,
            original: b.original,
            requirements_it_should_answer: b.targets,
          })),
        };
        const response = await client.messages.parse({
          model,
          max_tokens: maxTokens,
          system: REWRITE_SYSTEM,
          messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
          output_config: { format: zodOutputFormat(RewritesSchema) },
        });

        const parsed = response.parsed_output;
        if (parsed === null || parsed === undefined) return [];

        const known = new Set(bullets.map((b) => b.id));
        return parsed.rewrites
          .filter((r) => known.has(r.id) && r.rewritten.trim().length > 0)
          .map((r) => ({
            id: r.id,
            rewritten: r.rewritten.trim(),
            rationale: r.rationale.trim(),
          }));
      } catch {
        return [];
      }
    },
  };
}
