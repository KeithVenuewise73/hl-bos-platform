/**
 * Which football this installation is looking at.
 *
 * There are exactly two states and no third:
 *
 *   "demo"   — synthetic football from @hl-bos/highlight-football/mock. Every
 *              screen that shows it says so, in a banner nobody can miss.
 *   "live"   — a real Supabase project with real uploaded film.
 *
 * There is deliberately no fallback from live to demo. If the database is not
 * configured, screens say the database is not configured; they do not quietly
 * show synthetic plays and let a coach believe they are looking at their team.
 * That substitution is the single most damaging thing this product could do,
 * so the code that would perform it does not exist.
 */

export type DataMode = "demo" | "live";

export interface ModeState {
  readonly mode: DataMode;
  /** Why we are in this mode, in words the CEO can read. */
  readonly reason: string;
  readonly supabaseConfigured: boolean;
}

/**
 * Resolve the mode from configuration.
 *
 * Takes the environment as an argument rather than reading process.env inline
 * so it is testable and so the env boundary stays in one place.
 */
export function resolveMode(
  env: Readonly<Record<string, string | undefined>>,
): ModeState {
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const supabaseConfigured =
    typeof url === "string" &&
    url.length > 0 &&
    typeof key === "string" &&
    key.length > 0;

  const forced = env["HIGHLIGHTAI_MODE"];
  if (forced === "demo") {
    return {
      mode: "demo",
      reason: "Demo mode was requested explicitly (HIGHLIGHTAI_MODE=demo).",
      supabaseConfigured,
    };
  }

  if (supabaseConfigured) {
    return {
      mode: "live",
      reason: "Connected to a HighlightAI database.",
      supabaseConfigured,
    };
  }

  return {
    mode: "demo",
    reason:
      "No HighlightAI database is configured, so this installation is showing a " +
      "synthetic demo game. No real game film has been uploaded or analysed.",
    supabaseConfigured,
  };
}

export const DEMO_NOTICE =
  "Everything on this screen comes from a synthetic demo game. The football is " +
  "generated, not filmed — but the analysis is real: the same detection voting, " +
  "re-identification, play segmentation and scoring that production runs.";
