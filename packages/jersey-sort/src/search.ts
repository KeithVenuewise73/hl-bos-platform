/**
 * Global search: turn what a parent types into something a database can run.
 *
 *   "24" / "#24"          -> jersey number 24
 *   "Dominic Herman"      -> text: matches player names (and everything else)
 *   "October 3", "Oct 3"  -> a calendar day, any year unless one is given
 *   "10/3/2026", ISO      -> that exact day
 *   "West Seneca"         -> text: event, team, opponent, location
 *   "Football"            -> text: sport
 *
 * Every piece must match (AND), because that is what a person narrowing a
 * search means by typing more words. A bare one- or two-digit token is read
 * as a jersey number, except straight after a month name, where it is a day.
 */

import { normalizeJerseyNumber } from "./numbers.ts";

export interface DateFilter {
  readonly month: number; // 1..12
  readonly day: number | null; // null = whole month
  readonly year: number | null;
}

export interface ParsedSearch {
  readonly numbers: string[];
  readonly dates: DateFilter[];
  /** Lower-cased words, each of which must match some field. */
  readonly terms: string[];
}

const MONTHS: ReadonlyArray<readonly string[]> = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

function monthIndex(token: string): number | null {
  const t = token.toLowerCase().replace(/\.$/, "");
  const i = MONTHS.findIndex((names) => names.includes(t));
  return i === -1 ? null : i + 1;
}

const MAX_TOKENS = 12;

export function parseSearch(input: string): ParsedSearch {
  const tokens = input
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_TOKENS);

  const numbers: string[] = [];
  const dates: DateFilter[] = [];
  const terms: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";

    const month = monthIndex(token);
    if (month !== null) {
      const next = tokens[i + 1];
      const day =
        next !== undefined && /^\d{1,2}(st|nd|rd|th)?$/i.test(next)
          ? parseInt(next, 10)
          : null;
      if (day !== null && day >= 1 && day <= 31) {
        i += 1;
        const maybeYear = tokens[i + 1];
        let year: number | null = null;
        if (maybeYear !== undefined && /^\d{4}$/.test(maybeYear)) {
          year = Number(maybeYear);
          i += 1;
        }
        dates.push({ month, day, year });
      } else {
        const maybeYear = tokens[i + 1];
        let year: number | null = null;
        if (maybeYear !== undefined && /^\d{4}$/.test(maybeYear)) {
          year = Number(maybeYear);
          i += 1;
        }
        dates.push({ month, day: null, year });
      }
      continue;
    }

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token);
    if (iso !== null) {
      const parsed = validDate(Number(iso[2]), Number(iso[3]), Number(iso[1]));
      if (parsed !== null) {
        dates.push(parsed);
        continue;
      }
    }
    const us = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
    if (us !== null) {
      const yearText = us[3];
      const year =
        yearText === undefined
          ? null
          : yearText.length === 2
            ? 2000 + Number(yearText)
            : Number(yearText);
      const parsed = validDate(Number(us[1]), Number(us[2]), year);
      if (parsed !== null) {
        dates.push(parsed);
        continue;
      }
    }

    if (/^#?\d{1,2}$/.test(token)) {
      const value = normalizeJerseyNumber(token);
      if (value !== null) {
        if (!numbers.includes(value)) numbers.push(value);
        continue;
      }
    }

    const word = token.toLowerCase().replace(/^#/, "");
    if (word.length > 0 && !terms.includes(word)) terms.push(word);
  }

  return { numbers, dates, terms };
}

function validDate(month: number, day: number, year: number | null): DateFilter | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day, year };
}

export function isEmptySearch(s: ParsedSearch): boolean {
  return s.numbers.length === 0 && s.dates.length === 0 && s.terms.length === 0;
}

/** Does a calendar day (YYYY-MM-DD) satisfy a date filter? */
export function dateMatches(isoDay: string, filter: DateFilter): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  if (m === null) return false;
  if (Number(m[2]) !== filter.month) return false;
  if (filter.day !== null && Number(m[3]) !== filter.day) return false;
  if (filter.year !== null && Number(m[1]) !== filter.year) return false;
  return true;
}
