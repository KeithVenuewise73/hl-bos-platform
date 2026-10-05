/**
 * Claude vision provider.
 *
 * One structured-output call per photo, sent the app's medium preview (about
 * 1600 px on the long edge — enough to read a jersey number, small enough to
 * keep a 2,000-photo event affordable). The response is parsed against a zod
 * schema by the SDK and then treated as untrusted evidence: every reading
 * still passes `interpretReadings()` before it can be stored.
 *
 * The prompt asks Claude to report EVERY number it can see together with
 * what it is printed on, rather than to report only jersey numbers. That way
 * a scoreboard reading is refused by our rules, visibly, instead of silently
 * by the model — and the refusal is inspectable on the photo's detail page.
 *
 * Server-side refusal fallback is enabled (`fallbacks: "default"`).
 * Configuration is passed in, never read from the environment here.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import {
  JERSEY_LOCATIONS,
  NON_JERSEY_LOCATIONS,
  type ProviderResult,
} from "../types.ts";
import type { AnalysisImage, ImageAnalysisProvider } from "./types.ts";

export const DEFAULT_CLAUDE_VISION_MODEL = "claude-opus-5-5";

export interface ClaudeVisionOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** Injected in tests. */
  readonly client?: Anthropic;
}

const LOCATIONS = [...JERSEY_LOCATIONS, ...NON_JERSEY_LOCATIONS, "unknown"] as const;

const ResultSchema = z.object({
  athletes_present: z.boolean(),
  athlete_count: z.number().int(),
  numbers: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
      printed_on: z.enum(LOCATIONS),
      box: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .nullable(),
    }),
  ),
  notes: z.string(),
});

export const VISION_SYSTEM_PROMPT = `You examine sports photographs for a photo-organising product. Parents and photographers use your answer to file each photo under the jersey numbers of the athletes in it.

Report every number you can see in the photo, and say what each one is printed on:
- jersey_front, jersey_back, shoulder, helmet, shorts: a number worn by an athlete. Use jersey_unspecified if it is clearly on a uniform but you cannot tell where.
- scoreboard, yard_marker, sign, advertising, clock, field_marking, other_not_jersey: a number that is NOT worn by an athlete.
- unknown: you cannot tell.

Rules:
- Report what you actually see. Do not guess a number from a partial digit; if only part of it is visible, lower your confidence or leave it out.
- confidence is your probability (0 to 1) that you read the digits correctly AND that they are what you say they are printed on.
- If the same athlete's number is visible twice (front and sleeve), report it once.
- box is the number's position as fractions of the image width and height (x, y = top-left corner), or null.
- athletes_present: whether at least one athlete is visible. athlete_count: how many.
- notes: one short sentence about anything that limited what you could read (motion blur, the athlete is facing away, a pile-up). Empty if nothing did.`;

export function createClaudeVisionProvider(
  options: ClaudeVisionOptions,
): ImageAnalysisProvider {
  const model = options.model ?? DEFAULT_CLAUDE_VISION_MODEL;
  let client: Anthropic | undefined = options.client;

  return {
    info: {
      id: "claude-vision",
      model,
      label: `Claude vision (${model})`,
      method: "vision_model",
      understandsContext: true,
    },

    async analyze(image: AnalysisImage): Promise<ProviderResult> {
      client ??= new Anthropic({ apiKey: options.apiKey });
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: VISION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mimeType,
                  data: Buffer.from(image.bytes).toString("base64"),
                },
              },
              {
                type: "text",
                text: `This photo is ${image.width}x${image.height}. Report every number in it.`,
              },
            ],
          },
        ],
        output_config: { effort: "medium", format: betaZodOutputFormat(ResultSchema) },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to analyze this photo.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("Claude's answer was cut off before it finished.");
      }
      const parsed = response.parsed_output;
      if (parsed === null || parsed === undefined) {
        throw new Error("Claude returned an answer in an unexpected shape.");
      }

      return {
        athletesPresent: parsed.athletes_present,
        athleteCount: Math.max(0, parsed.athlete_count),
        readings: parsed.numbers.map((n) => ({
          text: n.text,
          confidence: n.confidence,
          location: n.printed_on,
          box: n.box === null ? null : normaliseBox(n.box),
        })),
        notes: parsed.notes,
      };
    },
  };
}

function normaliseBox(b: { x: number; y: number; width: number; height: number }) {
  const c = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  return { x: c(b.x), y: c(b.y), width: c(b.width), height: c(b.height) };
}
