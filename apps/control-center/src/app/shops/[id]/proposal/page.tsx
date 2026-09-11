import { connect } from "@/lib/shop-audit";
import { HLD_TENANT_SLUG } from "@/lib/shop-audit-sql";
import { loadAssembleContext, loadCatalog, loadProposals } from "@/lib/proposal-sql";
import { matchCapabilities, deliverableNow, roadmap } from "@/lib/capability-match";
import { referenceOf } from "@/lib/proposal-doc";
import { Card, Empty } from "@/components/ui";
import { CreateDraft } from "@/components/ProposalActions";

export const dynamic = "force-dynamic";

/**
 * Proposals for one shop.
 *
 * Two halves. The top says what a NEW proposal would be built from, in the
 * same words the document would use -- so it is obvious before anything is
 * frozen whether there is enough here to send. The bottom is the history,
 * which is the answer to "what have we already told this shop".
 */
export default async function ProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await connect();
  if (!state.connected) {
    return (
      <Shell id={id}>
        <Card title="Not connected to the database">
          <Empty>
            {state.reason}{" "}
            <a href="/connect" style={{ color: "#58a6ff" }}>
              Connect accounts
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let ctx, catalog, history;
  try {
    [ctx, catalog, history] = await Promise.all([
      loadAssembleContext(state.conn.run, HLD_TENANT_SLUG, id),
      loadCatalog(state.conn.run),
      loadProposals(state.conn.run, HLD_TENANT_SLUG, id),
    ]);
  } catch (e) {
    return (
      <Shell id={id}>
        <Card title="Could not open this shop">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (ctx === null) {
    return (
      <Shell id={id}>
        <Card title="No such shop">
          <Empty>Nothing in the prospect list has that id.</Empty>
        </Card>
      </Shell>
    );
  }

  const gaps = matchCapabilities(ctx.stack, catalog);
  const today = deliverableNow(gaps);
  const later = roadmap(gaps);

  // Why a draft cannot be built, when it cannot. Stated rather than shown as a
  // dead button.
  const blocked =
    catalog.length === 0
      ? "The capability catalog is empty in this project, so there is nothing to " +
        "cross-reference this shop against."
      : gaps.length === 0
        ? "Cross-referencing this shop against the catalog produced nothing to offer. " +
          "Either they are already covered, or nobody has audited or called them."
        : null;

  return (
    <Shell id={id} name={ctx.shop.name}>
      <Card
        title="A new proposal would say this"
        sub="Frozen into the draft the moment you create it, and not changed by later audits or calls"
      >
        <Source
          label="The audit"
          yes={
            ctx.audit === null
              ? null
              : ctx.audit.composite === null
                ? `Run, but nothing could be scored from outside. ${ctx.audit.findings.length} finding${ctx.audit.findings.length === 1 ? "" : "s"}.`
                : `${ctx.audit.composite}/100 over ${ctx.audit.coverage.scored} of ${ctx.audit.coverage.possible} dimensions, ${ctx.audit.findings.length} finding${ctx.audit.findings.length === 1 ? "" : "s"}.`
          }
          no="No audit has been run. The document will say so rather than leave the section out."
        />
        <Source
          label="The call"
          yes={
            ctx.answeredAt === null
              ? null
              : `Spoken to on ${new Date(ctx.answeredAt).toLocaleDateString()}.`
          }
          no={
            <>
              Nobody has spoken to this shop.{" "}
              <a href={`/shops/${id}/call`} style={{ color: "#58a6ff" }}>
                Make the call
              </a>{" "}
              — without it the proposal is built on what can be seen from outside, which
              is half the picture.
            </>
          }
        />
        <Source
          label="The offer"
          yes={
            gaps.length === 0
              ? null
              : `${today.length} deliverable today${today.length > 0 ? ` (${today.map((g) => g.name).join(", ")})` : ""}; ${later.length} on the roadmap.`
          }
          no="Nothing. There is no proposal to build."
        />

        <div style={{ marginTop: 18 }}>
          <CreateDraft prospectId={id} blocked={blocked} />
        </div>
      </Card>

      <Card
        title="What we have sent them"
        sub={`${history.length} proposal${history.length === 1 ? "" : "s"}`}
      >
        {history.length === 0 ? (
          <Empty>Nothing has been drafted for this shop yet.</Empty>
        ) : (
          history.map((p) => (
            <a
              key={p.id}
              href={`/shops/${id}/proposal/${p.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                border: "1px solid #21262d",
                borderRadius: 6,
                padding: "11px 13px",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
                {referenceOf(p.id)}
              </span>
              <span style={{ float: "right", fontSize: 12, color: "#8b949e" }}>
                {p.status}
              </span>
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
                {p.offerLines} thing{p.offerLines === 1 ? "" : "s"} offered ·{" "}
                {p.sentAt !== null
                  ? `sent ${new Date(p.sentAt).toLocaleDateString()}`
                  : p.createdAt !== null
                    ? `drafted ${new Date(p.createdAt).toLocaleDateString()}`
                    : "drafted"}
              </div>
            </a>
          ))
        )}
      </Card>
    </Shell>
  );
}

function Source({
  label,
  yes,
  no,
}: {
  label: string;
  yes: React.ReactNode | null;
  no: React.ReactNode;
}) {
  const present = yes !== null;
  return (
    <div
      style={{
        borderLeft: `3px solid ${present ? "#3fb950" : "#6e7681"}`,
        padding: "2px 0 2px 12px",
        margin: "0 0 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "#8b949e",
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 14, color: present ? "#e6edf3" : "#8b949e", marginTop: 3 }}
      >
        {present ? yes : no}
      </div>
    </div>
  );
}

function Shell({
  id,
  name,
  children,
}: {
  id: string;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <p style={{ margin: "0 0 18px", fontSize: 13 }}>
        <a href={`/shops/${id}`} style={{ color: "#58a6ff" }}>
          ← {name ?? "Back to the shop"}
        </a>
      </p>
      {children}
    </main>
  );
}
