"use client";

import { useWorkspace } from "@/lib/workspace";
import { engagementById, businessById, generateProposal } from "@/lib/store";
import { Card, Badge, EmptyState } from "@/components/ui";

// PROPOSAL VIEWER — reuses the deterministic recommendation set to draft a
// proposal preview. Pricing is intentionally blank: pricing is a CEO decision
// and HL-BTI never invents a number. Digital signature is a status only (the
// Alpha does not send anything).
export default function ProposalViewer({ engagementId }: { engagementId: string }) {
  const { ws, update } = useWorkspace();
  const e = engagementById(ws, engagementId)!;
  const b = businessById(ws, e.businessId)!;

  if (b.analysisOnly) {
    return (
      <EmptyState icon="🔒" title="Proposals disabled">
        {b.name} is analysis-only. HL-BTI provides recommendations, not a proposal.
      </EmptyState>
    );
  }

  function draft() {
    update((d) => generateProposal(engagementById(d, engagementId)!));
  }
  function setStatus(
    status: "internal_review" | "ready_for_customer" | "accepted" | "declined",
  ) {
    update((d) => {
      const de = engagementById(d, engagementId)!;
      if (de.proposal) de.proposal.status = status;
    });
  }
  function setSignature(sig: "sent" | "signed") {
    update((d) => {
      const de = engagementById(d, engagementId)!;
      if (de.proposal) de.proposal.signatureStatus = sig;
    });
  }

  if (!e.proposal) {
    return (
      <EmptyState icon="📄" title="No proposal drafted yet">
        <button className="btn primary" style={{ marginTop: 10 }} onClick={draft}>
          Draft proposal from recommendations
        </button>
      </EmptyState>
    );
  }

  const p = e.proposal;
  const recurring = p.lines.filter((l) => l.type === "recurring");
  const oneTime = p.lines.filter((l) => l.type === "one_time");

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <div className="row">
          <Badge
            kind={
              p.status === "accepted"
                ? "ok"
                : p.status === "declined"
                  ? "danger"
                  : "warn"
            }
          >
            {p.status.replace(/_/g, " ")}
          </Badge>
          <Badge kind={p.signatureStatus === "signed" ? "ok" : undefined}>
            Signature: {p.signatureStatus.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => setStatus("internal_review")}>
            Internal review
          </button>
          <button className="btn sm" onClick={() => setStatus("ready_for_customer")}>
            Ready for customer
          </button>
          <button className="btn sm" onClick={() => setSignature("sent")}>
            Mark sent
          </button>
          <button className="btn sm" onClick={() => setSignature("signed")}>
            Mark signed
          </button>
          <button className="btn sm primary" onClick={() => setStatus("accepted")}>
            Accept
          </button>
        </div>
      </div>

      <Card title="Proposal preview">
        <div className="dim" style={{ fontSize: 12.5 }}>
          Executive Summary
        </div>
        <p style={{ marginTop: 4 }}>
          A Business Transformation engagement for <strong>{b.name}</strong>, delivering
          the recommended Herman Legacy services below, sequenced from the executive
          assessment and blueprint.
        </p>
      </Card>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <Card title="Deliverables & scope">
          {p.lines.length === 0 ? (
            <div className="dim">No recommendations to scope yet.</div>
          ) : (
            <div className="list">
              {p.lines.map((l, i) => (
                <div className="li" key={i}>
                  <span>{l.label}</span>
                  <Badge kind={l.type === "recurring" ? "info" : undefined}>
                    {l.type === "recurring" ? "Monthly" : "One-time"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Pricing summary">
          <table className="tbl">
            <tbody>
              <tr>
                <td>One-time deliverables</td>
                <td className="dim">{oneTime.length} item(s) · price TBD</td>
              </tr>
              <tr>
                <td>Monthly services</td>
                <td className="dim">{recurring.length} item(s) · price TBD</td>
              </tr>
              <tr>
                <td>Recurring subscription</td>
                <td className="dim">TBD</td>
              </tr>
            </tbody>
          </table>
          <div className="banner" style={{ marginTop: 10 }}>
            💡 Pricing is a CEO decision. HL-BTI does not invent prices — set them
            before sending.
          </div>
        </Card>
      </div>
    </div>
  );
}
