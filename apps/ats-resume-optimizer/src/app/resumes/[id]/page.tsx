import Link from "next/link";
import { notFound } from "next/navigation";

import {
  GENERATED_FORMAT_GUARANTEES,
  buildExportDocument,
  type GeneratedLine,
} from "@hl-bos/ats-resume";
import {
  Audit,
  Card,
  Empty,
  MatchTag,
  Notice,
  PageHead,
  ValidationTag,
} from "@/components/ui.tsx";
import { confirmGeneratedLine, editGeneratedLine } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import { sortMatches } from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

/**
 * The review screen.
 *
 * Left: the generated resume, every sentence editable.
 * Right: the analysis it was built from.
 *
 * Each sentence carries a disclosure showing the evidence it came from, the
 * requirement it answers and why it is worded that way. That is what makes
 * this auditable rather than magical — and it is the screen where a user
 * decides whether to trust the tool, so nothing on it is hidden behind a
 * "learn more" link.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const found = workspace.generated.find((g) => g.id === id);
  if (found === undefined) notFound();
  // Bound to a const so the nested LineBlock closure keeps the narrowing.
  const generated = found;

  const analysis = workspace.analyses.find((a) => a.id === generated.analysisId);
  const job = workspace.jobs.find((j) => j.id === generated.jobPostingId);
  const { dropped } = buildExportDocument(generated);

  const lines: GeneratedLine[] = [
    generated.headline,
    ...generated.summary,
    ...generated.experience.flatMap((e) => e.bullets),
  ];
  const needsConfirmation = lines.filter((l) => l.validation === "needs_confirmation");
  const unsupported = lines.filter((l) => l.validation === "unsupported");

  const requirementText = new Map(
    (job?.requirements ?? []).map((r) => [r.id, r.text] as const),
  );

  function LineBlock({ line }: { line: GeneratedLine }) {
    return (
      <div className="line">
        <form action={editGeneratedLine}>
          <input type="hidden" name="resumeId" value={generated.id} />
          <input type="hidden" name="lineId" value={line.id} />
          <label className="small muted" htmlFor={`line-${line.id}`}>
            {line.section === "header" ? "Headline" : line.section}
          </label>
          <textarea
            id={`line-${line.id}`}
            name="text"
            defaultValue={line.text}
            rows={line.text.length > 140 ? 3 : 2}
          />
          <div className="line-meta">
            <ValidationTag status={line.validation} />
            <button className="btn btn-sm" type="submit">
              Save edit
            </button>
            {line.validation === "needs_confirmation" ||
            line.validation === "unsupported" ? null : (
              <span className="small muted">Exportable</span>
            )}
          </div>
        </form>

        {line.validationNotes.length > 0 ? (
          <Notice tone={line.validation === "unsupported" ? "danger" : "warn"}>
            {line.validationNotes.join(" ")}
            {line.validation === "needs_confirmation" ||
            line.validation === "unsupported" ? (
              <form action={confirmGeneratedLine} style={{ marginTop: 8 }}>
                <input type="hidden" name="resumeId" value={generated.id} />
                <input type="hidden" name="lineId" value={line.id} />
                <button className="btn btn-sm" type="submit">
                  This is true — confirm it
                </button>
                <span className="small muted" style={{ marginLeft: 8 }}>
                  Confirming stores this as a career fact in your profile.
                </span>
              </form>
            ) : null}
          </Notice>
        ) : null}

        <Audit summary="Why does this line say what it says?">
          <dl style={{ margin: 0 }}>
            <dt>Source evidence</dt>
            {line.evidenceText.length === 0 ? (
              <dd className="muted">
                None attached — which is why it cannot be exported.
              </dd>
            ) : (
              line.evidenceText.map((evidence) => (
                <dd key={evidence} className="quote">
                  {evidence}
                </dd>
              ))
            )}

            <dt>Requirement it addresses</dt>
            {line.addressesRequirementIds.length === 0 ? (
              <dd className="muted">
                No single requirement — it is here for context or continuity.
              </dd>
            ) : (
              line.addressesRequirementIds.map((requirementId) => (
                <dd key={requirementId}>
                  {requirementText.get(requirementId) ?? requirementId}
                </dd>
              ))
            )}

            <dt>Why this wording</dt>
            <dd>{line.rationale}</dd>

            {line.originalText === undefined ? null : (
              <>
                <dt>Your original wording</dt>
                <dd className="quote">{line.originalText}</dd>
              </>
            )}
          </dl>
        </Audit>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={`Tailored resume — ${generated.jobTitle}`}
        lead={`${generated.company} · version ${generated.versionNumber} · produced by the ${generated.engine}`}
        action={
          <div className="row">
            <a className="btn" href={`/resumes/${generated.id}/export?format=docx`}>
              Export DOCX
            </a>
            <a className="btn" href={`/resumes/${generated.id}/export?format=pdf`}>
              Export PDF
            </a>
            <a className="btn" href={`/resumes/${generated.id}/export?format=txt`}>
              Plain text
            </a>
          </div>
        }
      />

      {generated.isSample === true ? (
        <Notice tone="sample">
          <strong>Sample resume</strong> — generated from the fictional demo profile.
        </Notice>
      ) : null}

      {unsupported.length > 0 ? (
        <Notice tone="danger">
          <strong>
            {unsupported.length} line{unsupported.length === 1 ? "" : "s"} cannot be
            exported.
          </strong>{" "}
          Nothing unsupported is written into a DOCX or a PDF, so those lines will be
          missing from the file until you edit or confirm them.
        </Notice>
      ) : null}
      {needsConfirmation.length > 0 ? (
        <Notice tone="warn">
          <strong>
            {needsConfirmation.length} line{needsConfirmation.length === 1 ? "" : "s"}{" "}
            need your confirmation.
          </strong>{" "}
          They contain wording that could not be traced to your evidence. Confirm, edit,
          or leave them out — they are excluded from exports until you decide.
        </Notice>
      ) : null}

      <div className="split">
        <div>
          <Card
            title="Generated resume"
            sub="Edit any sentence. Every edit is re-checked against your evidence."
          >
            <h3 style={{ marginBottom: 8 }}>Header</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              {generated.fullName}
              {generated.contact.email === undefined
                ? ""
                : ` · ${generated.contact.email}`}
              {generated.contact.phone === undefined
                ? ""
                : ` · ${generated.contact.phone}`}
            </p>
            <LineBlock line={generated.headline} />

            <h3 style={{ margin: "18px 0 8px" }}>Professional summary</h3>
            {generated.summary.length === 0 ? (
              <Empty>No summary lines could be built from evidence.</Empty>
            ) : (
              generated.summary.map((line) => <LineBlock key={line.id} line={line} />)
            )}

            <h3 style={{ margin: "18px 0 8px" }}>Core competencies</h3>
            <p className="small">{generated.competencies.join(" | ")}</p>
            <p className="hint">
              Only terms your evidence supports. Posting keywords you cannot evidence
              are listed on the analysis page as &quot;not currently evidenced&quot; and
              are never placed here.
            </p>

            <h3 style={{ margin: "18px 0 8px" }}>Professional experience</h3>
            {generated.experience.map((entry) => (
              <div key={entry.entryId} style={{ marginBottom: 18 }}>
                <h3>
                  {entry.title} — {entry.employer}
                </h3>
                <p className="small muted" style={{ margin: "2px 0 4px" }}>
                  {[
                    entry.location,
                    entry.startDate,
                    entry.current ? "Present" : entry.endDate,
                  ]
                    .filter((p) => p !== undefined && p.length > 0)
                    .join(" | ")}
                </p>
                <p className="hint" style={{ marginTop: 0 }}>
                  {entry.relevanceNote}
                </p>
                {entry.bullets.map((line) => (
                  <LineBlock key={line.id} line={line} />
                ))}
              </div>
            ))}

            {generated.education.length > 0 ? (
              <>
                <h3 style={{ margin: "18px 0 8px" }}>Education</h3>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {generated.education.map((entry) => (
                    <li key={entry.id}>
                      {[entry.credential, entry.institution, entry.year]
                        .filter((p) => p !== undefined && p.length > 0)
                        .join(" | ")}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {generated.certifications.length > 0 ? (
              <>
                <h3 style={{ margin: "18px 0 8px" }}>Certifications</h3>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {generated.certifications.map((cert) => (
                    <li key={cert}>{cert}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        </div>

        <div className="sticky-col">
          <Card
            title="Export status"
            sub="What will and will not be written to a file."
          >
            {dropped.length === 0 ? (
              <p className="small">
                Every line is supported. The export contains the document exactly as
                shown.
              </p>
            ) : (
              <div className="stack">
                {dropped.map((line) => (
                  <div key={line.text} className="line">
                    <p className="small" style={{ margin: 0 }}>
                      {line.text}
                    </p>
                    <p className="small muted" style={{ margin: "6px 0 0" }}>
                      {line.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <details className="audit" style={{ marginTop: 10 }}>
              <summary>ATS formatting guarantees of the exported file</summary>
              <div className="audit-body">
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {GENERATED_FORMAT_GUARANTEES.map((guarantee) => (
                    <li key={guarantee}>{guarantee}</li>
                  ))}
                </ul>
              </div>
            </details>
          </Card>

          {analysis === undefined ? null : (
            <>
              <Card
                title="Match analysis"
                sub="The analysis this resume was built from."
              >
                <p className="small">
                  Score now <strong>{analysis.scoreBefore.overall.toFixed(1)}</strong>,
                  projected{" "}
                  <strong>{analysis.scoreProjected.overall.toFixed(1)}</strong> after
                  supported revisions.{" "}
                  <Link href={`/analyses/${analysis.id}`}>Open the full analysis</Link>.
                </p>
                <div className="stack">
                  {sortMatches(analysis.matches)
                    .slice(0, 8)
                    .map((match) => (
                      <div key={match.id} className="line">
                        <div className="row">
                          <MatchTag status={match.status} />
                          <span className="small muted">{match.importance}</span>
                        </div>
                        <p className="small" style={{ margin: "6px 0 0" }}>
                          {match.requirement}
                        </p>
                      </div>
                    ))}
                </div>
              </Card>

              <Card
                title="Unsupported requirements"
                sub="Nothing in your profile evidences these. They are absent from the resume on purpose."
              >
                {analysis.matches.filter((m) => m.status === "not_evidenced").length ===
                0 ? (
                  <p className="small">
                    None — every requirement has at least partial evidence.
                  </p>
                ) : (
                  <ul style={{ paddingLeft: 18, margin: 0 }} className="small">
                    {analysis.matches
                      .filter((m) => m.status === "not_evidenced")
                      .map((match) => (
                        <li key={match.id}>{match.requirement}</li>
                      ))}
                  </ul>
                )}
              </Card>

              <Card title="Improvement recommendations">
                <ol style={{ paddingLeft: 18, margin: 0 }} className="small">
                  {analysis.recommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ol>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
