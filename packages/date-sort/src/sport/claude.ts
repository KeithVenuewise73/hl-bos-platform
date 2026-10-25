/**
 * Asking Claude which sport each sample photo shows.
 *
 * One request per shooting date, carrying that date's sample previews.
 * The answer is parsed against a schema by the SDK and then checked again
 * here (one verdict per photo, every photo answered once) before anything
 * is believed. Server-side refusal fallback is enabled (`fallbacks:
 * "default"`). The key is passed in, never read from the environment.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { PHOTO_VERDICTS, type PhotoVerdict } from "./sports";

export const SPORT_MODEL = "claude-opus-5-5";

export interface ClaudeAnswer {
  /** One verdict per image, in the order the images were sent. */
  readonly verdicts: PhotoVerdict[];
  readonly notes: string;
}

/** Ask about a set of JPEG previews. Replaced in tests. */
export type AskClaude = (
  images: readonly Buffer[],
  signal?: AbortSignal,
) => Promise<ClaudeAnswer>;

const AnswerSchema = z.object({
  photos: z.array(
    z.object({
      photo: z.number().int(),
      sport: z.enum(PHOTO_VERDICTS),
    }),
  ),
  notes: z.string(),
});

export const SPORT_SYSTEM_PROMPT = `You look at photographs a sports photographer took at one event, to help file them by sport.

For EACH photo, say which sport is being played or practised in it:
- football: American football (helmets, shoulder pads, gridiron field).
- hockey: ice hockey (ice rink, sticks, skates, boards).
- baseball: baseball or softball (diamond, bats, gloves, bases).
- basketball: basketball (hoop and backboard, orange ball, court lines).
- soccer: soccer (football in the rest of the world: round black-and-white or coloured ball kicked on a field, goals with nets).
- volleyball: volleyball (high net across the court, volleyball).
- other: a sport that is none of the above.
- unclear: nothing in the photo shows which sport it is (a crowd, a bench, a portrait, a blurred frame).

Rules:
- Judge each photo on what is visible in it. Warm-ups count: players shooting at a hoop are basketball.
- Basketball and volleyball are both played indoors on wooden courts: look for the hoop or the net, and the ball.
- If you are not reasonably sure, answer unclear rather than guess.
- Answer every photo exactly once, numbered as given (photo 1 is the first image).
- notes: one short sentence about anything that made a photo hard to judge. Empty if nothing did.`;

export function claudeAsker(options: {
  readonly apiKey: string;
  readonly model?: string;
  /** Injected in tests. */
  readonly client?: Anthropic;
}): AskClaude {
  const model = options.model ?? SPORT_MODEL;
  let client = options.client;

  return async (images, signal) => {
    client ??= new Anthropic({ apiKey: options.apiKey });
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    images.forEach((img, i) => {
      content.push({ type: "text", text: `Photo ${i + 1}:` });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: img.toString("base64"),
        },
      });
    });
    content.push({
      type: "text",
      text: `Say which sport each of these ${images.length} photos shows.`,
    });

    const response = await client.beta.messages.parse(
      {
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SPORT_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { effort: "low", format: betaZodOutputFormat(AnswerSchema) },
      },
      signal ? { signal } : {},
    );

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to look at these photos.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Claude's answer was cut off before it finished.");
    }
    const parsed = response.parsed_output;
    if (parsed === null || parsed === undefined) {
      throw new Error("Claude answered in an unexpected shape.");
    }
    return checkAnswer(parsed, images.length);
  };
}

/** Exactly one verdict for each photo 1..count, or an error: never a partial guess. */
export function checkAnswer(
  parsed: z.infer<typeof AnswerSchema>,
  count: number,
): ClaudeAnswer {
  const byPhoto = new Map<number, PhotoVerdict>();
  for (const p of parsed.photos) {
    if (p.photo < 1 || p.photo > count || byPhoto.has(p.photo)) {
      throw new Error("Claude's answer did not match the photos sent.");
    }
    byPhoto.set(p.photo, p.sport);
  }
  if (byPhoto.size !== count) {
    throw new Error("Claude did not answer for every photo.");
  }
  return {
    verdicts: [...byPhoto.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    notes: parsed.notes,
  };
}

/**
 * What went wrong talking to Claude, in words for the person using DateSort.
 * Most-specific first; anything unrecognised keeps its own message.
 */
export function explainClaudeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "Anthropic did not accept the Claude key. Remove it and paste a new one.";
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return "The Claude key is not allowed to use this model. Check the key's workspace in the Anthropic Console.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Claude is busy for this key right now. Wait a minute and ask again.";
  }
  if (
    e instanceof Anthropic.BadRequestError &&
    /credit|billing|balance/i.test(e.message)
  ) {
    return "The Anthropic account has no credit left. Add credit in the Anthropic Console, then ask again.";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Could not reach Claude. Is this laptop connected to the internet?";
  }
  if (e instanceof Anthropic.InternalServerError) {
    return "Claude had a problem on its side. Ask again in a minute.";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Is this key accepted by Anthropic? A model lookup: no photo is sent and
 * no tokens are used. Returns null when it is, or the reason it is not.
 */
export async function checkKey(
  apiKey: string,
  client?: Anthropic,
): Promise<string | null> {
  try {
    await (client ?? new Anthropic({ apiKey })).models.retrieve(SPORT_MODEL);
    return null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return "Anthropic did not accept that key. Copy the whole key from the Anthropic Console and try again.";
    }
    return explainClaudeError(e);
  }
}
