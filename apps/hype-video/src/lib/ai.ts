import "server-only";

import {
  DEFAULT_CLAUDE_MODEL,
  createClaudeWriter,
  type HypeWriter,
} from "@hl-bos/hype-video";

import { config } from "./config.ts";

let writer: HypeWriter | undefined | null = null;

/** The configured model writer, or undefined when no key is set. */
export function modelWriter(): HypeWriter | undefined {
  if (writer !== null) return writer;
  const { anthropicApiKey, anthropicModel } = config();
  writer =
    anthropicApiKey === undefined
      ? undefined
      : createClaudeWriter({
          apiKey: anthropicApiKey,
          model: anthropicModel ?? DEFAULT_CLAUDE_MODEL,
        });
  return writer;
}

/** What the app shows about how packages are written. Never includes the key. */
export function writerStatus(): {
  readonly aiConfigured: boolean;
  readonly detail: string;
} {
  const w = modelWriter();
  return w === undefined
    ? {
        aiConfigured: false,
        detail:
          "No AI key is set, so packages are written by the built-in template writer. Every feature works; the wording follows fixed patterns. Adding an Anthropic key switches to Claude, with the same fact checks.",
      }
    : {
        aiConfigured: true,
        detail: `${w.label} writes packages. Every draft is checked for invented stats, honours and contact details before it is saved; a draft that fails is replaced by the template writer's version, and the page says so.`,
      };
}
