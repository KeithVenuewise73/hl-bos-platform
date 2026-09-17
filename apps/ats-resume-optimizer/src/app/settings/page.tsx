import { AI_SERVICES, SCORE_DISCLAIMER, SCORE_WEIGHTS } from "@hl-bos/ats-resume";
import { Card, Notice, PageHead } from "@/components/ui.tsx";
import { aiStatus } from "@/lib/config.ts";
import { currentMode, getViewer, modeDescription } from "@/lib/session.ts";
import { currentProfile, loadWorkspace, storageDescription } from "@/lib/store.ts";
import { deleteAccount, removeSampleData, restoreSampleData } from "@/lib/actions.ts";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Settings doubles as the honesty page: what is switched on, what is not, and
 * what each thing actually does. Everything it reports is read from the live
 * configuration and the live store — there is no hard-coded "connected" badge
 * anywhere on it.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const unconfirmed = query["deleted"] === "unconfirmed";
  const workspace = await loadWorkspace();
  const profile = await currentProfile();
  const ai = aiStatus();
  const storage = await storageDescription();
  const mode = currentMode();
  const viewer = await getViewer();
  const sampleCount =
    workspace.profiles.filter((p) => p.isSample === true).length +
    workspace.facts.filter((f) => f.isSample === true).length;

  return (
    <>
      <PageHead
        title="Settings"
        lead="What this installation has switched on, stated plainly."
      />

      <Card title="How this installation runs">
        <p>
          <span className={mode === "local" ? "tag tag-partial" : "tag tag-strong"}>
            {mode === "local" ? "Local mode — no sign-in" : "Signed-in mode"}
          </span>
          {viewer.email === null ? null : (
            <span className="small muted" style={{ marginLeft: 8 }}>
              signed in as {viewer.email}
            </span>
          )}
        </p>
        <p className="small">{modeDescription()}</p>
        {mode === "local" ? (
          <Notice tone="warn">
            <strong>Do not put this on a public address as it stands.</strong> In local
            mode there is no login, so anyone who could reach the URL could read this
            career database. Deploying it sets an environment that requires sign-in, and
            the app refuses to start if it finds itself deployed without one.
          </Notice>
        ) : null}
      </Card>

      <Card title="AI provider">
        <p>
          <span className={ai.configured ? "tag tag-strong" : "tag tag-neutral"}>
            {ai.configured ? "Claude configured" : "Rules engine only"}
          </span>
        </p>
        <p className="small">{ai.detail}</p>
        <Notice>
          Whatever produces a suggestion, the rule is the same: a generated sentence is
          checked against your own evidence before it can be shown as final, and an
          unsupported sentence can never reach an exported file. A model cannot talk its
          way past that check, because the check reads the sentence, not the
          explanation.
        </Notice>
      </Card>

      <Card title="Storage">
        <p className="small mono">{storage}</p>
        <p className="small muted">
          Stored now: {workspace.profiles.length} profile(s), {workspace.facts.length}{" "}
          career facts, {workspace.resumes.length} master resume(s),{" "}
          {workspace.analyses.length} analyses, {workspace.generated.length} tailored
          resumes, {workspace.applications.length} applications.
        </p>
        <Notice tone="warn">
          <strong>PostgreSQL is not connected.</strong> The schema for this app is
          written and committed at{" "}
          <span className="mono">
            supabase/migrations/20260916120000_hlbos_0048_ats_resume_optimizer.sql
          </span>{" "}
          — nine tables with row-level security keyed to the signed-in user. It has not
          been applied to any project, and the Supabase-backed store is not built yet,
          so this app stores everything in the local JSON file above. Nothing here
          pretends otherwise.
        </Notice>
      </Card>

      <Card title="Scoring model" sub={SCORE_DISCLAIMER}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Weight</th>
                <th>What moves it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Qualification alignment</td>
                <td className="mono">{SCORE_WEIGHTS.qualificationAlignment}</td>
                <td className="small">
                  Critical and preferred requirements, weighted by importance and by how
                  well your evidence covers them.
                </td>
              </tr>
              <tr>
                <td>Relevant experience</td>
                <td className="mono">{SCORE_WEIGHTS.relevantExperience}</td>
                <td className="small">
                  The posting&apos;s responsibilities, matched the same way.
                </td>
              </tr>
              <tr>
                <td>Skills and keyword coverage</td>
                <td className="mono">{SCORE_WEIGHTS.skillsAndKeywords}</td>
                <td className="small">
                  Share of the posting&apos;s weighted keywords already in your resume.
                  Keywords you cannot evidence are excluded from the numerator,
                  permanently.
                </td>
              </tr>
              <tr>
                <td>Quantified accomplishments</td>
                <td className="mono">{SCORE_WEIGHTS.quantifiedAccomplishments}</td>
                <td className="small">
                  Proportion of your bullets that carry a number.
                </td>
              </tr>
              <tr>
                <td>ATS structure and formatting</td>
                <td className="mono">{SCORE_WEIGHTS.atsStructure}</td>
                <td className="small">Formatting risks found in the extracted text.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Services"
        sub="The ten services in the product brief, and what implements each one today."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Implementation</th>
                <th>Module</th>
              </tr>
            </thead>
            <tbody>
              {AI_SERVICES.map((service) => (
                <tr key={service.service}>
                  <td>{service.service}</td>
                  <td className="small">{service.implementation}</td>
                  <td className="small mono">{service.module}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Sample data">
        <p className="small">
          {sampleCount > 0
            ? `${sampleCount} sample records are present. They are marked "Sample data" everywhere they appear.`
            : "No sample data is present."}
        </p>
        <div className="row">
          <form action={removeSampleData}>
            <button
              className="btn btn-danger"
              type="submit"
              disabled={sampleCount === 0}
            >
              Delete all sample data
            </button>
          </form>
          <form action={restoreSampleData}>
            <button className="btn" type="submit" disabled={sampleCount > 0}>
              Restore sample data
            </button>
          </form>
        </div>
        {profile?.isSample === true ? (
          <p className="hint">
            Your current profile is the sample one. Add your own resume before deleting
            it, or the app will be empty.
          </p>
        ) : null}
      </Card>

      <Card title="Your data">
        <p className="small">
          What is stored, who can read it and whether any of it reaches an AI provider
          is set out in <Link href="/data-handling">Your data</Link> and{" "}
          <Link href="/privacy">Privacy</Link>.
        </p>
      </Card>

      <Card title="Delete my account">
        <p className="small">
          This permanently removes your profile, career facts, resumes, job postings,
          analyses, generated documents, applications and product counters. It cannot be
          undone by us, because after it runs there is nothing left to undo it from.
        </p>
        <p className="hint">
          Your sign-in record with the identity provider is not removed by this action —
          deleting it needs an administrative key that this app deliberately does not
          hold. Email us if you want that removed too and we will do it by hand.
        </p>
        {unconfirmed ? (
          <div className="notice notice-danger" role="alert">
            Nothing was deleted. Type DELETE exactly, in capitals, to confirm.
          </div>
        ) : null}
        <form action={deleteAccount}>
          <div className="field">
            <label htmlFor="confirm">
              Type <code>DELETE</code> to confirm
            </label>
            <input
              id="confirm"
              name="confirm"
              type="text"
              autoComplete="off"
              placeholder="DELETE"
              required
            />
          </div>
          <button className="btn btn-danger" type="submit">
            Delete my account and all data
          </button>
        </form>
      </Card>
    </>
  );
}
