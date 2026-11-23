/**
 * "Show dates from…": limits the date cards (and what Copy all / Send all work on) to recent
 * shooting dates, so years of old pictures on a phone do not get in the way.
 */

export const SINCE_CHOICES = [
  { value: "all", label: "All dates" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last year" },
] as const;

export type SinceChoice = (typeof SINCE_CHOICES)[number]["value"];

export const isSinceChoice = (v: unknown): v is SinceChoice =>
  SINCE_CHOICES.some((c) => c.value === v);

const pad = (n: number) => String(n).padStart(2, "0");

/** The first date (YYYY-MM-DD, this computer's calendar) that is shown; null for all. */
export function sinceCutoff(
  choice: SinceChoice,
  now: Date = new Date(),
): string | null {
  if (choice === "all") return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - Number(choice));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The days on or after the cutoff (a date is YYYY-MM-DD, so plain comparison is right). */
export function filterSince<T extends { day: string }>(
  days: readonly T[],
  cutoff: string | null,
): T[] {
  return cutoff === null ? [...days] : days.filter((d) => d.day >= cutoff);
}
