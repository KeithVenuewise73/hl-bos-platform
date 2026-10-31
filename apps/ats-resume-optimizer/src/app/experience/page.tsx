import Link from "next/link";

import { experienceQuestions } from "@hl-bos/ats-resume";

import { Card, Empty, Flash, Notice, PageHead } from "@/components/ui.tsx";
import {
  answerQuestion,
  createBaseDraft,
  editFact,
  removeFact,
  resolveInterpretation,
  uploadResume,
} from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  resume: "From your resume",
  user_confirmed: "You confirmed",
  generated_wording: "Generated wording",
};

export default async function ExperiencePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string; answered?: string }>;
}) {
  const { error, step, answered } = await searchParams;
  const ctx = await careerContext();
  const uploads = ctx.resumes.filter(
    (r) => !r.label.startsWith("Approved base resume"),
  );
  const current = uploads.find((r) => r.isDefault) ?? uploads[uploads.length - 1];
  const questions = experienceQuestions(current?.parsed, ctx.facts);
  const pending = ctx.interpretations.filter((i) => i.status === "pending");
  const bank = ctx.facts.filter((f) => f.source !== "generated_wording");
  const byContext = new Map<string, typeof bank>();
  for (const f of bank) {
    const k = f.context ?? "General";
    byContext.set(k, [...(byContext.get(k) ?? []), f]);
  }

  return (
    <>
      <PageHead
        title="Experience bank and base resume"
        lead="Everything true about your work, each fact labelled with where it came from. Your resumes are built only from what is here."
      />
      <Flash
        error={error}
        ok={
          step === "review"
            ? "Resume read. Check the facts below, answer the questions, then build your base resume."
            : answered
              ? "Answer saved to your experience bank."
              : undefined
        }
      />

      <Card
        title="1. Your current resume"
        sub={
          current === undefined
            ? "Upload a PDF or Word file (5 MB max), or paste the text."
            : `Using: ${current.label}. Uploading again adds new facts and keeps everything you confirmed.`
        }
      >
        <form action={uploadResume} encType="multipart/form-data">
          <div className="field-row">
            <div className="field">
              <label htmlFor="file">Resume file (PDF or .docx)</label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rawText">…or paste the text</label>
            <textarea id="rawText" name="rawText" rows={6} />
          </div>
          <button className="btn btn-primary" type="submit">
            Read my resume
          </button>
        </form>
      </Card>

      {current === undefined ? null : (
        <>
          <Card
            title="2. Suggestions to confirm"
            sub="Things we inferred from your experience. They are not used anywhere until you confirm them."
          >
            <div id="suggestions" />
            {pending.length === 0 ? (
              <Empty>No suggestions waiting.</Empty>
            ) : (
              pending.map((i) => (
                <div key={i.id} className="line">
                  <form action={resolveInterpretation}>
                    <input type="hidden" name="interpretationId" value={i.id} />
                    <div className="field">
                      <label htmlFor={`int-${i.id}`}>
                        {i.category.replace(/_/g, " ")}
                      </label>
                      <input
                        id={`int-${i.id}`}
                        name="text"
                        defaultValue={i.proposedText}
                      />
                      <div className="small muted">
                        {i.reason} Based on: “{i.basisText[0]}”
                      </div>
                    </div>
                    <div className="row">
                      <button
                        className="btn btn-sm btn-primary"
                        name="decision"
                        value="confirm"
                        type="submit"
                      >
                        Yes, this is true
                      </button>
                      <button
                        className="btn btn-sm"
                        name="decision"
                        value="reject"
                        type="submit"
                      >
                        No
                      </button>
                    </div>
                  </form>
                </div>
              ))
            )}
          </Card>

          <Card
            title="3. Questions that strengthen your resume"
            sub="Answer what you can. Each answer is saved to your experience bank as your own confirmed statement."
          >
            <div id="questions" />
            {questions.slice(0, 8).map((q) => (
              <form key={q.id} action={answerQuestion} className="line">
                <input type="hidden" name="questionId" value={q.id} />
                <input type="hidden" name="category" value={q.category} />
                {q.context === undefined ? null : (
                  <input type="hidden" name="context" value={q.context} />
                )}
                <div className="field">
                  <label htmlFor={`q-${q.id}`}>{q.prompt}</label>
                  <textarea
                    id={`q-${q.id}`}
                    name="answer"
                    rows={2}
                    placeholder={q.hint}
                  />
                </div>
                <button className="btn btn-sm" type="submit">
                  Save answer
                </button>
              </form>
            ))}
          </Card>

          <Card
            title={`4. Your experience bank (${bank.length} facts)`}
            sub="Correct anything that was read wrongly. Corrections are stored as your confirmed wording."
          >
            <div id="bank" />
            {[...byContext.entries()].map(([ctxName, facts]) => (
              <details key={ctxName} className="audit" open={facts.length < 8}>
                <summary>
                  {ctxName} — {facts.length}
                </summary>
                <div className="audit-body">
                  {facts.map((f) => (
                    <div
                      key={f.id}
                      className="row"
                      style={{ alignItems: "flex-start", marginBottom: 8 }}
                    >
                      <form action={editFact} style={{ flex: 1, minWidth: 220 }}>
                        <input type="hidden" name="factId" value={f.id} />
                        <input
                          name="text"
                          defaultValue={f.text}
                          aria-label={`Edit fact: ${f.text.slice(0, 40)}`}
                        />
                        <div className="small muted">
                          {SOURCE_LABEL[f.source] ?? f.source} ·{" "}
                          {f.category.replace(/_/g, " ")}{" "}
                          <button className="btn btn-sm" type="submit">
                            Save
                          </button>
                        </div>
                      </form>
                      <form action={removeFact}>
                        <input type="hidden" name="factId" value={f.id} />
                        <button className="btn btn-sm" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </Card>

          <Card
            title="5. Base resume"
            sub="Assembled only from your experience bank. Review it, adjust wording, and approve. Every version is kept."
          >
            <div id="base" />
            <form action={createBaseDraft}>
              <button className="btn btn-primary" type="submit">
                Build a new draft from my experience bank
              </button>
            </form>
            {ctx.baseResumes.length === 0 ? null : (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.baseResumes.map((b) => (
                      <tr key={b.id}>
                        <td>v{b.versionNumber}</td>
                        <td>
                          {b.status === "approved" ? (
                            <span className="tag tag-strong">Approved</span>
                          ) : b.status === "draft" ? (
                            <span className="tag tag-confirm">Draft</span>
                          ) : (
                            <span className="tag tag-neutral">Superseded</span>
                          )}
                        </td>
                        <td>{b.createdAt.slice(0, 10)}</td>
                        <td>
                          <Link href={`/experience/base/${b.id}`}>Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Notice>
              Facts you leave out of a version stay in your experience bank and can
              still be used for a specific application.
            </Notice>
          </Card>
        </>
      )}
    </>
  );
}
