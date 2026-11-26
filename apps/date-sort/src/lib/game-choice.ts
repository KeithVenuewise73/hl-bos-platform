/**
 * What DateSort says when the website already has a game for a date under another name.
 * Pure, so it can be tested.
 */

export interface ChoiceGame {
  readonly name: string;
  readonly sport: string;
  readonly team: string | null;
  readonly photos: number;
  readonly clips: number;
}

const n = (x: number, w: string) =>
  `${x.toLocaleString("en-US")} ${w}${x === 1 ? "" : "s"}`;

/** "850 photos and 6 clips", "6 clips", or "nothing yet". */
export function holds(g: ChoiceGame): string {
  const parts = [
    g.photos > 0 ? n(g.photos, "photo") : "",
    g.clips > 0 ? n(g.clips, "clip") : "",
  ].filter((x) => x !== "");
  return parts.length === 0 ? "nothing yet" : parts.join(" and ");
}

/** One line for an existing game: name, then team and contents. */
export function gameLine(g: ChoiceGame): string {
  return `${g.name}${g.team !== null ? ` (${g.team})` : ""} — ${holds(g)}`;
}

/** The question above the choices. */
export function choiceQuestion(
  day: string,
  typed: string,
  games: readonly ChoiceGame[],
): string {
  return games.length === 1
    ? `The website already has a game on ${day}. Do these join it, or are they a different game called "${typed}"?`
    : `The website already has ${games.length} games on ${day}. Which one do these join, or are they a different game called "${typed}"?`;
}
