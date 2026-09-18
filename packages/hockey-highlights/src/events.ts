/**
 * Finding the moments worth watching.
 *
 * What this file does NOT do is as important as what it does. It does not
 * detect goals, saves, assists or hits, because nothing upstream of it can see
 * a puck. It detects **motion signatures** — sustained speed, sharp direction
 * changes, prolonged presence near play — and names them for what they are.
 *
 * Calling a burst of speed a "breakaway" would be inventing a result, which the
 * platform's tenth principle forbids and which would be caught the first time a
 * parent watched a clip labelled "goal" in which nobody scored. A clip labelled
 * "sustained high speed toward the far end" is honest, and a human reviewer
 * turns it into a highlight in one click.
 *
 * Speeds are in *frame heights per second*, not metres per second. Scale is
 * unknowable from a single uncalibrated camera, and a normalised unit that is
 * honestly relative beats a metric one that is confidently wrong.
 */

import type { CandidateEvent, EventKind, Observation, PlayerSegment } from "./types.ts";

export interface EventDetectionOptions {
  /** Frame height in pixels, used to normalise motion. */
  readonly frameHeight: number;
  /** Ignore anything shorter than this. Sub-second flickers are noise. */
  readonly minEventSeconds?: number;
  /** Speed (frame-heights/sec) above which motion counts as a burst. */
  readonly burstSpeed?: number;
  /** Direction change in degrees that counts as a cut. */
  readonly cutAngleDegrees?: number;
  /** Cap on how many events one segment may yield. */
  readonly maxEventsPerSegment?: number;
}

const DEFAULTS = {
  minEventSeconds: 0.8,
  burstSpeed: 0.55,
  cutAngleDegrees: 55,
  maxEventsPerSegment: 12,
} as const;

interface Sample {
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  readonly heading: number | null;
}

/**
 * Turn boxes into motion.
 *
 * The reference point is the bottom-centre of the box — where the skates are —
 * rather than the centroid. A player who raises their stick changes their box
 * height and therefore their centroid without having moved, and centroid-based
 * speed reports that as motion.
 */
function toSamples(
  observations: readonly Observation[],
  frameHeight: number,
): readonly Sample[] {
  const ordered = [...observations].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const samples: Sample[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    if (current === undefined) continue;
    const x = (current.box.x + current.box.width / 2) / frameHeight;
    const y = (current.box.y + current.box.height) / frameHeight;
    const previous = i > 0 ? samples[samples.length - 1] : undefined;
    if (previous === undefined) {
      samples.push({ time: current.timeSeconds, x, y, speed: 0, heading: null });
      continue;
    }
    const dt = current.timeSeconds - previous.time;
    if (dt <= 0) continue;
    const dx = x - previous.x;
    const dy = y - previous.y;
    const distance = Math.hypot(dx, dy);
    samples.push({
      time: current.timeSeconds,
      x,
      y,
      speed: distance / dt,
      heading: distance > 1e-6 ? Math.atan2(dy, dx) : previous.heading,
    });
  }
  return samples;
}

/** Smallest angle between two headings, in degrees. */
function headingDeltaDegrees(a: number, b: number): number {
  let delta = Math.abs(a - b);
  while (delta > Math.PI) delta = Math.abs(delta - 2 * Math.PI);
  return (delta * 180) / Math.PI;
}

/**
 * A three-sample median, applied to speed only.
 *
 * One dropped detection produces a box that jumps and returns, which reads as
 * two enormous speeds a frame apart. A median kills that without blunting a
 * real acceleration the way a mean would.
 */
function smoothSpeeds(samples: readonly Sample[]): readonly number[] {
  return samples.map((sample, index) => {
    const before = samples[index - 1]?.speed ?? sample.speed;
    const after = samples[index + 1]?.speed ?? sample.speed;
    const sorted = [before, sample.speed, after].sort((a, b) => a - b);
    return sorted[1] ?? sample.speed;
  });
}

interface Window {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly peakIndex: number;
  readonly peak: number;
}

/** Contiguous runs where a value stays above a threshold. */
function runsAbove(values: readonly number[], threshold: number): readonly Window[] {
  const windows: Window[] = [];
  let start: number | null = null;
  let peak = 0;
  let peakIndex = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? 0;
    if (value >= threshold) {
      if (start === null) {
        start = i;
        peak = value;
        peakIndex = i;
      } else if (value > peak) {
        peak = value;
        peakIndex = i;
      }
      continue;
    }
    if (start !== null) {
      windows.push({ startIndex: start, endIndex: i - 1, peakIndex, peak });
      start = null;
    }
  }
  if (start !== null) {
    windows.push({ startIndex: start, endIndex: values.length - 1, peakIndex, peak });
  }
  return windows;
}

/**
 * How strong an event is, 0..1.
 *
 * Speed above the threshold and duration both contribute, and both saturate:
 * a player going twice the threshold speed for ten seconds is a highlight, not
 * a highlight ten times over, and an unbounded score would sort it above
 * everything else forever.
 */
function strengthFrom(peak: number, threshold: number, seconds: number): number {
  const overspeed = Math.min(1, (peak - threshold) / Math.max(threshold, 1e-6));
  const sustain = Math.min(1, seconds / 3);
  return Math.round((0.6 * overspeed + 0.4 * sustain) * 1000) / 1000;
}

/**
 * Find candidate events inside one identified segment.
 *
 * Every event inherits the segment's identity confidence unchanged. It is
 * never blended into the motion strength, because "we are sure this is your
 * player and unsure it is interesting" and "we are unsure this is your player
 * and sure it is interesting" are opposite situations that a single combined
 * number would render identical.
 */
export function detectEvents(
  segment: PlayerSegment,
  observations: readonly Observation[],
  options: EventDetectionOptions,
): readonly CandidateEvent[] {
  const minSeconds = options.minEventSeconds ?? DEFAULTS.minEventSeconds;
  const burstSpeed = options.burstSpeed ?? DEFAULTS.burstSpeed;
  const cutAngle = options.cutAngleDegrees ?? DEFAULTS.cutAngleDegrees;
  const maxEvents = options.maxEventsPerSegment ?? DEFAULTS.maxEventsPerSegment;

  const samples = toSamples(observations, options.frameHeight);
  if (samples.length < 3) return [];
  const speeds = smoothSpeeds(samples);
  const events: CandidateEvent[] = [];

  const timeAt = (index: number): number =>
    samples[Math.min(Math.max(index, 0), samples.length - 1)]?.time ??
    segment.startTime;

  /**
   * The shortest a given kind of moment is allowed to be.
   *
   * Crease work gets its own, shorter floor. A goalie's post-to-post push is
   * genuinely brief — that is its whole signature — and holding it to the same
   * 0.8s minimum as a rush up the ice suppressed exactly the events the crease
   * detector exists to find. A floor built for one kind of motion is not a
   * floor for every kind of motion.
   */
  const floorFor = (kind: EventKind): number =>
    kind === "crease_action" ? Math.min(minSeconds, 0.45) : minSeconds;

  const push = (
    kind: EventKind,
    startIndex: number,
    endIndex: number,
    peakIndex: number,
    strength: number,
    rationale: string,
  ): void => {
    const startTime = timeAt(startIndex);
    const endTime = timeAt(endIndex);
    // The epsilon is not decoration. A cut window is exactly four samples wide,
    // which at 5Hz is 0.8s — the same as the default minimum. Computed as
    // 14/5 - 10/5 that is 0.7999999999999998, so a bare `<` silently threw away
    // every direction change the detector found. The engine's tests caught it
    // by asking for a hard turn and being handed nothing.
    if (endTime - startTime < floorFor(kind) - 1e-9) return;
    events.push({
      id: `${segment.id}-${kind}-${startIndex}`,
      projectId: segment.projectId,
      segmentId: segment.id,
      kind,
      startTime,
      endTime,
      peakTime: timeAt(peakIndex),
      strength,
      identityConfidence: segment.confidence,
      rationale,
    });
  };

  // --- Bursts of speed -----------------------------------------------------
  for (const window of runsAbove(speeds, burstSpeed)) {
    const seconds = timeAt(window.endIndex) - timeAt(window.startIndex);
    push(
      "burst",
      window.startIndex,
      window.endIndex,
      window.peakIndex,
      strengthFrom(window.peak, burstSpeed, seconds),
      `Skating hard for ${seconds.toFixed(1)}s, peaking at ${window.peak.toFixed(2)} frame-heights per second.`,
    );
  }

  // --- Sharp changes of direction, while moving ----------------------------
  // The speed condition matters: a stationary player's heading is noise, and
  // without the gate every idle stretch produces a stream of phantom cuts.
  for (let i = 1; i < samples.length - 1; i += 1) {
    const before = samples[i - 1];
    const after = samples[i + 1];
    const here = samples[i];
    if (before?.heading == null || after?.heading == null || here === undefined)
      continue;
    const speedHere = speeds[i] ?? 0;
    if (speedHere < burstSpeed * 0.5) continue;
    const delta = headingDeltaDegrees(before.heading, after.heading);
    if (delta < cutAngle) continue;
    push(
      "cut",
      Math.max(0, i - 2),
      Math.min(samples.length - 1, i + 2),
      i,
      Math.round(Math.min(1, delta / 180) * 1000) / 1000,
      `Changed direction by ${Math.round(delta)} degrees while still moving.`,
    );
  }

  // --- Goalie crease work --------------------------------------------------
  // A goalie's highlight is lateral scramble, not a rush, so the same speed
  // threshold would find nothing. This looks for the opposite signature:
  // significant sideways motion inside a small area.
  if (segment.evidence.observationCount >= 6) {
    for (const window of runsAbove(
      samples.map((s, i) => {
        const previous = samples[i - 1];
        if (previous === undefined) return 0;
        const dt = s.time - previous.time;
        if (dt <= 0) return 0;
        return Math.abs(s.x - previous.x) / dt;
      }),
      burstSpeed * 0.6,
    )) {
      const seconds = timeAt(window.endIndex) - timeAt(window.startIndex);
      const xs = samples.slice(window.startIndex, window.endIndex + 1).map((s) => s.x);
      if (xs.length === 0) continue;
      const spread = Math.max(...xs) - Math.min(...xs);
      // Confined to a small horizontal band: crease work, not a breakout.
      if (spread > 0.6) continue;
      push(
        "crease_action",
        window.startIndex,
        window.endIndex,
        window.peakIndex,
        strengthFrom(window.peak, burstSpeed * 0.6, seconds),
        `Quick side-to-side movement in a small area for ${seconds.toFixed(1)}s.`,
      );
    }
  }

  // --- Long, calm presence -------------------------------------------------
  // The weakest signal by design, and the one that keeps a defenceman from
  // having an empty reel: they are visibly involved without ever sprinting.
  const segmentSeconds = segment.endTime - segment.startTime;
  if (events.length === 0 && segmentSeconds >= 4) {
    push(
      "sustained_presence",
      0,
      samples.length - 1,
      Math.floor(samples.length / 2),
      0.25,
      `In frame and tracked continuously for ${segmentSeconds.toFixed(1)}s without a burst of speed.`,
    );
  }

  return dedupe(events)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxEvents);
}

/**
 * Collapse events of the same kind that overlap.
 *
 * A single rush produces several overlapping bursts as the smoothed speed
 * wobbles across the threshold. Shipping all of them would give the reviewer
 * five near-identical clips of one moment to rule on individually.
 */
function dedupe(events: readonly CandidateEvent[]): CandidateEvent[] {
  const byKind = new Map<EventKind, CandidateEvent[]>();
  for (const event of events) {
    const list = byKind.get(event.kind) ?? [];
    list.push(event);
    byKind.set(event.kind, list);
  }
  const kept: CandidateEvent[] = [];
  for (const list of byKind.values()) {
    const ordered = [...list].sort((a, b) => a.startTime - b.startTime);
    let current: CandidateEvent | undefined;
    for (const event of ordered) {
      if (current === undefined) {
        current = event;
        continue;
      }
      if (event.startTime <= current.endTime) {
        current =
          event.strength > current.strength
            ? { ...event, startTime: current.startTime }
            : { ...current, endTime: Math.max(current.endTime, event.endTime) };
        continue;
      }
      kept.push(current);
      current = event;
    }
    if (current !== undefined) kept.push(current);
  }
  return kept;
}
