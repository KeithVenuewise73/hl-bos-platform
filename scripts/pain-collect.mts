/**
 * Collect real public pain evidence from GitHub issues.
 *
 * Runs the phrasings defined in packages/venture-studio/src/pain.ts against
 * the GitHub issue-search API, assigns each result to a theme with the same
 * deterministic rule the tests cover, and stages the result.
 *
 * SEARCH RESULTS ARE NOT EVIDENCE UNTIL VERIFIED. GitHub's issue search does
 * not honour quoted phrases strictly: searching "why isn't there an app"
 * returns issues that merely share words with it. A first pass produced
 * signals like "Feature Request h264" and "Crash on startup" filed as people
 * asking for something that does not exist. Clusters built on that would be
 * evidence in name only.
 *
 * So every result is re-checked locally against the FULL issue body, and only
 * issues that genuinely contain the phrasing are staged. The number rejected
 * is recorded per phrasing — a search that returns 1,100 results of which 40
 * actually say the thing is a fact worth keeping, not an embarrassment to hide.
 *
 * NOTHING IS INVENTED HERE. Every field written comes from the API response:
 * the title, an excerpt of the body, the public URL, the reaction and comment
 * counts, the labels, the state and the creation date. There is no summary, no
 * paraphrase and no estimate of how many people are affected.
 *
 * WHY A CAP. The brief is explicit: do not store thousands of individual
 * complaints as thousands of executive opportunities. Clusters are the
 * deliverable; signals are their evidence. So each phrasing keeps its most
 * ENGAGED results — an issue others reacted to and replied to represents more
 * people than one nobody answered — and the cap and the ordering rule are
 * both recorded in the output so the selection is inspectable.
 *
 * Usage: tsx scripts/pain-collect.mts [--per-phrase 60] [--pages 3]
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import {
  PAIN_ENGINE_VERSION,
  PAIN_PHRASES,
  PAIN_SOURCE_GITHUB_ISSUE,
  assignTheme,
  engagementWeight,
  painSearchQuery,
} from "../packages/venture-studio/src/pain.ts";

const OUT_DIR = process.env["HLVS_PAIN_DIR"] ?? "/tmp/hlvs-pain";
const STAGING = `${OUT_DIR}/signals.ndjson`;
const PROGRESS = `${OUT_DIR}/progress.json`;

const argNum = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const PER_PHRASE = argNum("--per-phrase", 60);
const PAGES = argNum("--pages", 3);
const RESUME = process.argv.includes("--resume");

interface GhIssue {
  id: number;
  html_url: string;
  title: string;
  body: string | null;
  comments: number;
  state: string;
  created_at: string;
  labels: { name?: string }[];
  reactions?: { total_count?: number };
  pull_request?: unknown;
}

mkdirSync(OUT_DIR, { recursive: true });

interface Progress {
  engineVersion: string;
  perPhrase: number;
  selection: string;
  phrases: Record<
    string,
    {
      query: string;
      total: number | null;
      returned: number;
      rejectedAsNotContainingPhrase: number;
      kept: number;
      errors: number;
    }
  >;
}
const progress: Progress =
  RESUME && existsSync(PROGRESS)
    ? (JSON.parse(readFileSync(PROGRESS, "utf8")) as Progress)
    : {
        engineVersion: PAIN_ENGINE_VERSION,
        perPhrase: PER_PHRASE,
        selection: `Search results verified to actually contain the phrasing, then up to ${PER_PHRASE} per phrasing ordered by engagement (reactions + 2x comments), from the first ${PAGES} pages.`,
        phrases: {},
      };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Issue search shares the 30 requests/minute search budget. */
const PACE_MS = 2100;

async function fetchPage(
  query: string,
  page: number,
): Promise<{ total: number; items: GhIssue[] } | null> {
  const url =
    `https://api.github.com/search/issues?q=${encodeURIComponent(query)}` +
    `&per_page=100&page=${page}&sort=reactions&order=desc`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/vnd.github+json" },
      });
      if (res.ok) {
        const body = (await res.json()) as { total_count: number; items: GhIssue[] };
        return { total: body.total_count ?? 0, items: body.items ?? [] };
      }
      if (res.status === 403 || res.status === 429) {
        await sleep(30_000 * (attempt + 1));
        continue;
      }
      return null;
    } catch {
      await sleep(5_000 * (attempt + 1));
    }
  }
  return null;
}

/** An excerpt, not a copy: enough to judge relevance, with the URL for the rest. */
const excerpt = (body: string | null): string =>
  (body ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * Normalize for phrase comparison: fold case, collapse whitespace, and treat
 * curly apostrophes as straight ones. "Why isn’t there an app" and
 * "why isn't there an app" are the same person saying the same thing.
 */
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u00b4`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Machine-generated issues are not people asking for something.
 *
 * A scheduled "Seed audit — 2026-08" job can contain a pain phrasing verbatim
 * because it links a topic list, and counting it as public demand would
 * overstate the evidence. This is a narrow, stated rule rather than a
 * judgement call: the issue itself has to announce that it was generated.
 */
const GENERATED =
  /auto-generated|automatically generated|automated (monthly|weekly|daily)|this issue was (created|opened) by/i;

const looksMachineGenerated = (issue: GhIssue): boolean =>
  GENERATED.test(`${issue.title ?? ""} ${issue.body ?? ""}`);

/** Does this issue actually contain the phrasing, or did search just guess? */
function containsPhrase(issue: GhIssue, phrase: string): boolean {
  const hay = normalize(`${issue.title ?? ""} ${issue.body ?? ""}`);
  return hay.includes(normalize(phrase));
}

for (const phrase of PAIN_PHRASES) {
  if (RESUME && progress.phrases[phrase.id]) continue;
  const query = painSearchQuery(phrase);
  const collected: GhIssue[] = [];
  let total: number | null = null;
  let errors = 0;

  for (let page = 1; page <= PAGES; page++) {
    const res = await fetchPage(query, page);
    await sleep(PACE_MS);
    if (!res) {
      errors++;
      break;
    }
    if (page === 1) total = res.total;
    // The search endpoint returns pull requests too; a PR is a proposed fix,
    // not somebody asking for something that does not exist.
    const issues = res.items.filter((i) => !i.pull_request);
    collected.push(...issues);
    if (res.items.length < 100) break;
  }

  // The verification pass. Everything search returned is checked against the
  // full body; only genuine matches survive.
  const verified = collected.filter(
    (i) => containsPhrase(i, phrase.phrase) && !looksMachineGenerated(i),
  );
  const rejected = collected.length - verified.length;

  const kept = verified
    .sort(
      (a, b) =>
        engagementWeight(b.reactions?.total_count ?? 0, b.comments) -
        engagementWeight(a.reactions?.total_count ?? 0, a.comments),
    )
    .slice(0, PER_PHRASE);

  const lines = kept.map((i) => {
    const labels = (i.labels ?? []).map((l) => l.name ?? "").filter(Boolean);
    const body = excerpt(i.body);
    // Assign the theme from the FULL issue text, not from the stored excerpt.
    // The excerpt exists so the database holds a readable snippet rather than a
    // copy of somebody's post; truncating before clustering would mean the
    // analysis only ever saw the first 300 characters of the evidence.
    const theme = assignTheme({
      title: i.title ?? "",
      bodyExcerpt: (i.body ?? "").replace(/\s+/g, " ").trim(),
      labels,
    });
    return JSON.stringify({
      source: PAIN_SOURCE_GITHUB_ISSUE,
      source_url: i.html_url,
      external_id: String(i.id),
      title: (i.title ?? "").slice(0, 300),
      body_excerpt: body,
      labels,
      reactions: i.reactions?.total_count ?? 0,
      comments: i.comments ?? 0,
      state: i.state ?? null,
      created_at_source: i.created_at ?? null,
      matched_phrases: [phrase.phrase],
      theme: theme.theme,
      theme_keywords: theme.matchedKeywords,
      theme_basis: theme.basis,
    });
  });
  if (lines.length) appendFileSync(STAGING, lines.join("\n") + "\n");

  progress.phrases[phrase.id] = {
    query,
    total,
    returned: collected.length,
    rejectedAsNotContainingPhrase: rejected,
    kept: kept.length,
    errors,
  };
  writeFileSync(PROGRESS, JSON.stringify(progress, null, 1));
  console.log(
    `${phrase.id}: search=${total ?? "?"} returned=${collected.length} verified=${verified.length} kept=${kept.length}`,
  );
}

console.log("=== PAIN COLLECTION COMPLETE ===");
console.log(
  JSON.stringify(
    {
      phrases: Object.keys(progress.phrases).length,
      returned: Object.values(progress.phrases).reduce((a, p) => a + p.returned, 0),
      rejectedAsNotContainingPhrase: Object.values(progress.phrases).reduce(
        (a, p) => a + p.rejectedAsNotContainingPhrase,
        0,
      ),
      kept: Object.values(progress.phrases).reduce((a, p) => a + p.kept, 0),
      staging: STAGING,
    },
    null,
    1,
  ),
);
