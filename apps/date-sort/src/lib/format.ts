/**
 * How dates and counts read on screen. Pure string work on the camera's
 * wall-clock text: no Date objects, so no time zone can shift a photo to a
 * different day or hour.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-10-04" (or a full timestamp) -> "October 4, 2026". */
export function longDate(isoDay: string): string {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return `${MONTHS[m - 1] ?? "?"} ${d}, ${y}`;
}

/** "2026-10-04T13:03:00" -> "1:03 PM". */
export function clockTime(takenAt: string): string {
  const h = Number(takenAt.slice(11, 13));
  const m = takenAt.slice(14, 16);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** "2026-10-04T13:03:00" -> "October 4, 2026, 1:03 PM". */
export function dateAndTime(takenAt: string): string {
  return `${longDate(takenAt)}, ${clockTime(takenAt)}`;
}

/**
 * How a number is written on screen, defined once.
 *
 * This is NOT here for speed, and the measurement is worth recording so the
 * next person does not redo it. The hoist was proposed on the belief that
 * `n.toLocaleString("en-US")` builds a fresh Intl.NumberFormat per call. It
 * does not: V8 keeps its own cache behind toLocaleString. On Node 22.22,
 * 50,000 calls:
 *
 *     new Intl.NumberFormat() x50,000   515.2 ms
 *     toLocaleString("en-US") x50,000    16.5 ms
 *     one formatter, .format() x50,000   21.3 ms
 *
 * Constructing really is expensive; toLocaleString was never paying for it,
 * and the hoisted formatter is a shade SLOWER. So the reason to keep this is
 * the ordinary one: eleven call sites each naming "en-US" is one decision
 * written down eleven times, and changing how DateSort shows numbers should
 * be one edit rather than a search. Speed is not a reason, and a comment
 * claiming it was would send someone optimising a thing that is already fast.
 */
const NUMBER = new Intl.NumberFormat("en-US");

/** 1487 -> "1,487". Identical to toLocaleString("en-US"); see the test. */
export function number(n: number): string {
  return NUMBER.format(n);
}

export function count(n: number, one: string, many = `${one}s`): string {
  return `${number(n)} ${n === 1 ? one : many}`;
}
