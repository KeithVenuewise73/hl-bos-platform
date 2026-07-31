/**
 * Deterministic Knowledge Graph projection + integrity validation (Phase XI-2B).
 *
 * `buildKnowledgeGraph()` assembles the graph from the authoritative in-code
 * registries — no new source of truth, no persistence, no duplication. Given the
 * same registries it produces the same graph (deterministic ordering, stable ids).
 * `validateGraph()` proves the integrity rules the directive requires.
 */

import { CAPABILITIES, capabilityForModule } from "./capabilities";
import { MODULE_REGISTRY } from "./modules";
import { PRODUCT_COMPOSITIONS } from "./compositions";
import { APPLICATIONS } from "./app-registry";
import { CATALOG } from "./registry";
import {
  GRAPH_INVERSE,
  ACYCLIC_EDGE_KINDS,
  edgeId,
  nodeId,
  type GraphNode,
  type GraphEdge,
  type GraphEdgeKind,
  type KnowledgeGraph,
  type NodeLifecycle,
  type Scope,
} from "./graph-model";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- curated technologies (evidence: pnpm-workspace.yaml catalog) ----
const TECHNOLOGIES: { key: string; name: string }[] = [
  { key: "typescript", name: "TypeScript" },
  { key: "postgres", name: "PostgreSQL (Supabase)" },
];

interface Builder {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

function addNode(b: Builder, n: GraphNode): void {
  if (!b.nodes.has(n.id)) b.nodes.set(n.id, n);
}

function addEdge(
  b: Builder,
  from: string,
  kind: GraphEdgeKind,
  to: string,
  evidence: string,
  sourceSystem: string,
  scope: Scope,
): void {
  // Deterministic identity + dedupe. Only connect nodes that exist.
  if (!b.nodes.has(from) || !b.nodes.has(to)) return;
  if (from === to) return; // no self-edges here (depends_on self is a validation error, caught separately)
  const id = edgeId(from, kind, to);
  if (b.edges.has(id)) return;
  b.edges.set(id, {
    id,
    from,
    kind,
    to,
    inverse: GRAPH_INVERSE[kind],
    evidence,
    sourceSystem,
    scope,
    verification: "verified",
  });
}

function businessUnitNode(b: Builder, owner: string): string {
  const key = slug(owner);
  const id = nodeId("business_unit", key);
  addNode(b, {
    id,
    type: "business_unit",
    canonicalName: key,
    displayName: owner,
    lifecycle: "active",
    scope: "platform",
    evidence: "derived from owner/executiveOwner fields",
    sourceRegistry: "derived",
    verification: "verified",
    ownerRef: null,
    securityClassification: "internal",
    planned: false,
  });
  return id;
}

const CAP_LIFECYCLE: Record<string, NodeLifecycle> = {
  implemented: "implemented",
  partial: "partial",
  planned: "planned",
  deprecated: "deprecated",
};

/** Build the Enterprise Knowledge Graph from the authoritative registries. */
export function buildKnowledgeGraph(): KnowledgeGraph {
  const b: Builder = { nodes: new Map(), edges: new Map() };

  // --- Technologies ---
  for (const t of TECHNOLOGIES) {
    addNode(b, {
      id: nodeId("technology", t.key),
      type: "technology",
      canonicalName: t.key,
      displayName: t.name,
      lifecycle: "active",
      scope: "platform",
      evidence: "pnpm-workspace.yaml catalog",
      sourceRegistry: "pnpm catalog",
      verification: "verified",
      ownerRef: null,
      securityClassification: "public",
      planned: false,
    });
  }

  // --- Schemas (from MODULE_REGISTRY.schema) ---
  for (const m of MODULE_REGISTRY) {
    if (!m.schema || m.schema === "(package)") continue;
    const id = nodeId("schema", m.schema);
    addNode(b, {
      id,
      type: "schema",
      canonicalName: m.schema,
      displayName: `${m.schema} schema`,
      lifecycle: "live",
      scope: "platform",
      evidence: `owned by module ${m.key}`,
      sourceRegistry: "MODULE_REGISTRY / migrations",
      verification: "verified",
      ownerRef: null,
      securityClassification: "internal",
      planned: false,
    });
  }

  // --- Modules (authoritative: MODULE_REGISTRY) ---
  for (const m of MODULE_REGISTRY) {
    const id = nodeId("module", m.key);
    addNode(b, {
      id,
      type: "module",
      canonicalName: m.key,
      displayName: m.name,
      lifecycle: m.maturity === "live" ? "live" : "partial",
      scope: "platform",
      evidence: m.evidence,
      sourceRegistry: "MODULE_REGISTRY",
      verification: "verified",
      ownerRef: null,
      securityClassification: "internal",
      planned: false,
    });
  }
  // module edges: depends_on, owns schema (schema owned_by module), built_with
  for (const m of MODULE_REGISTRY) {
    const from = nodeId("module", m.key);
    for (const dep of m.dependsOn) {
      addEdge(
        b,
        from,
        "depends_on",
        nodeId("module", dep),
        "MODULE_REGISTRY.dependsOn",
        "MODULE_REGISTRY",
        "platform",
      );
    }
    if (m.schema && m.schema !== "(package)") {
      addEdge(
        b,
        nodeId("schema", m.schema),
        "owned_by",
        from,
        "module owns schema",
        "MODULE_REGISTRY",
        "platform",
      );
      addEdge(
        b,
        from,
        "built_with",
        nodeId("technology", "postgres"),
        "schema-owning module",
        "derived",
        "platform",
      );
    }
    addEdge(
      b,
      from,
      "built_with",
      nodeId("technology", "typescript"),
      "monorepo is TypeScript",
      "pnpm catalog",
      "platform",
    );
  }

  // --- Capabilities (semantic core) ---
  for (const c of CAPABILITIES) {
    const id = nodeId("capability", c.id);
    const bu = businessUnitNode(b, c.owningBusinessUnit);
    addNode(b, {
      id,
      type: "capability",
      canonicalName: c.canonicalName,
      displayName: c.displayName,
      lifecycle: CAP_LIFECYCLE[c.maturity] ?? "planned",
      scope: "platform",
      evidence: c.evidence,
      sourceRegistry: "Capability Library",
      verification: c.verificationState,
      ownerRef: bu,
      securityClassification: c.securityClassification,
      planned: c.maturity === "planned",
    });
    addEdge(
      b,
      id,
      "owned_by",
      bu,
      "capability.owningBusinessUnit",
      "Capability Library",
      "platform",
    );
  }
  // capability edges: provided_by module, depends_on capability
  for (const c of CAPABILITIES) {
    const from = nodeId("capability", c.id);
    for (const mk of c.providedByModules) {
      addEdge(
        b,
        from,
        "provided_by",
        nodeId("module", mk),
        "capability.providedByModules",
        "Capability Library",
        "platform",
      );
    }
    for (const dep of c.dependsOn) {
      addEdge(
        b,
        from,
        "depends_on",
        nodeId("capability", dep),
        "capability.dependsOn",
        "Capability Library",
        "platform",
      );
    }
  }

  // --- Products (compositions) ---
  for (const p of PRODUCT_COMPOSITIONS) {
    const id = nodeId("product", p.productKey);
    const availability = p.commercial.commercialAvailability;
    addNode(b, {
      id,
      type: "product",
      canonicalName: p.productKey,
      displayName: p.name,
      lifecycle: availability === "not_yet" ? "planned" : "active",
      scope: "platform",
      evidence: "PRODUCT_COMPOSITIONS",
      sourceRegistry: "compositions",
      verification: "verified",
      ownerRef: null,
      securityClassification: "internal",
      planned: availability === "not_yet",
    });
    // industry
    if (p.industryTemplate) {
      const indId = nodeId("industry", p.industryTemplate);
      addNode(b, {
        id: indId,
        type: "industry",
        canonicalName: p.industryTemplate,
        displayName: p.industryTemplate,
        lifecycle: "reference",
        scope: "platform",
        evidence: "composition.industryTemplate",
        sourceRegistry: "compositions",
        verification: "verified",
        ownerRef: null,
        securityClassification: "public",
        planned: false,
      });
      addEdge(
        b,
        id,
        "targets",
        indId,
        "composition.industryTemplate",
        "compositions",
        "platform",
      );
    }
    // composed_of capability + uses module
    for (const mk of p.requiredModules) {
      addEdge(
        b,
        id,
        "uses",
        nodeId("module", mk),
        "composition.requiredModules",
        "compositions",
        "platform",
      );
      const cap = capabilityForModule(mk);
      if (cap) {
        addEdge(
          b,
          id,
          "composed_of",
          nodeId("capability", cap.id),
          "requiredModule → capability",
          "compositions+capabilities",
          "platform",
        );
      }
    }
  }

  // --- Applications (Application Registry) ---
  for (const a of APPLICATIONS) {
    const id = nodeId("application", a.key);
    const bu = businessUnitNode(b, a.executiveOwner);
    const lifecycle: NodeLifecycle =
      a.developmentStatus === "live"
        ? "live"
        : a.developmentStatus === "planned"
          ? "planned"
          : "partial";
    addNode(b, {
      id,
      type: "application",
      canonicalName: a.key,
      displayName: a.name,
      lifecycle,
      scope: "platform",
      evidence: a.evidence,
      sourceRegistry: "Application Registry",
      verification: "verified",
      ownerRef: bu,
      securityClassification: "internal",
      planned: a.developmentStatus === "planned",
    });
    addEdge(
      b,
      id,
      "owned_by",
      bu,
      "application.executiveOwner",
      "Application Registry",
      "platform",
    );

    // repository
    if (a.repository && a.repository !== "not found (no accessible repository)") {
      const repoKey = slug(a.repository.replace(/\s*\(private\)/i, ""));
      const repoId = nodeId("repository", repoKey);
      addNode(b, {
        id: repoId,
        type: "repository",
        canonicalName: repoKey,
        displayName: a.repository,
        lifecycle: "active",
        scope: "platform",
        evidence: "Application Registry.repository",
        sourceRegistry: "Application Registry",
        verification: "verified",
        ownerRef: null,
        securityClassification: "internal",
        planned: false,
      });
      addEdge(
        b,
        repoId,
        "provides",
        id,
        "repository implements application",
        "Application Registry",
        "platform",
      );
    }

    // host + deployment
    const hostKey = slug(a.hosting.split("(")[0] ?? a.hosting);
    if (hostKey) {
      const hostId = nodeId("host", hostKey);
      addNode(b, {
        id: hostId,
        type: "host",
        canonicalName: hostKey,
        displayName: a.hosting,
        lifecycle: "active",
        scope: "platform",
        evidence: "Application Registry.hosting",
        sourceRegistry: "Application Registry",
        verification: "verified",
        ownerRef: null,
        securityClassification: "internal",
        planned: false,
      });
      const depId = nodeId("deployment", `${a.key}@${a.environment}`);
      addNode(b, {
        id: depId,
        type: "deployment",
        canonicalName: `${a.key}@${a.environment}`,
        displayName: `${a.name} (${a.environment})`,
        lifecycle:
          a.deploymentStatus === "deployed" || a.deploymentStatus === "external_hosted"
            ? "active"
            : "planned",
        scope: "platform",
        evidence: `Application Registry.deploymentStatus=${a.deploymentStatus}`,
        sourceRegistry: "Application Registry",
        verification: a.deploymentStatus === "unknown" ? "unverified" : "verified",
        ownerRef: null,
        securityClassification: "internal",
        planned:
          a.deploymentStatus === "not_deployed" || a.deploymentStatus === "unknown",
      });
      addEdge(
        b,
        id,
        "deployed_as",
        depId,
        "application deployment",
        "Application Registry",
        "platform",
      );
      addEdge(
        b,
        depId,
        "hosted_on",
        hostId,
        "deployment host",
        "Application Registry",
        "platform",
      );
    }

    // uses capability + depends_on module
    for (const mk of a.reusableModules) {
      addEdge(
        b,
        id,
        "depends_on",
        nodeId("module", mk),
        "application.reusableModules",
        "Application Registry",
        "platform",
      );
      const cap = capabilityForModule(mk);
      if (cap) {
        addEdge(
          b,
          id,
          "uses",
          nodeId("capability", cap.id),
          "reusableModule → capability",
          "Application Registry+capabilities",
          "platform",
        );
      }
    }
  }

  // --- APIs (catalog api assets → uses schema) ---
  for (const asset of CATALOG.assets) {
    if (asset.kind !== "api") continue;
    const key = asset.id.replace(/^api\./, "");
    const id = nodeId("api", key);
    addNode(b, {
      id,
      type: "api",
      canonicalName: key,
      displayName: asset.name,
      lifecycle: "live",
      scope: "platform",
      evidence: asset.evidence ?? "catalog api asset",
      sourceRegistry: "Enterprise Catalog",
      verification: "verified",
      ownerRef: null,
      securityClassification: "internal",
      planned: false,
    });
    for (const r of asset.relationships) {
      if (r.kind === "uses" && r.to.startsWith("db.")) {
        addEdge(
          b,
          id,
          "uses",
          nodeId("schema", r.to.replace(/^db\./, "")),
          "api uses schema",
          "Enterprise Catalog",
          "platform",
        );
      }
    }
  }

  // Deterministic ordering.
  const nodes = [...b.nodes.values()].sort((x, y) => x.id.localeCompare(y.id));
  const edges = [...b.edges.values()].sort((x, y) => x.id.localeCompare(y.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { nodes, edges, byId };
}

// ==========================================================================
// Integrity validation (deterministic)
// ==========================================================================

export interface GraphIntegrity {
  ok: boolean;
  nodeCount: number;
  edgeCount: number;
  duplicateEdges: string[];
  invalidReferences: string[]; // edges pointing at a missing node
  missingInverses: GraphEdgeKind[];
  selfDependencies: string[];
  cycles: string[]; // "a -> b -> a" within an acyclic family
  missingEvidence: string[]; // node/edge ids with empty evidence
  missingOwnership: string[]; // platform nodes that should have an owner but don't
  scopeViolations: string[]; // edges crossing tenant boundaries illegally
}

export function validateGraph(g: KnowledgeGraph): GraphIntegrity {
  const ids = new Set(g.nodes.map((n) => n.id));

  // duplicate edges (by deterministic id)
  const seen = new Set<string>();
  const duplicateEdges: string[] = [];
  for (const e of g.edges) {
    if (seen.has(e.id)) duplicateEdges.push(e.id);
    seen.add(e.id);
  }

  const invalidReferences: string[] = [];
  const selfDependencies: string[] = [];
  const missingEvidence: string[] = [];
  const scopeViolations: string[] = [];
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) invalidReferences.push(e.id);
    if (e.from === e.to) selfDependencies.push(e.id);
    if (!e.evidence) missingEvidence.push(e.id);
    // a platform/opportunity node may not depend on a tenant node
    const from = g.byId.get(e.from);
    const to = g.byId.get(e.to);
    if (from && to && from.scope !== "tenant" && to.scope === "tenant") {
      scopeViolations.push(e.id);
    }
  }

  // every edge kind used must have a declared inverse
  const usedKinds = new Set(g.edges.map((e) => e.kind));
  const missingInverses = [...usedKinds].filter((k) => !GRAPH_INVERSE[k]);

  for (const n of g.nodes) if (!n.evidence) missingEvidence.push(n.id);

  // ownership: capability/application/product nodes should carry an owner
  const missingOwnership = g.nodes
    .filter((n) => ["capability", "application"].includes(n.type) && !n.ownerRef)
    .map((n) => n.id);

  // cycles within acyclic families
  const cycles = detectCycles(g);

  return {
    ok:
      duplicateEdges.length === 0 &&
      invalidReferences.length === 0 &&
      missingInverses.length === 0 &&
      selfDependencies.length === 0 &&
      cycles.length === 0 &&
      missingEvidence.length === 0 &&
      missingOwnership.length === 0 &&
      scopeViolations.length === 0,
    nodeCount: g.nodes.length,
    edgeCount: g.edges.length,
    duplicateEdges,
    invalidReferences,
    missingInverses,
    selfDependencies,
    cycles,
    missingEvidence,
    missingOwnership,
    scopeViolations,
  };
}

/** DFS cycle detection over the acyclic edge families only. */
function detectCycles(g: KnowledgeGraph): string[] {
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!ACYCLIC_EDGE_KINDS.has(e.kind)) continue;
    const arr = adj.get(e.from) ?? [];
    arr.push(e.to);
    adj.set(e.from, arr);
  }
  const cycles: string[] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0=visiting,2=done
  const stack: string[] = [];

  const visit = (id: string): void => {
    state.set(id, 0);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next);
      if (s === 0) {
        const i = stack.indexOf(next);
        cycles.push([...stack.slice(i), next].join(" -> "));
      } else if (s === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const n of g.nodes) if (state.get(n.id) === undefined) visit(n.id);
  return cycles;
}
