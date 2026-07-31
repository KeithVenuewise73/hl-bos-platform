import { describe, it, expect } from "vitest";
import { buildKnowledgeGraph } from "./graph-projection";
import {
  serializeGraph,
  projectionStatus,
  GRAPH_MODEL_VERSION,
} from "./graph-serialize";

const g = buildKnowledgeGraph();
const p = serializeGraph(g);

describe("graph projection serializer (in-code ↔ persistable parity)", () => {
  it("is deterministic (same graph → identical projection incl. checksum)", () => {
    expect(serializeGraph(g)).toEqual(p);
    expect(serializeGraph(buildKnowledgeGraph()).checksum).toBe(p.checksum);
  });

  it("counts match the in-code graph", () => {
    expect(p.nodeCount).toBe(g.nodes.length);
    expect(p.edgeCount).toBe(g.edges.length);
    expect(p.nodes.length).toBe(g.nodes.length);
    expect(p.edges.length).toBe(g.edges.length);
  });

  it("preserves node identity, type, lifecycle, scope, evidence", () => {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    for (const n of g.nodes) {
      const s = byId.get(n.id);
      expect(s).toBeDefined();
      expect(s!.type).toBe(n.type);
      expect(s!.lifecycle).toBe(n.lifecycle);
      expect(s!.scope).toBe(n.scope);
      expect(s!.evidence).toBe(n.evidence);
      expect(s!.planned).toBe(n.planned);
    }
  });

  it("preserves edge identity, kind, inverse, endpoints, scope", () => {
    const byId = new Map(p.edges.map((e) => [e.id, e]));
    for (const e of g.edges) {
      const s = byId.get(e.id);
      expect(s).toBeDefined();
      expect(s!.kind).toBe(e.kind);
      expect(s!.inverse).toBe(e.inverse);
      expect(s!.from).toBe(e.from);
      expect(s!.to).toBe(e.to);
      expect(s!.scope).toBe(e.scope);
    }
  });

  it("carries integrity + model version; evidence retained on all rows", () => {
    expect(p.integrityOk).toBe(true);
    expect(p.graphModelVersion).toBe(GRAPH_MODEL_VERSION);
    for (const n of p.nodes) expect(n.evidence).toBeTruthy();
    for (const e of p.edges) expect(e.evidence).toBeTruthy();
  });

  it("a changed graph changes the checksum (drift is detectable)", () => {
    const mutated = {
      ...g,
      nodes: g.nodes.map((n, i) =>
        i === 0 ? { ...n, lifecycle: "deprecated" as const } : n,
      ),
    };
    expect(serializeGraph(mutated).checksum).not.toBe(p.checksum);
  });

  it("projectionStatus reports the in-code projection honestly", () => {
    const s = projectionStatus();
    expect(s.nodeCount).toBe(g.nodes.length);
    expect(s.integrityOk).toBe(true);
    expect(s.checksum).toBe(p.checksum);
  });
});
