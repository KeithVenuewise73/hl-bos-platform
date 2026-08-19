/**
 * HLVS discovery runner — GitHub.
 *
 * Executes the source-controlled matrix in
 * packages/venture-studio/src/discovery-matrix.ts. It does NOT define any
 * search of its own: categories, patterns, thresholds, pagination and the
 * dedupe key all come from that file, so a run is reproducible.
 *
 * DURABILITY. The container this runs in is ephemeral, so nothing is held
 * until the end:
 *   * every page is appended to an NDJSON staging file as soon as it arrives
 *   * per-query state is rewritten after every query
 * A run that dies mid-flight leaves both on disk, and `--resume` skips the
 * queries already marked complete. Re-running a query is harmless anyway: the
 * database enforces dedupe on lower(repository_url), so a repeat inserts
 * nothing new.
 *
 * It NEVER filters, scores or ranks. Every repository GitHub returns is staged
 * exactly as received.
 *
 * Usage:  tsx scripts/discovery-run.mts [--resume] [--limit N]
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  DISCOVERY_QUERIES,
  DISCOVERY_SOURCE,
  PAGINATION,
  MATRIX_VERSION,
} from "../packages/venture-studio/src/discovery-matrix.ts";

const OUT_DIR = process.env["HLVS_RUN_DIR"] ?? "/tmp/hlvs-discovery";
const STAGING = `${OUT_DIR}/results.ndjson`;
const PROGRESS = `${OUT_DIR}/progress.json`;

const RESUME = process.argv.includes("--resume");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

interface QueryState {
  id: string;
  query: string;
  status: "pending" | "complete" | "failed";
  totalCount: number | null;
  pagesFetched: number;
  resultsRetrieved: number;
  hardLimited: boolean;
  errors: number;
  lastError?: string;
}

interface Progress {
  matrixVersion: string;
  startedAt: string;
  updatedAt: string;
  queries: Record<string, QueryState>;
  totals: {
    queriesTotal: number;
    queriesComplete: number;
    queriesFailed: number;
    pagesFetched: number;
    rawResultsRetrieved: number;
    hardLimitedQueries: number;
    retries: number;
  };
}

mkdirSync(dirname(STAGING), { recursive: true });

const progress: Progress =
  RESUME && existsSync(PROGRESS)
    ? (JSON.parse(readFileSync(PROGRESS, "utf8")) as Progress)
    : {
        matrixVersion: MATRIX_VERSION,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queries: {},
        totals: {
          queriesTotal: DISCOVERY_QUERIES.length,
          queriesComplete: 0,
          queriesFailed: 0,
          pagesFetched: 0,
          rawResultsRetrieved: 0,
          hardLimitedQueries: 0,
          retries: 0,
        },
      };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = Math.ceil(60_000 / PAGINATION.requestsPerMinute) + 100;

function saveProgress(): void {
  progress.updatedAt = new Date().toISOString();
  const q = Object.values(progress.queries);
  progress.totals.queriesComplete = q.filter((x) => x.status === "complete").length;
  progress.totals.queriesFailed = q.filter((x) => x.status === "failed").length;
  progress.totals.pagesFetched = q.reduce((a, x) => a + x.pagesFetched, 0);
  progress.totals.rawResultsRetrieved = q.reduce((a, x) => a + x.resultsRetrieved, 0);
  progress.totals.hardLimitedQueries = q.filter((x) => x.hardLimited).length;
  writeFileSync(PROGRESS, JSON.stringify(progress, null, 1));
}

interface GhRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string | null;
  license?: { spdx_id?: string | null; key?: string | null } | null;
  archived: boolean;
}

/** One GitHub page, with backoff for secondary rate limits. */
async function fetchPage(
  query: string,
  page: number,
  state: QueryState,
): Promise<{ total: number; items: GhRepo[] } | null> {
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}` +
    `&per_page=${PAGINATION.perPage}&page=${page}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/vnd.github+json" },
      });
      if (res.ok) {
        const body = (await res.json()) as { total_count: number; items: GhRepo[] };
        return { total: body.total_count ?? 0, items: body.items ?? [] };
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      state.errors++;
      progress.totals.retries++;
      state.lastError = `HTTP ${res.status}: ${body.message ?? ""}`.slice(0, 200);
      // 403/429 are rate limiting; 422 past page 10 is the 1,000-result ceiling.
      if (res.status === 403 || res.status === 429) {
        await sleep(30_000 * (attempt + 1));
        continue;
      }
      return null;
    } catch (e) {
      state.errors++;
      progress.totals.retries++;
      state.lastError = String((e as Error)?.message ?? e).slice(0, 200);
      await sleep(5_000 * (attempt + 1));
    }
  }
  return null;
}

async function main(): Promise<void> {
  const queries = DISCOVERY_QUERIES.slice(
    0,
    Number.isFinite(LIMIT) ? LIMIT : undefined,
  );
  console.log(
    `matrix ${MATRIX_VERSION} · ${queries.length} queries · staging ${STAGING}`,
  );

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const existing = progress.queries[q.id];
    if (RESUME && existing?.status === "complete") continue;

    const state: QueryState = existing ?? {
      id: q.id,
      query: q.query,
      status: "pending",
      totalCount: null,
      pagesFetched: 0,
      resultsRetrieved: 0,
      hardLimited: false,
      errors: 0,
    };
    // A resumed-but-incomplete query restarts from page 1; the database
    // deduplicates, so re-reading pages costs time, never correctness.
    state.pagesFetched = 0;
    state.resultsRetrieved = 0;
    progress.queries[q.id] = state;

    for (let page = 1; page <= PAGINATION.maxPagesPerQuery; page++) {
      const result = await fetchPage(q.query, page, state);
      await sleep(PACE_MS);
      if (!result) break;

      if (page === 1) {
        state.totalCount = result.total;
        state.hardLimited = result.total > PAGINATION.maxResultsPerQuery;
      }
      if (result.items.length === 0) break;

      // Stage immediately — this is the durability guarantee.
      const lines = result.items
        .map((repo) =>
          JSON.stringify({
            repository_url: repo.html_url,
            title: repo.full_name,
            summary: repo.description ?? "",
            stars: repo.stargazers_count ?? 0,
            forks: repo.forks_count ?? 0,
            open_issues: repo.open_issues_count ?? 0,
            language: repo.language,
            topics: repo.topics ?? [],
            pushed_at: repo.pushed_at,
            license: repo.license?.spdx_id ?? repo.license?.key ?? null,
            archived: Boolean(repo.archived),
            category: q.categoryKey,
            category_label: q.categoryLabel,
            search_pattern: q.pattern,
            source_query: q.query,
            source_type: DISCOVERY_SOURCE,
          }),
        )
        .join("\n");
      appendFileSync(STAGING, lines + "\n");

      state.pagesFetched = page;
      state.resultsRetrieved += result.items.length;
      saveProgress();

      if (result.items.length < PAGINATION.perPage) break;
      if (state.resultsRetrieved >= PAGINATION.maxResultsPerQuery) break;
    }

    state.status =
      state.pagesFetched > 0 || state.totalCount === 0 ? "complete" : "failed";
    saveProgress();

    if ((i + 1) % 10 === 0) {
      console.log(
        `${i + 1}/${queries.length} queries · ${progress.totals.rawResultsRetrieved} raw staged · ` +
          `${progress.totals.hardLimitedQueries} hard-limited · ${progress.totals.queriesFailed} failed`,
      );
    }
  }

  saveProgress();
  console.log("=== RUN COMPLETE ===");
  console.log(JSON.stringify(progress.totals, null, 1));
}

void main();
