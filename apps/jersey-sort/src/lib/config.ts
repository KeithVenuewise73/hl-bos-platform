import "server-only";

import path from "node:path";

import { readSharedKey } from "./shared-key.ts";

/**
 * The app's environment boundary: the ONLY file that reads process.env (it
 * carries the matching ESLint exemption). Nothing here is browser-visible.
 *
 *   JERSEYSORT_DATA_DIR      where the database and photos live (default .jersey-sort/)
 *   JERSEYSORT_AI_PROVIDER   claude | local-ocr | none   (default: claude when a key is set, else local-ocr)
 *   ANTHROPIC_API_KEY        enables Claude vision. Without it, the key the CEO
 *                            saved in DateSort is used (shared-key.ts), read
 *                            fresh each time so saving it there needs no restart.
 *   JERSEYSORT_AI_MODEL      override the Claude model
 *   JERSEYSORT_WORKERS       photos analysed at once (default 2)
 */

export type ProviderChoice = "claude" | "local-ocr" | "none";

export interface AppConfig {
  readonly dataDir: string;
  readonly anthropicApiKey: string | undefined;
  readonly anthropicModel: string | undefined;
  readonly defaultProvider: ProviderChoice;
  /** JERSEYSORT_AI_PROVIDER was set. */
  readonly providerFromEnv: boolean;
  readonly workers: number;
  readonly secureCookies: boolean;
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached !== undefined) return cached;
  const env = process.env;
  const nonEmpty = (v: string | undefined) =>
    v !== undefined && v.trim().length > 0 ? v.trim() : undefined;
  const key = nonEmpty(env["ANTHROPIC_API_KEY"]);
  const requested = nonEmpty(env["JERSEYSORT_AI_PROVIDER"]);
  const defaultProvider: ProviderChoice =
    requested === "claude" || requested === "local-ocr" || requested === "none"
      ? requested
      : key !== undefined
        ? "claude"
        : "local-ocr";
  const workers = Number(nonEmpty(env["JERSEYSORT_WORKERS"]) ?? "2");
  cached = {
    dataDir: path.resolve(
      /*turbopackIgnore: true*/ process.cwd(),
      nonEmpty(env["JERSEYSORT_DATA_DIR"]) ?? ".jersey-sort",
    ),
    anthropicApiKey: key,
    anthropicModel: nonEmpty(env["JERSEYSORT_AI_MODEL"]),
    defaultProvider,
    providerFromEnv: requested !== undefined,
    workers: Number.isInteger(workers) && workers >= 1 && workers <= 8 ? workers : 2,
    secureCookies: nonEmpty(env["JERSEYSORT_SECURE_COOKIES"]) === "1",
  };
  return cached;
}

/** The Claude key: ANTHROPIC_API_KEY, else the one saved in DateSort. */
export function anthropicApiKey(): string | undefined {
  return config().anthropicApiKey ?? readSharedKey();
}

/** The provider when an organization has not chosen one. */
export function defaultProvider(): ProviderChoice {
  const c = config();
  // An explicit JERSEYSORT_AI_PROVIDER, or a key in the environment, decided it.
  if (c.providerFromEnv || c.anthropicApiKey !== undefined) return c.defaultProvider;
  return readSharedKey() !== undefined ? "claude" : c.defaultProvider;
}
