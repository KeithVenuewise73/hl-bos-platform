import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Empty, Notice, PageHead } from "@/components/ui.tsx";
import { createInterviewPrep } from "@/lib/actions.ts";
import { loadWorkspace } from "@/lib/store.ts";
import type { InterviewQuestion } from "@hl-bos/ats-resume";

export const dynamic = "force-dynamic";

function QuestionBlock({ question }: { question: InterviewQuestion }) {
  return (
    <div className="line">
      <p style={{ margin: 0, fontWeight: 560 }}>{question.question}</p>
      <p className="small muted" style={{ margin: "6px 0" }}>
        {question.why}
      </p>
      <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
        {question.starPrompts.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ol>
    </div>
  );
}

export default async function InterviewPrepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadWorkspace();
  const analysis = workspace.analyses.find((a) => a.id === id);
  if (analysis === undefined) notFound();
  const job = workspace.jobs.find((j) => j.id === analysis.jobPostingId);
  const prep = workspace.interviewPreps.find((p) => p.analysisId === analysis.id);

  return (
    <>
      <PageHead
        title="Interview prep"
        lead={`${job?.title ?? "Role"} at ${job?.company ?? "company"} — questions built from this posting and your actual record.`}
        action={
          <Link className="btn" href={`/analyses/${analysis.id}`}>
            Back to analysis
          </Link>
        }
      />

      <Card title="Generate">
        <form action={createInterviewPrep}>
          <input type="hidden" name="analysisId" value={analysis.id} />
          <button className="btn btn-primary" type="submit">
            {prep === undefined ? "Generate interview prep" : "Regenerate"}
          </button>
        </form>
        <p className="hint">
          You get questions and STAR scaffolding, not scripted answers. A scripted
          answer is obvious in the room, and one the app invented would not be true.
        </p>
      </Card>

      {prep === undefined ? (
        <Empty>Nothing generated yet.</Empty>
      ) : (
        <>
          <Card
            title="Questions to rehearse"
            sub="Where your evidence is strong — expect follow-up on the numbers."
          >
            <div className="stack">
              {prep.questions.map((question) => (
                <QuestionBlock key={question.id} question={question} />
              ))}
            </div>
          </Card>

          <Card
            title="Questions you should be ready to explain"
            sub="Partial matches and gaps. These are the ones that decide interviews."
          >
            <Notice tone="warn">
              Answer these honestly. Every one of them is a place where the posting asks
              for something your record does not fully cover, and an interviewer who
              probes will find that out in one follow-up question.
            </Notice>
            {prep.explainThese.length === 0 ? (
              <Empty>Nothing flagged — every requirement had solid evidence.</Empty>
            ) : (
              <div className="stack">
                {prep.explainThese.map((question) => (
                  <QuestionBlock key={question.id} question={question} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
