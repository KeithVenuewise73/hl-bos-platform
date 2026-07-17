import { repoStatus } from "@/lib/git";
import { githubState } from "@/lib/github";
import { gatesFor, overallHealth, type Health } from "@/lib/health";
import { milestoneState } from "@/lib/milestone";
import { approvalQueue } from "@/lib/approvals";
import { PORTFOLIO, PORTFOLIO_NOTE } from "@/lib/registry";
import { Card, Dot, Row, Empty, LABEL } from "@/components/ui";
import { ActionsIsland } from "@/components/ActionsIsland";
import { MergeButton } from "@/components/MergeButton";
import { supabaseState } from "@/lib/supabase";
import { connectionStatus } from "@/lib/secrets";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "@/lib/shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = await repoStatus();
  const gh = await githubState(repo.slug);
  const primaryPr = gh.connected ? (gh.pulls[0] ?? null) : null;
  const gates = gatesFor(primaryPr);
  const health = overallHealth(gh, gates);
  const milestone = await milestoneState();
  const approvals = approvalQueue({ gh, health: health.health, milestone });
  const conn = await connectionStatus();

  let repoMigrations: string[];
  try {
    repoMigrations = (await readdir(path.join(REPO_ROOT, "supabase", "migrations")))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    repoMigrations = [];
  }
  const sb = await supabaseState(repoMigrations);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Development Control Center</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Herman Legacy Software Ventures — internal. Runs on this machine only.{" "}
          <a href="/connect" style={{ color: "#58a6ff" }}>
            {conn.github && conn.supabase ? "Connections" : "Connect accounts"}
          </a>
        </p>
      </header>

      {/* ---- The headline: what, if anything, needs YOU ---- */}
      <div
        style={{
          background: approvals.length ? "#1c1a08" : "#0d1f14",
          border: "1px solid " + (approvals.length ? "#d29922" : "#2ea043"),
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Dot health={health.health} />
          <strong style={{ fontSize: 15 }}>
            {approvals.length === 0
              ? "Nothing needs your decision right now."
              : `${approvals.length} thing${approvals.length > 1 ? "s need" : " needs"} your decision.`}
          </strong>
        </div>
        <p style={{ margin: "6px 0 0 17px", fontSize: 13, color: "#c9d1d9" }}>
          {health.summary}
        </p>
      </div>

      {/* ---- 4. CEO APPROVAL QUEUE ---- */}
      <Card
        title="Your decisions"
        sub="Only things a person with authority has to choose. Everything else is automated."
      >
        {approvals.length === 0 ? (
          <Empty>
            Nothing is waiting on you. That is the goal state, not an error.
          </Empty>
        ) : (
          approvals.map((a) => (
            <div
              key={a.title}
              style={{ padding: "10px 0", borderBottom: "1px solid #1c2128" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#8b949e",
                  margin: "3px 0 6px",
                  lineHeight: 1.55,
                }}
              >
                {a.why}
              </div>
              {a.mergeable ? (
                // The approval can be executed here -- close the loop in the
                // console instead of sending the CEO out to github.com.
                <MergeButton number={a.mergeable.number} title={a.mergeable.title} />
              ) : a.href ? (
                <a
                  href={a.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#58a6ff", fontSize: 12.5 }}
                >
                  {a.action} →
                </a>
              ) : (
                <span style={{ fontSize: 12.5, color: "#d29922" }}>{a.action}</span>
              )}
            </div>
          ))
        )}
      </Card>

      {/* ---- 2. ONE-CLICK ACTIONS ---- */}
      <Card title="Actions" sub="No terminal. No Git commands.">
        <ActionsIsland />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ---- 1. PROJECT STATUS ---- */}
        <div>
          <Card title="Project status" sub="HL-BOS platform, on this machine.">
            <Row k="Branch" v={repo.branch} mono />
            <Row
              k="Latest change"
              v={repo.lastCommit ? repo.lastCommit.subject.slice(0, 46) : "—"}
            />
            <Row
              k="Saved"
              v={
                repo.lastCommit
                  ? `${repo.lastCommit.when} by ${repo.lastCommit.author}`
                  : "—"
              }
            />
            <Row
              k="Unsaved work"
              v={repo.dirtyFiles === 0 ? "None" : `${repo.dirtyFiles} file(s)`}
            />
            <Row
              k="Not yet on GitHub"
              v={repo.aheadOfMain === 0 ? "Nothing" : `${repo.aheadOfMain} change(s)`}
            />
            <Row k="Database" v="Built and tested. Never applied anywhere." />
            <Row k="Live version" v="None — nothing has been released yet" />
          </Card>
        </div>

        {/* ---- 3. QUALITY STATUS ---- */}
        <div>
          <Card
            title="Quality checks"
            sub="What the automated checks say about the current work."
          >
            {!gh.connected ? (
              <Empty>{gh.reason}</Empty>
            ) : gates.length === 0 ? (
              <Empty>No checks have run on the current work yet.</Empty>
            ) : (
              gates.map((g) => (
                <Row
                  key={g.name}
                  k={g.name}
                  v={
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      <Dot health={g.health} />
                      {g.summary}
                    </span>
                  }
                />
              ))
            )}
            <div
              style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}
            >
              <Dot health={health.health} />
              <strong style={{ fontSize: 13 }}>Overall: {LABEL[health.health]}</strong>
            </div>
          </Card>
        </div>
      </div>

      {/* ---- SUPABASE ---- */}
      <Card title="Database" sub="The HL-BOS Core project.">
        {!sb.connected ? (
          <>
            <Empty>{sb.reason}</Empty>
            <p style={{ marginTop: 10 }}>
              <a href="/connect" style={{ color: "#58a6ff", fontSize: 13 }}>
                Connect Supabase →
              </a>
            </p>
          </>
        ) : (
          <>
            <Row k="Project" v={sb.project.name} />
            <Row k="Reference" v={sb.project.ref} mono />
            <Row k="Region" v={sb.project.region} />
            <Row
              k="Status"
              v={sb.project.status === "ACTIVE_HEALTHY" ? "Healthy" : sb.project.status}
            />
            <Row k="Postgres" v={sb.project.pgVersion} />
            <Row
              k="Changes applied"
              v={
                sb.applied.length === 0
                  ? "None — the database is empty"
                  : `${sb.applied.length}`
              }
            />
            <Row
              k="Changes waiting"
              v={sb.pending.length === 0 ? "None" : `${sb.pending.length}`}
            />
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 12.5,
                color: "#8b949e",
                lineHeight: 1.6,
              }}
            >
              {sb.summary}
            </p>
          </>
        )}
      </Card>

      {/* ---- 5. ACTIVE DEVELOPMENT ---- */}
      <Card title="Active development" sub="What is being built right now.">
        {!milestone ? (
          <Empty>No milestone is declared.</Empty>
        ) : (
          <>
            <Row k="Milestone" v={milestone.milestone} />
            <Row k="Stage" v={milestone.phase} />
            <Row k="Engineer" v={milestone.engineer} />
            <Row
              k="Progress"
              v={`${milestone.progressPct}% (${milestone.tasks.filter((t) => t.done).length} of ${milestone.tasks.length} done)`}
            />
            <div
              style={{
                height: 6,
                background: "#21262d",
                borderRadius: 999,
                margin: "10px 0 14px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${milestone.progressPct}%`,
                  height: "100%",
                  background: "#3fb950",
                }}
              />
            </div>
            {milestone.remaining.length > 0 && (
              <>
                <div style={{ fontSize: 12.5, color: "#8b949e", marginBottom: 6 }}>
                  Still to do:
                </div>
                <ul
                  style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}
                >
                  {milestone.remaining.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6e7681" }}>
              No completion date is shown. We have no honest basis for one, and a
              made-up date is worse than none.
            </p>
          </>
        )}
      </Card>

      {/* ---- 6. SOFTWARE PIPELINE ---- */}
      <Card title="Software portfolio" sub={PORTFOLIO_NOTE}>
        {PORTFOLIO.map((p) => {
          const h: Health =
            p.stage === "not-started"
              ? "unknown"
              : p.stage === "production"
                ? "yellow"
                : "green";
          return (
            <div
              key={p.name}
              style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 13.5,
                  }}
                >
                  <Dot health={h} />
                  {p.name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "#8b949e",
                    textTransform: "capitalize",
                  }}
                >
                  {p.stage.replace("-", " ")}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#8b949e",
                  marginLeft: 17,
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {p.status}
              </div>
            </div>
          );
        })}
      </Card>

      {/* ---- 7. DEPLOYMENT HISTORY ---- */}
      <Card title="Release history" sub="Every build, test, merge and deployment.">
        <Empty>
          Nothing has been deployed yet. HL-BOS has never been released, and no database
          change has been applied to a live project. This fills in from the first real
          deployment onward — it will not be back-filled with invented history.
        </Empty>
      </Card>

      {/* ---- 8. MORNING BRIEF ---- */}
      <Card title="Morning brief" sub="Where the business stands today.">
        <Row
          k="Yesterday"
          v="Phase 2 (identity, tenancy, permissions, audit) was merged."
        />
        <Row k="Today" v={milestone ? milestone.phase : "—"} />
        <Row
          k="Blockers"
          v={
            milestone && milestone.blockers.length > 0
              ? `${milestone.blockers.length} — see below`
              : "None"
          }
        />
        <Row
          k="Ready to launch"
          v="Nothing yet. HL-BOS is the foundation; products come after."
        />
        <Row
          k="Revenue impact"
          v="Not measurable — no product is live and no revenue data is connected."
        />
        <Row
          k="Highest priority"
          v={
            approvals.length > 0
              ? approvals[0]!.title
              : "Keep building. Nothing is waiting on you."
          }
        />
        {milestone && milestone.blockers.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {milestone.blockers.map((b) => (
              <div
                key={b.title}
                style={{ padding: "8px 0", borderTop: "1px solid #1c2128" }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.title}</div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#8b949e",
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {b.meaning}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: b.owner === "ceo" ? "#d29922" : "#6e7681",
                    marginTop: 3,
                  }}
                >
                  {b.owner === "ceo"
                    ? "Needs you"
                    : "Your AI engineer is handling this"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p style={{ fontSize: 11.5, color: "#6e7681", marginTop: 24, lineHeight: 1.6 }}>
        This console runs only on your machine and is never deployed. Empty sections are
        empty because the underlying thing does not exist yet — HL-BOS does not invent
        data to fill a dashboard.
      </p>
    </main>
  );
}
