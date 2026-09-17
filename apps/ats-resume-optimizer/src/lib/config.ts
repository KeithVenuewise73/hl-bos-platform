import "server-only";

/**
 * The app's environment boundary.
 *
 * This is the ONLY file in the app that reads process.env, which is why it
 * carries an ESLint exemption in the repo config. Everything else takes its
 * configuration from here, so there is exactly one place to look when asking
 * "what does this deployment actually have switched on".
 *
 * Nothing here is browser-visible: the AI key is read on the server, used on
 * the server, and never returned to a page.
 */

export interface AppConfig {
  /** Where the local JSON store writes. */
  readonly dataDir: string;
  /** Anthropic API key, if one is configured. Never sent to the browser. */
  readonly anthropicApiKey: string | undefined;
  readonly anthropicModel: string;
  /** Whether demo data is seeded on first run. */
  readonly seedDemoData: boolean;
  /** Which HL-BOS environment this process belongs to. Decides the auth mode. */
  readonly hlBosEnv: string | undefined;
  readonly nodeEnv: string | undefined;
  /** Supabase, when configured. Publishable key only — never service-role. */
  readonly supabaseUrl: string | undefined;
  readonly supabasePublishableKey: string | undefined;
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached !== undefined) return cached;
  const env = process.env;
  const nonEmpty = (value: string | undefined): string | undefined =>
    value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
  const resolved: AppConfig = {
    dataDir: env["ATS_DATA_DIR"] ?? ".data",
    anthropicApiKey: nonEmpty(env["ANTHROPIC_API_KEY"]),
    anthropicModel: env["ATS_AI_MODEL"] ?? "claude-opus-5",
    seedDemoData: env["ATS_SEED_DEMO"] !== "false",
    hlBosEnv: nonEmpty(env["HL_BOS_ENV"]),
    nodeEnv: nonEmpty(env["NODE_ENV"]),
    supabaseUrl: nonEmpty(env["NEXT_PUBLIC_SUPABASE_URL"]),
    supabasePublishableKey: nonEmpty(env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]),
  };
  cached = resolved;
  return resolved;
}

/** What Settings shows about the AI provider. Never includes the key itself. */
export function aiStatus(): { readonly configured: boolean; readonly detail: string } {
  const { anthropicApiKey, anthropicModel } = config();
  return anthropicApiKey === undefined
    ? {
        configured: false,
        detail:
          "No ANTHROPIC_API_KEY is set. The built-in rules engine handles every feature — parsing, matching, scoring, generation and export all work. Phrasing is more literal than it would be with a model.",
      }
    : {
        configured: true,
        detail: `Claude is configured (${anthropicModel}). It is used for two jobs only: re-reading a job posting, and proposing bullet phrasing. Every suggestion is re-checked against your own evidence before it can appear in a resume.`,
      };
}
