import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot, Empty } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { canView } from "@/lib/authz";
import {
  buildKnowledgeGraph,
  validateGraph,
  blastRadius,
  singlePointsOfDependency,
  highestReuseCoveragePlannedProduct,
  outgoing,
  incoming,
  projectionStatus,
  GRAPH_MODEL_VERSION,
  type GraphNode,
} from "@/lib/portal-data";

export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  const priv = canView(viewer.role, "intelligence"); // evidence/security gated to execs

  const g = buildKnowledgeGraph();
  const v = validateGraph(g);

  const nodeKey = pick(params["node"]);
  const detail = nodeKey ? g.byId.get(nodeKey) : undefined;

  const byType = new Map<string, number>();
  for (const n of g.nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);

  const spods = singlePointsOfDependency(g, 2).slice(0, 6);
  const topPlanned = highestReuseCoveragePlannedProduct();
  const proj = projectionStatus();

  return (
    <PortalShell view="graph">
      <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
        A deterministic, read-only projection of how every enterprise asset relates —
        assembled from the Enterprise Catalog, Capability Library, Module Registry and
        Application Registry. No new database; the graph is rebuilt from those sources.
      </p>

      <Grid min={130}>
        <Tile label="Nodes" value={g.nodes.length} />
        <Tile label="Edges" value={g.edges.length} />
        <Tile
          label="Planned nodes"
          value={g.nodes.filter((n) => n.planned).length}
          accent="#6e7681"
        />
        <Tile
          label="Integrity"
          value={v.ok ? "clean" : "issues"}
          accent={v.ok ? "#3fb950" : "#f85149"}
        />
      </Grid>

      <Card
        title="Persistent read model (projection status)"
        sub="In-code projection. The DB read-model migration (0028) is created and locally validated — not yet applied."
      >
        <Row k="Graph model version" v={GRAPH_MODEL_VERSION} />
        <Row
          k="Projection checksum"
          v={<code style={{ fontSize: 12 }}>{proj.checksum}</code>}
        />
        <Row k="Nodes · edges" v={`${proj.nodeCount} · ${proj.edgeCount}`} />
        <Row
          k="Integrity"
          v={
            <span>
              <Dot health={proj.integrityOk ? "green" : "red"} />
              {proj.integrityOk ? "clean" : "issues"}
            </span>
          }
        />
        <div style={{ fontSize: 11.5, color: "#6e7681", marginTop: 8 }}>
          Publishing to the persistent read model requires an approved migration apply
          (CEO decision). Until then the portal reads the deterministic in-code
          projection.
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Node inventory" sub="By type (evidence-backed).">
          {[...byType.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => (
              <Row key={t} k={t.replace(/_/g, " ")} v={n} />
            ))}
        </Card>

        <Card title="Integrity results" sub="Deterministic validation.">
          <Row k="Duplicate edges" v={v.duplicateEdges.length} />
          <Row k="Invalid references" v={v.invalidReferences.length} />
          <Row k="Self-dependencies" v={v.selfDependencies.length} />
          <Row k="Cycles" v={v.cycles.length} />
          <Row k="Missing evidence" v={v.missingEvidence.length} />
          <Row k="Missing ownership" v={v.missingOwnership.length} />
          <Row k="Scope violations" v={v.scopeViolations.length} />
        </Card>
      </div>

      {/* Representative executive queries */}
      <Card
        title="Single points of dependency"
        sub="Modules/capabilities ≥2 applications rely on."
      >
        {spods.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          spods.map((s) => (
            <div
              key={s.node.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "7px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 13,
              }}
            >
              <a
                href={`/graph?node=${encodeURIComponent(s.node.id)}`}
                style={{ color: "#e8eaed", textDecoration: "none" }}
              >
                {s.node.displayName}
              </a>
              <span style={{ color: "#8b949e" }}>{s.dependentApplications} apps</span>
            </div>
          ))
        )}
      </Card>

      {topPlanned && (
        <Card
          title="Cheapest planned product to ship"
          sub="Highest existing reusable-capability coverage."
        >
          <Row k={topPlanned.name} v={`${topPlanned.coveragePct}% reusable coverage`} />
        </Card>
      )}

      {/* Node detail */}
      {detail ? (
        <NodeDetail node={detail} g={g} priv={priv} />
      ) : (
        <Card
          title="Explore a node"
          sub="Append ?node=<id> — e.g. module:scoring_engine, capability:identity_access."
        >
          <Empty>
            Pick a node from “single points of dependency” above, or append a node id to
            the URL, to see its relationships, blast radius and evidence.
          </Empty>
        </Card>
      )}

      <p style={{ fontSize: 11.5, color: "#6e7681", lineHeight: 1.6 }}>
        Read-only and deterministic. The graph is a projection — writes go to the source
        registries, never here. Nothing is fabricated; planned nodes are marked.
      </p>
    </PortalShell>
  );
}

function NodeDetail({
  node,
  g,
  priv,
}: {
  node: GraphNode;
  g: ReturnType<typeof buildKnowledgeGraph>;
  priv: boolean;
}) {
  const out = outgoing(g, node.id);
  const inc = incoming(g, node.id);
  const blast = blastRadius(g, node.id).nodes.filter((n) => n.id !== node.id);
  return (
    <Card
      title={node.displayName}
      sub={`${node.type} · ${node.lifecycle}${node.planned ? " · planned" : ""}`}
    >
      <Row k="ID" v={<code style={{ fontSize: 12 }}>{node.id}</code>} />
      <Row k="Scope" v={node.scope} />
      <Row k="Owner" v={node.ownerRef ?? "—"} />
      {priv && <Row k="Security" v={node.securityClassification} />}
      {priv && (
        <div style={{ fontSize: 11.5, color: "#6e7681", margin: "6px 0 10px" }}>
          Evidence: {node.evidence} · source {node.sourceRegistry}
        </div>
      )}
      <div style={{ fontSize: 12.5, marginTop: 8, marginBottom: 4, color: "#8b949e" }}>
        Outgoing ({out.length})
      </div>
      {out.slice(0, 12).map((e) => (
        <div key={e.id} style={{ fontSize: 12, padding: "3px 0", color: "#c9d1d9" }}>
          {e.kind.replace(/_/g, " ")} → {g.byId.get(e.to)?.displayName ?? e.to}
        </div>
      ))}
      <div style={{ fontSize: 12.5, marginTop: 10, marginBottom: 4, color: "#8b949e" }}>
        Incoming ({inc.length})
      </div>
      {inc.slice(0, 12).map((e) => (
        <div key={e.id} style={{ fontSize: 12, padding: "3px 0", color: "#c9d1d9" }}>
          {g.byId.get(e.from)?.displayName ?? e.from} → {e.kind.replace(/_/g, " ")}
        </div>
      ))}
      <div style={{ fontSize: 12.5, marginTop: 10 }}>
        <Dot
          health={blast.length > 3 ? "red" : blast.length > 0 ? "yellow" : "green"}
        />
        Blast radius: <strong>{blast.length}</strong> node(s) depend on this
      </div>
      <p style={{ marginTop: 10 }}>
        <a href="/graph" style={{ color: "#58a6ff", fontSize: 12 }}>
          ← Back to graph overview
        </a>
      </p>
    </Card>
  );
}
