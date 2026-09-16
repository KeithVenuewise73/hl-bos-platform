import { normalizeLog, type GameEvent } from "./events";
import type { GamePhase } from "./types";

/**
 * The game clock, derived rather than counted.
 *
 * Everything below is interval arithmetic over instants. There is no
 * `setInterval` in this package and there never should be: a running timer is
 * a promise the operating system does not keep. iOS suspends a backgrounded
 * app within seconds, a locked screen throttles timers to nothing, and a
 * process the system reclaims to free memory stops counting entirely and
 * never says so. Subtracting two timestamps is immune to all three, because
 * the arithmetic happens when someone asks, not while nobody is looking.
 */

/** A half-open span of wall-clock time, in epoch milliseconds. */
export interface Span {
  start: number;
  /** Null means "still open" -- the span runs to whenever you ask. */
  end: number | null;
  /** Which period this span of running clock belonged to. */
  period: number;
}

export interface ClockTimeline {
  phase: GamePhase;
  currentPeriod: number;
  /** Spans during which the game clock was running, in order. */
  running: readonly Span[];
  /** Periods that have been ended, in order. */
  completedPeriods: readonly number[];
  /** The instant of the last event in the log, or null for an empty log. */
  lastEventAt: number | null;
}

function close(spans: Span[], at: number): void {
  const open = spans[spans.length - 1];
  if (!open || open.end !== null) return;
  // Clamp rather than trust. A device whose clock stepped backwards (NTP
  // correction, a manual change, a timezone-naive restore) would otherwise
  // produce a negative span and silently subtract minutes an athlete played.
  open.end = Math.max(open.start, at);
}

function open(spans: Span[], at: number, period: number): void {
  const last = spans[spans.length - 1];
  if (last && last.end === null) return;
  spans.push({ start: at, end: null, period });
}

/**
 * Fold the event log into a clock timeline.
 *
 * Events after `game_ended` are ignored. A game that has been finalised is a
 * closed record: a stray queued tap arriving late from another device must not
 * be able to reopen it and change a report the coach has already shared.
 */
export function buildTimeline(events: readonly GameEvent[]): ClockTimeline {
  const log = normalizeLog(events);
  const running: Span[] = [];
  const completedPeriods: number[] = [];

  let phase: GamePhase = "scheduled";
  let currentPeriod = 0;
  let lastEventAt: number | null = null;

  for (const e of log) {
    const at = Date.parse(e.at);
    if (Number.isNaN(at)) continue;
    if (phase === "final") continue;
    lastEventAt = lastEventAt === null ? at : Math.max(lastEventAt, at);

    switch (e.type) {
      case "game_started": {
        if (phase !== "scheduled") break;
        currentPeriod = 1;
        open(running, at, currentPeriod);
        phase = "running";
        break;
      }
      case "period_started": {
        if (phase === "scheduled") break;
        close(running, at);
        if (currentPeriod > 0 && !completedPeriods.includes(currentPeriod) && phase !== "period_break") {
          // A period started without the previous one being explicitly ended.
          completedPeriods.push(currentPeriod);
        }
        currentPeriod = e.period;
        open(running, at, currentPeriod);
        phase = "running";
        break;
      }
      case "period_ended": {
        if (phase !== "running" && phase !== "paused") break;
        close(running, at);
        if (!completedPeriods.includes(e.period)) completedPeriods.push(e.period);
        phase = "period_break";
        break;
      }
      case "clock_paused": {
        if (phase !== "running") break;
        close(running, at);
        phase = "paused";
        break;
      }
      case "clock_resumed": {
        if (phase !== "paused") break;
        open(running, at, currentPeriod);
        phase = "running";
        break;
      }
      case "game_ended": {
        close(running, at);
        if (currentPeriod > 0 && !completedPeriods.includes(currentPeriod)) {
          completedPeriods.push(currentPeriod);
        }
        phase = "final";
        break;
      }
      case "player_in":
      case "player_out":
        break;
    }
  }

  return { phase, currentPeriod, running, completedPeriods, lastEventAt };
}

/**
 * Resolve the instant a computation is "as of".
 *
 * Never earlier than the last recorded event. If a device's clock is behind
 * the one that recorded the last substitution, `Date.now()` alone would make
 * an athlete's current session appear to have negative length.
 */
export function resolveAsOf(timeline: ClockTimeline, now: number): number {
  return timeline.lastEventAt === null ? now : Math.max(now, timeline.lastEventAt);
}

/** Close every open span at `asOf`, producing concrete spans. */
export function materialize(spans: readonly Span[], asOf: number): Span[] {
  return spans.map((s) => ({
    start: s.start,
    end: s.end === null ? Math.max(s.start, asOf) : s.end,
    period: s.period,
  }));
}

/** Total milliseconds covered by a list of concrete spans. */
export function spanTotal(spans: readonly Span[]): number {
  let total = 0;
  for (const s of spans) total += Math.max(0, (s.end ?? s.start) - s.start);
  return total;
}

/**
 * Milliseconds of `window` that fall inside `spans`.
 *
 * This is the single most important function in the engine. An athlete's
 * playing time is the overlap between "they were on the field" and "the clock
 * was running" -- never one or the other alone. Standing on the field through
 * a fourteen-minute halftime is not fourteen minutes of participation, and a
 * report that says it is will be the last report that coach trusts.
 */
export function overlapMs(window: Span, spans: readonly Span[]): number {
  const ws = window.start;
  const we = window.end ?? window.start;
  let total = 0;
  for (const s of spans) {
    const se = s.end ?? s.start;
    const lo = Math.max(ws, s.start);
    const hi = Math.min(we, se);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/** The period a span of on-field time began in, or null if it never overlapped play. */
export function periodOf(window: Span, spans: readonly Span[]): number | null {
  const ws = window.start;
  const we = window.end ?? window.start;
  for (const s of spans) {
    const se = s.end ?? s.start;
    if (Math.min(we, se) > Math.max(ws, s.start)) return s.period;
  }
  // No overlap: the athlete entered during a stoppage. Attribute them to the
  // next period that starts, so the session is not orphaned.
  for (const s of spans) if (s.start >= ws) return s.period;
  return null;
}
