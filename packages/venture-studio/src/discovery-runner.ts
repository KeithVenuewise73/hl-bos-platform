/**
 * Discovery runner — executes the committed GitHub matrix and returns a raw,
 * unfiltered corpus. Pure: the search function is injected, so tests need no
 * network and a run is reproducible from the matrix alone.
 *
 * Rules (from discovery-matrix.ts): never filter, rank or score here; dedupe
 * ONLY on canonical repository URL; record hard-limited queries, never
 * silently truncate; record failed queries, never hide them.
 */
import { DEDUPE_KEY, MATRIX_VERSION, PAGINATION, type DiscoveryQuery } from "./discovery-matrix";

export interface RepoHit {
  repositoryUrl: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  license: string | null;
  pushedAt: string | null;
  topics: string[];
}

export interface SearchPage {
  totalCount: number;
  items: RepoHit[];
}

/** One page (1-based) of results for a query string. May throw. */
export type SearchFn = (query: string, page: number, perPage: number) => Promise<SearchPage>;

export interface QueryOutcome {
  queryId: string;
  query: string;
  status: "ok" | "failed";
  totalCount: number;
  obtained: number;
  hardLimited: boolean;
  error?: string;
}

export interface FoundOpportunity extends RepoHit {
  /** Every query that surfaced this repository. */
  foundBy: { queryId: string; categoryKey: string; pattern: string }[];
}

export interface DiscoveryRun {
  matrixVersion: string;
  dedupeKey: typeof DEDUPE_KEY;
  queries: QueryOutcome[];
  opportunities: FoundOpportunity[];
}

export function canonicalRepoUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

export async function runDiscovery(
  queries: readonly DiscoveryQuery[],
  search: SearchFn,
  opts: { maxPages?: number } = {},
): Promise<DiscoveryRun> {
  const maxPages = Math.min(opts.maxPages ?? PAGINATION.maxPagesPerQuery, PAGINATION.maxPagesPerQuery);
  const found = new Map<string, FoundOpportunity>();
  const outcomes: QueryOutcome[] = [];

  for (const q of queries) {
    let total = 0;
    let obtained = 0;
    let error: string | undefined;
    try {
      for (let page = 1; page <= maxPages; page++) {
        const res = await search(q.query, page, PAGINATION.perPage);
        total = res.totalCount;
        for (const hit of res.items) {
          obtained++;
          const key = canonicalRepoUrl(hit.repositoryUrl);
          const ref = { queryId: q.id, categoryKey: q.categoryKey, pattern: q.pattern };
          const existing = found.get(key);
          if (existing) existing.foundBy.push(ref);
          else found.set(key, { ...hit, foundBy: [ref] });
        }
        if (res.items.length < PAGINATION.perPage || obtained >= total) break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    outcomes.push({
      queryId: q.id,
      query: q.query,
      status: error ? "failed" : "ok",
      totalCount: total,
      obtained,
      hardLimited: total > PAGINATION.maxResultsPerQuery,
      ...(error ? { error } : {}),
    });
  }
  return { matrixVersion: MATRIX_VERSION, dedupeKey: DEDUPE_KEY, queries: outcomes, opportunities: [...found.values()] };
}
