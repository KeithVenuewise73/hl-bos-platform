/**
 * The name a sent folder gets on the website. The owner can rename it there, so
 * an empty event name must never stop a send: with no name the folder is called
 * after its date ("Photos from November 14, 2026"). Always 1 to 200 characters,
 * which is what the review area requires.
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

export function gameNameFor(name: string, day: string): string {
  const typed = name.trim().slice(0, 200).trim();
  if (typed !== "") return typed;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return month && m
    ? `Photos from ${month} ${Number(m[3])}, ${m[1]}`
    : `Photos from ${day}`.slice(0, 200);
}
