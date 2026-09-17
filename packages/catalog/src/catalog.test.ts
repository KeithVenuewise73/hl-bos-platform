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

  it("registers the 21 application databases and 10 edge functions", () => {
    expect(assetsByKind(catalog, "database").length).toBe(21);
    expect(assetsByKind(catalog, "edge_function").length).toBe(10);
  });

  it("groups only non-empty kinds", () => {
    for (const g of groupByKind(catalog)) expect(g.assets.length).toBeGreaterThan(0);
  });
});

describe("repository scan (ground truth)", () => {
  it("discovers the real schemas, functions, apps and packages", async () => {
    const inv = await scanRepository(REPO_ROOT);
    expect(inv.schemas.length).toBe(21);
    expect(inv.schemas).toContain("hlvs");
    expect(inv.schemas).toContain("social");
    expect(inv.schemas).toContain("bti");
    expect(inv.schemas).toContain("intake");
    expect(inv.tables).toBeGreaterThanOrEqual(120);
    // 45 migration files on disk: 0029 (venture-studio foundation) + 0030 (CEO
    // Notebook — written, UNAPPLIED pending CEO approval) + 0031 (Business
    // Transformation intake — written, UNAPPLIED pending CEO approval) + 0032
    // (discovery metadata) + 0033 (intelligence layer) + 0034 (Level-1 triage)
    // + 0035 (portfolio building) + 0036 (rising / observations) + 0037 (pain
    // clustering) + 0038 (analysis levels) — those six additive and applied to
    // production under CEO approval — plus 0039 (provable intelligence gate)
    // and 0040 (pain source_url whitespace) — all applied to production under
    // CEO approval — plus 0041 (source-neutral pain/need discovery), 0042
    // (GitHub pain evidence backfill), 0043 + 0044 (capability intelligence and
    // its generated extraction) and 0045 (pain portfolio reframed to name its
    // population), applied under the Phase A / B / H approval — plus 0046
    // (HL Social publishing, Phase 1: owned-channel publishing with an
    // approval gate, per-target fan-out and an append-only attempt log),
    // APPLIED to canonical production on 2026-08-26 under CEO approval, with
    // 0047 (forward-repair pinning search_path on
    // social.deny_attempt_mutation — the post-apply advisor check caught it
    // and the local suite had not).
    // Plus 0048 (ats — ATS Resume Optimizer), 17 tables with RLS enabled and
    // forced, 68 policies and the anti-fabrication CHECK constraints — APPLIED
    // to canonical production as version 20260916190643 (this comment used to
    // say "UNAPPLIED to any project", which the live migration ledger
    // contradicts).
    // Plus 0049–0052 (BarberOS: capability catalog, shop + owned website,
    // client CRM, public API). These are a RECONSTRUCTION of a schema that was
    // built directly against production between 2026-09-09 and 2026-09-13 and
    // never committed — production carries it as eleven differently-named
    // migrations. They are already applied there and must not be re-applied;
    // they exist so the repository is true, so CI can prove the schema applies
    // from empty, and so supabase/tests/49_barberos.sql has something to test.
    // The reconstruction was verified byte-for-byte against production across
    // twelve structural fingerprint categories. See
    // docs/products/barberos/02-production-drift-map.md.
    // Plus 0053-0054 (transform_audit: the pre-sale diagnostic engine, and the
    // discovery call and proposal that follow it) — the second half of the same
    // reconstruction, applied in production as hlbos_0049_transform_audit,
    // 0050_citext_guard_semantics, 0051_unknown_is_not_complete,
    // 0054_discovery_call and 0055_proposal.
    // Plus 0055 (barberos_audit public API) — the first migration in this
    // sequence that is NEW WORK rather than a reconstruction. It existed
    // because transform_audit had 27 functions and zero public RPCs, so the 40
    // audit runs recorded in production could not be read by any application.
    // APPLIED to canonical production on 2026-09-17 under CEO approval, as
    // version 20260917212122, with two forward repairs (r01, r02) for the
    // in-body comment parity the body fingerprint caught.
    // Plus 0056 (barberos cockpit API) — also NEW WORK, and UNAPPLIED
    // anywhere, pending CEO approval. Purely additive: nine public wrappers
    // plus two schema functions, no table, column, constraint, policy or grant
    // altered. It closes the middle of the workflow, which 0049–0055 left
    // unreachable: the capability catalog had no public read, barberos.
    // upsert_shop and platform.provision_tenant were granted to authenticated
    // but never wrapped, and there was no single read of the pipeline.
    expect(inv.migrations.length).toBe(56);
    expect(inv.schemas).toContain("barberos");
    expect(inv.schemas).toContain("transform_audit");
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
    expect(m.databases).toBe(21);
    expect(m.edgeFunctions).toBe(10);
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
