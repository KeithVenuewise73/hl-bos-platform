import Link from "next/link";

import { STAGES, STAGE_LABELS, summarize } from "@hl-bos/ats-resume";

import { Card, Empty, PageHead, Stat } from "@/components/ui.tsx";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

/** The application dashboard. Every figure is counted from stored records. */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const ctx = await careerContext();
  const s = summarize(ctx.opportunities);
  const shown =
    stage === undefined
      ? ctx.opportunities.filter((o) => o.stage !== "passed")
      : ctx.opportunities.filter((o) => o.stage === stage);

  return (
    <>
      <PageHead
        title="Applications"
        lead="Every opportunity, its stage, and what you need to do next."
        action={
          <Link className="btn btn-primary" href="/jobs">
            Find jobs
          </Link>
        }
      />

      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat value={s.total} label="Opportunities" />
        <Stat
          value={s.applied}
          label="Submitted"
          note="Only applications you confirmed sending."
        />
        <Stat value={s.interviewsUpcoming.length} label="Upcoming interviews" />
        <Stat value={s.followUpsDue.length} label="Follow-ups due today or earlier" />
      </div>

      <Card title="By stage">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link
            className={stage === undefined ? "btn btn-sm btn-primary" : "btn btn-sm"}
            href="/pipeline"
          >
            All active
          </Link>
          {STAGES.map((st) => (
            <Link
              key={st}
              className={stage === st ? "btn btn-sm btn-primary" : "btn btn-sm"}
              href={`/pipeline?stage=${st}`}
            >
              {STAGE_LABELS[st]} ({s.byStage[st]})
            </Link>
          ))}
        </div>
      </Card>

      <Card
        title={
          stage === undefined
            ? "Active opportunities"
            : (STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? "Opportunities")
        }
      >
        {shown.length === 0 ? (
          <Empty>Nothing here yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Stage</th>
                  <th>Found via</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const sub = ctx.submissions.find((x) => x.id === o.submissionId);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/opportunities/${o.id}`}>{o.title}</Link>
                        <div className="small muted">{o.employer}</div>
                      </td>
                      <td>{STAGE_LABELS[o.stage]}</td>
                      <td className="small">{o.foundVia}</td>
                      <td className="small">
                        {sub === undefined
                          ? "—"
                          : `${sub.submittedOn} via ${sub.submittedVia}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid">
        <Card title="Follow-ups due">
          {s.followUpsDue.length === 0 ? (
            <Empty>None due.</Empty>
          ) : (
            s.followUpsDue.map(({ opportunity, followUp }) => (
              <p key={followUp.id} className="small">
                <strong>{followUp.due}</strong> — {followUp.action} (
                <Link href={`/opportunities/${opportunity.id}#followUp`}>
                  {opportunity.employer}
                </Link>
                )
              </p>
            ))
          )}
        </Card>
        <Card title="Upcoming interviews">
          {s.interviewsUpcoming.length === 0 ? (
            <Empty>None scheduled.</Empty>
          ) : (
            s.interviewsUpcoming.map(({ opportunity, round }) => (
              <p key={round.id} className="small">
                <strong>{round.date}</strong> — {round.label}, {opportunity.employer} (
                <Link href={`/opportunities/${opportunity.id}/practice`}>practice</Link>
                )
              </p>
            ))
          )}
        </Card>
      </div>

      <Card
        title="Outcomes by source"
        sub="Where your opportunities came from, and how far each got. Counted from your records only."
      >
        {s.outcomesBySource.length === 0 ? (
          <Empty>No records yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Found via</th>
                  <th>Found</th>
                  <th>Applied</th>
                  <th>Interviews</th>
                  <th>Offers</th>
                </tr>
              </thead>
              <tbody>
                {s.outcomesBySource.map((r) => (
                  <tr key={r.source}>
                    <td>{r.source}</td>
                    <td>{r.found}</td>
                    <td>{r.applied}</td>
                    <td>{r.interviews}</td>
                    <td>{r.offers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
