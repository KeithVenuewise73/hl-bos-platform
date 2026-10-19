import { BatchRunner } from "@/components/BatchRunner";
import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { MAX_BATCH, planBatch } from "@/lib/batch";
import { FilePresenceRepository } from "@/lib/presence-store";
import { FileBatchStore } from "@/lib/site-store";

export const dynamic = "force-dynamic";

/** The confirmation screen for a batch demo build, and the batch's live results. */
export default async function BatchPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids = "" } = await searchParams;
  const [leads, history] = await Promise.all([
    new FilePresenceRepository().listProspects(),
    new FileBatchStore().list(),
  ]);
  const plan = planBatch(ids.split(","), leads);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href="/presence"
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to the Lead Board
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>
        Build demos for selected leads
      </h1>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        Up to {MAX_BATCH} qualified leads at a time. Each demo uses template copy (never
        Claude), is built on its own so one failure does not stop the rest, and stays a
        private preview on this computer. No lead moves backwards in the pipeline.
        Nothing is published, no one is contacted and no domain is registered.
      </p>

      {plan.error ? (
        <Card title="This batch cannot run">
          <p style={{ margin: 0, fontSize: 13, color: C.red }}>{plan.error}</p>
        </Card>
      ) : (
        <>
          <Card
            title={`Confirm: ${plan.build.length} demo${plan.build.length === 1 ? "" : "s"} to build`}
            sub="Check the businesses below, then confirm."
          >
            <BatchRunner
              leads={plan.build.map(({ id, name }) => ({ id, name }))}
              needsInfo={plan.needsInfo}
            />
          </Card>
          {plan.excluded.length ? (
            <Card title="Selected but not included" sub="These will not be built.">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                {plan.excluded.map((x) => (
                  <li key={x.id}>
                    {x.name} — <span style={{ color: C.muted }}>{x.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}

      {history.length ? (
        <Card title="Recent batches" sub="Newest first.">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
            {history.slice(0, 10).map((b) => (
              <li key={b.id}>
                <span style={{ color: C.muted }}>
                  {b.finishedAt.slice(0, 16).replace("T", " ")} UTC
                </span>{" "}
                · {b.items.length} lead(s) · {b.summary}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
