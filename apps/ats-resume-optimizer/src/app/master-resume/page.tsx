import { validateAtsFormat } from "@hl-bos/ats-resume";
import { Card, Empty, Notice, PageHead, SampleTag } from "@/components/ui.tsx";
import { saveMasterResume, setDefaultResume } from "@/lib/actions.ts";
import { currentProfile, resumesFor } from "@/lib/store.ts";
import { formatDate } from "@/lib/analysis-helpers.ts";

export const dynamic = "force-dynamic";

export default async function MasterResumePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const profile = await currentProfile();
  const resumes = profile === undefined ? [] : await resumesFor(profile.id);
  const active = resumes.find((r) => r.isDefault) ?? resumes[resumes.length - 1];
  const findings =
    active === undefined ? [] : validateAtsFormat(active.rawText, active.parsed);

  return (
    <>
      <PageHead
        title="Master Resume"
        lead="Your source of truth. Upload a DOCX or PDF, or paste the text. Everything the app can ever claim about you starts here."
      />

      {params["error"] === "empty" ? (
        <Notice tone="danger">
          Nothing was saved: no text was pasted and no file could be read. If a PDF will
          not extract, open it and copy the text in.
        </Notice>
      ) : null}
      {params["error"] === "no-resume" ? (
        <Notice tone="warn">
          You need a master resume before a job can be analyzed. Add one below.
        </Notice>
      ) : null}
      {params["saved"] !== undefined ? (
        <Notice>
          <strong>Saved.</strong> Every line of it is now stored as evidence in your
          Candidate Profile. Check the parsed reading below — if a role or a bullet is
          missing, paste the text again with clearer section headings.
        </Notice>
      ) : null}

      <Card
        title="Add or replace your master resume"
        sub="Uploading does not overwrite anything: previous versions are kept, and the evidence from them stays in your profile."
      >
        <form action={saveMasterResume}>
          <div className="field">
            <label htmlFor="label">Version label</label>
            <input
              id="label"
              name="label"
              type="text"
              placeholder="Master resume — operations leadership"
            />
          </div>
          <div className="field">
            <label htmlFor="file">Upload a file (.docx, .pdf, .txt)</label>
            <input id="file" name="file" type="file" accept=".docx,.pdf,.txt,.md" />
            <p className="hint">
              DOCX extraction is reliable. PDF extraction is best effort — a PDF
              exported from a design tool may come out scrambled, and the app will tell
              you rather than analysing nonsense. Legacy .doc is not supported.
            </p>
          </div>
          <div className="field">
            <label htmlFor="rawText">…or paste the text</label>
            <textarea
              id="rawText"
              name="rawText"
              rows={12}
              placeholder={
                "Your Name\nHeadline\nCity, ST | phone | email\n\nPROFESSIONAL SUMMARY\n…\n\nPROFESSIONAL EXPERIENCE\nTitle | Employer | City, ST | Mar 2019 - Present\n• Achievement with a number in it."
              }
            />
            <p className="hint">
              If both a file and pasted text are supplied, the file wins. Standard
              headings (Summary, Skills, Experience, Education, Certifications) parse
              best.
            </p>
          </div>
          <button className="btn btn-primary" type="submit">
            Save master resume
          </button>
        </form>
      </Card>

      {active === undefined ? (
        <Empty>No resume stored yet.</Empty>
      ) : (
        <>
          <Card
            title="How this resume was read"
            sub="If something here is wrong, the analysis will be wrong too. This is the app showing its work."
            right={active.isSample === true ? <SampleTag /> : undefined}
          >
            <div className="grid" style={{ marginBottom: 14 }}>
              <div className="stat">
                <div className="stat-value">{active.parsed.experience.length}</div>
                <div className="stat-label">Roles read</div>
              </div>
              <div className="stat">
                <div className="stat-value">
                  {active.parsed.experience.reduce((n, e) => n + e.bullets.length, 0)}
                </div>
                <div className="stat-label">Bullets read</div>
              </div>
              <div className="stat">
                <div className="stat-value">{active.parsed.skills.length}</div>
                <div className="stat-label">Skills read</div>
              </div>
              <div className="stat">
                <div className="stat-value">{active.parsed.certifications.length}</div>
                <div className="stat-label">Certifications read</div>
              </div>
            </div>

            {active.parsed.experience.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 14 }}>
                <h3>
                  {entry.title.length > 0 ? entry.title : "(no title read)"}
                  {entry.employer.length > 0 ? ` — ${entry.employer}` : ""}
                </h3>
                <p className="small muted" style={{ margin: "2px 0 6px" }}>
                  {[
                    entry.location,
                    entry.startDate,
                    entry.current ? "Present" : entry.endDate,
                  ]
                    .filter((p) => p !== undefined && p.length > 0)
                    .join(" | ") || "No dates read"}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {entry.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}

            {active.parsed.unparsed.length > 0 ? (
              <Notice tone="warn">
                <strong>Kept but not placed:</strong>{" "}
                {active.parsed.unparsed.join(" / ")}. These lines were not under a
                heading the parser recognised, so they were stored as evidence rather
                than dropped.
              </Notice>
            ) : null}
          </Card>

          <Card
            title="ATS formatting check"
            sub="Run against the text we extracted — which is the closest thing we have to what an applicant tracking system will see."
          >
            <div className="stack">
              {findings.map((finding) => (
                <div key={finding.id} className="line">
                  <div className="row">
                    <span
                      className={
                        finding.severity === "risk"
                          ? "tag tag-missing"
                          : finding.severity === "warning"
                            ? "tag tag-partial"
                            : "tag tag-strong"
                      }
                    >
                      {finding.severity === "ok" ? "Looks good" : finding.severity}
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 4px" }}>{finding.message}</p>
                  <p className="small muted" style={{ margin: 0 }}>
                    Fix: {finding.fix}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title={`Versions (${resumes.length})`}
            sub="The default is the one new analyses use."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Source</th>
                    <th>Saved</th>
                    <th>Roles</th>
                    <th>Default</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume) => (
                    <tr key={resume.id}>
                      <td>
                        {resume.label}
                        {resume.isSample === true ? (
                          <>
                            {" "}
                            <SampleTag />
                          </>
                        ) : null}
                      </td>
                      <td className="small muted">{resume.format}</td>
                      <td className="nowrap">{formatDate(resume.createdAt)}</td>
                      <td>{resume.parsed.experience.length}</td>
                      <td>{resume.isDefault ? "Yes" : "—"}</td>
                      <td>
                        {resume.isDefault ? null : (
                          <form action={setDefaultResume}>
                            <input type="hidden" name="resumeId" value={resume.id} />
                            <button className="btn btn-sm" type="submit">
                              Make default
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Original text, as stored"
            sub="Exactly what was extracted or pasted. Nothing is rewritten on the way in."
          >
            <pre
              className="mono"
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                maxHeight: 320,
                overflow: "auto",
                color: "var(--text-dim)",
              }}
            >
              {active.rawText}
            </pre>
          </Card>
        </>
      )}
    </>
  );
}
