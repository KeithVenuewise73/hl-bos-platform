import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Audit,
  Card,
  Empty,
  Notice,
  PageHead,
  ValidationTag,
} from "@/components/ui.tsx";
import { createCoverLetter } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export default async function CoverLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === id);
  if (analysis === undefined) notFound();
  const job = workspace.jobs.find((j) => j.id === analysis.jobPostingId);
  const letter = workspace.coverLetters.find((l) => l.analysisId === analysis.id);

  return (
    <>
      <PageHead
        title="Cover letter"
        lead={`${job?.title ?? "Role"} at ${job?.company ?? "company"} — built from the same evidence as the resume, under the same rules.`}
        action={
          <Link className="btn" href={`/analyses/${analysis.id}`}>
            Back to analysis
          </Link>
        }
      />

      <Notice>
        <strong>The app will not write enthusiasm for you.</strong> It will not claim
        you admire the company, follow its work, or know someone there. If you want a
        reason for applying in the letter, write it below in your own words and it will
        be used verbatim.
      </Notice>

      <Card title="Generate">
        <form action={createCoverLetter}>
          <input type="hidden" name="analysisId" value={analysis.id} />
          <div className="field">
            <label htmlFor="recipient">Recipient name (optional)</label>
            <input
              id="recipient"
              name="recipient"
              type="text"
              placeholder='Leave blank for "Dear Hiring Manager"'
            />
          </div>
          <div className="field">
            <label htmlFor="motivation">Why this role, in your words (optional)</label>
            <textarea
              id="motivation"
              name="motivation"
              placeholder="I want to move from final-mile into temperature-controlled freight, and this role is a step up in scope."
            />
          </div>
          <button className="btn btn-primary" type="submit">
            {letter === undefined ? "Generate cover letter" : "Regenerate"}
          </button>
        </form>
      </Card>

      {letter === undefined ? (
        <Empty>No cover letter generated yet.</Empty>
      ) : (
        <Card
          title="Draft"
          sub="Every paragraph carries its evidence, exactly like a resume line."
        >
          <p>
            <strong>{letter.greeting}</strong>
          </p>
          <div className="stack">
            {letter.paragraphs.map((paragraph) => (
              <div key={paragraph.id} className="line">
                <p style={{ margin: 0 }}>{paragraph.text}</p>
                <div className="line-meta">
                  <ValidationTag status={paragraph.validation} />
                </div>
                <Audit summary="Where this came from">
                  <dl style={{ margin: 0 }}>
                    <dt>Evidence</dt>
                    {paragraph.evidenceText.map((evidence) => (
                      <dd key={evidence} className="quote">
                        {evidence}
                      </dd>
                    ))}
                    <dt>Why</dt>
                    <dd>{paragraph.rationale}</dd>
                  </dl>
                </Audit>
              </div>
            ))}
          </div>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 14 }}>
            {letter.closing}
          </pre>
        </Card>
      )}
    </>
  );
}
