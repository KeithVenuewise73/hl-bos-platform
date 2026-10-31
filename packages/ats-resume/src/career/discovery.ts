/**
 * Job discovery: supported sources, ingestion, duplicates, expiry and fit.
 *
 * The adapters and duplicate detection are ported from JobScout
 * (KeithVenuewise73/hl-jobscout, supabase/functions/_shared/adapters.ts and
 * dedupe.ts). JobScout itself is untouched — Keith's personal configuration,
 * seed employers and Buffalo-area geography stay where they are. What moved is
 * the logic that is not personal: reading public employer job-board feeds and
 * recognising the same job posted twice.
 *
 * Coverage is stated, never implied. There is no LinkedIn or Indeed crawler
 * here and the UI must not suggest otherwise: a subscriber adds the employer
 * boards they care about, and anything else comes in through manual import.
 */

import { newId, now } from "../text.ts";
import type { UUID } from "../types.ts";
import type {
  EmployerBoard,
  FitAssessment,
  FitCheck,
  Opportunity,
  SearchCriteria,
  SightingRecord,
  SourceDescriptor,
  SourceId,
} from "./types.ts";

export const SOURCES: readonly SourceDescriptor[] = [
  {
    id: "greenhouse",
    name: "Greenhouse job boards",
    kind: "employer_ats_feed",
    status: "supported",
    coverage:
      "Employers that publish a public Greenhouse board. You add each employer's board name.",
  },
  {
    id: "lever",
    name: "Lever job boards",
    kind: "employer_ats_feed",
    status: "supported",
    coverage:
      "Employers that publish a public Lever board. You add each employer's board name.",
  },
  {
    id: "ashby",
    name: "Ashby job boards",
    kind: "employer_ats_feed",
    status: "supported",
    coverage:
      "Employers that publish a public Ashby board. You add each employer's board name.",
  },
  {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    kind: "employer_ats_feed",
    status: "supported",
    coverage:
      "Employers with a public SmartRecruiters company page. You add each company id.",
  },
  {
    id: "manual",
    name: "Manual import",
    kind: "manual_import",
    status: "manual",
    coverage:
      "Any posting from anywhere — LinkedIn, Indeed, a company site, a referral. Paste the description.",
  },
];

/** Stated plainly on the discovery screen. */
export const COVERAGE_LIMITS: readonly string[] = [
  "LinkedIn and Indeed are not searched. Their terms do not permit automated collection, so postings found there come in through manual import.",
  "Workday, iCIMS, Paylocity, Paycom, UKG, Taleo, SuccessFactors and ADP boards are not ingested yet. JobScout detects several of them; only the four feeds listed above are read automatically.",
  "Distance is not measured. Location is matched by the place names you entered, so commute limits are shown as 'not checked' rather than guessed.",
];

export function sourceLabel(id: SourceId): string {
  return SOURCES.find((s) => s.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Adapters (ported from JobScout)
// ---------------------------------------------------------------------------

export interface RawPosting {
  readonly externalId: string;
  readonly title: string;
  readonly location: string | null;
  readonly url: string | null;
  readonly description: string | null;
  readonly compText: string | null;
  readonly postedAt: string | null;
}

/** Injected HTTP client: GET a URL, return parsed JSON. */
export type FetchJson = (url: string) => Promise<unknown>;

export function stripHtml(s: unknown): string {
  if (s === null || s === undefined || s === "") return "";
  let t = typeof s === "string" ? s : JSON.stringify(s);
  t = t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isoDate(ts: unknown): string | null {
  if (ts === null || ts === undefined || ts === "") return null;
  if (typeof ts === "number") {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof ts !== "string") return null;
  const d = new Date(ts.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;

/** Board tokens are path segments in a fixed host's URL; anything else is refused. */
export const BOARD_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

async function greenhouse(token: string, get: FetchJson): Promise<RawPosting[]> {
  const d = obj(
    await get(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`),
  );
  return arr(d["jobs"]).map((raw) => {
    const j = obj(raw);
    return {
      externalId: str(j["id"]) ?? "",
      title: str(j["title"]) ?? "",
      location: str(obj(j["location"])["name"]),
      url: str(j["absolute_url"]),
      description: stripHtml(j["content"]) || null,
      compText: null,
      postedAt: isoDate(j["first_published"] ?? j["updated_at"]),
    };
  });
}

async function lever(token: string, get: FetchJson): Promise<RawPosting[]> {
  const d = await get(`https://api.lever.co/v0/postings/${token}?mode=json`);
  return arr(d).map((raw) => {
    const j = obj(raw);
    const lists = arr(j["lists"])
      .map((l) => `${stripHtml(obj(l)["text"])}\n${stripHtml(obj(l)["content"])}`)
      .join("\n");
    const body = `${str(j["descriptionPlain"]) ?? str(j["description"]) ?? ""}\n${lists}`;
    const salary = obj(j["salaryRange"]);
    const comp =
      typeof salary["min"] === "number" && typeof salary["max"] === "number"
        ? `${str(salary["currency"]) ?? ""} ${String(salary["min"])}–${String(salary["max"])} ${str(salary["interval"]) ?? ""}`.trim()
        : null;
    return {
      externalId: str(j["id"]) ?? "",
      title: str(j["text"]) ?? "",
      location: str(obj(j["categories"])["location"]),
      url: str(j["hostedUrl"]),
      description: stripHtml(body) || null,
      compText: comp,
      postedAt: isoDate(j["createdAt"]),
    };
  });
}

async function ashby(token: string, get: FetchJson): Promise<RawPosting[]> {
  const d = obj(
    await get(
      `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`,
    ),
  );
  return arr(d["jobs"]).map((raw) => {
    const j = obj(raw);
    return {
      externalId: str(j["id"]) ?? "",
      title: str(j["title"]) ?? "",
      location: str(j["location"]),
      url: str(j["jobUrl"]),
      description: stripHtml(j["descriptionHtml"] ?? j["descriptionPlain"]) || null,
      compText: str(obj(j["compensation"])["compensationTierSummary"]),
      postedAt: isoDate(j["publishedAt"]),
    };
  });
}

async function smartrecruiters(token: string, get: FetchJson): Promise<RawPosting[]> {
  const out: RawPosting[] = [];
  for (let offset = 0; offset < 1000;) {
    const d = obj(
      await get(
        `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&offset=${offset}`,
      ),
    );
    const items = arr(d["content"]);
    for (const raw of items) {
      const j = obj(raw);
      const loc = obj(j["location"]);
      const id = str(j["id"]) ?? "";
      out.push({
        externalId: id,
        title: str(j["name"]) ?? "",
        location:
          [str(loc["city"]), str(loc["region"])].filter(Boolean).join(", ") || null,
        url: `https://jobs.smartrecruiters.com/${token}/${id}`,
        description: null,
        compText: null,
        postedAt: isoDate(j["releasedDate"]),
      });
    }
    offset += items.length;
    const total = typeof d["totalFound"] === "number" ? d["totalFound"] : 0;
    if (items.length < 100 || offset >= total) break;
  }
  return out;
}

export const ADAPTERS: Readonly<
  Record<
    Exclude<SourceId, "manual">,
    (token: string, get: FetchJson) => Promise<RawPosting[]>
  >
> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
};

// ---------------------------------------------------------------------------
// Duplicates (ported from JobScout dedupe.ts)
// ---------------------------------------------------------------------------

export const normTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const normEmployer = (t: string): string =>
  t
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function shingles(text: string, n = 3): Set<string> {
  const w = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const out = new Set<string>();
  if (w.length < n) {
    if (w.length > 0) out.add(w.join(" "));
    return out;
  }
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const s of A) if (B.has(s)) shared++;
  return shared / (A.size + B.size - shared);
}

export const SIMILAR_ENOUGH = 0.6;

/**
 * Same employer, same normalised title, and near-identical descriptions (or
 * one side has none). When in doubt this SPLITS: a wrong split shows a job
 * twice; a wrong merge hides one.
 */
export function sameJob(
  a: { employer: string; title: string; description?: string },
  b: { employer: string; title: string; description?: string },
): boolean {
  if (normEmployer(a.employer) !== normEmployer(b.employer)) return false;
  if (normTitle(a.title) !== normTitle(b.title)) return false;
  const da = a.description ?? "";
  const db = b.description ?? "";
  if (da.length === 0 || db.length === 0) return true;
  return similarity(da, db) >= SIMILAR_ENOUGH;
}

// ---------------------------------------------------------------------------
// Fit: firm requirements versus preferences
// ---------------------------------------------------------------------------

const HOURS_PER: Record<string, number> = {
  hour: 1,
  week: 40,
  month: 173.33,
  year: 2080,
};

/** Parse a disclosed pay range into hourly equivalents. Null when not disclosed. */
export function parseSalary(
  text: string,
): { low: number; high: number; period: string } | null {
  const t = text.replace(/,/g, "");
  const m =
    /\$?\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k)?/i.exec(
      t,
    ) ?? /\$\s*(\d+(?:\.\d+)?)\s*(k)?()()/i.exec(t);
  if (m === null) return null;
  const n = (v: string | undefined, k: string | undefined): number =>
    v === undefined || v === "" ? NaN : Number(v) * (k ? 1000 : 1);
  const low = n(m[1], m[2]);
  const highRaw = n(m[3], m[4] ?? m[2]);
  const high = Number.isNaN(highRaw) ? low : highRaw;
  if (Number.isNaN(low)) return null;
  const period = /\b(hour|hr|hourly)\b/i.test(t)
    ? "hour"
    : /\b(week|weekly)\b/i.test(t)
      ? "week"
      : /\b(month|monthly)\b/i.test(t)
        ? "month"
        : /\b(year|yr|annual|annually|salary)\b/i.test(t) || low >= 1000
          ? "year"
          : "hour";
  return { low, high, period };
}

function hourly(amount: number, period: string): number {
  return amount / (HOURS_PER[period] ?? 1);
}

const ARRANGEMENT_PATTERNS: Record<string, RegExp> = {
  remote:
    /\b(fully remote|remote[- ]first|100% remote|remote position|work from home|remote)\b/i,
  hybrid: /\bhybrid\b/i,
  on_site: /\b(on[- ]?site|in[- ]office|in person|onsite)\b/i,
};

function detectArrangements(text: string): string[] {
  return Object.entries(ARRANGEMENT_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

function detectEmploymentType(text: string): string | null {
  if (/\bpart[- ]time\b/i.test(text)) return "part_time";
  if (/\b(contract|contractor|1099|c2h|contract[- ]to[- ]hire)\b/i.test(text))
    return "contract";
  if (/\b(temporary|temp|seasonal)\b/i.test(text)) return "temporary";
  if (/\bfull[- ]time\b/i.test(text)) return "full_time";
  return null;
}

function detectTravel(text: string): number | null {
  const m =
    /travel[^.%\n]{0,40}?(\d{1,3})\s?%|(\d{1,3})\s?%\s*(?:of the time\s*)?travel/i.exec(
      text,
    );
  if (m === null) return null;
  return Number(m[1] ?? m[2]);
}

function detectShifts(text: string): string[] {
  const found: string[] = [];
  if (/\b(overnight|night shift|3rd shift|third shift|graveyard)\b/i.test(text))
    found.push("no_overnight");
  if (/\b(weekends?|saturday|sunday)\b/i.test(text)) found.push("no_weekends");
  if (/\brotating\b/i.test(text)) found.push("no_rotating");
  if (/\b(2nd shift|second shift|evening shift|night shift|overnight)\b/i.test(text))
    found.push("days_only");
  return found;
}

export interface FitInput {
  readonly title: string;
  readonly location?: string;
  readonly salaryText?: string;
  readonly description: string;
}

/**
 * Assess one opportunity against the subscriber's criteria.
 *
 * The signature takes `SearchCriteria`, which has no employment situation or
 * search activity on it: neither can influence fit, by construction. The
 * qualification score, when present, comes from the optimizer's evidence
 * analysis and is passed in, never computed from personal circumstances.
 */
export function assessFit(
  job: FitInput,
  criteria: SearchCriteria,
  qualification?: {
    score: number;
    strengths: readonly string[];
    gaps: readonly string[];
    uncertain: readonly string[];
  },
): FitAssessment {
  const checks: FitCheck[] = [];
  const text = `${job.title}\n${job.location ?? ""}\n${job.description}`;
  const arrangements = detectArrangements(text);

  // Location / arrangement
  const wantsRemote = criteria.arrangements.value.includes("remote");
  const isRemote =
    arrangements.includes("remote") &&
    !arrangements.includes("on_site") &&
    !arrangements.includes("hybrid");
  const places = criteria.locations.value
    .map((p) => p.toLowerCase().split(",")[0]?.trim() ?? "")
    .filter((p) => p.length > 0);
  const loc = (job.location ?? "").toLowerCase();
  if (isRemote && wantsRemote) {
    checks.push({
      criterion: "Location",
      firm: criteria.locations.firm,
      result: "pass",
      detail: "Remote role, and you accept remote work.",
    });
  } else if (places.length === 0) {
    checks.push({
      criterion: "Location",
      firm: criteria.locations.firm,
      result: "unknown",
      detail: "You have not listed locations.",
    });
  } else if (loc.length === 0) {
    checks.push({
      criterion: "Location",
      firm: criteria.locations.firm,
      result: "unknown",
      detail: "The posting does not state a location.",
    });
  } else if (places.some((p) => loc.includes(p))) {
    checks.push({
      criterion: "Location",
      firm: criteria.locations.firm,
      result: "pass",
      detail: `In ${job.location}.`,
    });
  } else {
    checks.push({
      criterion: "Location",
      firm: criteria.locations.firm && !criteria.willingToRelocate,
      result: "fail",
      detail: criteria.willingToRelocate
        ? `In ${job.location}, outside your listed areas — you said you would consider relocating.`
        : `In ${job.location}, outside your listed areas.`,
    });
  }
  if (criteria.maxCommuteMiles !== undefined) {
    checks.push({
      criterion: "Commute",
      firm: criteria.maxCommuteMiles.firm,
      result: "unknown",
      detail: `Distance is not measured, so your ${criteria.maxCommuteMiles.value}-mile limit was not checked.`,
    });
  }

  // Arrangement
  if (arrangements.length === 0) {
    checks.push({
      criterion: "Work arrangement",
      firm: criteria.arrangements.firm,
      result: "unknown",
      detail: "The posting does not say remote, hybrid or on-site.",
    });
  } else {
    const ok = arrangements.some((a) =>
      (criteria.arrangements.value as readonly string[]).includes(a),
    );
    checks.push({
      criterion: "Work arrangement",
      firm: criteria.arrangements.firm,
      result: ok ? "pass" : "fail",
      detail: `Posting mentions: ${arrangements.join(", ").replace("on_site", "on-site")}.`,
    });
  }

  // Salary
  const salary = criteria.salary;
  if (salary?.minimum !== undefined) {
    const disclosed =
      job.salaryText !== undefined
        ? parseSalary(job.salaryText)
        : parseSalary(job.description.match(/\$[^\n]{0,60}/)?.[0] ?? "");
    if (disclosed === null) {
      checks.push({
        criterion: "Salary",
        firm: salary.firm,
        result: "unknown",
        detail: "Salary not listed.",
      });
    } else {
      const top = hourly(disclosed.high, disclosed.period);
      const min = hourly(salary.minimum, salary.period);
      checks.push({
        criterion: "Salary",
        firm: salary.firm,
        result: top + 0.005 >= min ? "pass" : "fail",
        detail:
          top + 0.005 >= min
            ? "The disclosed range reaches your minimum."
            : "The top of the disclosed range is below your minimum.",
      });
    }
  }

  // Employment type
  const type = detectEmploymentType(text);
  if (type === null) {
    checks.push({
      criterion: "Employment type",
      firm: criteria.employmentTypes.firm,
      result: "unknown",
      detail: "Not stated.",
    });
  } else {
    const ok = (criteria.employmentTypes.value as readonly string[]).includes(type);
    checks.push({
      criterion: "Employment type",
      firm: criteria.employmentTypes.firm,
      result: ok ? "pass" : "fail",
      detail: `Posting reads as ${type.replace("_", "-")}.`,
    });
  }

  // Travel
  if (criteria.maxTravelPercent !== undefined) {
    const travel = detectTravel(text);
    checks.push(
      travel === null
        ? {
            criterion: "Travel",
            firm: criteria.maxTravelPercent.firm,
            result: "unknown",
            detail: "Travel not stated.",
          }
        : {
            criterion: "Travel",
            firm: criteria.maxTravelPercent.firm,
            result: travel <= criteria.maxTravelPercent.value ? "pass" : "fail",
            detail: `Up to ${travel}% travel.`,
          },
    );
  }

  // Shifts
  if (criteria.shiftLimits.value.length > 0) {
    const shifts = detectShifts(text);
    const conflicts = criteria.shiftLimits.value.filter((s) => shifts.includes(s));
    checks.push({
      criterion: "Shift",
      firm: criteria.shiftLimits.firm,
      result: conflicts.length > 0 ? "fail" : shifts.length === 0 ? "unknown" : "pass",
      detail:
        conflicts.length > 0
          ? "The posting mentions shifts you ruled out."
          : shifts.length === 0
            ? "Schedule not stated."
            : "No conflict with your shift limits.",
    });
  }

  // Title relevance — always a preference: the subscriber chose to see it.
  const wanted = [...criteria.targetTitles, ...criteria.relatedTitles].map(normTitle);
  const title = normTitle(job.title);
  const titleHit = wanted.some(
    (w) =>
      w.length > 0 &&
      (title.includes(w) ||
        w
          .split(" ")
          .filter((t) => t.length > 3)
          .every((t) => title.includes(t))),
  );
  checks.push({
    criterion: "Title",
    firm: false,
    result: titleHit ? "pass" : "fail",
    detail: titleHit
      ? "Matches a target or related title."
      : "Not one of your target titles.",
  });

  const blocked = checks.some((c) => c.firm && c.result === "fail");
  const prefs = checks.filter((c) => !c.firm);
  const known = prefs.filter((c) => c.result !== "unknown");
  const preferenceScore =
    known.length === 0
      ? 50
      : Math.round(
          (known.filter((c) => c.result === "pass").length / known.length) * 100,
        );

  const reasons = checks
    .filter((c) => c.result === "pass")
    .map((c) => `${c.criterion}: ${c.detail}`);
  if (qualification !== undefined)
    reasons.push(...qualification.strengths.slice(0, 3).map((s) => `Evidence: ${s}`));
  const gaps = [
    ...checks
      .filter((c) => c.result === "fail")
      .map((c) => `${c.criterion}${c.firm ? " (firm requirement)" : ""}: ${c.detail}`),
    ...(qualification?.gaps ?? []),
  ];
  const uncertain = [
    ...checks
      .filter((c) => c.result === "unknown")
      .map((c) => `${c.criterion}: ${c.detail}`),
    ...(qualification?.uncertain ?? []),
  ];

  const qualScore = qualification?.score;
  const label: FitAssessment["label"] = blocked
    ? "blocked"
    : preferenceScore >= 60 && (qualScore === undefined || qualScore >= 55)
      ? "strong"
      : "possible";

  return {
    label,
    preferenceScore,
    ...(qualScore === undefined ? {} : { qualificationScore: qualScore }),
    checks,
    reasons,
    gaps,
    uncertain,
    assessedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export function newOpportunity(input: {
  readonly profileId: UUID;
  readonly source: SourceId;
  readonly boardId?: UUID;
  readonly externalId?: string;
  readonly employer: string;
  readonly title: string;
  readonly location?: string;
  readonly salaryText?: string;
  readonly url?: string;
  readonly postedAt?: string;
  readonly description: string;
  readonly foundVia?: string;
}): Opportunity {
  const timestamp = now();
  return {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: input.profileId,
    source: input.source,
    ...(input.boardId === undefined ? {} : { boardId: input.boardId }),
    ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
    employer: input.employer.trim(),
    title: input.title.trim(),
    ...(input.location === undefined || input.location.trim() === ""
      ? {}
      : { location: input.location.trim() }),
    ...(input.salaryText === undefined || input.salaryText.trim() === ""
      ? {}
      : { salaryText: input.salaryText.trim() }),
    ...(input.url === undefined || input.url.trim() === ""
      ? {}
      : { url: input.url.trim() }),
    ...(input.postedAt === undefined || input.postedAt === ""
      ? {}
      : { postedAt: input.postedAt }),
    retrievedAt: timestamp,
    descriptionSnapshot: input.description,
    alsoSeen: [],
    stage: "new_match",
    history: [{ stage: "new_match", at: timestamp }],
    passReasons: [],
    foundVia: input.foundVia ?? sourceLabel(input.source),
    draftResumeIds: [],
    draftCoverLetterIds: [],
    outreachDrafts: [],
    contacts: [],
    interviews: [],
    followUps: [],
    notes: "",
  };
}

export type DuplicateOutcome =
  | { readonly kind: "new" }
  | {
      readonly kind: "duplicate";
      readonly of: Opportunity;
      readonly previouslyApplied: boolean;
    };

export function findDuplicate(
  candidate: {
    employer: string;
    title: string;
    description?: string;
    source: SourceId;
    externalId?: string;
  },
  existing: readonly Opportunity[],
): DuplicateOutcome {
  for (const o of existing) {
    const exactSame =
      candidate.externalId !== undefined &&
      o.source === candidate.source &&
      o.externalId === candidate.externalId;
    if (
      exactSame ||
      sameJob(candidate, {
        employer: o.employer,
        title: o.title,
        description: o.descriptionSnapshot,
      })
    ) {
      return {
        kind: "duplicate",
        of: o,
        previouslyApplied: o.submissionId !== undefined,
      };
    }
  }
  return { kind: "new" };
}

/** Would this posting interest the subscriber at all? Title or keyword relevance. */
export function relevant(
  title: string,
  description: string,
  criteria: SearchCriteria,
): boolean {
  const t = normTitle(title);
  const wanted = [...criteria.targetTitles, ...criteria.relatedTitles]
    .map(normTitle)
    .filter((w) => w.length > 0);
  if (
    wanted.some(
      (w) =>
        t.includes(w) ||
        w
          .split(" ")
          .filter((x) => x.length > 3)
          .every((x) => t.includes(x)),
    )
  )
    return true;
  const kws = criteria.keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2);
  if (kws.length === 0) return false;
  const body = `${title} ${description}`.toLowerCase();
  return (
    kws.filter((k) => body.includes(k)).length >= Math.min(2, kws.length) &&
    wanted.some((w) => w.split(" ").some((x) => x.length > 3 && t.includes(x)))
  );
}

export interface BoardRunResult {
  readonly boardId: UUID;
  readonly employer: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly fetched: number;
  readonly relevant: number;
}

export interface DiscoveryResult {
  readonly added: Opportunity[];
  /** Existing opportunities updated with another sighting or an expiry. */
  readonly updated: Opportunity[];
  readonly duplicates: number;
  readonly previouslyApplied: number;
  readonly expired: number;
  readonly boards: readonly BoardRunResult[];
}

/**
 * Run every board once.
 *
 * Expiry is only ever decided from a SUCCESSFUL read: a posting is marked
 * expired when its board answered and the posting was no longer on it. A
 * failed read changes nothing — JobScout's ingest tests exist because a
 * close-stale step that fires on a failed fetch destroys real data.
 */
export async function runDiscovery(input: {
  readonly profileId: UUID;
  readonly boards: readonly EmployerBoard[];
  readonly criteria: SearchCriteria;
  readonly existing: readonly Opportunity[];
  readonly fetchJson: FetchJson;
  readonly maxPerBoard?: number;
}): Promise<DiscoveryResult> {
  const added: Opportunity[] = [];
  const updatedById = new Map<UUID, Opportunity>();
  const results: BoardRunResult[] = [];
  let duplicates = 0;
  let previouslyApplied = 0;
  let expired = 0;
  const current = (): Opportunity[] => [
    ...input.existing.map((o) => updatedById.get(o.id) ?? o),
    ...added,
  ];

  for (const board of input.boards) {
    if (!BOARD_TOKEN_RE.test(board.boardToken)) {
      results.push({
        boardId: board.id,
        employer: board.employer,
        ok: false,
        error: "The board name contains characters that are not allowed.",
        fetched: 0,
        relevant: 0,
      });
      continue;
    }
    let postings: RawPosting[];
    try {
      postings = await ADAPTERS[board.source](board.boardToken, input.fetchJson);
    } catch (error) {
      results.push({
        boardId: board.id,
        employer: board.employer,
        ok: false,
        error: error instanceof Error ? error.message : "The job board did not answer.",
        fetched: 0,
        relevant: 0,
      });
      continue;
    }

    const seenIds = new Set(postings.map((p) => p.externalId));
    let relevantCount = 0;
    for (const p of postings.slice(0, input.maxPerBoard ?? 500)) {
      if (p.externalId === "" || p.title === "") continue;
      if (!relevant(p.title, p.description ?? "", input.criteria)) continue;
      relevantCount++;
      const dup = findDuplicate(
        {
          employer: board.employer,
          title: p.title,
          ...(p.description === null ? {} : { description: p.description }),
          source: board.source,
          externalId: p.externalId,
        },
        current(),
      );
      if (dup.kind === "duplicate") {
        duplicates++;
        if (dup.previouslyApplied) previouslyApplied++;
        const sameSource =
          dup.of.source === board.source && dup.of.externalId === p.externalId;
        if (!sameSource) {
          const sighting: SightingRecord = {
            source: board.source,
            ...(p.url === null ? {} : { url: p.url }),
            ...(p.location === null ? {} : { location: p.location }),
            seenAt: now(),
          };
          const base = updatedById.get(dup.of.id) ?? dup.of;
          if (added.includes(base)) continue;
          updatedById.set(base.id, {
            ...base,
            alsoSeen: [...base.alsoSeen, sighting],
            updatedAt: now(),
          });
        }
        continue;
      }
      const opp = newOpportunity({
        profileId: input.profileId,
        source: board.source,
        boardId: board.id,
        externalId: p.externalId,
        employer: board.employer,
        title: p.title,
        ...(p.location === null ? {} : { location: p.location }),
        ...(p.compText === null ? {} : { salaryText: p.compText }),
        ...(p.url === null ? {} : { url: p.url }),
        ...(p.postedAt === null ? {} : { postedAt: p.postedAt }),
        description: p.description ?? "",
        foundVia: `${board.employer} (${sourceLabel(board.source)})`,
      });
      added.push({
        ...opp,
        fit: assessFit(
          {
            title: opp.title,
            ...(opp.location === undefined ? {} : { location: opp.location }),
            ...(opp.salaryText === undefined ? {} : { salaryText: opp.salaryText }),
            description: opp.descriptionSnapshot,
          },
          input.criteria,
        ),
      });
    }

    for (const o of input.existing) {
      if (
        o.boardId !== board.id ||
        o.externalId === undefined ||
        o.expiredAt !== undefined
      )
        continue;
      if (!seenIds.has(o.externalId)) {
        const base = updatedById.get(o.id) ?? o;
        updatedById.set(o.id, { ...base, expiredAt: now(), updatedAt: now() });
        expired++;
      }
    }
    results.push({
      boardId: board.id,
      employer: board.employer,
      ok: true,
      fetched: postings.length,
      relevant: relevantCount,
    });
  }

  return {
    added,
    updated: [...updatedById.values()],
    duplicates,
    previouslyApplied,
    expired,
    boards: results,
  };
}
