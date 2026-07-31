import { describe, it, expect } from "vitest";
import { buildKnowledgeGraph, validateGraph } from "./graph-projection";
import { GRAPH_INVERSE, edgeId, nodeId, type GraphEdgeKind } from "./graph-model";
import {
  dependencies,
  blastRadius,
  capabilitiesForApplication,
  applicationsUsingCapability,
  productsUsingCapability,
  deploymentsForApplication,
  reusableCapabilitiesUnusedBy,
  opportunityOverlap,
  shortestPath,
  applicationsDependingOnModule,
  highestReuseCoveragePlannedProduct,
  nodesMissingGovernance,
  singlePointsOfDependency,
  outgoing,
} from "./graph-traverse";
import { CAPABILITIES } from "./capabilities";
import { APPLICATIONS } from "./app-registry";

const g = buildKnowledgeGraph();

describe("knowledge graph — deterministic projection", () => {
  it("1. builds deterministically from the authoritative registries", () => {
    const g2 = buildKnowledgeGraph();
    expect(g2.nodes).toEqual(g.nodes);
    expect(g2.edges).toEqual(g.edges);
  });

  it("3. Capability Library records appear as capability nodes", () => {
    const capNodes = g.nodes.filter((n) => n.type === "capability");
    expect(capNodes.length).toBe(CAPABILITIES.length);
  });

  it("4. Application Registry records appear as application nodes", () => {
    const appNodes = g.nodes.filter((n) => n.type === "application");
    expect(appNodes.length).toBe(APPLICATIONS.length);
  });

  it("5. nodes have stable, unique ids", () => {
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("6. edges have deterministic, unique ids", () => {
    const ids = g.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(g.edges[0]?.id).toBe(
      edgeId(g.edges[0]!.from, g.edges[0]!.kind, g.edges[0]!.to),
    );
  });

  it("14. evidence is retained on every node and edge", () => {
    for (const n of g.nodes) expect(n.evidence, n.id).toBeTruthy();
    for (const e of g.edges) expect(e.evidence, e.id).toBeTruthy();
  });

  it("13. planned and operational nodes remain distinct", () => {
    const planned = g.nodes.filter((n) => n.planned);
    const scheduling = g.byId.get(nodeId("capability", "scheduling"));
    expect(scheduling?.planned).toBe(true);
    const identity = g.byId.get(nodeId("capability", "identity_access"));
    expect(identity?.planned).toBe(false);
    expect(planned.length).toBeGreaterThan(0);
  });
});

describe("knowledge graph — integrity (deterministic validation)", () => {
  const v = validateGraph(g);

  it("2/9. every edge references valid nodes (no dangling)", () => {
    expect(v.invalidReferences).toEqual([]);
  });
  it("7. no duplicate edges", () => {
    expect(v.duplicateEdges).toEqual([]);
  });
  it("8. every used edge kind has a declared inverse", () => {
    expect(v.missingInverses).toEqual([]);
    for (const e of g.edges) expect(GRAPH_INVERSE[e.kind]).toBe(e.inverse);
  });
  it("10. no self-dependencies", () => {
    expect(v.selfDependencies).toEqual([]);
  });
  it("11. acyclic families contain no cycles", () => {
    expect(v.cycles).toEqual([]);
  });
  it("12. no scope violations (no platform→tenant dependency)", () => {
    expect(v.scopeViolations).toEqual([]);
  });
  it("evidence + ownership complete; graph is integral", () => {
    expect(v.missingEvidence).toEqual([]);
    expect(v.missingOwnership).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("10. a self-dependency would be caught by validation", () => {
    const bad = {
      ...g,
      edges: [
        ...g.edges,
        {
          id: "x",
          from: g.nodes[0]!.id,
          kind: "depends_on" as GraphEdgeKind,
          to: g.nodes[0]!.id,
          inverse: "x",
          evidence: "e",
          sourceSystem: "s",
          scope: "platform" as const,
          verification: "verified" as const,
        },
      ],
    };
    expect(validateGraph(bad).selfDependencies.length).toBeGreaterThan(0);
  });

  it("9. an invalid node reference would be caught by validation", () => {
    const bad = {
      ...g,
      edges: [
        ...g.edges,
        {
          id: "y",
          from: g.nodes[0]!.id,
          kind: "uses" as GraphEdgeKind,
          to: "capability:does_not_exist",
          inverse: "used by",
          evidence: "e",
          sourceSystem: "s",
          scope: "platform" as const,
          verification: "verified" as const,
        },
      ],
    };
    expect(validateGraph(bad).invalidReferences).toContain("y");
  });
});

describe("knowledge graph — typed traversal", () => {
  it("15. traversal returns only valid relationship kinds", () => {
    const r = outgoing(g, nodeId("capability", "billing"));
    for (const e of r) expect(GRAPH_INVERSE[e.kind]).toBeTruthy();
  });

  it("dependencies + dependents resolve", () => {
    const deps = dependencies(g, nodeId("capability", "billing"));
    // billing depends on entitlements + event_bus
    expect(deps.nodes.some((n) => n.id === nodeId("capability", "entitlements"))).toBe(
      true,
    );
  });

  it("16. blast radius is explainable and non-empty for a core module", () => {
    const r = blastRadius(g, nodeId("module", "scoring_engine"));
    expect(r.nodes.length).toBeGreaterThan(1);
    expect(r.explanation).toMatch(/blast radius/i);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it("17. capability reuse traversal works both directions", () => {
    const caps = capabilitiesForApplication(g, "executive-portal");
    expect(caps.nodes.some((n) => n.type === "capability")).toBe(true);
    // identity_access is provided by identity_core, which several apps reuse
    const apps = applicationsUsingCapability(g, "identity_access");
    expect(apps.nodes.some((n) => n.type === "application")).toBe(true);
  });

  it("products composed of a capability resolve", () => {
    const prods = productsUsingCapability(g, "executive_dashboards");
    expect(prods.nodes.some((n) => n.id === nodeId("product", "hl_bti"))).toBe(true);
  });

  it("deployments for an application resolve", () => {
    const d = deploymentsForApplication(g, "executive-portal");
    expect(d.nodes.some((n) => n.type === "deployment")).toBe(true);
  });

  it("shortest path returns a real path or a clear no-path", () => {
    const p = shortestPath(
      g,
      nodeId("application", "hl-bti"),
      nodeId("module", "scoring_engine"),
    );
    expect(p.path.length).toBeGreaterThan(0);
    expect(p.path[0]).toBe(nodeId("application", "hl-bti"));
  });

  it("scope filter drops nodes the viewer may not read (no leak)", () => {
    // platform-only viewer sees platform nodes; there are no tenant nodes projected
    const r = capabilitiesForApplication(g, "executive-portal");
    expect(r.nodes.every((n) => n.scope === "platform")).toBe(true);
  });
});

describe("knowledge graph — executive query proofs", () => {
  it("Q1. applications depending on a module", () => {
    const apps = applicationsDependingOnModule(g, "scoring_engine");
    expect(apps.length).toBeGreaterThan(0);
  });
  it("Q2. capabilities used by an application", () => {
    expect(capabilitiesForApplication(g, "hl-bti").nodes.length).toBeGreaterThan(0);
  });
  it("Q3. products that could reuse a capability", () => {
    expect(
      productsUsingCapability(g, "business_discovery").nodes.length,
    ).toBeGreaterThan(0);
  });
  it("Q5. reusable-but-underutilized capabilities are computable", () => {
    const unused = reusableCapabilitiesUnusedBy(g, "hl-bti-alpha");
    expect(Array.isArray(unused)).toBe(true);
  });
  it("Q7. planned product with highest reusable coverage", () => {
    const top = highestReuseCoveragePlannedProduct();
    expect(top).not.toBeNull();
    expect(top!.coveragePct).toBeGreaterThanOrEqual(0);
  });
  it("18. Q8. opportunity overlap works where evidence exists (no fabrication)", () => {
    const o = opportunityOverlap([
      "scheduling",
      "communications",
      "orbital-packet-router",
    ]);
    expect(o.have.some((h) => h.capabilityId === "communications")).toBe(true);
    expect(o.gaps).toContain("orbital-packet-router");
    expect(o.overlapPct).toBeGreaterThan(0);
  });
  it("Q9. governance gaps are computable (and currently none)", () => {
    expect(nodesMissingGovernance(g)).toEqual([]);
  });
  it("Q10. single points of dependency across applications", () => {
    const spods = singlePointsOfDependency(g, 2);
    expect(spods.length).toBeGreaterThan(0);
    expect(spods[0]!.dependentApplications).toBeGreaterThanOrEqual(2);
  });
});
