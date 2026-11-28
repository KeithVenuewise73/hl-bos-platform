import { describe, expect, it } from "vitest";
import { canonicalRepoUrl, runDiscovery, type RepoHit, type SearchFn } from "./discovery-runner";
import type { DiscoveryQuery } from "./discovery-matrix";

const hit = (url: string): RepoHit => ({
  repositoryUrl: url, fullName: url.split("github.com/")[1] ?? url, description: null,
  stars: 1, language: null, license: null, pushedAt: null, topics: [],
});
const q = (id: string): DiscoveryQuery => ({
  id, categoryKey: id.split("::")[0]!, categoryLabel: "x", pattern: "POPULAR", query: `q-${id}`,
});

describe("runDiscovery", () => {
  it("dedupes on canonical URL only and records every finder", async () => {
    const search: SearchFn = async (query) => ({
      totalCount: 2,
      items: query === "q-a::POPULAR"
        ? [hit("https://github.com/Foo/Bar"), hit("https://github.com/x/y")]
        : [hit("https://github.com/foo/bar.git/")],
    });
    const run = await runDiscovery([q("a::POPULAR"), q("b::POPULAR")], search);
    expect(run.opportunities).toHaveLength(2);
    expect(run.opportunities[0]!.foundBy.map((f) => f.queryId)).toEqual(["a::POPULAR", "b::POPULAR"]);
  });

  it("records failures and hard limits instead of hiding them", async () => {
    const search: SearchFn = async (query) => {
      if (query === "q-bad::POPULAR") throw new Error("HTTP 422");
      return { totalCount: 5000, items: [hit("https://github.com/a/b")] };
    };
    const run = await runDiscovery([q("big::POPULAR"), q("bad::POPULAR")], search);
    expect(run.queries[0]).toMatchObject({ status: "ok", hardLimited: true, totalCount: 5000 });
    expect(run.queries[1]).toMatchObject({ status: "failed", error: "HTTP 422" });
  });

  it("pages until results run out", async () => {
    const pages: number[] = [];
    const search: SearchFn = async (_q, page, per) => {
      pages.push(page);
      return { totalCount: per + 1, items: page === 1 ? Array.from({ length: per }, (_, i) => hit(`https://github.com/a/r${i}`)) : [hit("https://github.com/a/last")] };
    };
    const run = await runDiscovery([q("p::POPULAR")], search);
    expect(pages).toEqual([1, 2]);
    expect(run.opportunities).toHaveLength(101);
  });

  it("canonicalises", () => {
    expect(canonicalRepoUrl("https://GitHub.com/A/B.git/")).toBe("https://github.com/a/b");
  });
});
