/**
 * Tendency aggregation.
 *
 * This module is where the platform is most likely to lie, so it is the module
 * that refuses hardest.
 *
 * A tendency is a claim about what an opponent DOES. "Third and 7+: pass 81%"
 * is a coaching decision input -- it changes what a defense calls on Friday.
 * Computed from 4 snaps it is noise wearing a percentage sign, and a coach has
 * no way to tell the difference by looking at it.
 *
 * So every function here returns either a distribution WITH its sample size,
 * or an explicit insufficient-sample result carrying the number of confirmed
 * plays it actually had. There is no third option and no default percentage.
 *
 * The sample floor is a product decision, stated once, not scattered through
 * call sites: MIN_SAMPLE plays for a distribution to be reported at all.
 */

/** Below this many confirmed plays, no percentage is reported. */
export const MIN_SAMPLE = 8;

export interface TendencySlice {
  readonly value: string;
  readonly count: number;
  /** 0-100, rounded to one decimal. */
  readonly percent: number;
}

export interface TendencyReport {
  readonly sufficient: true;
  readonly sample: number;
  readonly slices: readonly TendencySlice[];
}

export interface InsufficientTendency {
  readonly sufficient: false;
  readonly sample: number;
  readonly required: number;
  /** Ready to render. The UI must not compose its own wording here. */
  readonly message: string;
}

export type TendencyResult = TendencyReport | InsufficientTendency;

/**
 * Count the values of one tagged field across a set of plays and report the
 * distribution -- or report that there is not enough confirmed film to.
 *
 * Untagged plays (null/undefined/empty) are EXCLUDED from the sample rather
 * than bucketed as "unknown". A 60% figure whose denominator includes plays
 * nobody tagged is not a tendency; it is a measure of how much tagging is left
 * to do, presented as football.
 */
export function tendency(
  values: readonly (string | null | undefined)[],
  options: { minSample?: number; label?: string } = {},
): TendencyResult {
  const minSample = options.minSample ?? MIN_SAMPLE;
  const tagged = values.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  const sample = tagged.length;

  if (sample < minSample) {
    const subject = options.label ? `${options.label}: ` : "";
    return {
      sufficient: false,
      sample,
      required: minSample,
      message:
        `${subject}FilmStudy AI does not yet have enough confirmed data to answer ` +
        `this reliably — ${sample} confirmed ${sample === 1 ? "play" : "plays"}, ` +
        `${minSample} needed.`,
    };
  }

  const counts = new Map<string, number>();
  for (const value of tagged) {
    const key = value.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const slices = [...counts.entries()]
    .map(([value, count]) => ({
      value,
      count,
      percent: Math.round((count / sample) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return { sufficient: true, sample, slices };
}

/** A run/pass split, which is a tendency over a two-value field. */
export function runPassSplit(
  families: readonly (string | null | undefined)[],
  options: { minSample?: number; label?: string } = {},
): TendencyResult {
  return tendency(
    families.map((f) => (f === "run" || f === "pass" ? f : undefined)),
    options,
  );
}

export interface RateResult {
  readonly sufficient: boolean;
  readonly sample: number;
  /** Null whenever the sample is below the floor. */
  readonly percent: number | null;
  readonly hits: number;
  readonly message?: string;
}

/**
 * A single rate -- blitz frequency, third-down conversion, explosive rate.
 * Same floor, same refusal.
 */
export function rate(
  outcomes: readonly boolean[],
  options: { minSample?: number; label?: string } = {},
): RateResult {
  const minSample = options.minSample ?? MIN_SAMPLE;
  const sample = outcomes.length;
  const hits = outcomes.filter(Boolean).length;

  if (sample < minSample) {
    const subject = options.label ? `${options.label}: ` : "";
    return {
      sufficient: false,
      sample,
      hits,
      percent: null,
      message:
        `${subject}not enough confirmed film — ${sample} ` +
        `${sample === 1 ? "play" : "plays"}, ${minSample} needed.`,
    };
  }

  return {
    sufficient: true,
    sample,
    hits,
    percent: Math.round((hits / sample) * 1000) / 10,
  };
}

/**
 * Yards per play over a set of plays. Null when the sample is too small OR no
 * play in it carries a yardage tag -- an average of nothing is not 0.0.
 */
export function averageYards(
  yards: readonly (number | null | undefined)[],
  options: { minSample?: number } = {},
): { sufficient: boolean; sample: number; average: number | null } {
  const minSample = options.minSample ?? MIN_SAMPLE;
  const values = yards.filter(
    (y): y is number => typeof y === "number" && Number.isFinite(y),
  );
  if (values.length < minSample) {
    return { sufficient: false, sample: values.length, average: null };
  }
  const total = values.reduce((sum, y) => sum + y, 0);
  return {
    sufficient: true,
    sample: values.length,
    average: Math.round((total / values.length) * 10) / 10,
  };
}
