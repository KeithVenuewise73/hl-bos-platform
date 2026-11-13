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
    label: labels?.[i] ?? m.label ?? "",
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

const clockText = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The picks as a plain text file, saved beside the finished video so a person can see
 * exactly what was chosen and when, and name a moment that was missed.
 * Times are on the FIRST video's clock, and the second video's equivalent is given too.
 */
export function picksFileText(plan: PlanSummary, madeAt: Date = new Date()): string {
  const cam = (c: "A" | "B") =>
    c === "A"
      ? `first video (${plan.names.a})`
      : `second video (${plan.names.b ?? ""})`;
  const lines: string[] = [];
  lines.push(
    plan.mode === "broadcast"
      ? "Game Cut: whole game, one broadcast"
      : "Game Cut: highlights from times",
  );
  lines.push(`Made ${madeAt.toISOString().slice(0, 16).replace("T", " ")} (UTC)`);
  lines.push("");
  lines.push(
    `${plan.rows.length} pieces, ${clockText(plan.keptSeconds)} kept of a ${clockText(plan.gameSeconds)} recording, ${plan.switches} camera switches.`,
  );
  if (plan.offsetSeconds !== null) {
    const off = plan.offsetSeconds;
    lines.push(
      off < 0
        ? `The second video started ${(-off).toFixed(1)} s BEFORE the first. A time on the first video plus ${(-off).toFixed(1)} s is the same moment on the second.`
        : `The second video started ${off.toFixed(1)} s after the first. A time on the first video minus ${off.toFixed(1)} s is the same moment on the second.`,
    );
  }
  for (const n of plan.notes) lines.push(`Note: ${n}`);
  lines.push("");
  lines.push(
    "All times below are on the FIRST video's clock. Pieces are in game order.",
  );
  lines.push("");
  for (const r of plan.rows) {
    const secondTime =
      plan.offsetSeconds === null ? null : r.startSeconds - plan.offsetSeconds;
    const second =
      secondTime === null || !plan.hasSecondCamera
        ? ""
        : secondTime < 0
          ? "  (second video had not started yet)"
          : `  (second video: ${clockText(secondTime)})`;
    lines.push(
      `${String(r.n).padStart(3)}. ${clockText(r.startSeconds)} to ${clockText(r.endSeconds)}  ${String(Math.round(r.lengthSeconds)).padStart(4)} s  ${cam(r.camera)}${second}${r.label === "" ? "" : `  <- ${r.label}`}`,
    );
  }
  return lines.join("\n") + "\n";
}
