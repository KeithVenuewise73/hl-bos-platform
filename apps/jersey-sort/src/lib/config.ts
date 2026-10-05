import "server-only";

import path from "node:path";

/**
 * The app's environment boundary: the ONLY file that reads process.env (it
 * carries the matching ESLint exemption). Nothing here is browser-visible.
 *
 *   JERSEYSORT_DATA_DIR      where the database and photos live (default .jersey-sort/)
 *   JERSEYSORT_AI_PROVIDER   claude | local-ocr | none   (default: claude when a key is set, else local-ocr)
 *   ANTHROPIC_API_KEY        enables Claude vision
 *   JERSEYSORT_AI_MODEL      override the Claude model
 *   JERSEYSORT_WORKERS       photos analysed at once (default 2)
 */

export type ProviderChoice = "claude" | "local-ocr" | "none";

export interface AppConfig {
  readonly dataDir: string;
  readonly anthropicApiKey: string | undefined;
  readonly anthropicModel: string | undefined;
  readonly defaultProvider: ProviderChoice;
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
    workers: Number.isInteger(workers) && workers >= 1 && workers <= 8 ? workers : 2,
    secureCookies: nonEmpty(env["JERSEYSORT_SECURE_COOKIES"]) === "1",
  };
  return cached;
}
