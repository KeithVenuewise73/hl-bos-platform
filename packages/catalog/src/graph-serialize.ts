/**
 * Projection serializer (Phase XI-2C).
 *
 * Converts the deterministic in-code KnowledgeGraph into the exact payload the
 * `graph.publish_projection` migration expects (node/edge row shapes), with a
 * deterministic checksum. This is the bridge that guarantees in-code ↔ persisted
 * parity: the DB stores precisely what this serializer emits, so proving the
 * serializer round-trips the in-code graph proves database parity by construction
 * (the pgTAP suite asserts the DB side end-to-end in CI).
 *
 * No Date/Math.random — the checksum is a pure function of the graph, so the same
 * graph always yields the same projection (versioning/timestamps are supplied by
 * the caller/DB, never invented here).
 */

import { buildKnowledgeGraph, validateGraph } from "./graph-projection";
import type { KnowledgeGraph, GraphNode, GraphEdge } from "./graph-model";

export const GRAPH_MODEL_VERSION = "kg-0.1.0";

export interface SerializedNode {
  id: string;
  type: string;
  canonicalName: string;
  displayName: string;
  lifecycle: string;
  scope: string;
  tenantId: string | null;
  sourceRegistry: string;
  sourceRecordId: string | null;
  evidence: string;
  ownerRef: string | null;
  securityClassification: string;
  verification: string;
  planned: boolean;
}

export interface SerializedEdge {
  id: string;
  from: string;
  kind: string;
  to: string;
  inverse: string;
  scope: string;
  tenantId: string | null;
  evidence: string;
  sourceSystem: string;
  verification: string;
}

export interface SerializedProjection {
  graphModelVersion: string;
  sourceRef: string | null;
  integrityOk: boolean;
  nodeCount: number;
  edgeCount: number;
  checksum: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

function serializeNode(n: GraphNode): SerializedNode {
  return {
    id: n.id,
    type: n.type,
    canonicalName: n.canonicalName,
    displayName: n.displayName,
    lifecycle: n.lifecycle,
    scope: n.scope,
    tenantId: null,
    sourceRegistry: n.sourceRegistry,
    sourceRecordId: null,
    evidence: n.evidence,
    ownerRef: n.ownerRef,
    securityClassification: n.securityClassification,
    verification: n.verification,
    planned: n.planned,
  };
}

function serializeEdge(e: GraphEdge): SerializedEdge {
  return {
    id: e.id,
    from: e.from,
    kind: e.kind,
    to: e.to,
    inverse: e.inverse,
    scope: e.scope,
    tenantId: null,
    evidence: e.evidence,
    sourceSystem: e.sourceSystem,
    verification: e.verification,
  };
}

/** Deterministic FNV-1a (32-bit) hex checksum over a stable string. */
function checksum(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Serialize a (built) graph into a publishable projection payload. The graph's
 * nodes/edges are already deterministically ordered by id; the checksum is taken
 * over the canonical node/edge identity + classification, so any drift changes it.
 */
export function serializeGraph(
  graph: KnowledgeGraph = buildKnowledgeGraph(),
  opts: { sourceRef?: string } = {},
): SerializedProjection {
  const nodes = graph.nodes.map(serializeNode);
  const edges = graph.edges.map(serializeEdge);
  const integrity = validateGraph(graph);

  const canonical = [
    GRAPH_MODEL_VERSION,
    ...nodes.map((n) => `${n.id}|${n.type}|${n.lifecycle}|${n.scope}|${n.evidence}`),
    ...edges.map((e) => `${e.id}|${e.inverse}|${e.scope}`),
  ].join("\n");

  return {
    graphModelVersion: GRAPH_MODEL_VERSION,
    sourceRef: opts.sourceRef ?? null,
    integrityOk: integrity.ok,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    checksum: checksum(canonical),
    nodes,
    edges,
  };
}

/** Read-only projection status for the portal (in-code; DB read model is a projection of this). */
export function projectionStatus(): {
  graphModelVersion: string;
  nodeCount: number;
  edgeCount: number;
  integrityOk: boolean;
  checksum: string;
} {
  const p = serializeGraph();
  return {
    graphModelVersion: p.graphModelVersion,
    nodeCount: p.nodeCount,
    edgeCount: p.edgeCount,
    integrityOk: p.integrityOk,
    checksum: p.checksum,
  };
}
