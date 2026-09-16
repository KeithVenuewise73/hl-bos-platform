import { clockText, FINAL_STATUS_LABEL, percentText } from "./format";
import type { ComplianceStatus, GameState, MinimumTarget, Sport } from "./types";
import { PERIOD_NOUN } from "./types";

/**
 * The playtime report.
 *
 * Built from the same computed state the live screen uses, so the number a
 * coach saw at the final whistle is the number in the report they share. Two
 * code paths producing "roughly the same" total is how a product loses an
 * argument with a parent.
 */

export type FinalStatus = "minimum_met" | "below_minimum" | "no_target";

export interface ReportRow {
  playerId: string;
  label: string;
  secondsPlayed: number;
  share: number | null;
  entries: number;
  status: FinalStatus;
  requiredSeconds: number | null;
}

export interface GameReport {
  gameId: string;
  opponent: string;
  gameDate: string;
  teamName: string;
  sport: Sport;
  /** Total counted game-clock seconds actually played. */
  gameSeconds: number;
  periodsPlayed: number;
  minimum: MinimumTarget;
  score: { us: number; them: number } | null;
  rows: readonly ReportRow[];
  /** How many rostered athletes never took the field. Stated, not hidden. */
  didNotPlay: number;
  complete: boolean;
}

function finalStatus(status: ComplianceStatus): FinalStatus {
  if (status === "no_target") return "no_target";
  return status === "safe" ? "minimum_met" : "below_minimum";
}

export interface BuildReportInput {
  state: GameState;
  teamName: string;
  sport: Sport;
  opponent: string;
  gameDate: string;
  minimum: MinimumTarget;
  score: { us: number; them: number } | null;
  periodsPlayed: number;
  /** Resolves a player id to its display label. */
  label: (playerId: string) => string;
}

export function buildReport(input: BuildReportInput): GameReport {
  const rows: ReportRow[] = input.state.participation.map((p) => ({
    playerId: p.playerId,
    label: input.label(p.playerId),
    secondsPlayed: p.secondsPlayed,
    share: p.share,
    entries: p.entries,
    status: finalStatus(p.status),
    requiredSeconds: p.requiredSeconds,
  }));

  return {
    gameId: input.state.gameId,
    opponent: input.opponent,
    gameDate: input.gameDate,
    teamName: input.teamName,
    sport: input.sport,
    gameSeconds: input.state.elapsedSeconds,
    periodsPlayed: input.periodsPlayed,
    minimum: input.minimum,
    score: input.score,
    rows,
    didNotPlay: rows.filter((r) => r.secondsPlayed === 0).length,
    complete: input.state.phase === "final",
  };
}

export function minimumText(minimum: MinimumTarget): string {
  switch (minimum.kind) {
    case "none":
      return "No minimum participation target set";
    case "percent":
      return `Minimum participation target: ${minimum.percent}% of game time`;
    case "seconds":
      return `Minimum participation target: ${clockText(minimum.seconds)}`;
  }
}

/**
 * Plain-text report for the native share sheet.
 *
 * Deliberately text and not an image: a coach forwards this into a team chat,
 * an email to a parent, or a league form, and text survives all three. It also
 * ends with the honest caveat -- this is the coach's own target, tracked by
 * their own taps, not a certification of anything.
 */
export function reportText(report: GameReport): string {
  const lines: string[] = [];
  lines.push("PLAYTIME REPORT");
  lines.push("");
  lines.push(`${report.teamName} vs ${report.opponent}`);
  lines.push(report.gameDate);
  if (report.score) lines.push(`Score: ${report.score.us}–${report.score.them}`);
  const noun = PERIOD_NOUN[report.sport].toLowerCase();
  lines.push(
    `Game time tracked: ${clockText(report.gameSeconds)} over ${report.periodsPlayed} ${noun}${report.periodsPlayed === 1 ? "" : "s"}`,
  );
  lines.push(minimumText(report.minimum));
  if (!report.complete) lines.push("NOTE: this game has not been ended. Totals are still live.");
  lines.push("");

  for (const row of report.rows) {
    lines.push(row.label);
    lines.push(`  Playing time: ${clockText(row.secondsPlayed)}`);
    lines.push(`  Game participation: ${percentText(row.share)}`);
    lines.push(`  Entries: ${row.entries}`);
    if (row.status !== "no_target") {
      lines.push(
        `  Status: ${row.status === "minimum_met" ? FINAL_STATUS_LABEL.safe : FINAL_STATUS_LABEL.below_target}`,
      );
    }
    lines.push("");
  }

  if (report.didNotPlay > 0) {
    lines.push(
      `${report.didNotPlay} rostered ${report.didNotPlay === 1 ? "athlete" : "athletes"} recorded no playing time.`,
    );
    lines.push("");
  }

  lines.push(
    "Tracked in PlayTime Tracker from substitutions entered by hand. The minimum above is the target this user configured; it is not a league ruling.",
  );
  return lines.join("\n");
}
