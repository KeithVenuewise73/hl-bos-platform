import Link from "next/link";
import { notFound } from "next/navigation";

import {
  STAGE_LABELS,
  TRANSITIONS,
  coverLetterText,
  now,
  verifySubmission,
} from "@hl-bos/ats-resume";

import { Card, Empty, Flash, Notice, PageHead } from "@/components/ui.tsx";
import { OpportunityRow } from "@/components/OpportunityRow.tsx";
import {
  confirmSubmitted,
  generatePackage,
  updateOpportunity,
} from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; generated?: string; submitted?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await careerContext();
  const o = ctx.opportunities.find((x) => x.id === id);
  if (o === undefined) notFound();
  const resumes = ctx.workspace.generated
    .filter((g) => o.draftResumeIds.includes(g.id))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const letters = ctx.workspace.coverLetters
    .filter((l) => o.draftCoverLetterIds.includes(l.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const submission = ctx.submissions.find((s) => s.id === o.submissionId);
  const approved = ctx.baseResumes.find((b) => b.status === "approved");
  const nextStages = TRANSITIONS[o.stage].filter((s) => s !== "documents_ready");
  const today = now().slice(0, 10);
  const Hidden = ({ op }: { op: string }) => (
    <>
      <input type="hidden" name="opportunityId" value={o.id} />
      <input type="hidden" name="op" value={op} />
    </>
  );

  return (
    <>
      <PageHead
        title={o.title}
        lead={`${o.employer} · ${STAGE_LABELS[o.stage]}`}
        action={
          <Link className="btn" href="/pipeline">
            All applications
          </Link>
        }
      />
      <Flash
        error={q.error}
        ok={
          q.generated === "1"
            ? "Documents ready for review. Nothing has been sent — when you submit the application yourself, confirm it below."
            : q.submitted === "1"
              ? "Recorded as applied. The exact documents are archived and will not change."
              : undefined
        }
      />

      <Card title="The opportunity">
        <OpportunityRow o={o} returnTo={`/opportunities/${o.id}`} />
        <p className="small">
          {o.url === undefined ? (
            "No link to the original posting."
          ) : (
            <a href={o.url} rel="noopener noreferrer" target="_blank">
              Original posting
            </a>
          )}{" "}
          · Found via {o.foundVia}
          {o.submittedVia === undefined ? "" : ` · Submitted via ${o.submittedVia}`}
        </p>
        <details className="audit">
          <summary>
            Job description as retrieved on {o.retrievedAt.slice(0, 10)}
          </summary>
          <div className="pre">
            {o.descriptionSnapshot || "No description was available from the source."}
          </div>
        </details>
        {o.passReasons.length === 0 ? null : (
          <p className="small muted">
            You passed because: {o.passReasons.join("; ")}. This did not change your
            search preferences.
          </p>
        )}
      </Card>

      {o.stage === "pursuing" || o.stage === "documents_ready" || resumes.length > 0 ? (
        <Card
          title="Application documents"
          sub="Built from your approved base resume and verified experience only. Anything the posting asks for that you have not evidenced is listed as a gap, never written in."
        >
          <div id="documents" />
          {approved === undefined ? (
            <Notice tone="warn">
              Approve your <Link href="/experience#base">base resume</Link> first.
            </Notice>
          ) : null}
          {submission === undefined &&
          (o.stage === "pursuing" || o.stage === "documents_ready") ? (
            <form action={generatePackage}>
              <input type="hidden" name="opportunityId" value={o.id} />
              <div className="field">
                <label htmlFor="motivation">
                  Why this role, in your own words (optional, used verbatim in the
                  letter)
                </label>
                <textarea id="motivation" name="motivation" rows={2} />
              </div>
              <button className="btn btn-primary" type="submit">
                {resumes.length === 0 ? "Prepare documents" : "Prepare a new version"}
              </button>
            </form>
          ) : null}
          {o.fit?.gaps.length ? (
            <Notice tone="warn">
              <strong>Gaps to be honest about:</strong>{" "}
              {o.fit.gaps.slice(0, 6).join(" · ")}
            </Notice>
          ) : null}
          {resumes.map((r) => (
            <div key={r.id} className="line">
              <strong>Resume v{r.versionNumber}</strong>{" "}
              <span className="small muted">
                {r.createdAt.slice(0, 16).replace("T", " ")}
              </span>{" "}
              <Link href={`/resumes/${r.id}`}>Review and edit</Link> ·{" "}
              <a href={`/resumes/${r.id}/export?format=docx`}>Download Word</a> ·{" "}
              <a href={`/resumes/${r.id}/export?format=pdf`}>PDF</a>
            </div>
          ))}
          {letters.map((l, i) => (
            <details key={l.id} className="audit">
              <summary>
                Cover letter {letters.length - i} —{" "}
                {l.createdAt.slice(0, 16).replace("T", " ")}
              </summary>
              <div className="pre">{coverLetterText(l)}</div>
            </details>
          ))}
          {o.outreachDrafts.length === 0 ? null : (
            <details className="audit">
              <summary>Recruiter / hiring-manager note (optional)</summary>
              <div className="pre">{o.outreachDrafts[o.outreachDrafts.length - 1]}</div>
            </details>
          )}
        </Card>
      ) : null}

      {submission === undefined && resumes.length > 0 ? (
        <Card
          title="Did you submit this application?"
          sub="Preparing documents does not apply for you. When you have actually submitted, record it here — the exact documents you choose are archived permanently."
        >
          <form action={confirmSubmitted}>
            <input type="hidden" name="opportunityId" value={o.id} />
            <div className="field-row">
              <div className="field">
                <label htmlFor="resumeId">Resume you sent</label>
                <select id="resumeId" name="resumeId">
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      Resume v{r.versionNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="coverLetterId">Cover letter you sent</label>
                <select id="coverLetterId" name="coverLetterId">
                  {letters.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      Cover letter {letters.length - i}
                    </option>
                  ))}
                  <option value="">No cover letter</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="submittedOn">Date submitted</label>
                <input
                  id="submittedOn"
                  name="submittedOn"
                  type="date"
                  max={today}
                  defaultValue={today}
                />
              </div>
              <div className="field">
                <label htmlFor="submittedVia">Where you submitted it</label>
                <input
                  id="submittedVia"
                  name="submittedVia"
                  placeholder="Company careers site, Indeed, email to recruiter…"
                />
              </div>
            </div>
            <label className="firm" style={{ fontSize: 14, marginBottom: 10 }}>
              <input type="checkbox" name="confirm" value="yes" /> I submitted this
              application with these documents.
            </label>
            <div>
              <button className="btn btn-primary" type="submit">
                Record as applied
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {submission === undefined ? null : (
        <Card
          title="Submitted package (archived)"
          sub={`Sent ${submission.submittedOn} via ${submission.submittedVia}. These are the exact documents; later edits and new versions never change them.`}
        >
          <div id="submitted" />
          <p className="small">
            Integrity check:{" "}
            {verifySubmission(submission) ? (
              <span className="tag tag-strong">Unchanged since submission</span>
            ) : (
              <span className="tag tag-missing">Does not match its fingerprint</span>
            )}{" "}
            <span className="mono small muted">
              {submission.contentHash.slice(0, 16)}…
            </span>
          </p>
          <p>
            <a
              className="btn btn-sm"
              href={`/opportunities/${o.id}/submitted/resume.docx`}
            >
              Resume (Word)
            </a>{" "}
            <a
              className="btn btn-sm"
              href={`/opportunities/${o.id}/submitted/resume.txt`}
            >
              Resume (text)
            </a>{" "}
            {submission.coverLetterText === undefined ? null : (
              <a
                className="btn btn-sm"
                href={`/opportunities/${o.id}/submitted/cover-letter.txt`}
              >
                Cover letter
              </a>
            )}{" "}
            <a
              className="btn btn-sm"
              href={`/opportunities/${o.id}/submitted/posting.txt`}
            >
              Job description
            </a>{" "}
            <Link
              className="btn btn-sm btn-primary"
              href={`/opportunities/${o.id}/practice`}
            >
              Practice for the interview
            </Link>
          </p>
          <details className="audit">
            <summary>Resume as sent</summary>
            <div className="pre">{submission.resumeText}</div>
          </details>
          {submission.coverLetterText === undefined ? null : (
            <details className="audit">
              <summary>Cover letter as sent</summary>
              <div className="pre">{submission.coverLetterText}</div>
            </details>
          )}
        </Card>
      )}

      {nextStages.length === 0 ||
      o.stage === "new_match" ||
      o.stage === "saved" ? null : (
        <Card title="Update status">
          <div id="stage" />
          <form action={updateOpportunity}>
            <Hidden op="stage" />
            <div className="field-row">
              <div className="field">
                <label htmlFor="stage-select">New status</label>
                {/* Keyed by stage so a re-render never keeps a stale selection,
                    and no consequential status is pre-selected. */}
                <select id="stage-select" name="stage" key={o.stage} defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {nextStages.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="note">Note (optional)</label>
                <input id="note" name="note" />
              </div>
              <div className="field">
                <label htmlFor="outcome">Final outcome (optional)</label>
                <input
                  id="outcome"
                  name="outcome"
                  placeholder="e.g. Offer accepted, start 1 Dec"
                />
              </div>
            </div>
            <button className="btn" type="submit">
              Update
            </button>
          </form>
        </Card>
      )}

      <div className="grid">
        <Card title="Contacts">
          <div id="contact" />
          {o.contacts.length === 0 ? (
            <Empty>No contacts yet.</Empty>
          ) : (
            o.contacts.map((c) => (
              <p key={c.id} className="small">
                <strong>{c.name}</strong>
                {c.role ? `, ${c.role}` : ""} {c.email ?? ""} {c.phone ?? ""}
              </p>
            ))
          )}
          <form action={updateOpportunity}>
            <Hidden op="contact" />
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input id="c-name" name="name" />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="c-role">Role</label>
                <input id="c-role" name="role" placeholder="Recruiter" />
              </div>
              <div className="field">
                <label htmlFor="c-email">Email</label>
                <input id="c-email" name="email" type="email" />
              </div>
            </div>
            <button className="btn btn-sm" type="submit">
              Add contact
            </button>
          </form>
        </Card>

        <Card
          title="Follow-ups"
          sub="Reminders you set. Shown on your dashboard when due."
        >
          <div id="followUp" />
          {o.followUps.map((f) => (
            <form key={f.id} action={updateOpportunity} className="small row">
              <Hidden op="followUpDone" />
              <input type="hidden" name="followUpId" value={f.id} />
              <span>
                {f.done ? "✓" : f.due <= today ? "Due" : "Upcoming"} {f.due} —{" "}
                {f.action}
              </span>
              {f.done ? null : (
                <button className="btn btn-sm" type="submit">
                  Done
                </button>
              )}
            </form>
          ))}
          <form action={updateOpportunity}>
            <Hidden op="followUp" />
            <div className="field-row">
              <div className="field">
                <label htmlFor="f-due">Date</label>
                <input id="f-due" name="due" type="date" />
              </div>
              <div className="field">
                <label htmlFor="f-action">What</label>
                <input id="f-action" name="action" placeholder="Email the recruiter" />
              </div>
            </div>
            <button className="btn btn-sm" type="submit">
              Add follow-up
            </button>
          </form>
        </Card>
      </div>

      <Card title="Interviews">
        <div id="interview" />
        {o.interviews.map((r) => (
          <div key={r.id} className="line">
            <strong>{r.label}</strong> — {r.date}
            {r.format ? ` (${r.format})` : ""}
            <form action={updateOpportunity}>
              <Hidden op="interviewNotes" />
              <input type="hidden" name="roundId" value={r.id} />
              <textarea
                name="notes"
                rows={2}
                defaultValue={r.notes}
                placeholder="Post-interview notes: who you met, what they asked, what to follow up on."
                aria-label={`Notes for ${r.label}`}
              />
              <button className="btn btn-sm" type="submit">
                Save notes
              </button>
            </form>
            <form action={updateOpportunity}>
              <Hidden op="thankYou" />
              <input type="hidden" name="roundId" value={r.id} />
              <button className="btn btn-sm" type="submit">
                {r.thankYouDraft ? "Redraft thank-you note" : "Draft a thank-you note"}
              </button>
            </form>
            {r.thankYouDraft === undefined ? null : (
              <div className="pre">{r.thankYouDraft}</div>
            )}
          </div>
        ))}
        <form action={updateOpportunity}>
          <Hidden op="interview" />
          <div className="field-row">
            <div className="field">
              <label htmlFor="i-label">Round</label>
              <input id="i-label" name="label" placeholder="Phone screen" />
            </div>
            <div className="field">
              <label htmlFor="i-date">Date</label>
              <input id="i-date" name="date" type="date" />
            </div>
            <div className="field">
              <label htmlFor="i-format">Format</label>
              <input id="i-format" name="format" placeholder="Video, on-site…" />
            </div>
          </div>
          <button className="btn btn-sm" type="submit">
            Add interview
          </button>
        </form>
      </Card>

      <Card title="Notes">
        <div id="notes" />
        <form action={updateOpportunity}>
          <Hidden op="notes" />
          <textarea name="notes" rows={4} defaultValue={o.notes} aria-label="Notes" />
          <button className="btn btn-sm" type="submit">
            Save notes
          </button>
        </form>
      </Card>

      <Card title="History">
        {o.history.map((h, i) => (
          <p key={i} className="small">
            <span className="mono">{h.at.slice(0, 16).replace("T", " ")}</span> —{" "}
            {STAGE_LABELS[h.stage]}
            {h.note ? ` · ${h.note}` : ""}
          </p>
        ))}
        {o.outcome === undefined ? null : (
          <p>
            <strong>Outcome:</strong> {o.outcome}
          </p>
        )}
      </Card>
    </>
  );
}
