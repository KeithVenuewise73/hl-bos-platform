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

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
