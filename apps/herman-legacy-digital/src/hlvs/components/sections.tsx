import type { OpportunityDetail } from "@/hlvs/lib/data";
import { EVALUATION_DIMENSIONS } from "@hl-bos/venture-studio";
import { Card, Grid, Empty, Badge, Bar, Row, colors } from "./ui";

export function ProvisioningBanner({
  detail,
}: {
  detail: Pick<OpportunityDetail, "provisioning">;
}) {
  if (detail.provisioning === "ready") return null;
  const text =
    detail.provisioning === "unconfigured"
      ? "Identity/database not configured for this environment — live data is unavailable. No data is fabricated."
      : "The Venture Studio schema is not yet provisioned. Its migration is written but unapplied, pending CEO approval. Live records appear once approved. Nothing shown here is invented.";
  return (
    <div
      style={{
        border: `1px solid ${colors.warn}55`,
        background: `${colors.warn}18`,
        color: colors.warn,
        borderRadius: 10,
        padding: 12,
        fontSize: 12.5,
        marginBottom: 14,
      }}
    >
      {text}
    </div>
  );
}

export function ReuseSection({ detail }: { detail: OpportunityDetail }) {
  const r = detail.reuse;
  const tone =
    r.reuseScore >= 60 ? colors.good : r.reuseScore >= 30 ? colors.warn : colors.bad;
  return (
    <Card
      title="Reuse analysis"
      sub="Measured deterministically against the live HL-BOS catalog — not an AI opinion."
      right={<Badge tone="good">measured</Badge>}
    >
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            marginBottom: 4,
          }}
        >
          <span style={{ color: colors.dim }}>Reuse score</span>
          <strong>{r.reuseScore}/100</strong>
        </div>
        <Bar pct={r.reuseScore} tone={tone} />
        <p style={{ fontSize: 11.5, color: colors.dim, marginTop: 6 }}>{r.formula}</p>
      </div>
      <Row k="Verdict" v={<Badge tone="accent">{r.verdict}</Badge>} />
      <Row k="Match score" v={`${r.matchScore}/100`} />
      <Row k="Confidence" v={r.confidence} />
      <Row k="Requires human review" v={r.requiresHumanReview ? "Yes" : "No"} />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12.5, color: colors.dim, marginBottom: 6 }}>
          Matching capabilities
        </div>
        {r.matches.length === 0 ? (
          <Empty>No strong catalog match — mostly net-new.</Empty>
        ) : (
          <Grid min={200}>
            {r.matches.slice(0, 6).map((m) => (
              <div
                key={m.capabilityId}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                }}
              >
                <strong>{m.displayName}</strong>
                <div style={{ color: colors.dim }}>score {m.score}</div>
              </div>
            ))}
          </Grid>
        )}
      </div>
      {r.relatedModules.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: colors.dim, marginBottom: 6 }}>
            Related modules
          </div>
          {r.relatedModules.map((m) => (
            <Row
              key={m.key}
              k={m.name}
              v={
                <Badge tone={m.built ? "good" : "warn"}>
                  {m.built ? "built" : "planned"}
                </Badge>
              }
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function FactorySection({ detail }: { detail: OpportunityDetail }) {
  const f = detail.factory;
  return (
    <Card
      title="Factory readiness (preview)"
      sub="Read-only. V2-1 creates NO Factory work — no order is generated here."
      right={
        <Badge tone={f.ready ? "good" : "warn"}>
          {f.ready ? "would be ready" : "not ready"}
        </Badge>
      }
    >
      <p style={{ fontSize: 12.5, color: colors.dim }}>{f.missingCapabilityNote}</p>
      <Row k="Reusable capabilities identified" v={String(f.reusableCapabilityCount)} />
      <Row k="Executable in V2-1" v={<Badge tone="bad">no — preview only</Badge>} />
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12.5, color: colors.dim, marginBottom: 6 }}>
          Readiness blockers
        </div>
        {f.blockers.length === 0 ? (
          <Empty>
            No blockers — a Build decision could proceed to the Factory (after V2-1).
          </Empty>
        ) : (
          <ul
            style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: colors.warn }}
          >
            {f.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function EvidenceList({ detail }: { detail: OpportunityDetail }) {
  const TONE: Record<string, string> = {
    verified_fact: "good",
    external_claim: "warn",
    estimate: "warn",
    inference: "neutral",
    ceo_note: "accent",
  };
  return (
    <Card
      title="Evidence & research"
      sub="Typed by trust. Verified facts are distinguished from claims, estimates and inferences."
    >
      {detail.evidence.length === 0 ? (
        <Empty>No evidence attached yet.</Empty>
      ) : (
        detail.evidence.map((e) => (
          <div
            key={e.id}
            style={{ borderBottom: `1px solid ${colors.border}`, padding: "8px 0" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{e.title}</strong>
              <Badge tone={TONE[e.evidence_type] ?? "neutral"}>
                {e.evidence_type.replace("_", " ")}
              </Badge>
            </div>
            <div style={{ fontSize: 12, color: colors.dim }}>
              {e.source_name || "—"} · reliability {e.reliability} · {e.relevance}
            </div>
            {e.excerpt ? (
              <p style={{ fontSize: 12.5, margin: "4px 0 0" }}>{e.excerpt}</p>
            ) : null}
          </div>
        ))
      )}
    </Card>
  );
}

export function EvaluationDims() {
  return (
    <Card
      title="Evaluation dimensions"
      sub="Every score carries methodology, evidence basis, confidence and a measured/estimated/unknown status."
    >
      <Grid min={200}>
        {EVALUATION_DIMENSIONS.map((d) => (
          <div
            key={d.key}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: 10,
              fontSize: 12.5,
            }}
          >
            <strong>{d.label}</strong>
            <div style={{ color: colors.dim }}>weight {d.weight}</div>
          </div>
        ))}
      </Grid>
    </Card>
  );
}
