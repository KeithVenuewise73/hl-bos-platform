// Pasted-list and CSV import: the scanner works with no Google key at all.
//
// Accepted shapes:
//   1. CSV (or tab-separated) with a header row naming the columns, e.g.
//        name,website,phone,address,email,rating,reviews
//   2. One business per line, fields separated by "|" or a tab:
//        Acme Roofing | acmeroofing.com | (716) 555-0100 | 12 Main St, West Seneca
//   3. One business per line, free text: the website and phone are picked out
//      and the rest is the name.
//
// Write "none" as the website to record that the business has no website.
// Leave it blank if you do not know -- that is recorded as "not checked".

import type { Candidate } from "./types.ts";

export const MAX_IMPORT_ROWS = 200;

export interface ImportResult {
  candidates: Candidate[];
  /** Lines that could not be read, with the reason, for the reviewer. */
  skipped: { line: number; text: string; reason: string }[];
}

/** RFC 4180-style CSV/TSV line splitter (quotes, doubled quotes). */
export function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur.trim() === "") {
      quoted = true;
      cur = "";
    } else if (c === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  business: "name",
  "business name": "name",
  company: "name",
  website: "website",
  url: "website",
  site: "website",
  "web site": "website",
  phone: "phone",
  telephone: "phone",
  "phone number": "phone",
  address: "address",
  location: "address",
  email: "email",
  "e-mail": "email",
  rating: "rating",
  "google rating": "rating",
  reviews: "reviews",
  "review count": "reviews",
  "google reviews": "reviews",
};

const URL_RE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s|,]*)?/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

const blank = (s: string | undefined) => (s && s.trim() !== "" ? s.trim() : undefined);

function numberOrUndefined(s: string | undefined): number | undefined {
  const t = blank(s);
  if (t === undefined) return undefined;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function candidate(fields: {
  name: string;
  website?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  email?: string | undefined;
  rating?: string | undefined;
  reviews?: string | undefined;
}): Candidate {
  const rating = numberOrUndefined(fields.rating);
  return {
    source: "import",
    name: fields.name.trim(),
    website: blank(fields.website),
    phone: blank(fields.phone),
    address: blank(fields.address),
    email: blank(fields.email),
    place: undefined,
    importedRating: rating !== undefined && rating <= 5 ? rating : undefined,
    importedReviewCount: numberOrUndefined(fields.reviews),
  };
}

/** Parse pasted text into candidates. Never throws; unreadable lines are reported. */
export function parseImport(text: string): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, text: l.trim() }))
    .filter((l) => l.text !== "" && !l.text.startsWith("#"));
  const skipped: ImportResult["skipped"] = [];
  const candidates: Candidate[] = [];
  if (lines.length === 0) return { candidates, skipped };

  const first = lines[0]!.text;
  const delim = first.includes("\t") ? "\t" : first.includes("|") ? "|" : ",";
  const headerCells = splitDelimited(first, delim).map((h) => h.toLowerCase());
  const mapped = headerCells.map((h) => HEADER_ALIASES[h]);
  const hasHeader = mapped.includes("name") && mapped.filter(Boolean).length >= 2;

  const rows = hasHeader ? lines.slice(1) : lines;
  for (const row of rows) {
    if (candidates.length >= MAX_IMPORT_ROWS) {
      skipped.push({
        line: row.n,
        text: row.text,
        reason: `limit of ${MAX_IMPORT_ROWS} businesses per import`,
      });
      continue;
    }
    if (hasHeader) {
      const cells = splitDelimited(row.text, delim);
      const get = (k: string) => {
        const i = mapped.indexOf(k);
        return i === -1 ? undefined : cells[i];
      };
      const name = blank(get("name"));
      if (!name) {
        skipped.push({ line: row.n, text: row.text, reason: "no business name" });
        continue;
      }
      candidates.push(
        candidate({
          name,
          website: get("website"),
          phone: get("phone"),
          address: get("address"),
          email: get("email"),
          rating: get("rating"),
          reviews: get("reviews"),
        }),
      );
      continue;
    }

    // No header: "|" / tab separated, or free text.
    const sep = row.text.includes("|") ? "|" : row.text.includes("\t") ? "\t" : null;
    if (sep) {
      const cells = row.text.split(sep).map((c) => c.trim());
      const name = blank(cells[0]);
      if (!name) {
        skipped.push({ line: row.n, text: row.text, reason: "no business name" });
        continue;
      }
      const rest = cells.slice(1);
      const pick = (re: RegExp) => rest.find((c) => re.test(c));
      const website = rest.find((c) => /^none$/i.test(c)) ?? pick(URL_RE);
      const phone = pick(PHONE_RE);
      const email = pick(EMAIL_RE);
      const address = rest.find(
        (c) =>
          c !== website &&
          c !== phone &&
          c !== email &&
          /\d/.test(c) &&
          /[a-z]/i.test(c),
      );
      candidates.push(candidate({ name, website, phone, email, address }));
      continue;
    }

    let rest = row.text;
    const email = rest.match(EMAIL_RE)?.[0];
    if (email) rest = rest.replace(email, " ");
    const website = rest.match(URL_RE)?.[0];
    if (website) rest = rest.replace(website, " ");
    const phone = rest.match(PHONE_RE)?.[0];
    if (phone) rest = rest.replace(phone, " ");
    const name = rest
      .replace(/[\s,;-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      skipped.push({ line: row.n, text: row.text, reason: "no business name" });
      continue;
    }
    candidates.push(candidate({ name, website, phone, email }));
  }
  return { candidates, skipped };
}
