"use client";

import { useState } from "react";

import {
  campaigns,
  discovery,
  pipeline,
  proposals,
  recordDiscovery,
  startRun,
  type Agency,
  type DiscoveryAnswers,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { evidenceNote, isWhollyInferred, when } from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import { Crumbs, Loaded, PageHead, Score, Toast } from "@/components/parts";

/** Three-valued, because "we did not ask" is not "no". */
function Tri({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
}) {
  const v = value === undefined ? null : value;
  return (
    <Field label={label}>
      <div className="row" style={{ gap: 6 }}>
        {[
          { k: true, t: "Yes" },
          { k: false, t: "No" },
          { k: null, t: "Didn't ask" },
        ].map((o) => (
          <button
            key={String(o.k)}
            type="button"
            className={`btn sm${v === o.k ? " primary" : ""}`}
            onClick={() => onChange(o.k)}
          >
            {o.t}
          </button>
        ))}
      </div>
    </Field>
  );
}

/**
 * Screen 4 — one shop, and everything that has happened to it.
 *
 * The hub for stages 2 through 6: the discovery call, the audit runs, the
 * proposals and the onboarding. Each section shows what exists; where nothing
 * does, it says what would be there and what to do about it.
 */
export default function Prospect({
  agency,
  prospectId,
  onBack,
  onOpenRun,
  onNewProposal,
  onOpenProposal,
  onOnboard,
  onOpenShop,
}: {
  agency: Agency;
  prospectId: string;
  onBack: () => void;
  onOpenRun: (runId: string) => void;
  onNewProposal: (runId: string | null) => void;
  onOpenProposal: (id: string) => void;
  onOnboard: () => void;
  onOpenShop: (tenantId: string) => void;
}) {
  const pipe = useAsync(() => pipeline(agency.tenant_id), [agency.tenant_id]);
  const disc = useAsync(() => discovery(prospectId), [prospectId]);
  const props = useAsync(() => proposals(prospectId), [prospectId]);
  const camps = useAsync(() => campaigns(agency.tenant_id), [agency.tenant_id]);
  const act = useAction();

  const [answers, setAnswers] = useState<DiscoveryAnswers | null>(null);
  const [campaign, setCampaign] = useState("");

  const entry = pipe.data?.find((e) => e.prospect_id === prospectId) ?? null;
  const form: DiscoveryAnswers = answers ?? {
    own_website: disc.data?.own_website ?? null,
    online_booking: disc.data?.online_booking ?? null,
    missed_call_handling: disc.data?.missed_call_handling ?? null,
    review_process: disc.data?.review_process ?? null,
    client_records: disc.data?.client_records ?? null,
    takes_walkins: disc.data?.takes_walkins ?? null,
    booking_platform: disc.data?.booking_platform ?? null,
    chairs: disc.data?.chairs ?? null,
    notes: disc.data?.notes ?? null,
  };

  function set<K extends keyof DiscoveryAnswers>(k: K, v: DiscoveryAnswers[K]) {
    setAnswers({ ...form, [k]: v });
  }

  function saveDiscovery() {
    act.run(
      "Discovery call saved.",
      () => recordDiscovery(prospectId, form),
      () => {
        setAnswers(null);
        disc.reload();
        pipe.reload();
      },
    );
  }

  function beginRun() {
    let id = "";
    act.run(
      "Audit started.",
      () => startRun(campaign, prospectId).then((v) => (id = v)),
      () => {
        if (id) onOpenRun(id);
      },
    );
  }

  return (
    <>
      <Crumbs
        trail={[
          { label: "Pipeline", go: onBack },
          { label: entry?.business_name ?? "Shop" },
        ]}
      />

      <Loaded
        state={pipe}
        isEmpty={() => entry === null}
        empty={
          <EmptyState title="That shop is not in this agency's pipeline">
            It may belong to another agency tenant, or it may have been removed. Go back
            to the board and pick a shop from it.
          </EmptyState>
        }
      >
        {() => {
          if (!entry) return null;
          return (
            <>
              <PageHead
                title={entry.business_name}
                sub={
                  [entry.locality, entry.region].filter(Boolean).join(", ") ||
                  "No location recorded"
                }
                action={
                  entry.onboarding?.client_tenant_id ? (
                    <button
                      className="btn primary"
                      onClick={() => onOpenShop(entry.onboarding!.client_tenant_id!)}
                    >
                      Open the client shop →
                    </button>
                  ) : entry.latest_proposal?.status === "accepted" ? (
                    agency.can.onboard_clients ? (
                      <button className="btn primary" onClick={onOnboard}>
                        Onboard this client →
                      </button>
                    ) : (
                      <span
                        className="dim"
                        style={{ fontSize: 12, maxWidth: 260, display: "block" }}
                      >
                        Sold, but onboarding needs both the sale permission and the
                        platform-wide right to create a tenant, and your account does
                        not have the second.
                      </span>
                    )
                  ) : undefined
                }
              />

              <div className="grid cols-4" style={{ marginBottom: 20 }}>
                <div className="stat">
                  <div className="stat-label">Latest audit</div>
                  <Score run={entry.latest_run} />
                </div>
                <div className="stat">
                  <div className="stat-label">Findings</div>
                  <div className="stat-value" style={{ fontSize: 24 }}>
                    {entry.latest_run?.findings ?? "—"}
                  </div>
                  <div className="stat-sub">
                    {entry.latest_run
                      ? `${entry.latest_run.evidenced_findings} carry an evidence URL`
                      : "No audit has been run"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Discovery call</div>
                  <div className="stat-value" style={{ fontSize: 24 }}>
                    {disc.data?.called ? "Answered" : "—"}
                  </div>
                  <div className="stat-sub">
                    {disc.data?.called
                      ? when(disc.data.answered_at)
                      : "Nothing recorded yet"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Proposals</div>
                  <div className="stat-value" style={{ fontSize: 24 }}>
                    {entry.proposals}
                  </div>
                  <div className="stat-sub">
                    {entry.latest_proposal
                      ? `latest is ${entry.latest_proposal.status}`
                      : "None drafted"}
                  </div>
                </div>
              </div>

              {isWhollyInferred(entry.latest_run) && (
                <div className="banner bdanger" style={{ marginBottom: 18 }}>
                  {evidenceNote(
                    entry.latest_run!.findings,
                    entry.latest_run!.evidenced_findings,
                  )}
                </div>
              )}

              <div className="grid cols-2">
                {/* ── The audit ───────────────────────────────────────── */}
                <Card title="Audits">
                  {entry.latest_run ? (
                    <div className="list">
                      <div className="li">
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {entry.latest_run.status.replace(/_/g, " ")}
                          </div>
                          <div className="dim" style={{ fontSize: 12 }}>
                            started {when(entry.latest_run.started_at)} ·{" "}
                            {entry.latest_run.coverage.scored} of{" "}
                            {entry.latest_run.coverage.possible} dimensions assessed
                            {entry.latest_run.has_outreach_hook
                              ? " · has an outreach hook"
                              : ""}
                          </div>
                        </div>
                        <button
                          className="btn sm"
                          onClick={() => onOpenRun(entry.latest_run!.run_id)}
                        >
                          Open
                        </button>
                      </div>
                      {entry.runs > 1 && (
                        <div className="dim" style={{ fontSize: 12 }}>
                          {entry.runs} runs in total. Only the latest is summarised
                          here; findings are append-only, so an earlier run's evidence
                          is never rewritten by a later one.
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState title="Not audited yet">
                      Nothing has been assessed for this shop, so there is no score to
                      show and nothing that could be quoted to them.
                    </EmptyState>
                  )}

                  {agency.can.run_audits && (
                    <div
                      style={{
                        marginTop: 14,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 14,
                      }}
                    >
                      <Loaded
                        state={camps}
                        isEmpty={(d) => d.length === 0}
                        empty={
                          <div className="dim" style={{ fontSize: 12.5 }}>
                            No campaign exists yet, and an audit cannot be started
                            without one.
                          </div>
                        }
                      >
                        {(list) => (
                          <div className="row">
                            <select
                              value={campaign}
                              onChange={(e) => setCampaign(e.target.value)}
                              style={{ maxWidth: 240 }}
                            >
                              <option value="">Choose a campaign…</option>
                              {list.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({Object.keys(c.weights).length} dimension
                                  {Object.keys(c.weights).length === 1 ? "" : "s"})
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn primary"
                              disabled={act.busy || !campaign}
                              onClick={beginRun}
                            >
                              Start an audit
                            </button>
                          </div>
                        )}
                      </Loaded>
                    </div>
                  )}
                </Card>

                {/* ── Proposals ───────────────────────────────────────── */}
                <Card
                  title="Proposals"
                  action={
                    agency.can.manage_proposals ? (
                      <button
                        className="btn sm primary"
                        onClick={() => onNewProposal(entry.latest_run?.run_id ?? null)}
                      >
                        + Draft
                      </button>
                    ) : undefined
                  }
                >
                  <Loaded
                    state={props}
                    isEmpty={(d) => d.length === 0}
                    empty={
                      <EmptyState title="No proposal yet">
                        Draft one from the audit and the catalog will decide what may be
                        offered — a capability that has not shipped cannot be sold as
                        available.
                      </EmptyState>
                    }
                  >
                    {(list) => (
                      <div className="list">
                        {list.map((p) => (
                          <div className="li" key={p.id}>
                            <div>
                              <div className="row" style={{ gap: 7 }}>
                                <span
                                  className={`badge ${
                                    p.status === "accepted"
                                      ? "ok"
                                      : p.status === "declined" ||
                                          p.status === "withdrawn"
                                        ? "danger"
                                        : p.status === "sent"
                                          ? "info"
                                          : "demo"
                                  }`}
                                >
                                  {p.status}
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {p.offer_lines} line{p.offer_lines === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div className="dim" style={{ fontSize: 12 }}>
                                drafted {when(p.created_at)}
                                {p.sent_at ? ` · sent ${when(p.sent_at)}` : ""}
                                {p.decided_at ? ` · decided ${when(p.decided_at)}` : ""}
                              </div>
                            </div>
                            <button
                              className="btn sm"
                              onClick={() => onOpenProposal(p.id)}
                            >
                              Open
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Loaded>
                </Card>
              </div>

              {/* ── The discovery call ─────────────────────────────────── */}
              <Card
                title="Discovery call"
                action={
                  disc.data?.called ? (
                    <span className="badge ok">
                      answered {when(disc.data.answered_at)}
                    </span>
                  ) : (
                    <span className="badge demo">not called</span>
                  )
                }
              >
                {!agency.can.manage_discovery ? (
                  <EmptyState title="You cannot record a discovery call">
                    Your membership of {agency.name} does not carry
                    transform_audit.discovery.manage.
                  </EmptyState>
                ) : (
                  <>
                    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                      Every question has three answers. &ldquo;Didn&rsquo;t ask&rdquo;
                      is stored as nothing at all, which is not the same as
                      &ldquo;no&rdquo; — and a call where nothing was established is not
                      recorded as answered.
                    </p>
                    <div className="grid cols-3">
                      <Tri
                        label="Do they own a website?"
                        value={form.own_website}
                        onChange={(v) => set("own_website", v)}
                      />
                      <Tri
                        label="Can people book online?"
                        value={form.online_booking}
                        onChange={(v) => set("online_booking", v)}
                      />
                      <Tri
                        label="Is a missed call handled?"
                        value={form.missed_call_handling}
                        onChange={(v) => set("missed_call_handling", v)}
                      />
                      <Tri
                        label="Do they ask for reviews?"
                        value={form.review_process}
                        onChange={(v) => set("review_process", v)}
                      />
                      <Tri
                        label="Do they keep client records?"
                        value={form.client_records}
                        onChange={(v) => set("client_records", v)}
                      />
                      <Tri
                        label="Do they take walk-ins?"
                        value={form.takes_walkins}
                        onChange={(v) => set("takes_walkins", v)}
                      />
                      <Field label="Booking platform, if any">
                        <input
                          type="text"
                          value={form.booking_platform ?? ""}
                          onChange={(e) =>
                            set("booking_platform", e.target.value || null)
                          }
                        />
                      </Field>
                      <Field label="Chairs">
                        <input
                          type="number"
                          min={1}
                          value={form.chairs ?? ""}
                          onChange={(e) =>
                            set(
                              "chairs",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Notes from the call">
                      <textarea
                        value={form.notes ?? ""}
                        onChange={(e) => set("notes", e.target.value || null)}
                      />
                    </Field>
                    <button
                      className="btn primary"
                      disabled={act.busy}
                      onClick={saveDiscovery}
                    >
                      {act.busy ? "Saving…" : "Save the call"}
                    </button>
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
