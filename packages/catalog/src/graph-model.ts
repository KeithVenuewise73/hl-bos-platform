/**
 * Enterprise Knowledge Graph — in-code model (Phase XI-2B).
 *
 * A deterministic, typed, scope-aware, READ-ONLY projection over the authoritative
 * registries that already exist (Enterprise Catalog, Capability Library, Module
 * Registry, Product Compositions, Application Registry). It formalizes and extends
 * the catalog's existing `Asset.relationships` / `RelationKind` / `INVERSE_RELATION`
 * graph — it is NOT a new store, a new source of truth, or an AI memory system.
 *
 * Writes continue to occur in the source registries; the graph is rebuilt from
 * them (`buildKnowledgeGraph`). Same sources → same graph.
 */

import type { RelationKind } from "./types";
import { INVERSE_RELATION } from "./types";

/** Node types — only those with real repository evidence are ever projected. */
export type NodeType =
  | "capability"
  | "module"
  | "product"
  | "application"
  | "service"
  | "schema"
  | "industry"
  | "business_unit"
  | "deployment"
  | "host"
  | "technology"
  | "repository"
  | "api"
  // Supported in the model, projected only where evidence exists (0 in this phase):
  | "customer"
  | "government_program"
  | "external_opportunity"
  | "acquisition_target";

export type Scope = "platform" | "tenant" | "opportunity";

export type NodeLifecycle =
  | "implemented"
  | "partial"
  | "planned"
  | "deprecated"
  | "live"
  | "reference"
  | "active";

/** The closed edge vocabulary: the catalog's RelationKind + the XI-2A additions. */
export type GraphEdgeKind =
  | RelationKind
  | "provided_by"
  | "composed_of"
  | "consolidates"
  | "alias_of"
  | "deployed_as"
  | "hosted_on"
  | "targets"
  | "built_with"
  | "requires"
  | "would_provide"
  | "maps_to";

/** Declared inverse for every edge kind (extends INVERSE_RELATION). */
export const GRAPH_INVERSE: Record<GraphEdgeKind, string> = {
  ...INVERSE_RELATION,
  provided_by: "provides",
  composed_of: "composed into",
  consolidates: "consolidated by",
  alias_of: "has alias",
  deployed_as: "deployment of",
  hosted_on: "hosts",
  targets: "targeted by",
  built_with: "used by",
  requires: "required by",
  would_provide: "would be provided by",
  maps_to: "mapped from",
};

/** Edge kinds whose graph must be acyclic (a build-order / reasoning guarantee). */
export const ACYCLIC_EDGE_KINDS: ReadonlySet<GraphEdgeKind> = new Set<GraphEdgeKind>([
  "depends_on",
  "composed_of",
  "provided_by",
]);

export interface GraphNode {
  id: string; // stable, `${type}:${key}`
  type: NodeType;
  canonicalName: string;
  displayName: string;
  lifecycle: NodeLifecycle;
  scope: Scope;
  evidence: string;
  sourceRegistry: string;
  verification: "verified" | "unverified";
  ownerRef: string | null; // business_unit node id, if known
  securityClassification: "public" | "internal" | "restricted";
  /** True when the node is a plan, not an operational asset. */
  planned: boolean;
}

export interface GraphEdge {
  /** Deterministic identity: `${from}|${kind}|${to}`. */
  id: string;
  from: string;
  kind: GraphEdgeKind;
  to: string;
  inverse: string;
  evidence: string;
  sourceSystem: string;
  scope: Scope;
  verification: "verified" | "unverified";
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Index for O(1) lookup; not part of equality. */
  byId: Map<string, GraphNode>;
}

export function edgeId(from: string, kind: GraphEdgeKind, to: string): string {
  return `${from}|${kind}|${to}`;
}

export function nodeId(type: NodeType, key: string): string {
  return `${type}:${key}`;
}
