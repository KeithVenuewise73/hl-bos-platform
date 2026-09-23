import "server-only";
import { readEnvFile } from "./secrets";
import {
  assessTexting,
  TEXTING_SUMMARY_SQL,
  type OutboxSummary,
  type TextingAssessment,
} from "./texting";

/**
 * Reads HomeHuddle's text outbox through the Supabase Management API's
 * READ-ONLY query endpoint (runs as supabase_read_only_user). It cannot change
 * anything, by construction, not by care.
 *
 * Uses the same access token the console already holds for the Database card.
 * HomeHuddle lives in the "Venuewise Platform" project, not HL-BOS Core.
 */
const HOMEHUDDLE_REF_DEFAULT = "urwnbskrtoplgnkkxuvl";

export async function textingHealth(now = new Date()): Promise<TextingAssessment> {
  const env = await readEnvFile();
  const tk = env["SUPABASE_ACCESS_TOKEN"];
  const ref = env["HOMEHUDDLE_SUPABASE_PROJECT_REF"] || HOMEHUDDLE_REF_DEFAULT;

  if (!tk) {
    return {
      health: "unknown",
      headline: "Cannot check HomeHuddle texts — Supabase is not connected.",
      summary: "Connect Supabase and this check starts working on its own.",
    };
  }

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query/read-only`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: TEXTING_SUMMARY_SQL }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = (await res.json()) as OutboxSummary[];
    const row = rows[0];
    if (!row) throw new Error("empty result");
    return assessTexting(row, now);
  } catch (e) {
    // Not being able to look is reported as exactly that -- never as green.
    return {
      health: "unknown",
      headline: "Could not check whether HomeHuddle texts are being delivered.",
      summary:
        "The console could not read HomeHuddle's text log just now. This says nothing about whether texts work; it will retry on the next refresh.",
      owner: "ai-engineer",
      detail: (e as Error).message,
    };
  }
}
