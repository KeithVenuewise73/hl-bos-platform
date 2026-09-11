import { connect } from "@/lib/shop-audit";
import { HLD_TENANT_SLUG } from "@/lib/shop-audit-sql";
import { loadProposal } from "@/lib/proposal-sql";
import { referenceOf } from "@/lib/proposal-doc";
import { Card, Empty } from "@/components/ui";
import {
  ProposalEditor,
  RecordOutcome,
  SendProposal,
} from "@/components/ProposalActions";

export const dynamic = "force-dynamic";

/**
 * One proposal.
 *
 * A draft shows the editor: the covering note, the pricing and the next steps
 * are the parts a person writes, and they are the ONLY parts that can move.
 * The evidence in the document -- the audit, the answers, the matched offer --
 * was frozen when the draft was created, so the wording can be worked on
 * without it shifting underneath.
 *
 * Once sent, everything is read-only and the only remaining act is recording
 * what came back.
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
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

  let proposal;
  try {
    proposal = await loadProposal(state.conn.run, HLD_TENANT_SLUG, pid);
  } catch (e) {
    return (
      <Shell id={id}>
        <Card title="Could not open this proposal">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }
  if (proposal === null) {
    return (
      <Shell id={id}>
        <Card title="No such proposal">
          <Empty>Nothing with that reference belongs to this agency.</Empty>
        </Card>
      </Shell>
    );
  }

  const doc = proposal.document;
  const isDraft = proposal.status === "draft";
  const today = doc.offer.filter((o) => o.deliverable_today);

  return (
    <Shell id={id}>
      <Card
        title={`${doc.shop.name} — ${referenceOf(proposal.id)}`}
        sub={[
          proposal.status,
          proposal.sentAt !== null
            ? `sent ${new Date(proposal.sentAt).toLocaleDateString()}`
            : null,
        ]
          .filter((x) => x !== null)
          .join(" · ")}
      >
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#8b949e" }}>
          {today.length} thing{today.length === 1 ? "" : "s"} offered as deliverable
          today, {doc.offer.length - today.length} as roadmap.{" "}
          {doc.investment.lines.length === 0
            ? "No pricing is stated in it."
            : `${doc.investment.lines.length} price line${doc.investment.lines.length === 1 ? "" : "s"}.`}
        </p>
        <a
          href={`/shops/${id}/proposal/${pid}/document`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 6,
            border: "1px solid #2f3742",
            background: "#21262d",
            color: "#e6edf3",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open the document →
        </a>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6e7681" }}>
          It opens as the finished page. Print it from the browser to get the PDF that
          goes to the shop.
          {isDraft
            ? " A draft is stamped as one, so it cannot be mistaken for a sent proposal."
            : ""}
        </p>
      </Card>

      {isDraft ? (
        <>
          <Card
            title="The words"
            sub="The only part of this document that can still change"
          >
            <ProposalEditor prospectId={id} proposalId={pid} document={doc} />
          </Card>
          <Card title="Send it">
            <SendProposal prospectId={id} proposalId={pid} />
          </Card>
        </>
      ) : proposal.status === "sent" ? (
        <Card title="What came back">
          <RecordOutcome prospectId={id} proposalId={pid} />
        </Card>
      ) : (
        <Card title="What came back">
          <p style={{ margin: 0, fontSize: 14, color: "#e6edf3" }}>
            {proposal.status}
            {proposal.decidedAt !== null
              ? ` on ${new Date(proposal.decidedAt).toLocaleDateString()}`
              : ""}
            .
          </p>
          {proposal.decisionNote !== null && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "#8b949e" }}>
              {proposal.decisionNote}
            </p>
          )}
        </Card>
      )}
    </Shell>
  );
}

function Shell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <main style={{ padding: "28px 32px", maxWidth: 1180, margin: "0 auto" }}>
      <p style={{ margin: "0 0 18px", fontSize: 13 }}>
        <a href={`/shops/${id}/proposal`} style={{ color: "#58a6ff" }}>
          ← All proposals for this shop
        </a>
      </p>
      {children}
    </main>
  );
}
