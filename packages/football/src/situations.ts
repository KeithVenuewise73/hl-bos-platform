/**
 * Situational classification.
 *
 * These four flags drive most of what a coach asks film for -- explosive
 * plays, red zone, third down, goal line -- so they are defined ONCE, here,
 * and FilmStudy stores the result rather than re-deriving it per query. Two
 * screens disagreeing about which plays were explosive is the kind of bug
 * that quietly destroys trust in every number on the page.
 */

import type { PlayFamily, PlaySituation, PlayOutcome, SituationFlags } from "./types";

/**
 * Explosive-play thresholds. The high-school convention, and the one the
 * FilmStudy brief uses: 12+ yards on a run, 16+ on a pass.
 *
 * These are per-level because they genuinely differ -- a 12-yard run is not
 * explosive in the NFL and is a huge gain in youth football -- but the levels
 * that share a threshold say so explicitly rather than falling through a
 * default, so changing one never silently changes another.
 */
export const EXPLOSIVE_THRESHOLDS = {
  youth: { run: 10, pass: 15 },
  middle_school: { run: 10, pass: 15 },
  high_school: { run: 12, pass: 16 },
  college: { run: 12, pass: 16 },
  semi_pro: { run: 12, pass: 16 },
  professional: { run: 12, pass: 16 },
} as const;

export type ExplosiveLevel = keyof typeof EXPLOSIVE_THRESHOLDS;

/**
 * Was this an explosive play?
 *
 * Returns false when we cannot tell -- unknown family, unknown yardage,
 * special teams. A missing tag is not a negative result, but it is also not a
 * positive one, and "explosive" is a claim we only make from data we have.
 */
export function isExplosive(
  family: PlayFamily | undefined,
  yards: number | undefined,
  level: ExplosiveLevel = "high_school",
): boolean {
  if (yards === undefined || yards === null) return false;
  if (family !== "run" && family !== "pass") return false;
  const thresholds = EXPLOSIVE_THRESHOLDS[level];
  return yards >= thresholds[family];
}

/**
 * Red zone: the offense is inside the opponent's 20.
 *
 * yardLine is measured from the POSSESSING team's own goal line, so for our
 * offense that means 80 or better. When our defense is on the field the same
 * number describes the opponent's progress, so the test inverts.
 */
export function isRedZone(situation: PlaySituation): boolean {
  const { yardLine, possession } = situation;
  if (yardLine === undefined) return false;
  if (possession === "offense") return yardLine >= 80;
  if (possession === "defense") return yardLine <= 20;
  return false;
}

/** Goal line: inside the 5. Same orientation rule as the red zone. */
export function isGoalLine(situation: PlaySituation): boolean {
  const { yardLine, possession } = situation;
  if (yardLine === undefined) return false;
  if (possession === "offense") return yardLine >= 95;
  if (possession === "defense") return yardLine <= 5;
  return false;
}

export function isThirdDown(situation: PlaySituation): boolean {
  return situation.down === 3;
}

/** All four flags at once -- what FilmStudy passes to filmstudy.tag_play. */
export function classifySituation(
  situation: PlaySituation,
  outcome: PlayOutcome,
  level: ExplosiveLevel = "high_school",
): SituationFlags {
  return {
    explosive: isExplosive(outcome.family, outcome.yards, level),
    redZone: isRedZone(situation),
    thirdDown: isThirdDown(situation),
    goalLine: isGoalLine(situation),
  };
}

/**
 * The down-and-distance bucket coaches actually talk in. This is what makes
 * "what do they do on third and long?" answerable.
 */
export type DistanceBucket = "short" | "medium" | "long";

export function distanceBucket(distance: number | undefined): DistanceBucket | null {
  if (distance === undefined || distance < 0) return null;
  if (distance <= 3) return "short";
  if (distance <= 6) return "medium";
  return "long";
}

/** "3rd & 7+" style label, or null when the down and distance are not tagged. */
export function situationLabel(situation: PlaySituation): string | null {
  const { down, distance } = situation;
  if (down === undefined) return null;
  const ordinal = down === 1 ? "1st" : down === 2 ? "2nd" : down === 3 ? "3rd" : "4th";
  if (distance === undefined) return ordinal;
  if (distance === 0) return `${ordinal} & Goal`;
  return `${ordinal} & ${distance}`;
}

/** Yard line as a coach writes it: "Own 38", "Opp 12", "50". */
export function yardLineLabel(
  yardLine: number | undefined,
  possession: "offense" | "defense" | "special_teams" | undefined,
): string | null {
  if (yardLine === undefined) return null;
  if (yardLine < 0 || yardLine > 100) return null;
  if (yardLine === 50) return "50";
  const side = possession === "defense" ? "Opp" : "Own";
  const other = possession === "defense" ? "Own" : "Opp";
  return yardLine < 50 ? `${side} ${yardLine}` : `${other} ${100 - yardLine}`;
}
