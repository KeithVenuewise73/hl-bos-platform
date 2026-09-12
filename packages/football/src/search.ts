/**
 * Film search query parsing.
 *
 * Turns what a coach types -- "third and long", "#24 tackles", "explosive
 * runs vs Trips Right" -- into a structured filter over confirmed play data.
 *
 * This is NOT natural-language understanding and does not pretend to be. It is
 * a deterministic term matcher over the football vocabulary, and its most
 * important output is `unrecognized`: the words it could not place. The search
 * UI shows those back to the coach, so a query that quietly matched half of
 * what they asked for cannot look like a query that matched all of it.
 */

import {
  COVERAGES,
  DEFENSIVE_FRONTS,
  FORMATIONS,
  PASS_CONCEPTS,
  PERSONNEL_PACKAGES,
  PRESSURES,
  RUN_CONCEPTS,
} from "./vocabulary";
import type { FieldDirection, PlayFamily } from "./types";

export interface PlayFilter {
  readonly jerseyNumbers: readonly number[];
  readonly formations: readonly string[];
  readonly concepts: readonly string[];
  readonly coverages: readonly string[];
  readonly fronts: readonly string[];
  readonly pressures: readonly string[];
  readonly personnel: readonly string[];
  readonly family?: PlayFamily | undefined;
  readonly direction?: FieldDirection | undefined;
  readonly down?: number | undefined;
  readonly distanceBucket?: "short" | "medium" | "long" | undefined;
  readonly quarter?: number | undefined;
  readonly explosive?: boolean | undefined;
  readonly redZone?: boolean | undefined;
  readonly goalLine?: boolean | undefined;
  readonly turnover?: boolean | undefined;
  readonly penalty?: boolean | undefined;
  readonly touchdown?: boolean | undefined;
  /** Words we could not place. Shown to the coach, never silently dropped. */
  readonly unrecognized: readonly string[];
  /** True when nothing at all was understood. */
  readonly empty: boolean;
}

/** Phrases that map to a flag, longest first so "third and long" wins over "third". */
const PHRASES: readonly { phrase: string; apply: (f: Mutable) => void }[] = [
  {
    phrase: "third and long",
    apply: (f) => {
      f.down = 3;
      f.distanceBucket = "long";
    },
  },
  {
    phrase: "3rd and long",
    apply: (f) => {
      f.down = 3;
      f.distanceBucket = "long";
    },
  },
  {
    phrase: "third and short",
    apply: (f) => {
      f.down = 3;
      f.distanceBucket = "short";
    },
  },
  {
    phrase: "3rd and short",
    apply: (f) => {
      f.down = 3;
      f.distanceBucket = "short";
    },
  },
  {
    phrase: "third down",
    apply: (f) => {
      f.down = 3;
    },
  },
  {
    phrase: "3rd down",
    apply: (f) => {
      f.down = 3;
    },
  },
  {
    phrase: "fourth down",
    apply: (f) => {
      f.down = 4;
    },
  },
  {
    phrase: "4th down",
    apply: (f) => {
      f.down = 4;
    },
  },
  {
    phrase: "first down",
    apply: (f) => {
      f.down = 1;
    },
  },
  {
    phrase: "1st down",
    apply: (f) => {
      f.down = 1;
    },
  },
  {
    phrase: "red zone",
    apply: (f) => {
      f.redZone = true;
    },
  },
  {
    phrase: "redzone",
    apply: (f) => {
      f.redZone = true;
    },
  },
  {
    phrase: "goal line",
    apply: (f) => {
      f.goalLine = true;
    },
  },
  {
    phrase: "explosive runs",
    apply: (f) => {
      f.explosive = true;
      f.family = "run";
    },
  },
  {
    phrase: "explosive passes",
    apply: (f) => {
      f.explosive = true;
      f.family = "pass";
    },
  },
  {
    phrase: "explosive plays",
    apply: (f) => {
      f.explosive = true;
    },
  },
  {
    phrase: "explosive",
    apply: (f) => {
      f.explosive = true;
    },
  },
  {
    phrase: "turnovers",
    apply: (f) => {
      f.turnover = true;
    },
  },
  {
    phrase: "turnover",
    apply: (f) => {
      f.turnover = true;
    },
  },
  {
    phrase: "touchdowns",
    apply: (f) => {
      f.touchdown = true;
    },
  },
  {
    phrase: "touchdown",
    apply: (f) => {
      f.touchdown = true;
    },
  },
  {
    phrase: "penalties",
    apply: (f) => {
      f.penalty = true;
    },
  },
  {
    phrase: "penalty",
    apply: (f) => {
      f.penalty = true;
    },
  },
  {
    phrase: "qb pressures",
    apply: (f) => {
      f.pressures.push("Blitz");
    },
  },
  {
    phrase: "pressures",
    apply: (f) => {
      f.pressures.push("Blitz");
    },
  },
  {
    phrase: "blitz",
    apply: (f) => {
      f.pressures.push("Blitz");
    },
  },
  {
    phrase: "runs",
    apply: (f) => {
      f.family = "run";
    },
  },
  {
    phrase: "run",
    apply: (f) => {
      f.family = "run";
    },
  },
  {
    phrase: "passes",
    apply: (f) => {
      f.family = "pass";
    },
  },
  {
    phrase: "pass",
    apply: (f) => {
      f.family = "pass";
    },
  },
  {
    phrase: "left",
    apply: (f) => {
      f.direction = "left";
    },
  },
  {
    phrase: "right",
    apply: (f) => {
      f.direction = "right";
    },
  },
  {
    phrase: "middle",
    apply: (f) => {
      f.direction = "middle";
    },
  },
];

/** Vocabulary lists, each mapped to the filter bucket it fills. */
const VOCAB: readonly { list: readonly string[]; key: VocabKey }[] = [
  { list: FORMATIONS, key: "formations" },
  { list: RUN_CONCEPTS, key: "concepts" },
  { list: PASS_CONCEPTS, key: "concepts" },
  { list: COVERAGES, key: "coverages" },
  { list: DEFENSIVE_FRONTS, key: "fronts" },
  { list: PRESSURES, key: "pressures" },
];

type VocabKey = "formations" | "concepts" | "coverages" | "fronts" | "pressures";

interface Mutable {
  jerseyNumbers: number[];
  formations: string[];
  concepts: string[];
  coverages: string[];
  fronts: string[];
  pressures: string[];
  personnel: string[];
  family?: PlayFamily | undefined;
  direction?: FieldDirection | undefined;
  down?: number | undefined;
  distanceBucket?: "short" | "medium" | "long" | undefined;
  quarter?: number | undefined;
  explosive?: boolean | undefined;
  redZone?: boolean | undefined;
  goalLine?: boolean | undefined;
  turnover?: boolean | undefined;
  penalty?: boolean | undefined;
  touchdown?: boolean | undefined;
  unrecognized: string[];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Parse a search query into a play filter.
 *
 * Matching is greedy and longest-first, and each matched span is removed from
 * the remaining text so a phrase cannot be counted twice. Whatever is left
 * over, minus filler words, is reported as unrecognized.
 */
export function parseFilmQuery(query: string): PlayFilter {
  const filter: Mutable = {
    jerseyNumbers: [],
    formations: [],
    concepts: [],
    coverages: [],
    fronts: [],
    pressures: [],
    personnel: [],
    unrecognized: [],
  };

  let text = ` ${query
    .toLowerCase()
    .replace(/[^a-z0-9#\-\s]/g, " ")
    .replace(/\s+/g, " ")} `;

  // Jersey numbers: "#24", or "number 24".
  for (const match of [...text.matchAll(/#(\d{1,2})\b/g)]) {
    filter.jerseyNumbers.push(Number(match[1]));
  }
  text = text.replace(/#\d{1,2}\b/g, " ");
  for (const match of [...text.matchAll(/\bnumber (\d{1,2})\b/g)]) {
    filter.jerseyNumbers.push(Number(match[1]));
  }
  text = text.replace(/\bnumber \d{1,2}\b/g, " ");

  // Personnel groupings are bare two-digit tokens ("11 personnel", or just
  // "11"). Matched before the vocabulary so "11" is never mistaken for a
  // jersey number, which is why jersey numbers require "#" or "number".
  for (const match of [...text.matchAll(/\b(\d{2}) personnel\b/g)]) {
    const value = match[1];
    if (
      value !== undefined &&
      (PERSONNEL_PACKAGES as readonly string[]).includes(value)
    ) {
      filter.personnel.push(value);
    }
  }
  text = text.replace(/\b\d{2} personnel\b/g, " ");

  // Quarter.
  const quarterMatch = /\b(?:q([1-4])|([1-4])(?:st|nd|rd|th) quarter)\b/.exec(text);
  if (quarterMatch) {
    filter.quarter = Number(quarterMatch[1] ?? quarterMatch[2]);
    text = text.replace(quarterMatch[0], " ");
  }

  // ONE longest-match-first pass over the vocabulary AND the situational
  // phrases together.
  //
  // Two passes would be wrong in both orders, and each way was a real bug:
  // vocabulary-first let the coverage "Zone" swallow the "zone" in "red zone",
  // and phrases-first let the direction "right" swallow the "right" in "Trips
  // Right". Sorting every pattern by length and consuming the longest match
  // available is the only ordering where both stay intact.
  const patterns: { text: string; apply: (f: Mutable) => void }[] = [
    ...VOCAB.flatMap(({ list, key }) =>
      list.map((term) => ({
        text: term.toLowerCase(),
        apply: (f: Mutable) => {
          f[key].push(term);
        },
      })),
    ),
    ...PHRASES.map(({ phrase, apply }) => ({ text: phrase, apply })),
  ].sort((a, b) => b.text.length - a.text.length);

  for (const pattern of patterns) {
    const needle = ` ${pattern.text} `;
    if (!text.includes(needle)) continue;
    pattern.apply(filter);
    // Consume EVERY occurrence. `replaceAll` on a space-padded needle misses
    // adjacent repeats because they share the separating space, so loop until
    // the text stops containing it. The text strictly shrinks, so this ends.
    while (text.includes(needle)) text = text.replace(needle, " ");
  }

  const FILLER = new Set([
    "show",
    "me",
    "all",
    "every",
    "the",
    "our",
    "us",
    "we",
    "a",
    "an",
    "of",
    "on",
    "in",
    "at",
    "to",
    "vs",
    "versus",
    "against",
    "from",
    "and",
    "or",
    "for",
    "with",
    "play",
    "plays",
    "snap",
    "snaps",
    "film",
    "clip",
    "clips",
    "where",
    "when",
    "what",
    "how",
    "did",
    "do",
    "does",
    "find",
    "best",
  ]);
  filter.unrecognized = unique(
    text
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && !FILLER.has(w)),
  );

  const understood =
    filter.jerseyNumbers.length > 0 ||
    filter.formations.length > 0 ||
    filter.concepts.length > 0 ||
    filter.coverages.length > 0 ||
    filter.fronts.length > 0 ||
    filter.pressures.length > 0 ||
    filter.personnel.length > 0 ||
    filter.family !== undefined ||
    filter.direction !== undefined ||
    filter.down !== undefined ||
    filter.distanceBucket !== undefined ||
    filter.quarter !== undefined ||
    filter.explosive !== undefined ||
    filter.redZone !== undefined ||
    filter.goalLine !== undefined ||
    filter.turnover !== undefined ||
    filter.penalty !== undefined ||
    filter.touchdown !== undefined;

  return {
    ...filter,
    jerseyNumbers: unique(filter.jerseyNumbers),
    formations: unique(filter.formations),
    concepts: unique(filter.concepts),
    coverages: unique(filter.coverages),
    fronts: unique(filter.fronts),
    pressures: unique(filter.pressures),
    personnel: unique(filter.personnel),
    empty: !understood,
  };
}

/** Plain-English echo of what the search actually did, for the results header. */
export function describeFilter(filter: PlayFilter): string {
  if (filter.empty) return "No football terms recognised in that search.";
  const parts: string[] = [];
  if (filter.jerseyNumbers.length) parts.push(`#${filter.jerseyNumbers.join(", #")}`);
  if (filter.family) parts.push(filter.family === "run" ? "runs" : "passes");
  if (filter.explosive) parts.push("explosive");
  if (filter.formations.length) parts.push(filter.formations.join(" / "));
  if (filter.personnel.length) parts.push(`${filter.personnel.join(" / ")} personnel`);
  if (filter.concepts.length) parts.push(filter.concepts.join(" / "));
  if (filter.coverages.length) parts.push(`vs ${filter.coverages.join(" / ")}`);
  if (filter.fronts.length) parts.push(`vs ${filter.fronts.join(" / ")}`);
  if (filter.pressures.length) parts.push(filter.pressures.join(" / "));
  if (filter.down !== undefined) {
    const ordinal = ["", "1st", "2nd", "3rd", "4th"][filter.down] ?? `${filter.down}`;
    parts.push(
      filter.distanceBucket
        ? `${ordinal} & ${filter.distanceBucket}`
        : `${ordinal} down`,
    );
  }
  if (filter.redZone) parts.push("red zone");
  if (filter.goalLine) parts.push("goal line");
  if (filter.turnover) parts.push("turnovers");
  if (filter.touchdown) parts.push("touchdowns");
  if (filter.penalty) parts.push("penalties");
  if (filter.quarter !== undefined) parts.push(`Q${filter.quarter}`);
  if (filter.direction) parts.push(filter.direction);
  return parts.join(", ");
}
