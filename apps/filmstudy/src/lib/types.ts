/**
 * Row shapes returned by the `filmstudy` schema.
 *
 * Hand-written rather than generated, because generating them needs a live
 * project and this app must typecheck without one. They are kept in step with
 * migration 0048 by `schema.test.ts`, which asserts that every column this app
 * selects is actually named in the migration file.
 */

import type { FootballRole } from "./access";

export type FilmKind =
  "game" | "practice" | "scrimmage" | "individual_workout" | "opponent";

export type FilmStatus =
  "registered" | "uploading" | "stored" | "ready" | "failed" | "demo_no_video";

export type Unit = "offense" | "defense" | "special_teams";
export type Venue = "home" | "away" | "neutral";
export type PlayFamilyRow = "run" | "pass" | "special_teams" | "penalty_only";
export type Direction = "left" | "middle" | "right";
export type GradeSymbolRow =
  "exceptional" | "positive" | "neutral" | "negative" | "major_error";
export type PredictionStateRow =
  "ai_suggested" | "coach_confirmed" | "coach_corrected" | "rejected";
export type AssignmentKind =
  | "review"
  | "correct"
  | "study"
  | "great_rep"
  | "mental_error"
  | "technique"
  | "opponent_tendency";
export type AssignmentStatus = "assigned" | "viewed" | "acknowledged" | "completed";

export interface TeamRow {
  id: string;
  tenant_id: string;
  name: string;
  level: string;
  mascot: string | null;
  grade_scale: "symbol" | "numeric";
  athletes_see_grades: boolean;
  guardian_access: boolean;
  guardians_see_grades: boolean;
  is_demo: boolean;
}

export interface SeasonRow {
  id: string;
  year: number;
  label: string;
  is_current: boolean;
}

export interface PlayerRow {
  id: string;
  jersey_number: number | null;
  first_name: string;
  last_name: string;
  position: string | null;
  unit: Unit | null;
  class_year: string | null;
  height_inches: number | null;
  weight_pounds: number | null;
  active: boolean;
}

export interface OpponentRow {
  id: string;
  name: string;
  mascot: string | null;
}

export interface GameRow {
  id: string;
  opponent_id: string | null;
  kickoff_at: string | null;
  venue: Venue;
  location: string | null;
  week: number | null;
  team_score: number | null;
  opponent_score: number | null;
  notes: string | null;
}

export interface FilmRow {
  id: string;
  game_id: string | null;
  title: string;
  film_kind: FilmKind;
  unit: Unit | null;
  status: FilmStatus;
  bucket: string;
  object_path: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  recorded_on: string | null;
  notes: string | null;
  athlete_visible: boolean;
  created_at: string;
}

export interface PlayRow {
  id: string;
  film_asset_id: string;
  game_id: string | null;
  play_number: number;
  start_seconds: number;
  end_seconds: number;
  snap_seconds: number | null;
  quarter: number | null;
  clock: string | null;
  down: number | null;
  distance: number | null;
  yard_line: number | null;
  hash: Direction | null;
  possession: Unit | null;
  personnel: string | null;
  formation: string | null;
  strength: Direction | null;
  motion: string | null;
  play_call: string | null;
  family: PlayFamilyRow | null;
  concept: string | null;
  direction: Direction | null;
  defensive_front: string | null;
  box_count: number | null;
  coverage: string | null;
  pressure: string | null;
  result: string | null;
  yards: number | null;
  touchdown: boolean;
  first_down: boolean;
  turnover: boolean;
  penalty: boolean;
  explosive: boolean;
  red_zone: boolean;
  third_down: boolean;
  goal_line: boolean;
}

export interface PredictionRow {
  id: string;
  play_id: string;
  prediction_type: string;
  predicted_value: string;
  confidence: number;
  model: string;
  model_version: string;
  state: PredictionStateRow;
}

export interface ParticipationRow {
  id: string;
  play_id: string;
  player_id: string;
  unit: Unit;
  position: string | null;
  assignment: string | null;
}

export interface GradeRow {
  id: string;
  play_id: string;
  player_id: string;
  category_key: string;
  symbol: GradeSymbolRow | null;
  numeric_value: number | null;
}

export interface GradeCategoryRow {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  active: boolean;
}

export interface NoteRow {
  id: string;
  player_id: string;
  play_id: string | null;
  timestamp_seconds: number | null;
  body: string;
  visible_to_athlete: boolean;
  source: string;
  created_at: string;
}

export interface ClipRow {
  id: string;
  film_asset_id: string;
  play_id: string | null;
  title: string;
  caption: string | null;
  start_seconds: number;
  end_seconds: number;
  playback_rate: number;
  created_at: string;
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  generated_by: string;
  shared_with_athletes: boolean;
  created_at: string;
}

export interface PlaylistItemRow {
  id: string;
  playlist_id: string;
  play_id: string | null;
  clip_id: string | null;
  position: number;
  note: string | null;
}

export interface AssignmentRow {
  id: string;
  player_id: string;
  assignment_kind: AssignmentKind;
  message: string | null;
  due_on: string | null;
  status: AssignmentStatus;
  created_at: string;
}

export interface AssignmentItemRow {
  id: string;
  assignment_id: string;
  play_id: string | null;
  clip_id: string | null;
  position: number;
}

export interface TeamMemberRow {
  id: string;
  user_id: string;
  football_role: FootballRole;
  unit: Unit | null;
  position_group: string | null;
}

/** Who is looking, and at which team. */
export interface Viewer {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  /** The team currently in context, or null when the user is on none. */
  team: TeamRow | null;
  /** Every team this user belongs to, for the team switcher. */
  teams: readonly TeamRow[];
  role: FootballRole | null;
  /** Roster rows this user IS (athlete) or is guardian for. */
  playerIds: readonly string[];
}
