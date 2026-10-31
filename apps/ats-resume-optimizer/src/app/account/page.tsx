import {
  PLANS,
  checkAllowance,
  usageSummary,
  type MeteredAction,
} from "@hl-bos/ats-resume";

import { Card, Flash, Notice, PageHead } from "@/components/ui.tsx";
import { deleteAllMyData } from "@/lib/career-actions.ts";
import { careerContext, currentPlan } from "@/lib/career.ts";
import { config } from "@/lib/config.ts";
import { currentMode } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

const ACTIONS: readonly MeteredAction[] = [
  "resume_upload",
  "base_resume_draft",
  "discovery_run",
  "job_import",
  "package_generation",
  "practice_answer",
  "linkedin_generation",
];

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { error, deleted } = await searchParams;
  const ctx = await careerContext();
  const plan = currentPlan();
  const summary = usageSummary(ctx.usage);
  const support = config().supportEmail;
  const signedIn = currentMode() === "authenticated";

  return (
    <>
      <PageHead
        title="Account and data"
        lead="Your plan, what you have used, and full control over your data."
      />
      <Flash
        error={error}
        ok={
          deleted === undefined
            ? undefined
            : `Deleted ${deleted} record(s). Your account data is gone.`
        }
      />

      <Card title={`Plan: ${plan.name}`} sub={plan.description}>
        <p className="small">
          Paid plans are not on sale yet. No payment details are collected and nothing
          is charged.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>This month ({summary.month})</th>
                <th>Used</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => {
                const al = checkAllowance(plan, ctx.usage, a);
                return (
                  <tr key={a}>
                    <td>{a.replace(/_/g, " ")}</td>
                    <td>{al.used}</td>
                    <td>{al.limit ?? "No limit"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Estimated AI cost this month: ${summary.estimatedCostUsd.toFixed(2)} (
          {summary.events} metered actions). Actions run by the built-in rules engine
          cost nothing.
        </p>
        <details className="audit">
          <summary>
            Planned plans (prices are recommendations awaiting approval)
          </summary>
          <div className="audit-body small">
            {Object.values(PLANS)
              .filter((p) => p.recommendedMonthlyUsd !== null)
              .map((p) => (
                <p key={p.id}>
                  <strong>{p.name}</strong> — ${p.recommendedMonthlyUsd}/month
                  recommended. {p.description}
                </p>
              ))}
          </div>
        </details>
      </Card>

      <Card
        title="Download your data"
        sub="Everything this account holds — profile, experience bank, resumes, opportunities, submitted packages, practice and drafts — as one JSON file."
      >
        <a className="btn" href="/account/export">
          Download my data
        </a>
      </Card>

      <Card title="Delete your data">
        <Notice tone="danger">
          This permanently deletes everything above, including your archived submitted
          applications. Download a copy first if you may need it.
        </Notice>
        {signedIn ? (
          <p className="small muted">
            This deletes your records. Closing the sign-in account itself is done by
            support on request.
          </p>
        ) : null}
        <form action={deleteAllMyData}>
          <div className="field">
            <label htmlFor="confirm">Type DELETE to confirm</label>
            <input id="confirm" name="confirm" autoComplete="off" />
          </div>
          <button className="btn btn-danger" type="submit">
            Delete all my data
          </button>
        </form>
      </Card>

      <Card title="Help">
        {support === undefined ? (
          <p className="small">
            A support address has not been configured for this installation yet.
          </p>
        ) : (
          <p>
            Questions, problems or account closure:{" "}
            <a href={`mailto:${support}`}>{support}</a>
          </p>
        )}
        <p className="small muted">
          Your resume and documents are private to your account. They are never shared
          with employers or other users, and nobody operating the platform browses them.
        </p>
      </Card>
    </>
  );
}
