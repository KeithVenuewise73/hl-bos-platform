import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildCatalog,
  assetsByKind,
  groupByKind,
  scanRepository,
  completeness,
  metrics,
  search,
  neighborhood,
  referencedIds,
} from "./index";
import type { AssetKind, Maturity, ReuseFlag, RelationKind } from "./types";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const VALID_KINDS = new Set<AssetKind>([
  "product",
  "application",
  "module",
  "package",
  "shared_service",
  "ai_capability",
  "api",
  "repository",
  "database",
  "workflow",
  "edge_function",
  "industry_solution",
  "business_capability",
]);
const VALID_REUSE = new Set<ReuseFlag>([
  "reusable",
  "internal_only",
  "commercial",
  "requires_refactor",
  "requires_documentation",
  "requires_testing",
  "deprecated",
]);
const VALID_MATURITY = new Set<Maturity>([
  "live",
  "built_undeployed",
  "prototype",
  "reference",
  "dormant",
  "legacy",
  "planned",
]);
const VALID_RELATIONS = new Set<RelationKind>([
  "uses",
  "depends_on",
  "provides",
  "consumes",
  "extends",
  "owned_by",
  "referenced_by",
  "replaced_by",
  "successor",
  "deprecated",
]);

describe("registry integrity", () => {
  const catalog = buildCatalog();
  const ids = new Set(catalog.assets.map((a) => a.id));

  it("has a substantial, non-trivial catalog", () => {
    expect(catalog.assets.length).toBeGreaterThan(80);
  });

  it("has unique asset ids", () => {
    expect(ids.size).toBe(catalog.assets.length);
  });

  it("uses only valid kinds, reuse flags, maturities and relation kinds", () => {
    for (const a of catalog.assets) {
      expect(VALID_KINDS.has(a.kind), `kind ${a.kind} on ${a.id}`).toBe(true);
      expect(VALID_MATURITY.has(a.maturity), `maturity on ${a.id}`).toBe(true);
      expect(a.reuse.length, `reuse flags on ${a.id}`).toBeGreaterThan(0);
      for (const f of a.reuse)
        expect(VALID_REUSE.has(f), `reuse ${f} on ${a.id}`).toBe(true);
      for (const r of a.relationships)
        expect(VALID_RELATIONS.has(r.kind), `relation ${r.kind} on ${a.id}`).toBe(true);
    }
  });

  it("has no dangling relationships (every target exists)", () => {
    const dangling: string[] = [];
    for (const target of referencedIds(catalog)) {
      if (!ids.has(target)) dangling.push(target);
    }
    expect(dangling, `dangling targets: ${dangling.join(", ")}`).toEqual([]);
  });

  it("registers the 18 application databases and 8 edge functions", () => {
    expect(assetsByKind(catalog, "database").length).toBe(18);
    expect(assetsByKind(catalog, "edge_function").length).toBe(8);
  });

  it("groups only non-empty kinds", () => {
    for (const g of groupByKind(catalog)) expect(g.assets.length).toBeGreaterThan(0);
  });
});

describe("repository scan (ground truth)", () => {
  it("discovers the real schemas, functions, apps and packages", async () => {
    const inv = await scanRepository(REPO_ROOT);
    expect(inv.schemas.length).toBe(18);
    expect(inv.schemas).toContain("hlvs");
    expect(inv.schemas).toContain("bti");
    expect(inv.schemas).toContain("intake");
    expect(inv.tables).toBeGreaterThanOrEqual(120);
    // 33 migration files on disk: 0029 (venture-studio foundation, applied to
    // production) + 0030 (CEO Notebook — written, UNAPPLIED pending CEO approval)
    // + 0031 (Business Transformation intake — written, UNAPPLIED pending CEO
    // approval) + 0032 (venture-studio discovery metadata — additive, applied to
    // production under CEO approval) + 0033 (venture-studio intelligence layer —
    // additive, applied to production under CEO approval).
    expect(inv.migrations.length).toBe(33);
    expect(inv.edgeFunctions).toContain("ai-gateway");
    expect(inv.edgeFunctions).not.toContain("tests");
    expect(inv.apps).toEqual(
      expect.arrayContaining(["control-center", "hl-bti", "hl-bti-alpha"]),
    );
    expect(inv.packages).toEqual(
      expect.arrayContaining(["config", "bti-engine", "catalog"]),
    );
    expect(inv.testFiles).toBeGreaterThan(0);
  });
});

describe("completeness (registry reconciled against scan)", () => {
  it("reports 100% for every discoverable kind — everything on disk is registered", async () => {
    const catalog = buildCatalog();
    const inv = await scanRepository(REPO_ROOT);
    const report = completeness(catalog, inv);
    for (const k of report.byKind) {
      expect(
        k.pct,
        `${k.kind} completeness (unregistered: ${k.unregistered.join(",")})`,
      ).toBe(100);
      expect(k.unregistered).toEqual([]);
    }
    expect(report.overallPct).toBe(100);
  });
});

describe("executive metrics", () => {
  it("counts headline tiles from the catalog", async () => {
    const catalog = buildCatalog();
    const inv = await scanRepository(REPO_ROOT);
    const m = metrics(catalog, completeness(catalog, inv));
    expect(m.databases).toBe(18);
    expect(m.edgeFunctions).toBe(8);
    expect(m.sharedServices).toBeGreaterThanOrEqual(12);
    expect(m.products).toBeGreaterThanOrEqual(3);
    expect(m.reusableAssets).toBeGreaterThan(0);
    expect(m.reusePct).toBeGreaterThan(0);
    expect(m.catalogCompletionPct).toBe(100);
    expect(["green", "yellow", "red", "unknown"]).toContain(m.enterpriseHealth);
  });
});

describe("global search", () => {
  const catalog = buildCatalog();

  it("returns nothing for an empty query", () => {
    expect(search(catalog, "   ")).toEqual([]);
  });

  it("finds Stripe via the billing webhook and surfaces related assets", () => {
    const hits = search(catalog, "stripe");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.asset.id === "fn.billing-webhook")).toBe(true);
    const top = hits[0]!;
    expect(top.related.length).toBeGreaterThan(0);
  });

  it("finds communications for 'notification'-adjacent terms", () => {
    expect(
      search(catalog, "communications").some((h) => h.asset.id.includes("comms")),
    ).toBe(true);
  });

  it("finds authentication/identity", () => {
    expect(
      search(catalog, "identity").some((h) => h.asset.kind === "shared_service"),
    ).toBe(true);
  });
});

describe("relationship graph", () => {
  const catalog = buildCatalog();

  it("derives incoming edges (used-by) for a shared service", () => {
    const n = neighborhood(catalog, "svc.identity");
    expect(n.incoming.length).toBeGreaterThan(0);
    expect(n.incoming.some((e) => e.inverseLabel === "used by")).toBe(true);
  });

  it("a product's outgoing edges resolve to real assets", () => {
    const n = neighborhood(catalog, "prod.hl-bti");
    expect(n.outgoing.length).toBeGreaterThan(3);
    for (const r of n.outgoing) {
      expect(catalog.assets.find((a) => a.id === r.to)).toBeTruthy();
    }
  });
});
