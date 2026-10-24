/**
 * Which sport a shooting date shows, decided from what Claude says about a
 * few sample photos. Pure: no files, no network.
 *
 * Claude labels each sample photo on its own; the date's sport is only
 * suggested when MORE THAN HALF of the samples agree. Anything less is shown
 * as the tally ("Basketball 3, Volleyball 3, unclear 2") with no suggestion,
 * so a wrong guess is never presented as an answer. The person decides.
 */

import type { ScannedPhoto } from "../report";

/** The sports the CEO shoots, in the order he named them. */
export const SPORTS = [
  "football",
  "hockey",
  "baseball",
  "basketball",
  "soccer",
  "volleyball",
] as const;
export type Sport = (typeof SPORTS)[number];

/** What one photo shows: one of the sports, another sport, or can't tell. */
export const PHOTO_VERDICTS = [...SPORTS, "other", "unclear"] as const;
export type PhotoVerdict = (typeof PHOTO_VERDICTS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  football: "Football",
  hockey: "Hockey",
  baseball: "Baseball",
  basketball: "Basketball",
  soccer: "Soccer",
  volleyball: "Volleyball",
};

/** Photos looked at per date: enough to outvote warm-ups and crowd shots. */
export const SAMPLES_PER_DAY = 8;

export interface SportGuess {
  readonly day: string;
  /** Suggested only when more than half of the samples agree. */
  readonly sport: Sport | null;
  /** Samples that showed `sport` (0 when there is no suggestion). */
  readonly agreeing: number;
  /** Samples Claude looked at. */
  readonly looked: number;
  /** How many samples showed each verdict, largest first. */
  readonly tally: ReadonlyArray<{
    readonly verdict: PhotoVerdict;
    readonly count: number;
  }>;
  /** Claude's one-line note, or why nothing was looked at. */
  readonly notes: string;
}

/**
 * The photos to show Claude for one date: JPGs only (every camera date of
 * the CEO's has them; RAW files are the same shots), spread evenly across
 * the day by the time they were taken, so one warm-up burst cannot fill the
 * sample.
 */
export function pickSamples(
  photos: readonly ScannedPhoto[],
  day: string,
  count: number = SAMPLES_PER_DAY,
): ScannedPhoto[] {
  const ofDay = photos
    .filter((p) => p.format === "jpeg" && p.takenAt?.startsWith(day))
    .sort(
      (a, b) =>
        (a.takenAt ?? "").localeCompare(b.takenAt ?? "") ||
        a.path.localeCompare(b.path),
    );
  if (ofDay.length <= count) return ofDay;
  const picked: ScannedPhoto[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(ofDay[Math.floor(((i + 0.5) * ofDay.length) / count)]!);
  }
  return picked;
}

export function tallyGuess(
  day: string,
  verdicts: readonly PhotoVerdict[],
  notes: string,
): SportGuess {
  const counts = new Map<PhotoVerdict, number>();
  for (const v of verdicts) counts.set(v, (counts.get(v) ?? 0) + 1);
  const tally = [...counts.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count || a.verdict.localeCompare(b.verdict));
  const top = tally[0];
  const isSport = (v: PhotoVerdict): v is Sport =>
    (SPORTS as readonly string[]).includes(v);
  const wins =
    top !== undefined && isSport(top.verdict) && top.count * 2 > verdicts.length;
  return {
    day,
    sport: wins ? (top.verdict as Sport) : null,
    agreeing: wins ? top.count : 0,
    looked: verdicts.length,
    tally,
    notes,
  };
}

/**
 * The event name with the sport added in front, once:
 * "" -> "Basketball", "Zac K" -> "Basketball - Zac K",
 * "Basketball - Zac K" -> unchanged.
 */
export function withSport(eventName: string, sport: Sport): string {
  const label = SPORT_LABEL[sport];
  const name = eventName.trim();
  if (name === "") return label;
  if (name.toLowerCase() === label.toLowerCase()) return name;
  if (name.toLowerCase().startsWith(`${label.toLowerCase()} - `)) return name;
  return `${label} - ${name}`;
}
