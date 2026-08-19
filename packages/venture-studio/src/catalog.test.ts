import { describe, it, expect } from "vitest";
import {
  CATALOG_SORTS,
  CATALOG_FILTER_KEYS,
  DEFAULT_CATALOG_PAGE_SIZE,
  MAX_CATALOG_PAGE_SIZE,
  clampPage,
  clampPageSize,
  hasActiveFilters,
  pageCount,
  pageRange,
  resolveSort,
  sanitizeSearchTerm,
} from "./catalog";

describe("catalog sorting", () => {
  it("offers every ordering the CEO asked for", () => {
    expect(Object.keys(CATALOG_SORTS).sort()).toEqual(
      [
        "category",
        "issues_desc",
        "newest",
        "pushed_desc",
        "score",
        "stars_asc",
        "stars_desc",
      ].sort(),
    );
  });

  it("sorts stars numerically in both directions", () => {
    expect(CATALOG_SORTS.stars_desc.column).toBe("stars");
    expect(CATALOG_SORTS.stars_desc.ascending).toBe(false);
    expect(CATALOG_SORTS.stars_asc.column).toBe("stars");
    expect(CATALOG_SORTS.stars_asc.ascending).toBe(true);
  });

  it("falls back to newest rather than failing on an unknown sort", () => {
    expect(resolveSort(undefined)).toBe("newest");
    expect(resolveSort("")).toBe("newest");
    expect(resolveSort("nonsense")).toBe("newest");
    expect(resolveSort("constructor")).toBe("newest");
    expect(resolveSort("stars_desc")).toBe("stars_desc");
  });
});

describe("catalog paging — the browser never gets the whole corpus", () => {
  it("clamps page size to a ceiling however the URL is crafted", () => {
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(100000)).toBe(MAX_CATALOG_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(DEFAULT_CATALOG_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(DEFAULT_CATALOG_PAGE_SIZE);
    expect(clampPageSize("abc")).toBe(DEFAULT_CATALOG_PAGE_SIZE);
    expect(clampPageSize(undefined)).toBe(DEFAULT_CATALOG_PAGE_SIZE);
  });

  it("treats nonsense page numbers as page 1", () => {
    expect(clampPage(1)).toBe(1);
    expect(clampPage(7)).toBe(7);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-3)).toBe(1);
    expect(clampPage("abc")).toBe(1);
    expect(clampPage(undefined)).toBe(1);
  });

  it("computes non-overlapping ranges that cover the corpus exactly", () => {
    expect(pageRange(1, 50)).toEqual({ from: 0, to: 49 });
    expect(pageRange(2, 50)).toEqual({ from: 50, to: 99 });
    expect(pageRange(3, 100)).toEqual({ from: 200, to: 299 });
  });

  it("counts pages for a large corpus, and never reports zero pages", () => {
    expect(pageCount(50_000, 50)).toBe(1000);
    expect(pageCount(101, 50)).toBe(3);
    expect(pageCount(1, 50)).toBe(1);
    expect(pageCount(0, 50)).toBe(1);
  });
});

describe("catalog filters", () => {
  it("covers every filter the CEO asked for", () => {
    for (const key of [
      "category",
      "pattern",
      "source",
      "archived",
      "license",
      "language",
    ]) {
      expect(CATALOG_FILTER_KEYS).toContain(key);
    }
  });

  it("knows when the view is narrowed and when it is the whole corpus", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ category: "" })).toBe(false);
    expect(hasActiveFilters({ category: "mobile-ios" })).toBe(true);
    expect(hasActiveFilters({ q: "calendar" })).toBe(true);
    // Combinable: several at once is still just "narrowed".
    expect(hasActiveFilters({ language: "Rust", license: "MIT" })).toBe(true);
  });
});

describe("catalog search term", () => {
  it("keeps ordinary searches intact", () => {
    expect(sanitizeSearchTerm("calendar")).toBe("calendar");
    expect(sanitizeSearchTerm("  video   editor ")).toBe("video editor");
  });

  it("neutralises characters that are PostgREST filter syntax", () => {
    // A raw comma or paren would otherwise break out of the or() expression.
    expect(sanitizeSearchTerm("a,b")).toBe("a b");
    expect(sanitizeSearchTerm("drop(x)")).toBe("drop x");
    expect(sanitizeSearchTerm("100%")).toBe("100");
  });

  it("returns null when nothing searchable remains", () => {
    expect(sanitizeSearchTerm(undefined)).toBeNull();
    expect(sanitizeSearchTerm("")).toBeNull();
    expect(sanitizeSearchTerm("   ")).toBeNull();
    expect(sanitizeSearchTerm(",,,")).toBeNull();
  });
});
