import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Empty, Flash, Notice, PageHead } from "@/components/ui.tsx";
import { answerPractice, startPractice } from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; session?: string; q?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await careerContext();
  const o = ctx.opportunities.find((x) => x.id === id);
  if (o === undefined) notFound();
  const submission = ctx.submissions.find((s) => s.id === o.submissionId);
  const sessions = ctx.practice
    .filter((s) => s.opportunityId === o.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const session = sessions.find((s) => s.id === q.session) ?? sessions[0];
  const current = session?.questions.find((x) => x.id === q.q) ?? session?.questions[0];
  const attempts = session?.attempts.filter((a) => a.questionId === current?.id) ?? [];
  const last = attempts[attempts.length - 1];

  return (
    <>
      <PageHead
        title="Interview preparation and practice"
        lead={`${o.title} at ${o.employer}. Built from the exact resume${submission?.coverLetter ? " and cover letter" : ""} you submitted.`}
        action={
          <Link className="btn" href={`/opportunities/${o.id}`}>
            Back to application
          </Link>
        }
      />
      <Flash error={q.error} />
      {submission === undefined ? (
        <Notice tone="warn">
          Practice uses the exact package you sent.{" "}
          <Link href={`/opportunities/${o.id}#submitted`}>Confirm your submission</Link>{" "}
          first.
        </Notice>
      ) : (
        <Card title="Start a practice session">
          <form action={startPractice} className="row">
            <input type="hidden" name="opportunityId" value={o.id} />
            <input
              name="round"
              placeholder="Which round? e.g. Phone screen"
              aria-label="Interview round"
              style={{ maxWidth: 280 }}
            />
            <button className="btn btn-primary" type="submit">
              {session === undefined ? "Start" : "Start a new session"}
            </button>
          </form>
          <p className="small muted">
            Text practice only. Voice practice is not offered: no speech service in this
            platform has been verified, so nothing is recorded.
          </p>
        </Card>
      )}

      {session === undefined ? null : (
        <>
          <Card
            title="Preparation material"
            sub={`${session.round} — reference reading, not interactive.`}
          >
            <h3>Role briefing</h3>
            {session.briefing.map((b) => (
              <p key={b} className="small">
                {b}
              </p>
            ))}
            <h3>Questions to ask them</h3>
            <ul className="small">
              {session.askThem.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>

          <Card
            title="Practice"
            sub="Answer as you would out loud. Feedback checks structure, length, and whether every figure you use is in your experience bank."
          >
            <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
              {session.questions.map((x, i) => (
                <Link
                  key={x.id}
                  className={
                    x.id === current?.id ? "btn btn-sm btn-primary" : "btn btn-sm"
                  }
                  href={`/opportunities/${o.id}/practice?session=${session.id}&q=${encodeURIComponent(x.id)}`}
                >
                  {i + 1}
                  {session.attempts.some((a) => a.questionId === x.id) ? " ✓" : ""}
                </Link>
              ))}
            </div>
            {current === undefined ? (
              <Empty>No questions.</Empty>
            ) : (
              <>
                <p>
                  <span className="tag tag-neutral">{current.kind}</span>{" "}
                  <strong>{current.question}</strong>
                </p>
                <p className="small muted">{current.why}</p>
                {current.useThese.length === 0 ? null : (
                  <div className="small">
                    <strong>From the resume you sent:</strong>
                    <ul>
                      {current.useThese.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <form action={answerPractice}>
                  <input type="hidden" name="opportunityId" value={o.id} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="questionId" value={current.id} />
                  <textarea
                    name="answer"
                    rows={7}
                    aria-label="Your answer"
                    defaultValue={last?.answer ?? ""}
                  />
                  <button className="btn btn-primary" type="submit">
                    {last === undefined ? "Get feedback" : "Try again"}
                  </button>
                </form>
              </>
            )}
          </Card>

          {last === undefined ? null : (
            <Card
              title={`Feedback — ${last.feedback.score}/5`}
              sub={`Attempt ${attempts.length} · ${last.feedback.wordCount} words`}
            >
              <div id="feedback" />
              <p className="small">
                Structure:{" "}
                {(["situation", "task", "action", "result"] as const).map((k) => (
                  <span
                    key={k}
                    className={
                      last.feedback.star[k] ? "tag tag-strong" : "tag tag-neutral"
                    }
                    style={{ marginRight: 4 }}
                  >
                    {k}
                    {last.feedback.star[k] ? " ✓" : ""}
                  </span>
                ))}
              </p>
              {last.feedback.strengths.length === 0 ? null : (
                <>
                  <h3>Working</h3>
                  <ul className="small">
                    {last.feedback.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
              {last.feedback.improvements.length === 0 ? null : (
                <>
                  <h3>To improve</h3>
                  <ul className="small">
                    {last.feedback.improvements.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
