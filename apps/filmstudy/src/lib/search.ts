/**
 * Applying a parsed film query to confirmed play rows.
 *
 * Pure, so it is unit tested. It sits between @hl-bos/football's parser (which
 * knows football words) and the database rows (which know this team's film).
 *
 * The matching rule throughout: a filter term only ever NARROWS. A play with an
 * untagged formation is not a match for "Trips Right" — it is a play nobody has
 * charted. Treating untagged as "might be" would make every result list longer
 * and every one of them less true.
 */

import { conceptFamily, distanceBucket, type PlayFilter } from "@hl-bos/football";
import type { ParticipationRow, PlayRow, PlayerRow } from "./types";

function matchesAny(value: string | null, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  if (value === null) return false;
  const needle = value.trim().toLowerCase();
  return wanted.some((w) => w.toLowerCase() === needle);
}

export function matchPlays(
  plays: readonly PlayRow[],
  filter: PlayFilter,
  players: readonly PlayerRow[],
  participation: readonly ParticipationRow[],
): PlayRow[] {
  // A jersey number resolves to player rows first; two players can share one,
  // so a search for "#24" legitimately matches both of their snaps.
  let playIdsWithPlayer: Set<string> | null = null;
  if (filter.jerseyNumbers.length > 0) {
    const wanted = new Set(
      players
        .filter(
          (p) =>
            p.jersey_number !== null && filter.jerseyNumbers.includes(p.jersey_number),
        )
        .map((p) => p.id),
    );
    playIdsWithPlayer = new Set(
      participation
        .filter((row) => wanted.has(row.player_id))
        .map((row) => row.play_id),
    );
  }

  return plays.filter((play) => {
    if (playIdsWithPlayer !== null && !playIdsWithPlayer.has(play.id)) return false;

    if (!matchesAny(play.formation, filter.formations)) return false;
    if (!matchesAny(play.coverage, filter.coverages)) return false;
    if (!matchesAny(play.defensive_front, filter.fronts)) return false;
    if (!matchesAny(play.personnel, filter.personnel)) return false;

    // Pressure is matched as a substring: a coach tags "A-gap blitz" and
    // searching "blitz" should find it.
    if (filter.pressures.length > 0) {
      if (play.pressure === null) return false;
      const haystack = play.pressure.toLowerCase();
      if (!filter.pressures.some((p) => haystack.includes(p.toLowerCase())))
        return false;
    }

    if (!matchesAny(play.concept, filter.concepts)) return false;

    if (filter.family !== undefined) {
      // A play tagged with a concept but no family still answers a run/pass
      // question, because the concept's family is known. Falling back to it is
      // the one inference here, and it is a lookup, not a guess.
      const family =
        play.family ?? (play.concept === null ? null : conceptFamily(play.concept));
      if (family !== filter.family) return false;
    }

    if (filter.direction !== undefined && play.direction !== filter.direction)
      return false;
    if (filter.down !== undefined && play.down !== filter.down) return false;
    if (filter.quarter !== undefined && play.quarter !== filter.quarter) return false;

    if (filter.distanceBucket !== undefined) {
      const bucket = distanceBucket(play.distance ?? undefined);
      if (bucket !== filter.distanceBucket) return false;
    }

    if (filter.explosive === true && !play.explosive) return false;
    if (filter.redZone === true && !play.red_zone) return false;
    if (filter.goalLine === true && !play.goal_line) return false;
    if (filter.turnover === true && !play.turnover) return false;
    if (filter.penalty === true && !play.penalty) return false;
    if (filter.touchdown === true && !play.touchdown) return false;

    return true;
  });
}
