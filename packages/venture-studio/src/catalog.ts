/**
 * Opportunity Catalog — pure browsing logic.
 *
 * The catalog must stay usable when the corpus is tens of thousands of rows,
 * which means every decision here (which column to order by, which page to
 * read, which filters are active) is resolved BEFORE the database is asked,
 * and resolved the same way every time. Keeping it pure makes it testable
 * without a database.
 *
 * Filtering narrows a view. It never deletes, and it never permanently hides:
 * clearing the filters always returns the whole corpus.
 */

export interface CatalogSort {
  /** Database column to order by. */
  column: string;
  ascending: boolean;
  label: string;
}

/**
 * Every ordering the catalog offers. Unscored opportunities stay visible in
 * all of them — sorting reorders, it never excludes.
 */
export const CATALOG_SORTS = {
  newest: { column: "discovered_at", ascending: false, label: "Newest discovered" },
  stars_desc: { column: "stars", ascending: false, label: "Stars: high to low" },
  stars_asc: { column: "stars", ascending: true, label: "Stars: low to high" },
  issues_desc: { column: "open_issues", ascending: false, label: "Most open issues" },
  pushed_desc: { column: "pushed_at", ascending: false, label: "Most recently pushed" },
  category: { column: "category", ascending: true, label: "Category" },
  score: { column: "confidence", ascending: true, label: "Score (when available)" },
} as const satisfies Record<string, CatalogSort>;

export type CatalogSortKey = keyof typeof CATALOG_SORTS;

export const DEFAULT_CATALOG_SORT: CatalogSortKey = "newest";
export const DEFAULT_CATALOG_PAGE_SIZE = 50;
/** A hard ceiling: the browser must never be handed the whole corpus. */
export const MAX_CATALOG_PAGE_SIZE = 200;

/** The filters the catalog understands, all applied server-side. */
export const CATALOG_FILTER_KEYS = [
  "q",
  "category",
  "pattern",
  "source",
  "archived",
  "license",
  "language",
  "status",
] as const;

export type CatalogFilterKey = (typeof CATALOG_FILTER_KEYS)[number];

/**
 * An unknown or missing sort key falls back to the default rather than failing.
 *
 * Own-property check, not `in`: `"constructor" in CATALOG_SORTS` is true via
 * the prototype chain, which would let a crafted URL select a "sort" whose
 * column is undefined and break the query.
 */
export function resolveSort(key: string | undefined): CatalogSortKey {
  return key && Object.hasOwn(CATALOG_SORTS, key)
    ? (key as CatalogSortKey)
    : DEFAULT_CATALOG_SORT;
}

/** Page numbers are 1-based; anything nonsensical becomes page 1. */
export function clampPage(page: unknown): number {
  const n = typeof page === "number" ? page : Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Page size is bounded so a crafted URL cannot request the entire corpus. */
export function clampPageSize(
  size: unknown,
  fallback = DEFAULT_CATALOG_PAGE_SIZE,
): number {
  const n = typeof size === "number" ? size : Number(size);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_CATALOG_PAGE_SIZE, Math.floor(n));
}

/** The inclusive row range a page covers, for a range-based read. */
export function pageRange(
  page: number,
  pageSize: number,
): { from: number; to: number } {
  const p = clampPage(page);
  const s = clampPageSize(pageSize);
  const from = (p - 1) * s;
  return { from, to: from + s - 1 };
}

/** How many pages the matching set spans. Always at least one. */
export function pageCount(matching: number, pageSize: number): number {
  const s = clampPageSize(pageSize);
  if (!Number.isFinite(matching) || matching <= 0) return 1;
  return Math.max(1, Math.ceil(matching / s));
}

/** True when the viewer has narrowed the corpus in any way. */
export function hasActiveFilters(
  params: Partial<Record<CatalogFilterKey, string | undefined>>,
): boolean {
  return CATALOG_FILTER_KEYS.some((k) => Boolean(params[k]));
}

/**
 * Make a free-text term safe for a PostgREST `or=` expression, where commas
 * and parentheses are syntax. Returns null when nothing searchable remains.
 */
export function sanitizeSearchTerm(term: string | undefined): string | null {
  if (!term) return null;
  const cleaned = term
    .replace(/[%,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
