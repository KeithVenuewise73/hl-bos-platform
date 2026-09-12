/**
 * Dashboard and player-page aggregation.
 *
 * Pure functions over rows that have already been read through RLS, so this
 * module is unit tested and holds no I/O.
 *
 * Its governing rule, Principle 10 applied to a dashboard: a panel with no
 * confirmed data says so and says why. Every figure below is either a count of
 * rows that actually exist or an explicit `null` meaning "nothing recorded" —
 * never a zero standing in for an absence.
 */

import { rate, summarizeGrades, type GradeInput } from "@hl-bos/football";
import type { GradeRow, ParticipationRow, PlayRow } from "./types";

export interface TeamSnapshot {
  /** Plays tagged with our offence on the field. */
  readonly offensivePlays: number;
  readonly defensivePlays: number;
  /** Plays with no possession tag — the honest remainder. */
  readonly untaggedPossession: number;
  readonly explosive: number;
  readonly turnovers: number;
  readonly penalties: number;
  readonly totalPlays: number;
  /** Null when no third down has been tagged: a 0% conversion rate on zero
   *  third downs is a claim about a team that never faced one. */
  readonly thirdDownConversion: {
    hits: number;
    sample: number;
    percent: number | null;
  };
  readonly redZonePlays: number;
}

export function teamSnapshot(plays: readonly PlayRow[]): TeamSnapshot {
  const offensive = plays.filter((p) => p.possession === "offense");
  const thirdDowns = plays.filter((p) => p.third_down && p.possession === "offense");
  // A third down converted: the play produced a first down or a touchdown.
  const conversions = thirdDowns.map((p) => p.first_down || p.touchdown);
  const conversionRate = rate(conversions, { minSample: 1 });

  return {
    offensivePlays: offensive.length,
    defensivePlays: plays.filter((p) => p.possession === "defense").length,
    untaggedPossession: plays.filter((p) => p.possession === null).length,
    explosive: plays.filter((p) => p.explosive).length,
    turnovers: plays.filter((p) => p.turnover).length,
    penalties: plays.filter((p) => p.penalty).length,
    totalPlays: plays.length,
    thirdDownConversion: {
      hits: conversions.filter(Boolean).length,
      sample: thirdDowns.length,
      percent: conversionRate.percent,
    },
    redZonePlays: plays.filter((p) => p.red_zone).length,
  };
}

export interface PlayerSeason {
  readonly snaps: number;
  readonly offensiveSnaps: number;
  readonly defensiveSnaps: number;
  readonly specialTeamsSnaps: number;
  readonly graded: number;
  readonly positive: number;
  readonly neutral: number;
  readonly negative: number;
  /** Null when nothing is graded. Never 0. */
  readonly averageGrade: number | null;
  /** Snaps with no grade at all — the work still to do, stated plainly. */
  readonly ungraded: number;
}

export function playerSeason(
  participation: readonly ParticipationRow[],
  grades: readonly GradeRow[],
): PlayerSeason {
  const gradeInputs: GradeInput[] = grades.map((g) => ({
    ...(g.symbol !== null ? { symbol: g.symbol } : {}),
    ...(g.numeric_value !== null ? { numericValue: g.numeric_value } : {}),
  }));
  const summary = summarizeGrades(gradeInputs);
  const gradedPlays = new Set(grades.map((g) => g.play_id));

  return {
    snaps: participation.length,
    offensiveSnaps: participation.filter((p) => p.unit === "offense").length,
    defensiveSnaps: participation.filter((p) => p.unit === "defense").length,
    specialTeamsSnaps: participation.filter((p) => p.unit === "special_teams").length,
    graded: summary.graded,
    positive: summary.positive,
    neutral: summary.neutral,
    negative: summary.negative,
    averageGrade: summary.average,
    ungraded: participation.filter((p) => !gradedPlays.has(p.play_id)).length,
  };
}

/**
 * How complete the tagging is on one film.
 *
 * This is the number that decides whether any tendency on top of it means
 * anything, so it is shown wherever a coach might otherwise assume the film is
 * fully charted.
 */
export interface TaggingProgress {
  readonly plays: number;
  readonly withSituation: number;
  readonly withFormation: number;
  readonly withResult: number;
  readonly withParticipation: number;
  /** 0-100, or null when there are no plays at all. */
  readonly percent: number | null;
}

export function taggingProgress(
  plays: readonly PlayRow[],
  participation: readonly ParticipationRow[],
): TaggingProgress {
  if (plays.length === 0) {
    return {
      plays: 0,
      withSituation: 0,
      withFormation: 0,
      withResult: 0,
      withParticipation: 0,
      percent: null,
    };
  }
  const playsWithPeople = new Set(participation.map((p) => p.play_id));
  const withSituation = plays.filter(
    (p) => p.down !== null && p.distance !== null,
  ).length;
  const withFormation = plays.filter((p) => p.formation !== null).length;
  const withResult = plays.filter((p) => p.yards !== null || p.result !== null).length;
  const withParticipation = plays.filter((p) => playsWithPeople.has(p.id)).length;

  const filled = withSituation + withFormation + withResult + withParticipation;
  return {
    plays: plays.length,
    withSituation,
    withFormation,
    withResult,
    withParticipation,
    percent: Math.round((filled / (plays.length * 4)) * 100),
  };
}

/**
 * Film-review status across a squad (the brief's FILM REVIEW STATUS panel).
 *
 * Counts only what an athlete actually did: `filmstudy.assignment_reviews` is
 * written by the athlete's own action and by nothing else, so these numbers
 * cannot be inflated by a coach ticking a box on their behalf.
 */
export interface ReviewStatus {
  readonly assigned: number;
  readonly viewed: number;
  readonly completed: number;
  readonly outstanding: number;
}

export function reviewStatus(assignments: readonly { status: string }[]): ReviewStatus {
  const completed = assignments.filter((a) => a.status === "completed").length;
  const viewed = assignments.filter(
    (a) => a.status === "viewed" || a.status === "acknowledged",
  ).length;
  return {
    assigned: assignments.length,
    viewed,
    completed,
    outstanding: assignments.filter((a) => a.status === "assigned").length,
  };
}
