import { notFound } from "next/navigation";
import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Empty, Badge, Row, colors } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import { NotebookStatusControl } from "@/hlvs/components/Forms";
import { getNotebookEntry } from "@/hlvs/lib/notebook";
import { kindMeta, isTaskKind, TASK_STATUSES } from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

export default async function NotebookEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getNotebookEntry(id);
  if (detail.provisioning === "ready" && detail.object === null) notFound();
  const obj = detail.object;

  return (
    <StudioShell view="notebook_detail">
      <p style={{ fontSize: 12.5, marginBottom: 8 }}>
        <a
          href="/HLVS/notebook"
          style={{ color: colors.accent, textDecoration: "none" }}
        >
          ← CEO Notebook
        </a>
      </p>
      <ProvisioningBanner detail={detail} />

      {!obj ? (
        <Empty>No live data in this environment — see the notice above.</Empty>
      ) : (
        <>
          <Card
            title={kindMeta(obj.entry.kind).label}
            sub={kindMeta(obj.entry.kind).description}
            right={
              obj.program ? (
                <Badge tone={obj.program.status === "active" ? "good" : "neutral"}>
                  {obj.program.name}
                </Badge>
              ) : null
            }
          >
            {obj.entry.title ? (
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{obj.entry.title}</h2>
            ) : null}
            <p style={{ fontSize: 13.5, whiteSpace: "pre-wrap", margin: 0 }}>
              {obj.entry.body}
            </p>
            <div style={{ marginTop: 10 }}>
              <Row
                k="Linked opportunity"
                v={
                  obj.entry.opportunityId ? (
                    <a
                      href={`/HLVS/opportunities/${obj.entry.opportunityId}`}
                      style={{ color: colors.accent }}
                    >
                      open
                    </a>
                  ) : (
                    "standalone"
                  )
                }
              />
              {obj.entry.dueDate ? <Row k="Due" v={obj.entry.dueDate} /> : null}
              <Row k="Created" v={obj.entry.createdAt.slice(0, 10)} />
            </div>
            {isTaskKind(obj.entry.kind) ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12.5, color: colors.dim, marginBottom: 6 }}>
                  Status
                </div>
                <NotebookStatusControl
                  id={obj.entry.id}
                  status={obj.entry.status}
                  statuses={TASK_STATUSES}
                />
              </div>
            ) : null}
          </Card>

          {obj.facets.researchRequest.available ? (
            <Card title="Research request" sub="Belongs to Research Intelligence">
              <p style={{ fontSize: 13 }}>{obj.facets.researchRequest.data.detail}</p>
              <Row
                k="Status"
                v={
                  <Badge tone="accent">{obj.facets.researchRequest.data.status}</Badge>
                }
              />
            </Card>
          ) : null}

          {obj.facets.aiAnalysisRequest.available ? (
            <Card
              title="AI analysis request"
              sub="Executed via the metered AI gateway — results are never fabricated"
            >
              <p style={{ fontSize: 13 }}>{obj.facets.aiAnalysisRequest.data.detail}</p>
              <Row
                k="Status"
                v={
                  <Badge tone="accent">
                    {obj.facets.aiAnalysisRequest.data.status}
                  </Badge>
                }
              />
            </Card>
          ) : null}

          {obj.facets.executiveStatus.available ? (
            <Card title="Executive status">
              <p style={{ fontSize: 13 }}>{obj.facets.executiveStatus.data.status}</p>
            </Card>
          ) : null}

          <Card
            title="Evidence collection"
            sub="From the linked opportunity (vstudio.evidence)"
          >
            {obj.facets.evidenceCollection.available ? (
              obj.facets.evidenceCollection.data.map((e) => (
                <Row
                  key={e.id}
                  k={e.title}
                  v={
                    <Badge tone={e.evidenceType === "verified_fact" ? "good" : "warn"}>
                      {e.evidenceType.replace("_", " ")}
                    </Badge>
                  }
                />
              ))
            ) : (
              <Empty>{obj.facets.evidenceCollection.reason}</Empty>
            )}
          </Card>

          <Card
            title="Reuse analysis"
            sub="Deterministic — measured against the HL-BOS catalog"
          >
            {obj.facets.reuseAnalysis.available ? (
              <>
                <Row
                  k="Reuse score"
                  v={<strong>{obj.facets.reuseAnalysis.data.score}/100</strong>}
                />
                <Row
                  k="Verdict"
                  v={
                    <Badge tone="accent">{obj.facets.reuseAnalysis.data.verdict}</Badge>
                  }
                />
                <p style={{ fontSize: 11.5, color: colors.dim, marginTop: 6 }}>
                  {obj.facets.reuseAnalysis.data.formula}
                </p>
              </>
            ) : (
              <Empty>{obj.facets.reuseAnalysis.reason}</Empty>
            )}
          </Card>

          <Card
            title="Factory readiness (preview)"
            sub="Read-only; creates no Factory work"
          >
            {obj.facets.factoryReadiness.available ? (
              <>
                <Row
                  k="Would be ready"
                  v={
                    <Badge
                      tone={obj.facets.factoryReadiness.data.ready ? "good" : "warn"}
                    >
                      {obj.facets.factoryReadiness.data.ready ? "yes" : "no"}
                    </Badge>
                  }
                />
                <Row
                  k="Reusable capabilities"
                  v={String(obj.facets.factoryReadiness.data.reusableCapabilityCount)}
                />
                {obj.facets.factoryReadiness.data.blockers.length > 0 ? (
                  <ul
                    style={{
                      margin: "8px 0 0",
                      paddingLeft: 18,
                      fontSize: 12.5,
                      color: colors.warn,
                    }}
                  >
                    {obj.facets.factoryReadiness.data.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <Empty>{obj.facets.factoryReadiness.reason}</Empty>
            )}
          </Card>

          <Card title="Related opportunities" sub="Sharing at least one tag">
            {obj.facets.relatedOpportunities.available ? (
              obj.facets.relatedOpportunities.data.map((o) => (
                <Row
                  key={o.id}
                  k={
                    <a
                      href={`/HLVS/opportunities/${o.id}`}
                      style={{ color: colors.accent }}
                    >
                      {o.title}
                    </a>
                  }
                  v={<Badge tone="neutral">{o.status}</Badge>}
                />
              ))
            ) : (
              <Empty>{obj.facets.relatedOpportunities.reason}</Empty>
            )}
          </Card>

          <Card
            title="Decision history"
            sub="Authoritative CEO decisions on the linked opportunity"
          >
            {obj.facets.decisionHistory.available ? (
              obj.facets.decisionHistory.data.map((d) => (
                <Row
                  key={d.id}
                  k={d.decidedAt.slice(0, 10)}
                  v={<Badge tone="accent">{d.decision}</Badge>}
                />
              ))
            ) : (
              <Empty>{obj.facets.decisionHistory.reason}</Empty>
            )}
          </Card>

          <Card
            title="Related notes"
            sub="Other notebook entries on the same opportunity"
          >
            {obj.facets.ceoNotes.available ? (
              obj.facets.ceoNotes.data.map((n) => (
                <Row
                  key={n.id}
                  k={
                    <a href={`/HLVS/notebook/${n.id}`} style={{ color: colors.accent }}>
                      {kindMeta(n.kind).label}
                    </a>
                  }
                  v={n.title || n.body.slice(0, 40)}
                />
              ))
            ) : (
              <Empty>{obj.facets.ceoNotes.reason}</Empty>
            )}
          </Card>
        </>
      )}
    </StudioShell>
  );
}
