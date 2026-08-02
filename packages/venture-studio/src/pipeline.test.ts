import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_CONNECTORS,
  OPPORTUNITY_CONNECTOR_KEYS,
  connectorFor,
  isConnectorKey,
  RELATIONSHIP_TYPES,
  isRelationshipType,
  detectDuplicates,
  computePriority,
  assembleDiscovery,
} from "./pipeline";

describe("connector registry", () => {
  it("covers the eleven external sources with unique keys", () => {
    expect(OPPORTUNITY_CONNECTORS.length).toBe(11);
    expect(new Set(OPPORTUNITY_CONNECTORS.map((c) => c.key)).size).toBe(11);
    expect(OPPORTUNITY_CONNECTORS.map((c) => c.key)).toEqual([
      ...OPPORTUNITY_CONNECTOR_KEYS,
    ]);
  });
  it("every connector is stubbed and maps to a program (no live connector yet)", () => {
    for (const c of OPPORTUNITY_CONNECTORS) {
      expect(c.status).toBe("stubbed");
      expect(c.program).toBeTruthy();
    }
  });
  it("resolves + guards keys", () => {
    expect(connectorFor("github")?.name).toBe("GitHub");
    expect(isConnectorKey("flippa")).toBe(true);
    expect(isConnectorKey("nope")).toBe(false);
  });
});

describe("relationship vocabulary", () => {
  it("matches the DB enum set", () => {
    expect(RELATIONSHIP_TYPES).toContain("duplicate_of");
    expect(isRelationshipType("supersedes")).toBe(true);
    expect(isRelationshipType("x")).toBe(false);
  });
});

describe("detectDuplicates", () => {
  it("scores strong overlap as a duplicate suggestion and is deterministic", () => {
    const a = detectDuplicates(
      { title: "AI clip tagging for hockey coaches", summary: "auto tag game film" },
      [
        {
          id: "o1",
          title: "AI clip tagging for hockey coaches",
          summary: "auto tag game film",
        },
        { id: "o2", title: "Unrelated grant portal", summary: "government forms" },
      ],
    );
    expect(a[0]?.opportunityId).toBe("o1");
    expect(a[0]?.suggestedType).toBe("duplicate_of");
    // determinism
    const b = detectDuplicates(
      { title: "AI clip tagging for hockey coaches", summary: "auto tag game film" },
      [
        {
          id: "o1",
          title: "AI clip tagging for hockey coaches",
          summary: "auto tag game film",
        },
      ],
    );
    expect(b[0]?.score).toBe(a[0]?.score);
  });
  it("drops weak matches below threshold", () => {
    const r = detectDuplicates({ title: "alpha beta gamma" }, [
      { id: "x", title: "completely different words here" },
    ]);
    expect(r.length).toBe(0);
  });
});

describe("computePriority", () => {
  it("ranks a high-reuse, evaluated, build-recommended opportunity as 'now'", () => {
    const p = computePriority({
      reuseScore: 90,
      evidenceCount: 3,
      hasVerifiedEvidence: true,
      evaluationComposite: 85,
      recommendation: "build",
    });
    expect(p.tier).toBe("now");
    expect(p.score).toBeGreaterThanOrEqual(75);
  });
  it("ranks a weak, unevaluated, ignore-recommended opportunity low", () => {
    const p = computePriority({
      reuseScore: 5,
      evidenceCount: 0,
      hasVerifiedEvidence: false,
      evaluationComposite: null,
      recommendation: "ignore",
    });
    expect(["later", "watch"]).toContain(p.tier);
    expect(p.score).toBeLessThan(50);
  });
  it("clamps to 0..100", () => {
    const p = computePriority({
      reuseScore: 100,
      evidenceCount: 100,
      hasVerifiedEvidence: true,
      evaluationComposite: 100,
      recommendation: "build",
    });
    expect(p.score).toBeLessThanOrEqual(100);
  });
});

describe("assembleDiscovery", () => {
  it("produces the ten fields with a NON-authoritative recommendation and honest estimates", () => {
    const d = assembleDiscovery({
      source: "github",
      title: "Open-source invoice OCR",
      summary: "extract line items from PDF invoices",
      url: "https://github.com/example/repo",
    });
    expect(d.source).toBe("github");
    expect(d.url).toBe("https://github.com/example/repo");
    expect(d.recommendation.authoritative).toBe(false);
    // never fabricates a number
    expect(d.estimatedBuildEffort.status).toBe("unknown");
    expect(d.estimatedBuildEffort.value).toBeNull();
    expect(d.estimatedRevenuePotential.status).toBe("unknown");
    expect(d.category).toBe("code");
  });
});
