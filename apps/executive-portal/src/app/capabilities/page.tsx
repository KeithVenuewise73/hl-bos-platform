import { PortalShell } from "@/components/PortalShell";
import { Card, Tile, Grid, Row, Dot, Empty } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { canView } from "@/lib/authz";
import {
  CAPABILITIES,
  capabilityById,
  capabilityInventory,
  productsForCapability,
  applicationsForCapability,
  reconcileCapabilities,
  evaluateReuse,
  type Capability,
  type ProposedCapability,
} from "@/lib/portal-data";

export const dynamic = "force-dynamic";

const MATURITY_HEALTH: Record<
  Capability["maturity"],
  "green" | "yellow" | "red" | "unknown"
> = {
  implemented: "green",
  partial: "yellow",
  planned: "unknown",
  deprecated: "red",
};

const VERDICT_HEALTH: Record<string, "green" | "yellow" | "red"> = {
  REUSE_EXISTING: "green",
  EXTEND_EXISTING: "green",
  CONSOLIDATE_DUPLICATES: "yellow",
  POSSIBLE_OVERLAP: "yellow",
  MANUAL_REVIEW_REQUIRED: "yellow",
  BUILD_NEW: "red",
};

// Illustrative proposals to demonstrate the deterministic gate (no AI, no I/O).
const DEMO_PROPOSALS: ProposedCapability[] = [
  { name: "communications", functionalPurpose: "send email and SMS to customers" },
  {
    name: "appointment booking",
    domain: "operations",
    functionalPurpose: "schedule and book customer appointments and resources",
  },
  {
    name: "fleet telematics",
    domain: "transportation",
    functionalPurpose: "vehicle GPS tracking and diagnostics telemetry",
  },
];

function pick<T>(v: T | string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

export default async function CapabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  const priv = canView(viewer.role, "intelligence"); // owner/exec/admin see governance internals

  const key = pick(params["key"]);
  const domainFilter = pick(params["domain"]);
  const statusFilter = pick(params["status"]);

  const inv = capabilityInventory();
  const recon = reconcileCapabilities();
  const detail = key ? capabilityById(key) : undefined;

  const filtered = CAPABILITIES.filter(
    (c) =>
      (!domainFilter || c.domain === domainFilter) &&
      (!statusFilter || c.maturity === statusFilter),
  ).sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <PortalShell view="capabilities">
      <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
        The canonical record of reusable platform capabilities. It links to — and never
        replaces — the Enterprise Catalog and Application Registry. Every capability
        cites its repository evidence; <strong>planned</strong> capabilities are marked
        and are not counted as reusable.
      </p>

      <Grid min={140}>
        <Tile label="Capabilities" value={inv.total} />
        <Tile label="Implemented" value={inv.implemented} accent="#3fb950" />
        <Tile label="Partial" value={inv.partial} accent="#d29922" />
        <Tile label="Planned" value={inv.planned} accent="#6e7681" />
        <Tile label="Reusable" value={inv.reusable} accent="#3fb950" />
        <Tile
          label="Legacy keys folded"
          value={inv.consolidatedLegacyKeys}
          hint="from 3 registries"
        />
      </Grid>

      <Card
        title="Governance reconciliation"
        sub="Prevents new parallel capability registries."
      >
        <Row
          k="Every module & business-capability mapped"
          v={
            <span>
              <Dot health={recon.ok ? "green" : "red"} />
              {recon.ok ? "Reconciled — no gaps" : "Gaps found"}
            </span>
          }
        />
        {!recon.ok && (
          <div style={{ fontSize: 12, color: "#f85149", marginTop: 6 }}>
            Unmapped modules: {recon.unmappedModules.join(", ") || "none"} · Unmapped
            business capabilities:{" "}
            {recon.unmappedBusinessCapabilities.join(", ") || "none"}
          </div>
        )}
      </Card>

      {/* Duplicate-check demonstration */}
      <Card
        title="Duplicate gate — live demonstration"
        sub="Deterministic reuse-before-rebuild. No AI; identical inputs give identical verdicts."
      >
        {DEMO_PROPOSALS.map((p) => {
          const d = evaluateReuse(p);
          return (
            <div
              key={p.name}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 12.5,
              }}
            >
              <Dot health={VERDICT_HEALTH[d.recommendedAction] ?? "yellow"} />
              <strong>“{p.name}”</strong> → {d.recommendedAction.replace(/_/g, " ")}
              <span style={{ color: "#6e7681" }}>
                {" "}
                · best match {d.bestMatches[0]?.displayName ?? "none"} ({d.matchScore})
                {d.mayEnterBuildQueue ? " · may enter Build Queue" : ""}
                {d.requiredHumanReview ? " · human review required" : ""}
              </span>
            </div>
          );
        })}
      </Card>

      {/* Detail view */}
      {detail ? (
        <Card title={detail.displayName} sub={detail.description}>
          <Row
            k="Status"
            v={
              <span>
                <Dot health={MATURITY_HEALTH[detail.maturity]} />
                {detail.maturity} · {detail.lifecycle}
              </span>
            }
          />
          <Row k="Type · Domain" v={`${detail.type} · ${detail.domain}`} />
          <Row k="Reusability" v={detail.reusability} />
          <Row k="Strategic importance" v={detail.strategicImportance} />
          <Row k="Business function" v={detail.businessFunction} />
          <Row k="Industries" v={detail.industries.join(", ")} />
          <Row k="Commercial readiness" v={detail.commercialReadiness} />
          <Row
            k="Provided by modules"
            v={detail.providedByModules.join(", ") || "— (planned)"}
          />
          <Row k="Products" v={productsForCapability(detail.id).join(", ") || "—"} />
          <Row
            k="Applications"
            v={applicationsForCapability(detail.id).join(", ") || "—"}
          />
          <Row k="Depends on" v={detail.dependsOn.join(", ") || "—"} />
          <Row k="Aliases (legacy keys)" v={detail.aliases.join(", ") || "—"} />
          {detail.duplicatesConsolidated.length > 0 && (
            <Row k="Consolidated from" v={detail.duplicatesConsolidated.join(", ")} />
          )}
          {priv ? (
            <>
              <Row
                k="Owner · unit"
                v={`${detail.owner} · ${detail.owningBusinessUnit}`}
              />
              <Row
                k="Risk · security"
                v={`${detail.riskLevel} · ${detail.securityClassification}`}
              />
              <Row
                k="Approval · verification"
                v={`${detail.approvalState} · ${detail.verificationState}`}
              />
              <Row
                k="Package · schema"
                v={`${detail.package ?? "—"} · ${detail.schema ?? "—"}`}
              />
              <div style={{ fontSize: 11.5, color: "#6e7681", marginTop: 8 }}>
                Evidence: {detail.evidence} · reviewed {detail.lastReviewed}
              </div>
            </>
          ) : (
            <Empty>
              Ownership, risk, security and evidence are restricted to executive roles.
            </Empty>
          )}
          <p style={{ marginTop: 12 }}>
            <a href="/capabilities" style={{ color: "#58a6ff", fontSize: 12 }}>
              ← Back to all capabilities
            </a>
          </p>
        </Card>
      ) : (
        <Card
          title={`Capabilities · ${filtered.length}`}
          sub="Filter by ?domain= or ?status= in the URL. Click a capability for detail."
        >
          {filtered.length === 0 ? (
            <Empty>No capabilities match the filter.</Empty>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "7px 0",
                  borderBottom: "1px solid #1c2128",
                  fontSize: 12.5,
                }}
              >
                <span>
                  <Dot health={MATURITY_HEALTH[c.maturity]} />
                  <a
                    href={`/capabilities?key=${encodeURIComponent(c.id)}`}
                    style={{ color: "#e8eaed", textDecoration: "none" }}
                  >
                    <strong>{c.displayName}</strong>
                  </a>
                  <span style={{ color: "#6e7681" }}>
                    {" "}
                    · {c.domain} · {c.type}
                  </span>
                </span>
                <span style={{ color: "#8b949e" }}>
                  {c.maturity}
                  {c.reusability === "reusable" ? " · reusable" : ""}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      <p style={{ fontSize: 11.5, color: "#6e7681", lineHeight: 1.6 }}>
        Read-only. The duplicate gate is deterministic and requires no AI. Capabilities
        are derived from the version-controlled registries (modules, catalog,
        compositions, application registry) — nothing here is fabricated.
      </p>
    </PortalShell>
  );
}
