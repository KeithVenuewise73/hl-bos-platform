import Link from "next/link";

import { Card, Notice, PageHead, Stat } from "@/components/ui.tsx";
import { careerContext } from "@/lib/career.ts";
import { summarize } from "@hl-bos/ats-resume";

export const dynamic = "force-dynamic";

/**
 * The subscriber's home: where they are in the journey, counted from their own
 * records. A step reads "Done" only when the record that proves it exists.
 */
export default async function StartPage() {
  const ctx = await careerContext();
  const approved = ctx.baseResumes.find((b) => b.status === "approved");
  const summary = summarize(ctx.opportunities);
  const steps = [
    {
      done: ctx.search !== undefined,
      title: "Tell us what you are looking for",
      detail:
        ctx.search === undefined
          ? "Titles, locations, pay, and what is a must versus a nice-to-have."
          : `Targeting ${ctx.search.targetTitles.join(", ")}.`,
      href: "/intake",
      action: ctx.search === undefined ? "Start" : "Edit",
    },
    {
      done: ctx.resumes.length > 0,
      title: "Add your current resume",
      detail:
        ctx.resumes.length === 0
          ? "Upload a PDF or Word file, or paste the text."
          : `${ctx.facts.length} facts in your experience bank.`,
      href: "/experience",
      action: ctx.resumes.length === 0 ? "Upload" : "Review",
    },
    {
      done: approved !== undefined,
      title: "Approve your base resume",
      detail:
        approved === undefined
          ? "Built only from your experience bank. Nothing is invented."
          : `Version ${approved.versionNumber} approved ${approved.approvedAt?.slice(0, 10) ?? ""}.`,
      href: "/experience#base",
      action: approved === undefined ? "Build" : "View",
    },
    {
      done: ctx.opportunities.length > 0,
      title: "Find or import jobs",
      detail:
        ctx.opportunities.length === 0
          ? "Watch employer job boards, or paste a posting from anywhere."
          : `${ctx.opportunities.length} opportunities, ${summary.byStage.new_match} new.`,
      href: "/jobs",
      action: "Open",
    },
    {
      done: summary.applied > 0,
      title: "Prepare and send applications",
      detail:
        summary.applied === 0
          ? "Choose Pursue, review the tailored documents, then confirm when you have submitted."
          : `${summary.applied} submitted; every package is archived exactly as sent.`,
      href: "/pipeline",
      action: "Open",
    },
  ];

  return (
    <>
      <PageHead
        title="Your job search"
        lead="One place to keep your real experience, find suitable roles, send truthful applications and keep track of every one."
      />

      {ctx.profile?.isSample === true ? (
        <Notice tone="sample">
          The optimizer's sample profile is loaded for demonstration. Your own job
          search starts empty and nothing here is sample data.
        </Notice>
      ) : null}

      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat value={summary.total} label="Opportunities tracked" />
        <Stat value={summary.applied} label="Applications submitted" />
        <Stat value={summary.interviewsUpcoming.length} label="Upcoming interviews" />
        <Stat value={summary.followUpsDue.length} label="Follow-ups due" />
      </div>

      <Card title="Steps">
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.title}>
              <div>
                <span className={s.done ? "tag tag-strong" : "tag tag-neutral"}>
                  {s.done ? "Done" : "To do"}
                </span>{" "}
                <strong>{s.title}</strong>
                <div className="small muted">{s.detail}</div>
              </div>
              <Link
                className={s.done ? "btn btn-sm" : "btn btn-sm btn-primary"}
                href={s.href}
              >
                {s.action}
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
