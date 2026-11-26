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
  /** "HH:MM" (24 hours) of the first and last item taken, or null. */
  readonly firstAt?: string | null;
  readonly lastAt?: string | null;
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

/** "2:43 PM" from "14:43"; null when it is not a time. */
function clock(hhmm: string): { text: string; pm: boolean } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return { text: `${h % 12 === 0 ? 12 : h % 12}:${m[2]}`, pm: h >= 12 };
}

/** "2:43 to 3:25 PM", "11:50 AM to 1:10 PM", or "" when the game has no times. */
export function timeSpan(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const a = first ? clock(first) : null;
  const b = last ? clock(last) : null;
  if (!a || !b) return "";
  const mer = (c: { pm: boolean }) => (c.pm ? "PM" : "AM");
  return a.pm === b.pm
    ? `${a.text} to ${b.text} ${mer(b)}`
    : `${a.text} ${mer(a)} to ${b.text} ${mer(b)}`;
}

/** One line for an existing game: name, then team, contents and when it was taken. */
export function gameLine(g: ChoiceGame): string {
  const span = timeSpan(g.firstAt, g.lastAt);
  return `${g.name}${g.team !== null ? ` (${g.team})` : ""} — ${holds(g)}${span === "" ? "" : `, taken ${span}`}`;
}

/** A reminder under the choices: a camera's clock can be set wrong. */
export const CLOCK_HINT =
  "A camera's clock can be set wrong (even 12 hours off), so compare the length of time and the order as well as the hour.";

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
