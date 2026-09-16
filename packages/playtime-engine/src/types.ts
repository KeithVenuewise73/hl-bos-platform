/**
 * The domain vocabulary of game participation.
 *
 * Nothing in this file knows about React, Supabase, localStorage or PlayTime
 * Tracker's screens. That is deliberate: this engine is meant to be lifted
 * into AthleteHuddle, CoachesHuddle, OrganizationHuddle, GameTracker and
 * 5-Star Sports Media without dragging a UI behind it.
 *
 * Two rules shape every type here:
 *
 *   1. TIME IS A TIMESTAMP, NEVER A COUNTER. Every duration in this engine is
 *      derived by subtracting two wall-clock instants recorded at the moment
 *      something happened. There is no tick, no interval, no accumulator that
 *      a backgrounded app, a locked screen or a killed process could stop
 *      advancing. If the phone sleeps for eleven minutes, the arithmetic
 *      simply produces eleven more minutes when it wakes up.
 *
 *   2. THE EVENT LOG IS THE TRUTH. Everything else -- who is on the field,
 *      how long #22 has played, whether the game is running -- is computed
 *      from the log, not stored beside it and hoped to agree.
 */

/** Sports understood in V1. `other` keeps the product usable beyond them. */
export const SPORTS = [
  "football",
  "basketball",
  "soccer",
  "hockey",
  "baseball",
  "other",
] as const;

export type Sport = (typeof SPORTS)[number];

export const SPORT_LABEL: Readonly<Record<Sport, string>> = {
  football: "Football",
  basketball: "Basketball",
  soccer: "Soccer",
  hockey: "Hockey",
  baseball: "Baseball",
  other: "Other",
};

/**
 * What a sport calls its segments. Cosmetic only -- the engine treats every
 * sport identically -- but saying "Quarter 3" to a football coach and
 * "Period 3" to a hockey coach is the difference between a tool that was
 * built for them and one that was not.
 */
export const PERIOD_NOUN: Readonly<Record<Sport, string>> = {
  football: "Quarter",
  basketball: "Quarter",
  soccer: "Half",
  hockey: "Period",
  baseball: "Inning",
  other: "Period",
};

export interface Team {
  id: string;
  ownerId: string;
  name: string;
  sport: Sport;
  /** Archived teams stay in history but leave the active list. Never deleted silently. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Player {
  id: string;
  ownerId: string;
  teamId: string;
  firstName: string;
  lastName: string;
  /** Free text, not a number: "00" and "07" are real jerseys and are not 0 and 7. */
  jerseyNumber: string;
  position: string | null;
  /** A deactivated player keeps every minute already recorded; they just stop being rostered. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A user-configured participation target. Never a league rule: PlayTime
 * Tracker does not know your league's bylaws and does not claim to.
 */
export type MinimumTarget =
  | { kind: "none" }
  /** e.g. 25 -> every athlete should play at least 25% of the game clock. */
  | { kind: "percent"; percent: number }
  /** e.g. 720 -> every athlete should play at least 12 minutes. */
  | { kind: "seconds"; seconds: number };

export type GamePhase =
  /** Created, roster chosen, clock has never started. */
  | "scheduled"
  /** Clock is running. */
  | "running"
  /** Clock is stopped mid-period (timeout, injury, the coach's discretion). */
  | "paused"
  /** A period has ended and the next has not begun. */
  | "period_break"
  /** Final. The log is closed. */
  | "final";

export interface GameSetup {
  id: string;
  ownerId: string;
  teamId: string;
  opponent: string;
  /** Calendar date of the game, `YYYY-MM-DD`, as the user entered it. */
  gameDate: string;
  periodCount: number;
  periodSeconds: number;
  minimum: MinimumTarget;
  createdAt: string;
}

/** Optional, entered after the fact. Absent is absent -- never rendered as 0-0. */
export interface GameScore {
  us: number;
  them: number;
}

export interface Game extends GameSetup {
  /** Roster selected for this game: the player ids eligible to take the field. */
  rosterPlayerIds: readonly string[];
  score: GameScore | null;
  updatedAt: string;
}

/** A single continuous stretch of one athlete on the field. */
export interface ParticipationSession {
  playerId: string;
  /** Wall-clock instant the athlete entered play. */
  enteredAt: string;
  /** Null while the athlete is still on the field. */
  exitedAt: string | null;
  /**
   * Counted seconds in this session. This is NOT `exitedAt - enteredAt`: time
   * while the clock was stopped (halftime, a timeout, an injury) is excluded,
   * because an athlete standing on the field during a stoppage is not playing.
   */
  durationSeconds: number;
  /** The period the session began in. */
  periodNumber: number;
}

export type ComplianceStatus =
  /** Target already met, or on pace to meet it. */
  | "safe"
  /** Can still reach the target, but is behind the pace needed to get there. */
  | "at_risk"
  /** Cannot reach the target in the time that remains. */
  | "below_target"
  /** No target configured. The engine states this rather than inventing one. */
  | "no_target";

export interface PlayerParticipation {
  playerId: string;
  /** Total counted seconds played so far. */
  secondsPlayed: number;
  /** Fraction of elapsed game clock, 0..1. Null when the clock has not started. */
  share: number | null;
  onField: boolean;
  /** How many times this athlete has entered play. */
  entries: number;
  sessions: readonly ParticipationSession[];
  status: ComplianceStatus;
  /** Seconds required to satisfy the configured target; null when there is none. */
  requiredSeconds: number | null;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  /** 0 before the first period starts. */
  currentPeriod: number;
  /** Counted game-clock seconds elapsed across the whole game. */
  elapsedSeconds: number;
  /** Counted seconds elapsed in the current period. */
  periodElapsedSeconds: number;
  /** periodCount * periodSeconds. The denominator for a percentage target. */
  regulationSeconds: number;
  /** Regulation seconds not yet played. Zero once the game is final. */
  remainingSeconds: number;
  /** Player ids currently on the field. */
  onField: readonly string[];
  participation: readonly PlayerParticipation[];
  /** Instant this state was computed for. */
  asOf: string;
}
