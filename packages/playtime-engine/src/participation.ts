import {
  buildTimeline,
  materialize,
  overlapMs,
  periodOf,
  resolveAsOf,
  spanTotal,
  type ClockTimeline,
  type Span,
} from "./clock";
import { normalizeLog, type GameEvent } from "./events";
import type {
  ComplianceStatus,
  GameState,
  MinimumTarget,
  ParticipationSession,
  PlayerParticipation,
} from "./types";

/**
 * Who played, for how long, and whether the coach's own target is being met.
 */

export interface ParticipationInput {
  gameId: string;
  /** Every athlete eligible to play. Listed even if they never enter -- especially then. */
  rosterPlayerIds: readonly string[];
  periodCount: number;
  periodSeconds: number;
  minimum: MinimumTarget;
  events: readonly GameEvent[];
  /** Epoch ms. Injected rather than read from the clock so results are testable. */
  now: number;
}

/** Seconds an athlete must play to satisfy the configured target. */
export function requiredSecondsFor(
  minimum: MinimumTarget,
  regulationSeconds: number,
): number | null {
  switch (minimum.kind) {
    case "none":
      return null;
    case "percent":
      return Math.round((regulationSeconds * minimum.percent) / 100);
    case "seconds":
      return Math.max(0, Math.round(minimum.seconds));
  }
}

/**
 * Classify one athlete against the target.
 *
 * The three live states answer three different questions, and conflating them
 * is what makes a compliance indicator useless:
 *
 *   safe          Already there, or on pace to get there if nothing changes.
 *   at_risk       Still reachable, but they are behind the pace it needs.
 *                 This is the only one that asks the coach to do something,
 *                 and it is deliberately raised while there is still time to
 *                 act rather than at the final whistle.
 *   below_target  Cannot reach it even by playing every remaining second.
 *                 Stated plainly, because a tracker that keeps showing amber
 *                 after the arithmetic is settled is lying to be polite.
 */
export function classify(args: {
  secondsPlayed: number;
  requiredSeconds: number | null;
  elapsedSeconds: number;
  regulationSeconds: number;
  remainingSeconds: number;
}): ComplianceStatus {
  const { secondsPlayed, requiredSeconds, elapsedSeconds, regulationSeconds, remainingSeconds } =
    args;
  if (requiredSeconds === null) return "no_target";
  if (secondsPlayed >= requiredSeconds) return "safe";
  if (secondsPlayed + remainingSeconds < requiredSeconds) return "below_target";
  if (regulationSeconds <= 0) return "at_risk";
  const paceTarget = (requiredSeconds * Math.min(elapsedSeconds, regulationSeconds)) / regulationSeconds;
  return secondsPlayed < paceTarget ? "at_risk" : "safe";
}

/** Fold the log into each athlete's on-field spans. */
function onFieldSpans(
  events: readonly GameEvent[],
  timeline: ClockTimeline,
): Map<string, Span[]> {
  const byPlayer = new Map<string, Span[]>();
  // An athlete still on the field when the whistle blows is checked out by the
  // whistle, not left running forever.
  const finalAt = timeline.phase === "final" ? timeline.lastEventAt : null;

  let ended = false;
  for (const e of normalizeLog(events)) {
    if (ended) continue;
    const at = Date.parse(e.at);
    if (Number.isNaN(at)) continue;
    if (e.type === "game_ended") {
      ended = true;
      continue;
    }
    if (e.type !== "player_in" && e.type !== "player_out") continue;

    const spans = byPlayer.get(e.playerId) ?? [];
    const last = spans[spans.length - 1];
    if (e.type === "player_in") {
      // Already on the field: a double tap, or the same tap synced twice from
      // two devices. Ignoring it is what keeps a duplicate from becoming a
      // second concurrent session and doubling the athlete's minutes.
      if (last && last.end === null) continue;
      spans.push({ start: at, end: null, period: 0 });
    } else {
      if (!last || last.end !== null) continue;
      last.end = Math.max(last.start, at);
    }
    byPlayer.set(e.playerId, spans);
  }

  if (finalAt !== null) {
    for (const spans of byPlayer.values()) {
      const last = spans[spans.length - 1];
      if (last && last.end === null) last.end = Math.max(last.start, finalAt);
    }
  }
  return byPlayer;
}

const SEC = (ms: number): number => Math.round(ms / 1000);

/**
 * Compute the full participation picture for a game at instant `now`.
 *
 * Pure, deterministic and total: the same log and the same `now` always
 * produce the same result, on any device, after any number of restarts. That
 * property is what makes "background the app for ten minutes and come back"
 * a non-event rather than a bug report.
 */
export function computeGameState(input: ParticipationInput): GameState {
  const timeline = buildTimeline(input.events);
  const asOf = resolveAsOf(timeline, input.now);
  const runs = materialize(timeline.running, asOf);

  const elapsedMs = spanTotal(runs);
  const elapsedSeconds = SEC(elapsedMs);
  const regulationSeconds = Math.max(
    0,
    Math.round(input.periodCount * input.periodSeconds),
  );
  const periodElapsedSeconds = SEC(
    spanTotal(runs.filter((s) => s.period === timeline.currentPeriod)),
  );
  const remainingSeconds =
    timeline.phase === "final" ? 0 : Math.max(0, regulationSeconds - elapsedSeconds);
  const requiredSeconds = requiredSecondsFor(input.minimum, regulationSeconds);

  const spansByPlayer = onFieldSpans(input.events, timeline);
  const onField: string[] = [];
  const participation: PlayerParticipation[] = [];

  // Every rostered athlete appears, plus anyone the log mentions who is no
  // longer rostered. A player deactivated mid-season must not vanish from the
  // report of a game they actually played.
  const ids = new Set<string>(input.rosterPlayerIds);
  for (const id of spansByPlayer.keys()) ids.add(id);

  for (const playerId of ids) {
    const raw = spansByPlayer.get(playerId) ?? [];
    const spans = materialize(raw, asOf);
    const isOn = raw.some((s) => s.end === null);
    if (isOn) onField.push(playerId);

    const sessions: ParticipationSession[] = raw.map((s, i) => {
      const concrete = spans[i] as Span;
      const period = periodOf(concrete, runs) ?? timeline.currentPeriod;
      return {
        playerId,
        enteredAt: new Date(s.start).toISOString(),
        exitedAt: s.end === null ? null : new Date(s.end).toISOString(),
        durationSeconds: SEC(overlapMs(concrete, runs)),
        periodNumber: period,
      };
    });

    // Summed from the spans, not from the rounded per-session seconds: adding
    // up ten values each rounded to the nearest second loses up to five
    // seconds off a total that a coach may be comparing against a target.
    const playedMs = spans.reduce((acc, s) => acc + overlapMs(s, runs), 0);
    const secondsPlayed = SEC(playedMs);

    participation.push({
      playerId,
      secondsPlayed,
      share: elapsedSeconds > 0 ? playedMs / elapsedMs : null,
      onField: isOn,
      entries: raw.length,
      sessions,
      requiredSeconds,
      status: classify({
        secondsPlayed,
        requiredSeconds,
        elapsedSeconds,
        regulationSeconds,
        remainingSeconds,
      }),
    });
  }

  participation.sort((a, b) => b.secondsPlayed - a.secondsPlayed);

  return {
    gameId: input.gameId,
    phase: timeline.phase,
    currentPeriod: timeline.currentPeriod,
    elapsedSeconds,
    periodElapsedSeconds,
    regulationSeconds,
    remainingSeconds,
    onField,
    participation,
    asOf: new Date(asOf).toISOString(),
  };
}
