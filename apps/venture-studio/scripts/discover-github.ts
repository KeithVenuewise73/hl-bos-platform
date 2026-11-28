// Runs the committed GitHub discovery matrix through the authenticated `gh` CLI
// and writes a raw, unfiltered corpus. Read-only: touches no database.
//   pnpm --filter @hl-bos/venture-studio-app discover:github <out.json> [--limit N] [--pages N]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DISCOVERY_QUERIES, runDiscovery, type SearchFn } from "@hl-bos/venture-studio";

const out = process.argv[2];
const arg = (n: string, d: number): number => {
  const i = process.argv.indexOf(n);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const limit = arg("--limit", DISCOVERY_QUERIES.length);
const maxPages = arg("--pages", 10);
if (!out) {
  console.error("usage: discover-github.ts <out.json> [--limit N] [--pages N]");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const search: SearchFn = async (query, page, perPage) => {
  await sleep(2100); // GitHub Search ceiling: 30 requests/minute
  const raw = execFileSync(
    "gh",
    ["api", "-X", "GET", "search/repositories", "-f", `q=${query}`, "-f", `per_page=${perPage}`, "-f", `page=${page}`, "-f", "sort=stars"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const j = JSON.parse(raw);
  return {
    totalCount: j.total_count,
    items: j.items.map((r: any) => ({
      repositoryUrl: r.html_url,
      fullName: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      language: r.language,
      license: r.license?.spdx_id ?? null,
      pushedAt: r.pushed_at,
      topics: r.topics ?? [],
    })),
  };
};

const run = await runDiscovery(DISCOVERY_QUERIES.slice(0, limit), search, { maxPages });
writeFileSync(out, JSON.stringify(run, null, 1));
const failed = run.queries.filter((q) => q.status === "failed").length;
console.log(`queries ${run.queries.length} (failed ${failed}) · unique repositories ${run.opportunities.length}`);
