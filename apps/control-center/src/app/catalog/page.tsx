import { catalogView, groupByKind, search, KIND_LABEL } from "@/lib/catalog";
import { Card, Dot, Empty, LABEL } from "@/components/ui";
import { Tile, Bar, AssetRow } from "@/components/CatalogUI";
import type { ReuseFlag } from "@hl-bos/catalog";
import { REUSE_LABEL } from "@hl-bos/catalog";

export const dynamic = "force-dynamic";

const REUSE_ORDER: ReuseFlag[] = [
  "reusable",
  "commercial",
  "internal_only",
  "requires_refactor",
  "requires_documentation",
  "requires_testing",
  "deprecated",
];

export default async function CatalogDashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { catalog, metrics: m, completeness } = await catalogView();
  const groups = groupByKind(catalog);

  const q = ((await searchParams).q ?? "").trim();
  const hits = q ? search(catalog, q) : [];

  const reuseCounts = REUSE_ORDER.map((flag) => ({
    flag,
    count: catalog.assets.filter((a) => a.reuse.includes(flag)).length,
  }));

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Enterprise Catalog</h1>
          <span style={{ fontSize: 12, color: "#6e7681" }}>· Atlas</span>
        </div>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          The authoritative source for every Herman Legacy software asset.{" "}
          <a href="/catalog/factory" style={{ color: "#58a6ff" }}>
            Software Factory
          </a>{" "}
          ·{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            ← Control Center
          </a>
        </p>
      </header>

      {/* ---- Global search (server-rendered: works with or without JS) ---- */}
      <div
        style={{
          background: "#12151a",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 18,
        }}
      >
        <form action="/catalog" method="get" style={{ display: "flex", gap: 10 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search every asset — try “Stripe”, “Notification”, “Proposal”, “Authentication”…"
            aria-label="Search the Enterprise Catalog"
            style={{
              flex: 1,
              boxSizing: "border-box",
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 10,
              color: "#e8eaed",
              fontSize: 14,
              padding: "12px 14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              background: "#1f6feb",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              padding: "0 18px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>

        {q && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, color: "#8b949e", marginBottom: 6 }}>
              {hits.length === 0
                ? `No assets match “${q}”. The catalog only shows what really exists.`
                : `${hits.length} asset${hits.length > 1 ? "s" : ""} match “${q}”.`}
            </div>
            {hits.map((h) => (
              <div key={h.asset.id}>
                <AssetRow asset={h.asset} />
                {h.related.length > 0 && (
                  <div style={{ fontSize: 11, color: "#58a6ff", margin: "-2px 0 2px" }}>
                    {h.related.length} related asset{h.related.length > 1 ? "s" : ""} &
                    dependencies
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- CEO dashboard: headline tiles ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Tile label="Products" value={m.products} />
        <Tile label="Modules" value={m.modules} />
        <Tile label="Shared services" value={m.sharedServices} />
        <Tile label="AI capabilities" value={m.aiServices} />
        <Tile label="Edge functions" value={m.edgeFunctions} />
        <Tile label="Databases" value={m.databases} />
        <Tile
          label="Business solutions"
          value={m.businessSolutions}
          hint="capabilities + industries"
        />
        <Tile label="Repositories" value={m.repositories} />
        <Tile label="Reusable assets" value={m.reusableAssets} accent="#3fb950" />
        <Tile
          label="Enterprise health"
          value={
            <span
              style={{ display: "inline-flex", alignItems: "center", fontSize: 18 }}
            >
              <Dot health={m.enterpriseHealth} />
              {LABEL[m.enterpriseHealth]}
            </span>
          }
        />
        <Tile
          label="Catalog completion"
          value={`${m.catalogCompletionPct}%`}
          accent="#3fb950"
        />
        <Tile label="Platform reuse" value={`${m.reusePct}%`} accent="#1f6feb" />
      </div>

      <p
        style={{
          fontSize: 11.5,
          color: "#6e7681",
          margin: "0 0 18px",
          lineHeight: 1.6,
        }}
      >
        Total assets catalogued: <strong>{m.totalAssets}</strong>. Every number is
        counted from the catalog and a live scan of this repository — none is entered by
        hand.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ---- Completeness ---- */}
        <Card
          title="Catalog completeness"
          sub="Of what physically exists in the repo, how much is registered. A scan drives this — an unregistered asset shows as a gap."
        >
          {completeness.byKind.map((k) => (
            <Bar
              key={k.kind}
              label={k.label}
              pct={k.pct}
              sub={`${k.matched}/${k.discovered}`}
            />
          ))}
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <Dot health={completeness.overallPct >= 100 ? "green" : "yellow"} />
            <strong style={{ fontSize: 13 }}>
              Overall {completeness.overallPct}% ({completeness.overallMatched}/
              {completeness.overallDiscovered} discoverable assets registered)
            </strong>
          </div>
        </Card>

        {/* ---- Reuse intelligence ---- */}
        <Card
          title="Reuse intelligence"
          sub="How many assets carry each reuse classification (an asset may carry several)."
        >
          {reuseCounts.map(({ flag, count }) => (
            <div
              key={flag}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#8b949e" }}>{REUSE_LABEL[flag]}</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>{count}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* ---- Browse by type ---- */}
      <Card
        title="Browse the estate"
        sub="Every asset kind the catalog tracks. Click through to the full list."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {groups.map((g) => (
            <a
              key={g.kind}
              href={`/catalog/${g.kind}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                background: "#0d1117",
                border: "1px solid #21262d",
                borderRadius: 10,
                padding: "12px 14px",
                display: "block",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {KIND_LABEL[g.kind].many}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#58a6ff" }}>
                  {g.assets.length}
                </span>
              </div>
            </a>
          ))}
        </div>
      </Card>

      {/* ---- Governance ---- */}
      <Card
        title="Atlas governance"
        sub="The catalog is the single source of truth. These rules keep it honest."
      >
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.75,
            color: "#c9d1d9",
          }}
        >
          <li>
            <strong>Register before you build.</strong> A new asset is added to the
            registry (`packages/catalog/src/registry.ts`) before development, so the
            catalog never trails reality.
          </li>
          <li>
            <strong>Every scan updates the catalog.</strong> Completeness is recomputed
            from the repository on each visit; an unregistered schema, function, app or
            package drops the score and is named.
          </li>
          <li>
            <strong>Honest maturity.</strong> Dormant objects are marked dormant, not
            green — e.g. the engineering module registry (`hlvs.modules`) is seeded 0
            rows in the live database even though 23 commercial modules exist in
            discovery; the catalog surfaces that gap rather than hiding it.
          </li>
        </ul>
        {completeness.byKind.some((k) => k.unregistered.length > 0) ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, color: "#d29922", marginBottom: 4 }}>
              Discovered but not registered:
            </div>
            {completeness.byKind
              .filter((k) => k.unregistered.length > 0)
              .map((k) => (
                <div key={k.kind} style={{ fontSize: 12.5, color: "#8b949e" }}>
                  {k.label}: {k.unregistered.join(", ")}
                </div>
              ))}
          </div>
        ) : (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#3fb950" }}>
            Every discoverable asset in this repository is registered. No governance
            backlog.
          </p>
        )}
      </Card>

      {groups.length === 0 && <Empty>The catalog is empty.</Empty>}
    </main>
  );
}
