/**
 * The Claude writer.
 *
 * One structured-output call per package. The response is parsed against a
 * zod schema by the SDK, then handed back to `generatePackage()`, which
 * treats it as untrusted: normalised, guarded, screened, and replaced by the
 * template writer's draft if any of that fails.
 *
 * Server-side refusal fallback is enabled (`fallbacks: "default"`): if the
 * primary model declines a request on policy grounds, the API re-runs it on a
 * fallback model inside the same call. If the whole chain still refuses, this
 * throws and the template writer's draft is used.
 *
 * Configuration is passed in, never read from the environment here — the app
 * owns its env boundary, so this package stays pure and testable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.ts";
import type { GenerationRequest, HypePackage } from "../types.ts";
import type { HypeWriter } from "./types.ts";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export interface ClaudeWriterOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** Injected in tests. */
  readonly client?: Anthropic;
}

const PackageSchema = z.object({
  title: z.string(),
  script15: z.string(),
  script30: z.string(),
  voiceover: z.string(),
  socialCaption: z.string(),
  hashtags: z.array(z.string()),
  onScreenText: z.array(z.object({ atSecond: z.number(), text: z.string() })),
  videoPrompt: z.string(),
  musicPrompt: z.string(),
  sponsorCallout: z.string().nullable(),
});

export function createClaudeWriter(options: ClaudeWriterOptions): HypeWriter {
  const model = options.model ?? DEFAULT_CLAUDE_MODEL;
  const available = options.apiKey.length > 0 || options.client !== undefined;
  // Constructed lazily so an app with no key never builds a client at all.
  let client: Anthropic | undefined = options.client;

  return {
    id: `claude:${model}`,
    label: `Claude (${model})`,
    available,

    async write(
      request: GenerationRequest,
      baseline: HypePackage,
    ): Promise<HypePackage> {
      client ??= new Anthropic({ apiKey: options.apiKey });
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(request, baseline) }],
        output_config: { effort: "medium", format: betaZodOutputFormat(PackageSchema) },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to write this package.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("Claude's draft was cut off before it finished.");
      }
      const parsed = response.parsed_output;
      if (parsed === null || parsed === undefined) {
        throw new Error(
          "Claude returned a draft that did not match the package format.",
        );
      }
      return parsed;
    },
  };
}
