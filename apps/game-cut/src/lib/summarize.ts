import type { Analysis, HighlightPlanResult, Moment } from "@hl-bos/game-cut";

import type { PickRow, PlanSummary } from "./types.ts";

/**
 * A plan as the page shows it. Pure, so it is tested without any video.
 */

function rowsOf(
  moments: readonly Moment[],
  labels: readonly string[] | null,
): PickRow[] {
  return moments.map((m, i) => ({
    n: i + 1,
    startSeconds: m.startSeconds,
    endSeconds: m.endSeconds,
    lengthSeconds: m.endSeconds - m.startSeconds,
    camera: m.camera,
    label: labels?.[i] ?? "",
  }));
}

const keptOf = (rows: readonly PickRow[]) =>
  rows.reduce((t, r) => t + r.lengthSeconds, 0);
const switchesOf = (rows: readonly PickRow[]) =>
  rows.filter((r, i) => i > 0 && rows[i - 1]!.camera !== r.camera).length;

export function summarizeBroadcast(
  planId: string,
  names: { a: string; b: string },
  analysis: Analysis,
): PlanSummary {
  const rows = rowsOf(analysis.moments, null);
  return {
    planId,
    mode: "broadcast",
    names,
    hasSecondCamera: true,
    gameSeconds: analysis.gameSeconds,
    keptSeconds: keptOf(rows),
    switches: switchesOf(rows),
    offsetSeconds: analysis.sync.offsetSeconds,
    confidence: analysis.sync.confidence,
    rows,
    notes: analysis.notes,
    skipped: [],
    problems: [],
  };
}

export function summarizeTimes(
  planId: string,
  names: { a: string; b: string | null },
  plan: HighlightPlanResult,
): PlanSummary {
  const rows = rowsOf(
    plan.clips,
    plan.clips.map((c) => c.label),
  );
  return {
    planId,
    mode: "times",
    names,
    hasSecondCamera: plan.hasSecondCamera,
    gameSeconds: plan.factsA.durationSeconds,
    keptSeconds: keptOf(rows),
    switches: switchesOf(rows),
    offsetSeconds: plan.alignment?.sync.offsetSeconds ?? null,
    confidence: plan.alignment?.sync.confidence ?? null,
    rows,
    notes: plan.notes,
    skipped: plan.skipped,
    problems: plan.problems,
  };
}
