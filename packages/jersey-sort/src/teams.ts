/**
 * Two teams, two jersey shades: which team a number belongs to.
 *
 * An athlete is TEAM + NUMBER, not a number. At Caz vs Wheatfield, Caz #22
 * and Wheatfield #22 are two different people, and a photo of one must never
 * land in the other's gallery.
 *
 * V1 tells the teams apart the way a person at the game does: one team wears
 * light jerseys, the other dark. The event records which is which; the
 * analysis records the shade of the jersey each number is printed on; and the
 * team follows from the two. It is DERIVED, never stored on the detection, so
 * correcting an event's colors corrects every photo in it at once.
 *
 * When the team cannot be known, the answer is "no team", never a guess: a
 * number on a jersey of unknown shade, in a game with two known teams, is
 * left for a person to assign.
 */

export const JERSEY_SHADES = ["light", "dark"] as const;
export type JerseyShade = (typeof JERSEY_SHADES)[number];

export type TeamSide = "home" | "away";

export function parseJerseyShade(v: unknown): JerseyShade | null {
  return v === "light" || v === "dark" ? v : null;
}

export function otherShade(s: JerseyShade): JerseyShade {
  return s === "light" ? "dark" : "light";
}

/** What an event knows about its two teams. */
export interface EventTeams {
  readonly homeJersey: JerseyShade | null;
  readonly awayJersey: JerseyShade | null;
  /**
   * Whether the away team is a team JerseySort knows (it can have a roster).
   * Events created before Home/Away existed have one team and the opponent
   * as plain text.
   */
  readonly hasAwayTeam: boolean;
}

/**
 * Which side of the event a number on a `jersey`-shaded jersey belongs to,
 * or null when that cannot be known.
 *
 *   - the shade matches the home jersey            -> home
 *   - the shade matches the away jersey            -> away (if that team is known)
 *   - a one-team event, shade or colors unknown    -> home (the only team there is:
 *                                                     how events worked before)
 *   - anything else                                -> null: a person decides
 *
 * The app's SQL applies the same rule (`DETECTION_TEAM` in the app's sql.ts);
 * a test holds the two together.
 */
export function teamSideFor(
  jersey: JerseyShade | null,
  event: EventTeams,
): TeamSide | null {
  if (jersey !== null && event.homeJersey === jersey) return "home";
  if (jersey !== null && event.awayJersey === jersey) {
    return event.hasAwayTeam ? "away" : null;
  }
  if (!event.hasAwayTeam && (jersey === null || event.homeJersey === null))
    return "home";
  return null;
}

/**
 * The away jersey to suggest once the home jersey is chosen (and the other
 * way round): the opposite shade. A suggestion only; the person confirms.
 */
export function suggestOtherJersey(chosen: JerseyShade | null): JerseyShade | null {
  return chosen === null ? null : otherShade(chosen);
}

/**
 * Two teams in one game cannot both be light or both be dark: then the shade
 * could not tell their athletes apart. Returns why not, or null when fine.
 */
export function jerseyConflict(
  home: JerseyShade | null,
  away: JerseyShade | null,
): string | null {
  if (home !== null && home === away) {
    return `Both teams are set to ${home} jerseys. One team must be light and the other dark, or JerseySort cannot tell their players apart.`;
  }
  return null;
}
