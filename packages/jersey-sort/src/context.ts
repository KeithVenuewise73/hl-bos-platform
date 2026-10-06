/**
 * Which numbers in a photo are jersey numbers.
 *
 * A sports photo is full of digits that are not jerseys: the scoreboard, the
 * game clock, the yard line, a sponsor's phone number, the 50 painted on the
 * field. A product that files a photo under every number it can read sends a
 * parent's #14 gallery a picture of the scoreboard reading 14–21.
 *
 * Two kinds of evidence are used, in this order:
 *
 *   1. WHAT THE PROVIDER SAW. A vision model can say "that 30 is a yard
 *      marker". When it does, the reading is refused outright.
 *   2. WHERE AND HOW BIG THE DIGITS ARE, when the provider cannot say (plain
 *      OCR reads characters, not jerseys). These rules only LOWER confidence;
 *      a heuristic is not allowed to throw away a real #30 on its own.
 *
 * And one rule about honesty: a provider that cannot see what a number is
 * printed on (`location: "unknown"`) cannot be highly confident it is a
 * jersey, however crisp the digits. Its confidence is capped below the
 * automatic band by default, so OCR-only readings always reach a human.
 */

import { parseJerseyShade } from "./teams.ts";
import { normalizeJerseyNumber } from "./numbers.ts";
import {
  JERSEY_LOCATIONS,
  NON_JERSEY_LOCATIONS,
  type DetectionMethod,
  type JerseyDetection,
  type NonJerseyLocation,
  type ProviderReading,
  type RejectedReading,
} from "./types.ts";

export interface InterpretOptions {
  readonly method: DetectionMethod;
  /** Readings below this, after adjustment, are noise and are dropped. */
  readonly minConfidence?: number;
  /**
   * Ceiling for readings whose location is unknown. 0.8 sits inside the
   * default MEDIUM band: filed, but marked Needs Review.
   */
  readonly unknownLocationCap?: number;
}

const DEFAULTS = { minConfidence: 0.15, unknownLocationCap: 0.8 } as const;

const NON_JERSEY_REASON: Readonly<Record<NonJerseyLocation, string>> = {
  scoreboard: "on the scoreboard",
  yard_marker: "a yard marker",
  sign: "on a sign",
  advertising: "advertising",
  clock: "a clock",
  field_marking: "painted on the field",
  other_not_jersey: "not on a uniform",
};

export interface Interpretation {
  readonly detections: JerseyDetection[];
  readonly rejected: RejectedReading[];
}

export function interpretReadings(
  readings: readonly ProviderReading[],
  options: InterpretOptions,
): Interpretation {
  const minConfidence = options.minConfidence ?? DEFAULTS.minConfidence;
  const cap = options.unknownLocationCap ?? DEFAULTS.unknownLocationCap;
  const best = new Map<string, JerseyDetection>();
  const rejected: RejectedReading[] = [];

  for (const reading of readings) {
    const refuse = (reason: string): void => {
      rejected.push({
        text: reading.text,
        confidence: reading.confidence,
        location: reading.location,
        reason,
      });
    };

    const confidence = clamp01(reading.confidence);
    const nonJersey = (NON_JERSEY_LOCATIONS as readonly string[]).includes(
      reading.location,
    )
      ? (reading.location as NonJerseyLocation)
      : null;
    if (nonJersey !== null) {
      refuse(`Not a jersey number: ${NON_JERSEY_REASON[nonJersey]}.`);
      continue;
    }

    const value = normalizeJerseyNumber(reading.text);
    if (value === null) {
      refuse("Not a jersey number: jerseys carry one or two digits.");
      continue;
    }

    let adjusted = confidence;
    if (reading.location === "unknown") {
      adjusted = Math.min(adjusted * positionalFactor(value, reading), cap);
    } else if (!(JERSEY_LOCATIONS as readonly string[]).includes(reading.location)) {
      /* c8 ignore next 2 -- the type admits no other value */
      refuse("Not a jersey number: unrecognised location.");
      continue;
    }

    if (adjusted < minConfidence) {
      refuse("Too faint to be useful.");
      continue;
    }

    const detection: JerseyDetection = {
      value,
      confidence: round3(adjusted),
      box: reading.box,
      location: reading.location,
      method: options.method,
      jersey: parseJerseyShade(reading.jersey),
    };
    // One detection per number per jersey shade: two readings of the same
    // dark #24 are the same athlete seen twice. Keep the stronger. A light
    // #24 and a dark #24 are two athletes on two teams, and both are kept.
    const key = `${value}|${detection.jersey ?? "?"}`;
    const existing = best.get(key);
    if (existing === undefined || existing.confidence < detection.confidence) {
      best.set(key, detection);
    }
  }

  // A #24 whose jersey could not be seen is the #24 that WAS seen, not a third
  // athlete: drop it when the same number was read on a known jersey.
  const known = new Set(
    [...best.values()].filter((d) => d.jersey !== null).map((d) => d.value),
  );
  const detections = [...best.values()]
    .filter((d) => d.jersey !== null || !known.has(d.value))
    .sort((a, b) => b.confidence - a.confidence);
  return { detections, rejected };
}

/**
 * Confidence multiplier from where the digits sit, for readings whose
 * location is unknown. Each factor encodes one thing photographers' photos
 * actually look like; none of them is allowed to reach zero.
 */
export function positionalFactor(value: string, reading: ProviderReading): number {
  const box = reading.box;
  if (box === null) return 1;
  let factor = 1;
  // Scoreboards and clocks live along the top edge of a sideline shot.
  if (box.y + box.height <= 0.15) factor *= 0.5;
  // Tiny digits are signage, a distant scoreboard, or a sponsor's phone
  // number. A jersey number a photographer cares about is not 2% tall.
  if (box.height < 0.025) factor *= 0.6;
  // Yard markers: 10..50 by tens, low in the frame.
  const n = Number(value);
  if (value.length === 2 && n % 10 === 0 && n >= 10 && n <= 50 && box.y >= 0.65) {
    factor *= 0.6;
  }
  return factor;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
