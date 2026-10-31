import Link from "next/link";

import { COVERAGE_LIMITS, SOURCES, sourceLabel } from "@hl-bos/ats-resume";

import { OpportunityRow } from "@/components/OpportunityRow.tsx";

import { Card, Empty, Flash, Notice, PageHead } from "@/components/ui.tsx";
import { addBoard, importJob, removeBoard, runSearch } from "@/lib/career-actions.ts";
import { careerContext, SUPPORTED_BOARD_SOURCES } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const ctx = await careerContext();
  const fresh = ctx.opportunities.filter(
    (o) => o.stage === "new_match" || o.stage === "saved",
  );
  const ran =
    q["ran"] === "1"
      ? `Search finished: ${q["added"]} new, ${q["dupes"]} duplicate(s) skipped${q["applied"] !== "0" ? ` (${q["applied"]} you already applied to)` : ""}, ${q["expired"]} no longer posted${q["failed"] !== "0" ? `, ${q["failed"]} source(s) failed — see below` : ""}.`
      : undefined;

  return (
    <>
      <PageHead
        title="Find jobs"
        lead="Matches from the employer job boards you choose, plus anything you import yourself."
      />
      <Flash error={q["error"]} ok={ran} />
      {ctx.search === undefined ? (
        <Notice tone="warn">
          Complete your <Link href="/intake">search profile</Link> first — matches are
          judged against it.
        </Notice>
      ) : null}

      <Card
        title={`New and saved (${fresh.length})`}
        sub="Pursue prepares tailored documents. Pass and Save for later only file the job — they never change your search preferences."
      >
        {fresh.length === 0 ? (
          <Empty>Nothing new. Run a search or import a posting below.</Empty>
        ) : (
          fresh.map((o) => <OpportunityRow key={o.id} o={o} returnTo="/jobs" />)
        )}
        <form action={runSearch} style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="submit">
            Search my job boards now
          </button>
        </form>
      </Card>

      <Card
        title="Import a posting"
        sub="From LinkedIn, Indeed, a company site, a recruiter — anywhere. The description you paste is kept as the snapshot."
      >
        <form action={importJob}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="employer">Employer</label>
              <input id="employer" name="employer" />
            </div>
            <div className="field">
              <label htmlFor="title">Job title</label>
              <input id="title" name="title" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="url">Link to the posting</label>
              <input id="url" name="url" type="url" />
            </div>
            <div className="field">
              <label htmlFor="foundOn">Where you found it</label>
              <input
                id="foundOn"
                name="foundOn"
                placeholder="LinkedIn, Indeed, referral…"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              name="location"
              placeholder="City, State — or Remote"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="salaryText">Salary (if listed)</label>
              <input id="salaryText" name="salaryText" />
            </div>
            <div className="field">
              <label htmlFor="postedAt">Posting date (if shown)</label>
              <input id="postedAt" name="postedAt" type="date" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Full job description</label>
            <textarea id="description" name="description" rows={8} required />
          </div>
          <button className="btn btn-primary" type="submit">
            Import
          </button>
        </form>
      </Card>

      <Card
        title="Sources and coverage"
        sub="What is actually searched. Nothing else is implied."
      >
        <div id="sources" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>How</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="small">{s.coverage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="small muted">
          {COVERAGE_LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <h3>Your employer job boards</h3>
        {ctx.boards.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employer</th>
                  <th>System</th>
                  <th>Last check</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ctx.boards.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.employer}
                      <div className="small muted mono">{b.boardToken}</div>
                    </td>
                    <td>{sourceLabel(b.source)}</td>
                    <td className="small">
                      {b.lastCheckedAt === undefined ? (
                        "Never checked"
                      ) : b.lastResult === "ok" ? (
                        `OK — ${b.lastCount ?? 0} postings read, ${b.lastCheckedAt.slice(0, 16).replace("T", " ")}`
                      ) : (
                        <span className="field-error">Failed: {b.lastError}</span>
                      )}
                    </td>
                    <td>
                      <form action={removeBoard}>
                        <input type="hidden" name="boardId" value={b.id} />
                        <button className="btn btn-sm" type="submit">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={addBoard} style={{ marginTop: 12 }}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="b-employer">Employer name</label>
              <input id="b-employer" name="employer" />
            </div>
            <div className="field">
              <label htmlFor="b-source">Job-board system</label>
              <select id="b-source" name="source">
                {SUPPORTED_BOARD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-token">Board name</label>
              <input
                id="b-token"
                name="boardToken"
                placeholder="e.g. the word after boards.greenhouse.io/"
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Add job board
          </button>
        </form>
      </Card>
    </>
  );
}
