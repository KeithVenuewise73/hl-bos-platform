import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Empty, Badge, colors } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import {
  listOpportunityPage,
  catalogFacets,
  SORTS,
  DEFAULT_PAGE_SIZE,
} from "@/hlvs/lib/data";
import {
  DISCOVERY_CATEGORIES,
  SEARCH_PATTERNS,
  OPPORTUNITY_STATUSES,
  resolveSort,
} from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  inbox: "neutral",
  researching: "accent",
  evaluated: "warn",
  watch: "warn",
  approved: "good",
  rejected: "bad",
  archived: "neutral",
};

const field: React.CSSProperties = {
  background: "#0d1117",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.text,
  padding: "8px 10px",
  fontSize: 13,
};

/** Rebuild the querystring, changing one key and returning to page 1. */
function href(
  sp: Record<string, string | undefined>,
  patch: Record<string, string>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v) next.set(k, v);
  }
  return `/HLVS/opportunities?${next.toString()}`;
}

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // resolveSort does an own-property check: `"constructor" in SORTS` is true
  // via the prototype chain and would select a sort with no column.
  const sort = resolveSort(sp["sort"]);
  const page = Number(sp["page"] ?? "1") || 1;

  const [list, facets] = await Promise.all([
    listOpportunityPage({
      q: sp["q"],
      category: sp["category"],
      pattern: sp["pattern"],
      source: sp["source"],
      archived: sp["archived"],
      license: sp["license"],
      language: sp["language"],
      status: sp["status"],
      sort,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    catalogFacets(),
  ]);

  const filtered =
    Boolean(sp["q"]) ||
    Boolean(sp["category"]) ||
    Boolean(sp["pattern"]) ||
    Boolean(sp["source"]) ||
    Boolean(sp["archived"]) ||
    Boolean(sp["license"]) ||
    Boolean(sp["language"]) ||
    Boolean(sp["status"]);

  return (
    <StudioShell view="opportunities">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <h1 style={{ fontSize: 20 }}>Opportunity Catalog</h1>
        <a
          href="/HLVS/opportunities/new"
          style={{ color: colors.accent, fontSize: 13 }}
        >
          + New opportunity
        </a>
      </div>
      <ProvisioningBanner detail={list} />

      {/* TOTAL is the whole persisted corpus and never moves. SHOWING is what
          the current filters match. Filtering changes the view, never the data. */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "6px 0 12px" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {list.total.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: colors.dim, textTransform: "uppercase" }}>
            Total opportunities
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {list.matching.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: colors.dim, textTransform: "uppercase" }}>
            Showing {filtered ? "(filtered)" : "(all)"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {list.page} / {list.pageCount}
          </div>
          <div style={{ fontSize: 11, color: colors.dim, textTransform: "uppercase" }}>
            Page
          </div>
        </div>
      </div>

      <Card>
        <form
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            marginBottom: 12,
          }}
        >
          <input
            name="q"
            defaultValue={sp["q"] ?? ""}
            placeholder="Search name or description"
            style={{ ...field, gridColumn: "1 / -1" }}
          />
          <select name="category" defaultValue={sp["category"] ?? ""} style={field}>
            <option value="">All categories</option>
            {DISCOVERY_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select name="pattern" defaultValue={sp["pattern"] ?? ""} style={field}>
            <option value="">All patterns</option>
            {SEARCH_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select name="source" defaultValue={sp["source"] ?? ""} style={field}>
            <option value="">All sources</option>
            {facets.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="archived" defaultValue={sp["archived"] ?? ""} style={field}>
            <option value="">Active &amp; archived</option>
            <option value="active">Active only</option>
            <option value="archived">Archived only</option>
          </select>
          <select name="language" defaultValue={sp["language"] ?? ""} style={field}>
            <option value="">All languages</option>
            {facets.languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select name="license" defaultValue={sp["license"] ?? ""} style={field}>
            <option value="">All licenses</option>
            {facets.licenses.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={sp["status"] ?? ""} style={field}>
            <option value="">All statuses</option>
            {OPPORTUNITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort} style={field}>
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            style={{
              background: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          {filtered ? (
            <a
              href="/HLVS/opportunities"
              style={{
                ...field,
                textAlign: "center",
                textDecoration: "none",
                color: colors.dim,
              }}
            >
              Clear filters
            </a>
          ) : null}
        </form>

        {list.error ? (
          <Empty>
            The catalog could not be read: {list.error}. No data is shown rather than an
            empty list that would imply the corpus is empty.
          </Empty>
        ) : list.items.length === 0 ? (
          <Empty>
            {list.total === 0
              ? "No opportunities have been persisted yet."
              : "No opportunities match these filters. Nothing has been deleted — clear the filters to see the full corpus."}
          </Empty>
        ) : (
          list.items.map((o) => (
            <a
              key={o.id}
              href={`/HLVS/opportunities/${o.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: colors.text,
                borderBottom: `1px solid ${colors.border}`,
                padding: "10px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{o.title}</strong>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {o.archived ? <Badge tone="warn">archived</Badge> : null}
                  {o.is_demonstration ? (
                    <Badge tone="warn">DEMO / NOT LIVE</Badge>
                  ) : null}
                  <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Badge>
                </span>
              </div>
              {o.summary ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: colors.text,
                    opacity: 0.85,
                    margin: "2px 0",
                  }}
                >
                  {o.summary.length > 180 ? `${o.summary.slice(0, 180)}…` : o.summary}
                </div>
              ) : null}
              <div style={{ fontSize: 12, color: colors.dim }}>
                {[
                  o.stars !== null ? `★ ${o.stars.toLocaleString()}` : null,
                  o.open_issues !== null
                    ? `${o.open_issues.toLocaleString()} issues`
                    : null,
                  o.language,
                  o.license,
                  o.category,
                  o.search_pattern,
                  o.source_type,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </a>
          ))
        )}

        {list.pageCount > 1 ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 14,
              fontSize: 13,
            }}
          >
            {list.page > 1 ? (
              <a
                href={href(sp, { page: String(list.page - 1) })}
                style={{ color: colors.accent }}
              >
                ← Previous
              </a>
            ) : (
              <span style={{ color: colors.dim }}>← Previous</span>
            )}
            <span style={{ color: colors.dim }}>
              Page {list.page} of {list.pageCount} · {list.pageSize} per page
            </span>
            {list.page < list.pageCount ? (
              <a
                href={href(sp, { page: String(list.page + 1) })}
                style={{ color: colors.accent }}
              >
                Next →
              </a>
            ) : (
              <span style={{ color: colors.dim }}>Next →</span>
            )}
          </div>
        ) : null}
      </Card>
    </StudioShell>
  );
}
