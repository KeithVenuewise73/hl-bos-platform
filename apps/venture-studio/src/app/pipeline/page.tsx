import { StudioShell } from "@/components/StudioShell";
import { Card, Grid, Empty, Badge, Row, colors } from "@/components/ui";
import { ProvisioningBanner } from "@/components/sections";
import { RelateButton } from "@/components/Forms";
import { loadPipeline, type PipelineOpportunity } from "@/lib/pipeline";
import { listNotebookEntries } from "@/lib/notebook";
import { OPPORTUNITY_CONNECTORS, connectorCategoryLabel } from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

const TIER_TONE: Record<string, string> = {
  now: "accent",
  soon: "good",
  later: "warn",
  watch: "neutral",
};

function OppRowLink({ o }: { o: PipelineOpportunity }) {
  const stored = o.priorityScore !== null;
  const score = o.priorityScore ?? o.suggestedScore;
  const tier = o.priorityTier ?? o.suggestedTier;
  return (
    <a
      href={`/opportunities/${o.id}`}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 0",
        borderBottom: `1px solid ${colors.border}`,
        textDecoration: "none",
        color: colors.text,
        fontSize: 13,
      }}
    >
      <span>
        {o.title}
        {o.sourceConnector ? (
          <span style={{ color: colors.dim }}> · {o.sourceConnector}</span>
        ) : null}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: colors.dim, fontSize: 12 }}>
          {score}
          {stored ? "" : " (suggested)"}
        </span>
        <Badge tone={TIER_TONE[tier] ?? "neutral"}>{tier}</Badge>
      </span>
    </a>
  );
}

export default async function Pipeline() {
  const data = await loadPipeline();
  const notebook = await listNotebookEntries();
  const researchRequests = notebook.entries.filter(
    (e) =>
      e.kind === "research_request" && e.status !== "done" && e.status !== "archived",
  );

  return (
    <StudioShell view="pipeline">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>
        Opportunity Intelligence Pipeline
      </h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        The successor to the HLVS Think Tank: ingest, organise, relate, score and
        prioritise opportunities. Connectors are stubbed until a CEO-approved credential
        exists — nothing is fabricated.
      </p>
      <ProvisioningBanner detail={data} />

      <Card
        title="Sources"
        sub="Every connector belongs to an Intelligence Program; all are stubbed (no credential yet)."
      >
        <Grid min={220}>
          {OPPORTUNITY_CONNECTORS.map((c) => (
            <div
              key={c.key}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 12,
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <strong>{c.name}</strong>
                <Badge tone="neutral">stubbed</Badge>
              </div>
              <div style={{ color: colors.dim, marginTop: 4 }}>
                {connectorCategoryLabel(c.category)} · {c.program}
              </div>
              <div style={{ color: colors.dim }}>
                auth: {c.credentialType} · {c.integration}
              </div>
            </div>
          ))}
        </Grid>
      </Card>

      <Grid min={320}>
        <Card title="Opportunity Inbox" sub="Newly captured / ingested (status: inbox)">
          {data.inbox.length === 0 ? (
            <Empty>
              {data.provisioning === "ready"
                ? "Inbox is empty."
                : "No live data in this environment — see the notice above."}
            </Empty>
          ) : (
            data.inbox.map((o) => <OppRowLink key={o.id} o={o} />)
          )}
        </Card>

        <Card
          title="Executive Priority Queue"
          sub="Ordered by priority — measured/suggested, deterministic"
        >
          {data.priorityQueue.length === 0 ? (
            <Empty>No opportunities to prioritise yet.</Empty>
          ) : (
            data.priorityQueue.slice(0, 15).map((o) => <OppRowLink key={o.id} o={o} />)
          )}
        </Card>
      </Grid>

      <Card
        title="Research Queue"
        sub="Opportunities in research + open research requests from the CEO Notebook"
      >
        {data.researchQueue.length === 0 && researchRequests.length === 0 ? (
          <Empty>Nothing awaiting research.</Empty>
        ) : (
          <>
            {data.researchQueue.map((o) => (
              <Row
                key={o.id}
                k={
                  <a href={`/opportunities/${o.id}`} style={{ color: colors.accent }}>
                    {o.title}
                  </a>
                }
                v={<Badge tone="warn">researching</Badge>}
              />
            ))}
            {researchRequests.map((e) => (
              <Row
                key={e.id}
                k={
                  <a href={`/notebook/${e.id}`} style={{ color: colors.accent }}>
                    {e.title || e.body.slice(0, 50)}
                  </a>
                }
                v={<Badge tone="accent">research request</Badge>}
              />
            ))}
          </>
        )}
      </Card>

      <Card
        title="Duplicate & relationship suggestions"
        sub="Deterministic token-overlap suggestions — confirm to create the link"
      >
        {data.duplicateSuggestions.length === 0 ? (
          <Empty>No suggestions (need at least two similar opportunities).</Empty>
        ) : (
          data.duplicateSuggestions.map((s) => (
            <div
              key={`${s.fromId}-${s.toId}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${colors.border}`,
                fontSize: 13,
              }}
            >
              <span>
                {s.fromTitle} <span style={{ color: colors.dim }}>↔</span> {s.toTitle}
                <span style={{ color: colors.dim }}> · {s.score}% overlap</span>
              </span>
              <RelateButton
                from={s.fromId}
                to={s.toId}
                type={s.type}
                label={s.type === "duplicate_of" ? "Mark duplicate" : "Mark related"}
              />
            </div>
          ))
        )}
      </Card>

      {data.relationships.length > 0 ? (
        <Card title="Relationships" sub="Confirmed links between opportunities">
          {data.relationships.map((r) => (
            <Row
              key={`${r.fromId}-${r.toId}-${r.type}`}
              k={`${r.fromTitle} → ${r.toTitle}`}
              v={<Badge tone="neutral">{r.type.replace("_", " ")}</Badge>}
            />
          ))}
        </Card>
      ) : null}
    </StudioShell>
  );
}
