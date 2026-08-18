import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Grid, Empty, Badge, colors } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import { NotebookEntryForm } from "@/hlvs/components/Forms";
import { listNotebookEntries } from "@/hlvs/lib/notebook";
import {
  INTELLIGENCE_PROGRAMS,
  NOTEBOOK_KINDS,
  TASK_STATUSES,
  kindMeta,
  isTaskKind,
} from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  open: "accent",
  in_progress: "warn",
  blocked: "bad",
  done: "good",
  archived: "neutral",
};

export default async function Notebook() {
  const list = await listNotebookEntries();
  const openTasks = list.entries.filter(
    (e) => isTaskKind(e.kind) && e.status !== "done" && e.status !== "archived",
  );

  return (
    <StudioShell view="notebook">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>CEO Notebook</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        The executive intelligence workspace. Every entry is a living intelligence
        object — notes, research requests, AI-analysis requests, tasks and status,
        composed with the opportunity intelligence it links to. Nothing here is
        fabricated.
      </p>
      <ProvisioningBanner detail={list} />

      <Card
        title="Intelligence programs"
        sub="Every future connector belongs to one of these six permanent programs."
      >
        <Grid min={240}>
          {INTELLIGENCE_PROGRAMS.map((p) => (
            <div
              key={p.key}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 12,
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
                <strong style={{ fontSize: 13 }}>{p.name}</strong>
                <Badge tone={p.status === "active" ? "good" : "neutral"}>
                  {p.status}
                </Badge>
              </div>
              <p style={{ fontSize: 12, color: colors.dim, margin: "6px 0 0" }}>
                {p.currentCapability}
              </p>
            </div>
          ))}
        </Grid>
      </Card>

      <Card title="Open tasks & requests" sub="Task-like entries not yet done">
        {openTasks.length === 0 ? (
          <Empty>
            {list.provisioning === "ready"
              ? "No open tasks or requests."
              : "No live data in this environment — see the notice above."}
          </Empty>
        ) : (
          openTasks.map((e) => (
            <a
              key={e.id}
              href={`/HLVS/notebook/${e.id}`}
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
                {kindMeta(e.kind).label} · {e.title || e.body.slice(0, 60)}
              </span>
              <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
            </a>
          ))
        )}
      </Card>

      <Card title="Capture an entry" sub="Reuses vstudio.notes — no separate store">
        <NotebookEntryForm
          kinds={NOTEBOOK_KINDS.map((k) => ({ kind: k.kind, label: k.label }))}
          programs={INTELLIGENCE_PROGRAMS.map((p) => ({ key: p.key, name: p.name }))}
          statuses={TASK_STATUSES}
        />
      </Card>

      <Card title="All entries" sub={`${list.entries.length} total`}>
        {list.entries.length === 0 ? (
          <Empty>Nothing captured yet.</Empty>
        ) : (
          list.entries.map((e) => (
            <a
              key={e.id}
              href={`/HLVS/notebook/${e.id}`}
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
                <Badge tone="neutral">{kindMeta(e.kind).label}</Badge>{" "}
                {e.title || e.body.slice(0, 70)}
                {e.opportunityId ? (
                  <span style={{ color: colors.dim }}> · linked</span>
                ) : null}
              </span>
              {isTaskKind(e.kind) ? (
                <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
              ) : null}
            </a>
          ))
        )}
      </Card>
    </StudioShell>
  );
}
