"use client";

import { useState } from "react";

import {
  addRecommendation,
  catalog,
  finishRun,
  recommendedBundle,
  recordDimension,
  recordFinding,
  report,
  setHook,
  type Agency,
  type Confidence,
  type Dimension,
  type Priority,
  type Report,
  type Severity,
} from "@/lib/api";
import { useAction, useAsync } from "@/lib/hooks";
import { evidenceNote, offerableCapabilities } from "@/lib/model";
import { Card, EmptyState, Field } from "@/components/ui";
import { Crumbs, FindingCard, Loaded, PageHead, Toast } from "@/components/parts";

const DIMENSIONS: Dimension[] = ["website", "google_business", "social", "competitor"];
const CONFIDENCES: Confidence[] = ["verified", "inferred", "unknown"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "info"];

/**
 * Screens 5 and 6 — run the audit, and read the report.
 *
 * Every write here goes through the append-only surface. Findings cannot be
 * edited or deleted once recorded, and record_finding() refuses a finished
 * run, so a report cannot change after it was quoted. The form therefore warns
 * before, not after.
 *
 * `verified` requires an evidence URL — the schema enforces it — so the form
 * demands one rather than letting the operator discover the refusal. The
 * default is `inferred`, because that is what an unevidenced observation is.
 */
export default function AuditRun({
  agency,
  runId,
  onBack,
  onDraftProposal,
}: {
  agency: Agency;
  runId: string;
  onBack: () => void;
  onDraftProposal: (runId: string) => void;
}) {
  const rep = useAsync(() => report(runId), [runId]);
  const bundle = useAsync(() => recommendedBundle(runId), [runId]);
  const cat = useAsync(() => catalog(), []);
  const act = useAction();

  const [fDim, setFDim] = useState<Dimension>("website");
  const [fCode, setFCode] = useState("");
  const [fText, setFText] = useState("");
  const [fConf, setFConf] = useState<Confidence>("inferred");
  const [fSev, setFSev] = useState<Severity>("medium");
  const [fUrl, setFUrl] = useState("");

  const [sDim, setSDim] = useState<Dimension>("website");
  const [sScore, setSScore] = useState("");
  const [sConf, setSConf] = useState<Confidence>("verified");
  const [sRubric, setSRubric] = useState("barber_web_rubric_v1");
  const [sNote, setSNote] = useState("");

  const [rTitle, setRTitle] = useState("");
  const [rDetail, setRDetail] = useState("");
  const [rCap, setRCap] = useState("");
  const [rPriority, setRPriority] = useState<Priority>("structural");

  const [hook, setHookText] = useState("");
  const [hookFinding, setHookFinding] = useState("");

  // report() returns each finding's statement, dimension, confidence and
  // evidence URL, but not its id — so the only ids this screen can name are
  // the ones record_finding() handed back during this sitting. The hook picker
  // therefore offers those, and the note under it says so, rather than
  // presenting a box that only works if you already know a number.
  const [recorded, setRecorded] = useState<{ id: number; statement: string }[]>([]);

  function reloadAll() {
    rep.reload();
    bundle.reload();
  }

  const running = rep.data?.status === "running";
  const verifiedNeedsUrl = fConf === "verified" && fUrl.trim() === "";

  return (
    <>
      <Crumbs trail={[{ label: "Pipeline", go: onBack }, { label: "Audit run" }]} />

      <Loaded
        state={rep}
        empty={
          <EmptyState title="That audit run could not be read">
            It may belong to another agency tenant, or it may not exist.
          </EmptyState>
        }
      >
        {(r: Report) => {
          const evidenced = r.findings.filter((f) => f.evidence_url !== null).length;
          return (
            <>
              <PageHead
                title={r.shop.business_name}
                sub={
                  <>
                    Audit run · <strong>{r.status.replace(/_/g, " ")}</strong> ·{" "}
                    {r.coverage.scored} of {r.coverage.possible} weighted dimensions
                    assessed
                  </>
                }
                action={
                  running ? (
                    agency.can.run_audits ? (
                      <button
                        className="btn primary"
                        disabled={act.busy}
                        onClick={() =>
                          act.run("Audit finished.", () => finishRun(runId), reloadAll)
                        }
                      >
                        Finish the audit
                      </button>
                    ) : undefined
                  ) : agency.can.manage_proposals ? (
                    <button
                      className="btn primary"
                      onClick={() => onDraftProposal(runId)}
                    >
                      Draft a proposal from this →
                    </button>
                  ) : undefined
                }
              />

              {/* The headline honesty statement, above everything else. */}
              <div
                className={
                  evidenced === 0 && r.findings.length > 0 ? "banner bdanger" : "banner"
                }
                style={{ marginBottom: 18 }}
              >
                {evidenceNote(r.findings.length, evidenced)}
              </div>

              <div className="grid cols-4" style={{ marginBottom: 20 }}>
                <div className="stat">
                  <div className="stat-label">Composite</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {r.composite_score === null ? "—" : r.composite_score}
                  </div>
                  <div className="stat-sub">
                    {r.composite_score === null
                      ? "Nothing that the campaign weights has been scored"
                      : r.coverage.scored < r.coverage.possible
                        ? `From ${r.coverage.scored} of ${r.coverage.possible} dimensions only`
                        : "All weighted dimensions assessed"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Findings</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {r.findings.length}
                  </div>
                  <div className="stat-sub">{evidenced} with an evidence URL</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Recommendations</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {r.recommendations.length}
                  </div>
                  <div className="stat-sub">structural first, then quick wins</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Unassessed</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {r.unscored_dimensions.length}
                  </div>
                  <div className="stat-sub">
                    {r.unscored_dimensions.length === 0
                      ? "nothing weighted was missed"
                      : r.unscored_dimensions
                          .map((d) => d.replace(/_/g, " "))
                          .join(", ")}
                  </div>
                </div>
              </div>

              <div className="grid cols-2">
                <Card title={`Findings (${r.findings.length})`}>
                  {r.findings.length === 0 ? (
                    <EmptyState title="Nothing recorded yet">
                      A finding is a single observation about this shop. It is
                      append-only: once recorded it cannot be edited or removed, which
                      is what stops a report changing after it was shown to somebody.
                    </EmptyState>
                  ) : (
                    <div className="list">
                      {r.findings.map((f, i) => (
                        <FindingCard
                          key={`${f.code}-${i}`}
                          statement={f.statement}
                          confidence={f.confidence}
                          evidenceUrl={f.evidence_url}
                          dimension={f.dimension}
                          severity={f.severity}
                        />
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Scorecard">
                  {r.scorecard.length === 0 ? (
                    <EmptyState title="Nothing scored yet">
                      A dimension the campaign weights must be scored, or explicitly
                      recorded as unknown, before this run can read as complete.
                    </EmptyState>
                  ) : (
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Dimension</th>
                          <th>Score</th>
                          <th>Confidence</th>
                          <th>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.scorecard.map((s) => (
                          <tr key={s.dimension}>
                            <td>{s.dimension.replace(/_/g, " ")}</td>
                            <td>
                              {s.score === null ? (
                                <span className="dim">not scored</span>
                              ) : (
                                s.score
                              )}
                            </td>
                            <td>
                              <span className={`ev ${s.confidence}`}>
                                {s.confidence}
                              </span>
                            </td>
                            <td className="muted">
                              {r.weights[s.dimension] ?? "unweighted"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {r.scorecard.some((s) => s.note) && (
                    <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                      {r.scorecard
                        .filter((s) => s.note)
                        .map((s) => `${s.dimension}: ${s.note}`)
                        .join(" · ")}
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Recommendations">
                {r.recommendations.length === 0 ? (
                  <EmptyState title="None yet">
                    A recommendation may name a BarberOS capability. Where it does, the
                    proposal builder can turn it into an offer line — and only where the
                    catalog says that capability has actually shipped.
                  </EmptyState>
                ) : (
                  <div className="list">
                    {r.recommendations.map((rec, i) => {
                      const line = bundle.data?.find(
                        (b) => b.capability_key === rec.capability_key,
                      );
                      return (
                        <div className="li" key={i}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{rec.title}</div>
                            {rec.detail && (
                              <div className="muted" style={{ fontSize: 12.5 }}>
                                {rec.detail}
                              </div>
                            )}
                            <div
                              className="dim"
                              style={{ fontSize: 11.5, marginTop: 3 }}
                            >
                              {rec.priority.replace(/_/g, " ")} · rank {rec.rank}
                              {rec.capability_key
                                ? ` · ${rec.capability_key}`
                                : " · no capability named"}
                            </div>
                          </div>
                          {rec.capability_key &&
                            (line?.is_shipped ? (
                              <span className="badge ok">shipped</span>
                            ) : (
                              <span className="badge warn">
                                {line?.status ?? "not shipped"}
                              </span>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card title="Outreach hook">
                {r.outreach_hook ? (
                  <>
                    <p style={{ marginTop: 0, fontSize: 15 }}>
                      &ldquo;{r.outreach_hook}&rdquo;
                    </p>
                    <div className="dim" style={{ fontSize: 12 }}>
                      A hook must cite a finding from this run. It does not have to cite
                      an EVIDENCED one — so before you say this to a shop, check the
                      confidence on the finding behind it.
                    </div>
                  </>
                ) : (
                  <EmptyState title="No hook set">
                    The one sentence you would open with. It has to cite a finding from
                    this run.
                  </EmptyState>
                )}
              </Card>

              {/* ── The recording forms. Only while the run is open. ──── */}
              {!running ? (
                <div className="banner" style={{ marginTop: 18 }}>
                  This run is {r.status.replace(/_/g, " ")}. Its findings are closed —
                  adding to them now would let a report change after it was sent, which
                  append-only findings exist to prevent. Start a new run instead.
                </div>
              ) : !agency.can.run_audits ? (
                <div className="banner" style={{ marginTop: 18 }}>
                  This run is open, but your membership of {agency.name} does not carry
                  transform_audit.audit.create, so the recording forms are not shown.
                </div>
              ) : (
                <>
                  <h3 className="section-title" style={{ marginTop: 26 }}>
                    Record
                  </h3>
                  <div className="grid cols-2">
                    <Card title="A finding">
                      <div className="grid cols-2">
                        <Field label="Dimension">
                          <select
                            value={fDim}
                            onChange={(e) => setFDim(e.target.value as Dimension)}
                          >
                            {DIMENSIONS.map((d) => (
                              <option key={d} value={d}>
                                {d.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Code (short, reusable)">
                          <input
                            type="text"
                            placeholder="no_booking_link"
                            value={fCode}
                            onChange={(e) => setFCode(e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field label="What you observed, in one sentence">
                        <textarea
                          value={fText}
                          onChange={(e) => setFText(e.target.value)}
                        />
                      </Field>
                      <div className="grid cols-2">
                        <Field label="Confidence">
                          <select
                            value={fConf}
                            onChange={(e) => setFConf(e.target.value as Confidence)}
                          >
                            {CONFIDENCES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Severity">
                          <select
                            value={fSev}
                            onChange={(e) => setFSev(e.target.value as Severity)}
                          >
                            {SEVERITIES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Evidence URL">
                        <input
                          type="url"
                          placeholder="https://"
                          value={fUrl}
                          onChange={(e) => setFUrl(e.target.value)}
                        />
                      </Field>
                      {verifiedNeedsUrl && (
                        <div className="banner bdanger">
                          A finding marked <strong>verified</strong> must carry the URL
                          that verifies it. Either paste it, or record this as inferred
                          — which is what an observation without a source is.
                        </div>
                      )}
                      <button
                        className="btn primary"
                        disabled={
                          act.busy || !fCode.trim() || !fText.trim() || verifiedNeedsUrl
                        }
                        onClick={() => {
                          const statement = fText.trim();
                          act.run(
                            "Finding recorded.",
                            () =>
                              recordFinding({
                                run: runId,
                                dimension: fDim,
                                code: fCode.trim(),
                                statement,
                                confidence: fConf,
                                severity: fSev,
                                evidenceUrl: fUrl.trim() || null,
                              }).then((id) => {
                                setRecorded((p) => [...p, { id, statement }]);
                                return id;
                              }),
                            () => {
                              setFCode("");
                              setFText("");
                              setFUrl("");
                              reloadAll();
                            },
                          );
                        }}
                      >
                        Record finding
                      </button>
                    </Card>

                    <Card title="A dimension score">
                      <div className="grid cols-2">
                        <Field label="Dimension">
                          <select
                            value={sDim}
                            onChange={(e) => setSDim(e.target.value as Dimension)}
                          >
                            {DIMENSIONS.map((d) => (
                              <option key={d} value={d}>
                                {d.replace(/_/g, " ")}
                                {r.weights[d] === undefined ? " (unweighted)" : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Score 0–100, or leave blank for unknown">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={sScore}
                            onChange={(e) => setSScore(e.target.value)}
                          />
                        </Field>
                        <Field label="Confidence">
                          <select
                            value={sConf}
                            onChange={(e) => setSConf(e.target.value as Confidence)}
                          >
                            {CONFIDENCES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Rubric version">
                          <input
                            type="text"
                            value={sRubric}
                            onChange={(e) => setSRubric(e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field label="Why, or why it could not be assessed">
                        <input
                          type="text"
                          value={sNote}
                          onChange={(e) => setSNote(e.target.value)}
                        />
                      </Field>
                      <div className="banner">
                        {sConf === "unknown"
                          ? "Unknown means we could not reach it. The score must be blank, and this dimension will count as unassessed — the run will finish as partially completed."
                          : "A score needs a confidence that is not unknown, or it does not count towards coverage."}
                      </div>
                      {sConf === "verified" && evidenced === 0 && (
                        <div className="banner bdanger">
                          This run has no finding carrying an evidence URL, and the
                          database refuses to call a dimension <strong>verified</strong>{" "}
                          without one. Record an evidenced finding first, or score this
                          as inferred.
                        </div>
                      )}
                      {r.weights[sDim] === undefined && (
                        <div className="banner bdanger">
                          This campaign does not weight {sDim.replace(/_/g, " ")}. A
                          score here is recorded but cannot influence the composite.
                        </div>
                      )}
                      <button
                        className="btn primary"
                        disabled={
                          act.busy ||
                          !sRubric.trim() ||
                          (sConf === "unknown" && sScore !== "") ||
                          (sConf !== "unknown" && sScore === "") ||
                          (sConf === "verified" && evidenced === 0)
                        }
                        onClick={() =>
                          act.run(
                            "Dimension scored.",
                            () =>
                              recordDimension({
                                run: runId,
                                dimension: sDim,
                                score: sScore === "" ? null : Number(sScore),
                                confidence: sConf,
                                rubric: sRubric.trim(),
                                note: sNote.trim(),
                              }),
                            () => {
                              setSScore("");
                              setSNote("");
                              reloadAll();
                            },
                          )
                        }
                      >
                        Record score
                      </button>
                    </Card>

                    <Card title="A recommendation">
                      <Field label="What they should do">
                        <input
                          type="text"
                          value={rTitle}
                          onChange={(e) => setRTitle(e.target.value)}
                        />
                      </Field>
                      <Field label="Detail">
                        <textarea
                          value={rDetail}
                          onChange={(e) => setRDetail(e.target.value)}
                        />
                      </Field>
                      <div className="grid cols-2">
                        <Field label="Priority">
                          <select
                            value={rPriority}
                            onChange={(e) => setRPriority(e.target.value as Priority)}
                          >
                            <option value="structural">structural</option>
                            <option value="quick_win">quick win</option>
                          </select>
                        </Field>
                        <Field label="BarberOS capability, if any">
                          <select
                            value={rCap}
                            onChange={(e) => setRCap(e.target.value)}
                          >
                            <option value="">
                              none — this is advice, not a module
                            </option>
                            {(cat.data ? offerableCapabilities(cat.data) : []).map(
                              (c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name}
                                  {c.status === "available" ? "" : ` — ${c.status}`}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>
                      </div>
                      <button
                        className="btn primary"
                        disabled={act.busy || !rTitle.trim()}
                        onClick={() =>
                          act.run(
                            "Recommendation added.",
                            () =>
                              addRecommendation({
                                run: runId,
                                priority: rPriority,
                                title: rTitle.trim(),
                                detail: rDetail.trim(),
                                capability: rCap || null,
                                addresses: null,
                                rank: r.recommendations.length + 1,
                              }),
                            () => {
                              setRTitle("");
                              setRDetail("");
                              setRCap("");
                              reloadAll();
                            },
                          )
                        }
                      >
                        Add recommendation
                      </button>
                    </Card>

                    <Card title="The outreach hook">
                      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                        Must cite one of this run&rsquo;s findings. Pick the finding it
                        rests on so anybody reading the hook later can check what it was
                        built from.
                      </p>
                      {recorded.length > 0 ? (
                        <Field label="The finding it rests on">
                          <select
                            value={hookFinding}
                            onChange={(e) => setHookFinding(e.target.value)}
                          >
                            <option value="">Choose a finding…</option>
                            {recorded.map((f) => (
                              <option key={f.id} value={String(f.id)}>
                                #{f.id} — {f.statement.slice(0, 70)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label="Finding id">
                          <input
                            type="number"
                            placeholder="the id of a finding in this run"
                            value={hookFinding}
                            onChange={(e) => setHookFinding(e.target.value)}
                          />
                        </Field>
                      )}
                      <div
                        className="dim"
                        style={{ fontSize: 11.5, marginTop: -4, marginBottom: 8 }}
                      >
                        {recorded.length > 0
                          ? `Offering the ${recorded.length} finding${recorded.length === 1 ? "" : "s"} recorded in this sitting. A finding recorded earlier can still be cited by typing its id.`
                          : "The report does not carry finding ids, so record a finding above and it will appear here to choose from."}
                      </div>
                      <Field label="The sentence">
                        <textarea
                          value={hook}
                          onChange={(e) => setHookText(e.target.value)}
                        />
                      </Field>
                      <div className="banner">
                        The database requires a hook to cite a finding. It does not
                        require that finding to be evidenced — that judgement is yours,
                        and this run has {evidenced} of {r.findings.length} evidenced.
                      </div>
                      <button
                        className="btn primary"
                        disabled={act.busy || !hook.trim() || !hookFinding}
                        onClick={() =>
                          act.run(
                            "Outreach hook set.",
                            () => setHook(runId, Number(hookFinding), hook.trim()),
                            () => {
                              setHookText("");
                              setHookFinding("");
                              reloadAll();
                            },
                          )
                        }
                      >
                        Set hook
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          );
        }}
      </Loaded>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
