/**
 * The football domain's shared vocabulary of types.
 *
 * These mirror the enums in migration 0048 exactly. They are duplicated here
 * rather than generated because this package is deliberately database-free:
 * a future AthleteHuddle or HighlightAI can depend on the football rules
 * without depending on FilmStudy's schema. The pgTAP suite and these types are
 * kept in step by `vocabulary.test.ts`, which asserts the canonical lists.
 */

export type CompetitionLevel =
  "youth" | "middle_school" | "high_school" | "college" | "semi_pro" | "professional";

export type Unit = "offense" | "defense" | "special_teams";

export type FieldDirection = "left" | "middle" | "right";

export type HashMark = "left" | "middle" | "right";

export type PlayFamily = "run" | "pass" | "special_teams" | "penalty_only";

export type GradeScale = "symbol" | "numeric";

export type GradeSymbol =
  "exceptional" | "positive" | "neutral" | "negative" | "major_error";

/**
 * The lifecycle of a machine's guess. `ai_suggested` is the only state in
 * which a value has NOT been seen by a coach, and it is therefore the only
 * state in which a value must never be presented as a football fact.
 */
export type PredictionState =
  "ai_suggested" | "coach_confirmed" | "coach_corrected" | "rejected";

/** The situation a play happened in. Every field is optional: film gets tagged
 *  progressively, and a half-tagged play is normal, not an error. */
export interface PlaySituation {
  readonly down?: number | undefined;
  readonly distance?: number | undefined;
  /** 0-100, measured from the possessing team's own goal line. */
  readonly yardLine?: number | undefined;
  readonly quarter?: number | undefined;
  readonly possession?: Unit | undefined;
}

/** What happened. */
export interface PlayOutcome {
  readonly family?: PlayFamily | undefined;
  readonly yards?: number | undefined;
  readonly touchdown?: boolean | undefined;
  readonly firstDown?: boolean | undefined;
  readonly turnover?: boolean | undefined;
  readonly penalty?: boolean | undefined;
}

/** The four situational flags FilmStudy stores on every play. */
export interface SituationFlags {
  readonly explosive: boolean;
  readonly redZone: boolean;
  readonly thirdDown: boolean;
  readonly goalLine: boolean;
}
