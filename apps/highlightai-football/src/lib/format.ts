/**
 * Formatting for the screens.
 *
 * The rule running through this file: a value that was not measured renders as
 * words saying so, never as a zero, a dash that could be mistaken for zero, or
 * a plausible-looking number. `percent(null)` is "Not measured", not "0%".
 */

/** mm:ss, as a human reads a game clock. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return clock(seconds);
}

export function percent(value: number | null, notMeasured = "Not measured"): string {
  if (value === null || Number.isNaN(value)) return notMeasured;
  return `${Math.round(value * 100)}%`;
}

export function decimal(
  value: number | null,
  places = 1,
  notMeasured = "Not measured",
): string {
  if (value === null || Number.isNaN(value)) return notMeasured;
  return value.toFixed(places);
}

export const INVOLVEMENT_LABEL: Readonly<Record<number, string>> = {
  0: "Not involved",
  1: "On the field",
  2: "Secondary involvement",
  3: "Meaningful involvement",
  4: "Significant play",
  5: "Major highlight",
};

export function involvementLabel(score: number): string {
  return INVOLVEMENT_LABEL[score] ?? "Unknown";
}

/** Tone for a confidence meter. Thresholds are the same ones that route a
 *  play to REVIEW REQUIRED, so the colour and the flag never disagree. */
export function confidenceTone(value: number): "ok" | "warn" | "danger" {
  if (value >= 0.8) return "ok";
  if (value >= 0.6) return "warn";
  return "danger";
}

export function eventLabel(kind: string): string {
  const words: Readonly<Record<string, string>> = {
    pass_breakup: "Pass breakup",
    run_stop: "Run stop",
    forced_fumble: "Forced fumble",
    pancake: "Pancake block",
  };
  return words[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Classify a play the way the Game Analysis side panel labels it. */
export function playClassification(
  events: readonly string[],
  positions: readonly string[],
): string {
  const defensive = new Set([
    "tackle",
    "sack",
    "interception",
    "pass_breakup",
    "pressure",
    "run_stop",
    "forced_fumble",
  ]);
  const offensive = new Set([
    "catch",
    "run",
    "pass",
    "handoff",
    "block",
    "pancake",
    "touchdown",
  ]);
  if (events.some((e) => defensive.has(e))) return "Defensive play";
  if (events.some((e) => offensive.has(e))) return "Offensive play";
  if (events.some((e) => ["kick", "punt", "return"].includes(e)))
    return "Special teams";
  const first = positions[0];
  if (first !== undefined && ["S", "CB", "LB", "DL"].includes(first))
    return "Defensive snap";
  return "Unclassified";
}
