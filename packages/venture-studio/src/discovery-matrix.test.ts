import { describe, it, expect } from "vitest";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_QUERIES,
  DISCOVERY_SOURCE,
  DEDUPE_KEY,
  PAGINATION,
  PATTERN_QUALIFIERS,
  SEARCH_PATTERNS,
  buildDiscoveryQueries,
} from "./discovery-matrix";

/**
 * The matrix is the discovery engine's memory. These tests exist because the
 * previous matrix was lost: they pin the shape and size of the definition so a
 * silent edit cannot quietly shrink the net, and they enforce the GitHub
 * syntax rules we have already been burned by.
 */
describe("discovery matrix — size and shape", () => {
  it("is materially wider than the 79-category matrix it replaces", () => {
    expect(DISCOVERY_CATEGORIES.length).toBe(111);
    expect(DISCOVERY_QUERIES.length).toBe(301);
    expect(DISCOVERY_CATEGORIES.length).toBeGreaterThan(79);
    expect(DISCOVERY_QUERIES.length).toBeGreaterThan(139);
  });

  it("keeps every category the CEO named explicitly", () => {
    const keys = DISCOVERY_CATEGORIES.map((c) => c.key);
    for (const required of [
      "video-media-processing",
      "scheduling-calendars",
      "sports-technology",
      "automation-workflow",
      "ai-models-agents",
      "analytics-bi",
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("has unique category keys and unique query strings", () => {
    const keys = DISCOVERY_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const queries = DISCOVERY_QUERIES.map((q) => q.query);
    expect(new Set(queries).size).toBe(queries.length);
    const ids = DISCOVERY_QUERIES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("searches every category with at least the two broad patterns", () => {
    for (const category of DISCOVERY_CATEGORIES) {
      expect(category.patterns).toContain("POPULAR");
      expect(category.patterns).toContain("UNDERDEVELOPED");
    }
  });

  it("uses every one of the six patterns", () => {
    for (const pattern of SEARCH_PATTERNS) {
      expect(DISCOVERY_QUERIES.some((q) => q.pattern === pattern)).toBe(true);
    }
  });

  it("expands deterministically — same input, same order, same output", () => {
    expect(buildDiscoveryQueries()).toEqual(buildDiscoveryQueries());
    expect(buildDiscoveryQueries().map((q) => q.id)).toEqual(
      DISCOVERY_QUERIES.map((q) => q.id),
    );
  });
});

describe("discovery matrix — GitHub syntax", () => {
  // GitHub returns HTTP 422 for `topic:a OR topic:b`. This exact query cost us
  // a failed run once; it can never come back.
  it("never puts OR between topic qualifiers", () => {
    for (const { query } of DISCOVERY_QUERIES) {
      expect(query).not.toMatch(/topic:\S+\s+OR\s+topic:/);
    }
  });

  it("keeps android and ios as separate categories, never one OR'd query", () => {
    const keys = DISCOVERY_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("mobile-android");
    expect(keys).toContain("mobile-ios");
    for (const { query } of DISCOVERY_QUERIES) {
      expect(query).not.toMatch(/topic:android[^]*topic:ios/);
    }
  });

  it("emits only qualifiers GitHub's repository search accepts", () => {
    // Anything outside this set is either a typo or a qualifier that belongs to
    // a different search endpoint (issues, code) and would 422 here.
    const allowed =
      /^(topic|stars|pushed|created|language|license|archived|help-wanted-issues|good-first-issues|in|is|fork|user|org|size|forks|followers|mirror|template)$/;
    for (const { query } of DISCOVERY_QUERIES) {
      const qualifiers = query.match(/(^|\s)([a-z-]+):/g) ?? [];
      for (const raw of qualifiers) {
        const name = raw.trim().replace(":", "");
        expect(allowed.test(name), `${name} in "${query}"`).toBe(true);
      }
    }
  });

  it("states thresholds absolutely, so a re-run searches the same window", () => {
    // A relative date ("last year") would make two runs incomparable.
    for (const qualifier of Object.values(PATTERN_QUALIFIERS)) {
      const dates = qualifier.match(/(pushed|created):[<>]=?\S+/g) ?? [];
      for (const d of dates) {
        expect(d).toMatch(/\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe("discovery matrix — run contract", () => {
  it("names GitHub as the source and the repository URL as the only dedupe key", () => {
    expect(DISCOVERY_SOURCE).toBe("github");
    expect(DEDUPE_KEY).toBe("repository_url");
  });

  it("pages to GitHub's real ceiling and records what it could not reach", () => {
    expect(PAGINATION.perPage).toBe(100);
    expect(PAGINATION.maxResultsPerQuery).toBe(1000);
    expect(PAGINATION.maxPagesPerQuery).toBe(10);
    // A hard-limited query must be recorded as such, never silently truncated.
    expect(PAGINATION.recordHardLimited).toBe(true);
  });

  it("carries the exact query on every finding, so a row can be traced back", () => {
    for (const q of DISCOVERY_QUERIES) {
      expect(q.query.length).toBeGreaterThan(0);
      expect(q.categoryKey.length).toBeGreaterThan(0);
      expect(q.id).toBe(`${q.categoryKey}::${q.pattern}`);
    }
  });
});
