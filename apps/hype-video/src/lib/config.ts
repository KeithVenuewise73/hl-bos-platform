import "server-only";

/**
 * The app's environment boundary.
 *
 * The ONLY file in this app that reads process.env (it carries the matching
 * ESLint exemption in the repo config). Nothing it reads is browser-visible:
 * the Anthropic key is read on the server, used on the server, and never
 * returned to a page.
 */

export interface AppConfig {
  /** Where projects and uploaded media are stored. Gitignored. */
  readonly dataDir: string;
  readonly anthropicApiKey: string | undefined;
  readonly anthropicModel: string | undefined;
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached !== undefined) return cached;
  const env = process.env;
  const nonEmpty = (value: string | undefined): string | undefined =>
    value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
  cached = {
    dataDir: nonEmpty(env["HYPE_DATA_DIR"]) ?? ".hype-video",
    anthropicApiKey: nonEmpty(env["ANTHROPIC_API_KEY"]),
    anthropicModel: nonEmpty(env["HYPE_AI_MODEL"]),
  };
  return cached;
}
