"use client";

import { useEffect, useState } from "react";

import {
  catalog,
  decideProposal,
  draftProposal,
  markProposalSent,
  proposal,
  report,
  saveProposal,
  type Agency,
  type Catalog,
  type OfferLine,
  type Pricing,
  type ProposalDocument,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import {
  PRICING_DEFAULTS,
  draftFromReport,
  evidenceNote,
  money,
  offerLineFor,
  offerableCapabilities,
  proposalProblems,
  when,
} from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import { Crumbs, Evidence, Loaded, PageHead, Toast } from "@/components/parts";

function emptyDoc(): ProposalDocument {
  return {
    headline: "",
    summary: "",
    pricing: { ...PRICING_DEFAULTS },
    offer: [],
    cited_findings: [],
    from_run: null,
    evidence: null,
  };
}

/**
 * Screens 7 and 8 — build the proposal, and record what happened to it.
 *
 * Three rules from the schema shape this screen, and it shows all three rather
 * than letting the operator find them by being refused:
 *
 *   1. The catalog is the vocabulary. A capability not in it cannot be offered,
 *      so the offer is built by picking from the catalog, never by typing.
 *   2. `deferred` must not appear in any form, so it is not offered at all.
 *   3. Only what has shipped may be sold as available — deliverable_today is
 *      derived from the catalog, not chosen.
 *
 * And one rule from reality: there is no email or SMS provider on this
 * platform, so nothing here sends anything. The control says "Mark as sent",
 * because that is the only thing it does.
 */
export default function ProposalBuilder({
  agency,
  prospectId,
  proposalId,
  runId,
  onBack,
  onOnboard,
}: {
  agency: Agency;
  prospectId: string;
  proposalId: string | null;
  runId: string | null;
  onBack: () => void;
  onOnboard: () => void;
}) {
  const cat = useAsync(() => catalog(), []);
  const existing = useAsync(
    () => (proposalId ? proposal(proposalId) : Promise.resolve(null)),
    [proposalId],
  );
  const rep = useAsync(() => (runId ? report(runId) : Promise.resolve(null)), [runId]);
  const act = useAction();

  const [doc, setDoc] = useState<ProposalDocument | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [id, setId] = useState(proposalId);

  // Seed the editor once, from the saved proposal if there is one, otherwise
  // from the audit report. Never re-seed, or an operator's edits would be
  // silently discarded by a background reload.
  useEffect(() => {
    if (doc !== null) return;
    if (proposalId) {
      if (existing.data) setDoc(existing.data.document);
      return;
    }
    if (!cat.data) return;
    setDoc(
      rep.data ? draftFromReport({ report: rep.data, catalog: cat.data }) : emptyDoc(),
    );
  }, [doc, proposalId, existing.data, rep.data, cat.data]);

  const status = existing.data?.status ?? "draft";
  const locked = id !== null && status !== "draft";

  function setPricing<K extends keyof Pricing>(k: K, v: Pricing[K]) {
    setDoc((d) => (d ? { ...d, pricing: { ...d.pricing, [k]: v } } : d));
  }

  function toggle(key: string, cat2: Catalog) {
    setDoc((d) => {
      if (!d) return d;
      const has = d.offer.some((l) => l.capability === key);
      if (has) return { ...d, offer: d.offer.filter((l) => l.capability !== key) };
      const c = cat2.capabilities.find((x) => x.key === key);
      if (!c) return d;
      return { ...d, offer: [...d.offer, offerLineFor(c)] };
    });
  }

  function setNote(key: string, note: string) {
    setDoc((d) =>
      d
        ? {
            ...d,
            offer: d.offer.map((l): OfferLine =>
              l.capability === key ? { ...l, note } : l,
            ),
          }
        : d,
    );
  }

  function persist() {
    if (!doc) return;
    if (id) {
      act.run(
        "Proposal saved.",
        () => saveProposal(id, doc),
        () => existing.reload(),
      );
    } else {
      let created = "";
      act.run(
        "Proposal drafted.",
        () => draftProposal(prospectId, doc.from_run, doc).then((v) => (created = v)),
        () => {
          if (created) setId(created);
        },
      );
    }
  }

  if (!agency.can.manage_proposals && !proposalId) {
    return (
      <>
        <Crumbs trail={[{ label: "Back", go: onBack }, { label: "Proposal" }]} />
        <EmptyState title="You cannot draft a proposal">
          Your membership of {agency.name} does not carry
          transform_audit.proposal.manage.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <Crumbs trail={[{ label: "Back", go: onBack }, { label: "Proposal" }]} />

      <Loaded
        state={cat}
        empty={
          <EmptyState title="The capability catalog could not be read">
            Without it, nothing can be offered, because the catalog is the only
            permitted vocabulary for an offer.
          </EmptyState>
        }
      >
        {(c) => {
          if (!doc) return <div className="dim">Loading…</div>;
          const problems = proposalProblems(doc, c);
          const offerable = offerableCapabilities(c);
          const deferred = c.capabilities.filter((x) => x.status === "deferred");

          return (
            <>
              <PageHead
                title={id ? "Proposal" : "New proposal"}
                sub={
                  locked
                    ? `This proposal was ${status}${existing.data?.sent_at ? ` on ${when(existing.data.sent_at)}` : ""}. A sent proposal cannot be edited — draft a new one instead.`
                    : "Everything offered here is checked against the catalog before it can be saved."
                }
                action={
                  <span
                    className={`badge ${
                      status === "accepted"
                        ? "ok"
                        : status === "declined" || status === "withdrawn"
                          ? "danger"
                          : status === "sent"
                            ? "info"
                            : "demo"
                    }`}
                  >
                    {status}
                  </span>
                }
              />

              {problems.length > 0 && !locked && (
                <div className="banner bdanger" style={{ marginBottom: 16 }}>
                  <strong>This cannot be sent yet.</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {problems.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid cols-2">
                <Card title="The document">
                  <Field label="Headline — the first thing they read">
                    <input
                      type="text"
                      disabled={locked}
                      value={doc.headline}
                      onChange={(e) => setDoc({ ...doc, headline: e.target.value })}
                    />
                  </Field>
                  <Field label="Summary">
                    <textarea
                      disabled={locked}
                      value={doc.summary}
                      onChange={(e) => setDoc({ ...doc, summary: e.target.value })}
                    />
                  </Field>

                  <div className="section-title">Price</div>
                  <p className="dim" style={{ fontSize: 12, marginTop: 0 }}>
                    Stored inside this proposal, not fixed in the software. Change it
                    here and what the shop sees is what gets stored.
                  </p>
                  <div className="grid cols-3">
                    <Field label="Setup, one-off">
                      <input
                        type="number"
                        min={0}
                        disabled={locked}
                        value={doc.pricing.setup_cents / 100}
                        onChange={(e) =>
                          setPricing(
                            "setup_cents",
                            Math.round(Number(e.target.value) * 100) || 0,
                          )
                        }
                      />
                    </Field>
                    <Field label="Monthly">
                      <input
                        type="number"
                        min={0}
                        disabled={locked}
                        value={doc.pricing.monthly_cents / 100}
                        onChange={(e) =>
                          setPricing(
                            "monthly_cents",
                            Math.round(Number(e.target.value) * 100) || 0,
                          )
                        }
                      />
                    </Field>
                    <Field label="Term in months (blank = no term)">
                      <input
                        type="number"
                        min={0}
                        disabled={locked}
                        value={doc.pricing.term_months ?? ""}
                        onChange={(e) =>
                          setPricing(
                            "term_months",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>
                  </div>
                  <div className="row" style={{ gap: 18, marginTop: 4 }}>
                    <span className="money">
                      {money(doc.pricing.setup_cents, doc.pricing.currency)} to set up
                    </span>
                    <span className="money">
                      {money(doc.pricing.monthly_cents, doc.pricing.currency)} a month
                    </span>
                    {doc.pricing.term_months ? (
                      <span className="dim">over {doc.pricing.term_months} months</span>
                    ) : null}
                  </div>
                </Card>

                <Card title="What is being offered">
                  <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                    Pick from the catalog. Anything not marked{" "}
                    <strong>deliverable today</strong> is in the document as something
                    that has not shipped, and must be described that way to the shop.
                  </p>
                  <div className="list">
                    {offerable.map((cp) => {
                      const line = doc.offer.find((l) => l.capability === cp.key);
                      return (
                        <div key={cp.key}>
                          <label
                            className="li"
                            style={{ cursor: locked ? "default" : "pointer" }}
                          >
                            <span>
                              <input
                                type="checkbox"
                                disabled={locked}
                                checked={line !== undefined}
                                onChange={() => toggle(cp.key, c)}
                                style={{ marginRight: 8 }}
                              />
                              <strong>{cp.name}</strong>
                              <div
                                className="dim"
                                style={{ fontSize: 11.5, marginLeft: 24 }}
                              >
                                {cp.key}
                              </div>
                            </span>
                            {cp.status === "available" ? (
                              <span className="badge ok">deliverable today</span>
                            ) : (
                              <span className="badge warn">
                                not shipped — {cp.status}
                              </span>
                            )}
                          </label>
                          {line && !locked && (
                            <input
                              type="text"
                              placeholder="How you will describe this line"
                              value={line.note}
                              onChange={(e) => setNote(cp.key, e.target.value)}
                              style={{ marginTop: 6 }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {deferred.length > 0 && (
                    <div className="banner" style={{ marginTop: 12 }}>
                      Not offerable at all: {deferred.map((d) => d.name).join(", ")}.
                      Deferred is a decision not to build, and the database rejects a
                      proposal that mentions it in any form.
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Findings quoted in this proposal">
                {doc.cited_findings.length === 0 ? (
                  <EmptyState title="No findings cited">
                    A proposal drafted from an audit carries that audit&rsquo;s findings
                    across with their confidence. This one was not, so it rests on
                    nothing recorded.
                  </EmptyState>
                ) : (
                  <>
                    <div
                      className={
                        doc.evidence && doc.evidence.evidenced === 0
                          ? "banner bdanger"
                          : "banner"
                      }
                      style={{ marginBottom: 12 }}
                    >
                      {doc.evidence
                        ? evidenceNote(doc.evidence.findings, doc.evidence.evidenced)
                        : "The evidence base of this document was not recorded."}
                    </div>
                    <div className="list">
                      {doc.cited_findings.map((f, i) => (
                        <div className="li" key={i}>
                          <span>{f.statement}</span>
                          <span className="row" style={{ gap: 6 }}>
                            <Evidence confidence={f.confidence} />
                            {f.evidence_url && (
                              <a
                                href={f.evidence_url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="muted"
                                style={{ fontSize: 12 }}
                              >
                                source ↗
                              </a>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>

              {/* ── Lifecycle ─────────────────────────────────────────── */}
              <Card title="Where this proposal is">
                {!locked ? (
                  <div className="row">
                    <button
                      className="btn primary"
                      disabled={act.busy || problems.length > 0}
                      onClick={persist}
                    >
                      {id ? "Save draft" : "Save as draft"}
                    </button>
                    {id && (
                      <>
                        <button
                          className="btn"
                          disabled={act.busy || problems.length > 0}
                          onClick={() =>
                            act.run(
                              "Recorded as sent.",
                              () => markProposalSent(id),
                              () => existing.reload(),
                            )
                          }
                        >
                          Mark as sent
                        </button>
                        <span className="dim" style={{ fontSize: 12, maxWidth: 380 }}>
                          This records that you sent it. It does not send anything —
                          there is no email or SMS provider connected to this platform,
                          so you send the document yourself and log it here.
                        </span>
                      </>
                    )}
                  </div>
                ) : status === "sent" ? (
                  <>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Sent on {when(existing.data?.sent_at)}. Record what the shop said.
                    </p>
                    <Field label="Note">
                      <input
                        type="text"
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                      />
                    </Field>
                    <div className="row">
                      {(["accepted", "declined", "withdrawn"] as const).map((s) => (
                        <button
                          key={s}
                          className={`btn${s === "accepted" ? " primary" : ""}`}
                          disabled={act.busy}
                          onClick={() =>
                            act.run(
                              `Recorded as ${s}.`,
                              () => decideProposal(id, s, decisionNote),
                              () => existing.reload(),
                            )
                          }
                        >
                          {s === "accepted"
                            ? "They accepted"
                            : s === "declined"
                              ? "They declined"
                              : "We withdrew it"}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <dl className="kv">
                      <dt>Outcome</dt>
                      <dd>{status}</dd>
                      <dt>Decided</dt>
                      <dd>{when(existing.data?.decided_at)}</dd>
                      {existing.data?.decision_note && (
                        <>
                          <dt>Note</dt>
                          <dd>{existing.data.decision_note}</dd>
                        </>
                      )}
                    </dl>
                    {status === "accepted" && (
                      <div className="row" style={{ marginTop: 14 }}>
                        {agency.can.onboard_clients ? (
                          <button className="btn primary" onClick={onOnboard}>
                            Onboard this client →
                          </button>
                        ) : (
                          <span className="dim" style={{ fontSize: 12.5 }}>
                            Onboarding needs the platform-wide right to create a tenant
                            as well as this agency&rsquo;s sale permission, and your
                            account does not have it.
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Card>
            </>
          );
        }}
      </Loaded>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
