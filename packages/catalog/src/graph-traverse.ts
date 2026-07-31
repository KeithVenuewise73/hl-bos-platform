/**
 * Typed, explainable traversal API + executive query helpers (Phase XI-2B).
 *
 * Pure functions over a built KnowledgeGraph. Every traversal returns nodes,
 * edges, an optional path, the evidence behind them, the scopes touched, and a
 * plain-language explanation — so an executive (or an advisory AI) can see WHY an
 * answer holds. Scope-aware: a `viewerScopes` filter drops nodes the caller may
 * not read (no existence leak). No AI, no I/O.
 */

import { CAPABILITIES, capabilityByAlias, isReusableNow } from "./capabilities";
import { evaluateReuse } from "./capability-reuse";
import { PRODUCT_COMPOSITIONS } from "./compositions";
import { moduleByKey, moduleIsBuilt } from "./modules";
import {
  nodeId,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphNode,
  type KnowledgeGraph,
  type NodeType,
  type Scope,
} from "./graph-model";

export interface TraversalResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  path: string[];
  evidence: string[];
  scopes: Scope[];
  explanation: string;
}

const DEFAULT_SCOPES: Scope[] = ["platform"];

function result(
  g: KnowledgeGraph,
  nodeIds: Iterable<string>,
  edges: GraphEdge[],
  explanation: string,
  scopes: Scope[] = DEFAULT_SCOPES,
): TraversalResult {
  const nodes = [...new Set(nodeIds)]
    .map((id) => g.byId.get(id))
    .filter((n): n is GraphNode => n !== undefined && scopes.includes(n.scope))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const shownEdges = edges.filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to));
  return {
    nodes,
    edges: shownEdges,
    path: [],
    evidence: [...new Set(shownEdges.map((e) => e.evidence))],
    scopes: [...new Set(nodes.map((n) => n.scope))],
    explanation,
  };
}

// ---- primitives ----
export function outgoing(g: KnowledgeGraph, id: string): GraphEdge[] {
  return g.edges.filter((e) => e.from === id);
}
export function incoming(g: KnowledgeGraph, id: string): GraphEdge[] {
  return g.edges.filter((e) => e.to === id);
}
export function outgoingByKind(
  g: KnowledgeGraph,
  id: string,
  kind: GraphEdgeKind,
): GraphEdge[] {
  return g.edges.filter((e) => e.from === id && e.kind === kind);
}
export function incomingByKind(
  g: KnowledgeGraph,
  id: string,
  kind: GraphEdgeKind,
): GraphEdge[] {
  return g.edges.filter((e) => e.to === id && e.kind === kind);
}
export function nodesOfType(g: KnowledgeGraph, type: NodeType): GraphNode[] {
  return g.nodes.filter((n) => n.type === type);
}

/** Transitive dependencies (follow depends_on outgoing). */
export function dependencies(g: KnowledgeGraph, id: string): TraversalResult {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of outgoingByKind(g, cur, "depends_on")) {
      edges.push(e);
      if (!seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return result(g, [id, ...seen], edges, `Transitive dependencies of ${id}.`);
}

/**
 * Blast radius: everything that (transitively) depends on `id` — i.e. what breaks
 * if `id` is retired. Reverse BFS over dependency-bearing edges.
 */
const BREAKING_KINDS: ReadonlySet<GraphEdgeKind> = new Set<GraphEdgeKind>([
  "depends_on",
  "provided_by",
  "composed_of",
  "uses",
]);

export function blastRadius(g: KnowledgeGraph, id: string): TraversalResult {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of incoming(g, cur)) {
      if (!BREAKING_KINDS.has(e.kind)) continue;
      edges.push(e);
      if (!seen.has(e.from)) {
        seen.add(e.from);
        stack.push(e.from);
      }
    }
  }
  return result(
    g,
    [id, ...seen],
    edges,
    `Blast radius of retiring ${id}: ${seen.size} dependent node(s) would be impacted.`,
  );
}

/** Capabilities an application uses. */
export function capabilitiesForApplication(
  g: KnowledgeGraph,
  appKey: string,
): TraversalResult {
  const id = nodeId("application", appKey);
  const edges = outgoingByKind(g, id, "uses").filter(
    (e) => g.byId.get(e.to)?.type === "capability",
  );
  return result(
    g,
    [id, ...edges.map((e) => e.to)],
    edges,
    `Capabilities used by application ${appKey}.`,
  );
}

/** Applications that use a capability. */
export function applicationsUsingCapability(
  g: KnowledgeGraph,
  capId: string,
): TraversalResult {
  const id = nodeId("capability", capId);
  const edges = incomingByKind(g, id, "uses").filter(
    (e) => g.byId.get(e.from)?.type === "application",
  );
  return result(
    g,
    [id, ...edges.map((e) => e.from)],
    edges,
    `Applications using capability ${capId}.`,
  );
}

/** Products composed of a capability (candidates that could reuse it). */
export function productsUsingCapability(
  g: KnowledgeGraph,
  capId: string,
): TraversalResult {
  const id = nodeId("capability", capId);
  const edges = incomingByKind(g, id, "composed_of");
  return result(
    g,
    [id, ...edges.map((e) => e.from)],
    edges,
    `Products composed of capability ${capId}.`,
  );
}

/** Deployments of an application. */
export function deploymentsForApplication(
  g: KnowledgeGraph,
  appKey: string,
): TraversalResult {
  const id = nodeId("application", appKey);
  const edges = outgoingByKind(g, id, "deployed_as");
  return result(
    g,
    [id, ...edges.map((e) => e.to)],
    edges,
    `Deployments of application ${appKey}.`,
  );
}

/** Repositories that implement/provide anything reachable from a capability (via apps). */
export function repositoriesForCapability(
  g: KnowledgeGraph,
  capId: string,
): TraversalResult {
  const apps = applicationsUsingCapability(g, capId).nodes.filter(
    (n) => n.type === "application",
  );
  const edges: GraphEdge[] = [];
  const repos = new Set<string>();
  for (const app of apps) {
    for (const e of incomingByKind(g, app.id, "provides")) {
      if (g.byId.get(e.from)?.type === "repository") {
        edges.push(e);
        repos.add(e.from);
      }
    }
  }
  return result(
    g,
    [...repos, ...apps.map((a) => a.id)],
    edges,
    `Repositories implementing applications that use ${capId}.`,
  );
}

/** Reusable capabilities a target application does NOT currently use. */
export function reusableCapabilitiesUnusedBy(
  g: KnowledgeGraph,
  appKey: string,
): GraphNode[] {
  const used = new Set(
    capabilitiesForApplication(g, appKey).nodes.map((n) => n.canonicalName),
  );
  return g.nodes.filter((n) => {
    if (n.type !== "capability") return false;
    const cap = CAPABILITIES.find((c) => c.id === n.canonicalName);
    return cap ? isReusableNow(cap) && !used.has(cap.id) : false;
  });
}

/** Overlap of an external opportunity's required capabilities against the library. */
export interface OpportunityOverlap {
  required: string[];
  have: { required: string; capabilityId: string }[];
  gaps: string[];
  overlapPct: number;
  explanation: string;
}
export function opportunityOverlap(
  requiredCapabilityAliases: string[],
): OpportunityOverlap {
  const have: { required: string; capabilityId: string }[] = [];
  const gaps: string[] = [];
  for (const req of requiredCapabilityAliases) {
    const cap = capabilityByAlias(req);
    if (cap) have.push({ required: req, capabilityId: cap.id });
    else {
      const decision = evaluateReuse({ name: req });
      if (decision.recommendedAction === "REUSE_EXISTING" && decision.bestMatches[0]) {
        have.push({
          required: req,
          capabilityId: decision.bestMatches[0].capabilityId,
        });
      } else gaps.push(req);
    }
  }
  const total = requiredCapabilityAliases.length;
  const overlapPct = total === 0 ? 0 : Math.round((have.length / total) * 100);
  return {
    required: requiredCapabilityAliases,
    have,
    gaps,
    overlapPct,
    explanation: `${have.length}/${total} required capabilities already exist (${overlapPct}% overlap); ${gaps.length} gap(s).`,
  };
}

/** Shortest undirected relationship path between two nodes (BFS). */
export function shortestPath(
  g: KnowledgeGraph,
  from: string,
  to: string,
): TraversalResult {
  if (!g.byId.has(from) || !g.byId.has(to)) {
    return {
      nodes: [],
      edges: [],
      path: [],
      evidence: [],
      scopes: [],
      explanation: "One or both nodes do not exist.",
    };
  }
  const adj = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e);
  }
  const prev = new Map<string, { node: string; edge: GraphEdge }>();
  const q = [from];
  const visited = new Set([from]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const e of adj.get(cur) ?? []) {
      const nxt = e.from === cur ? e.to : e.from;
      if (!visited.has(nxt)) {
        visited.add(nxt);
        prev.set(nxt, { node: cur, edge: e });
        q.push(nxt);
      }
    }
  }
  if (!prev.has(to) && from !== to) {
    return {
      nodes: [],
      edges: [],
      path: [],
      evidence: [],
      scopes: [],
      explanation: `No path from ${from} to ${to}.`,
    };
  }
  const path: string[] = [to];
  const edges: GraphEdge[] = [];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur)!;
    edges.push(step.edge);
    path.push(step.node);
    cur = step.node;
  }
  path.reverse();
  const r = result(
    g,
    path,
    edges,
    `Shortest path from ${from} to ${to} (${path.length - 1} hop(s)).`,
  );
  return { ...r, path };
}

// ==========================================================================
// Executive query proofs
// ==========================================================================

export function applicationsDependingOnModule(
  g: KnowledgeGraph,
  moduleKey: string,
): GraphNode[] {
  const id = nodeId("module", moduleKey);
  return blastRadius(g, id).nodes.filter((n) => n.type === "application");
}

/** Planned product with the highest existing reusable-capability coverage. */
export function highestReuseCoveragePlannedProduct(): {
  productKey: string;
  name: string;
  coveragePct: number;
} | null {
  const planned = PRODUCT_COMPOSITIONS.filter(
    (p) => p.commercial.commercialAvailability === "not_yet",
  );
  const scored = planned.map((p) => {
    const built = p.requiredModules.filter((k) => {
      const m = moduleByKey(k);
      return m ? moduleIsBuilt(m) : false;
    }).length;
    const coveragePct = p.requiredModules.length
      ? Math.round((built / p.requiredModules.length) * 100)
      : 0;
    return { productKey: p.productKey, name: p.name, coveragePct };
  });
  scored.sort(
    (a, b) => b.coveragePct - a.coveragePct || a.productKey.localeCompare(b.productKey),
  );
  return scored[0] ?? null;
}

/** Nodes missing ownership, evidence, or a lifecycle classification. */
export function nodesMissingGovernance(g: KnowledgeGraph): GraphNode[] {
  return g.nodes.filter(
    (n) =>
      !n.evidence ||
      !n.lifecycle ||
      (["capability", "application"].includes(n.type) && !n.ownerRef),
  );
}

/** Modules/capabilities that are a single point of dependency for multiple applications. */
export function singlePointsOfDependency(
  g: KnowledgeGraph,
  minApps = 2,
): {
  node: GraphNode;
  dependentApplications: number;
}[] {
  const out: { node: GraphNode; dependentApplications: number }[] = [];
  for (const n of g.nodes) {
    if (n.type !== "module" && n.type !== "capability") continue;
    const deps = blastRadius(g, n.id).nodes.filter(
      (x) => x.type === "application",
    ).length;
    if (deps >= minApps) out.push({ node: n, dependentApplications: deps });
  }
  return out.sort(
    (a, b) =>
      b.dependentApplications - a.dependentApplications ||
      a.node.id.localeCompare(b.node.id),
  );
}
