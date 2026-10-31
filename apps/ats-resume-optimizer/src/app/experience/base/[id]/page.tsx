import Link from "next/link";
import { notFound } from "next/navigation";

import { blockingLines } from "@hl-bos/ats-resume";

import { Card, Flash, Notice, PageHead, ValidationTag } from "@/components/ui.tsx";
import { approveBase, confirmBaseLine, editBaseLine } from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

export default async function BaseResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; approved?: string }>;
}) {
  const { id } = await params;
  const { error, approved } = await searchParams;
  const ctx = await careerContext();
  const base = ctx.baseResumes.find((b) => b.id === id);
  if (base === undefined) notFound();
  const blocking = blockingLines(base);
  const editable = base.status === "draft";

  return (
    <>
      <PageHead
        title={`Base resume v${base.versionNumber}`}
        lead={
          editable
            ? "Review every line. Edit wording freely — each edit is re-checked against your experience bank."
            : `This version is ${base.status}. Approved versions are never changed; build a new draft to make edits.`
        }
        action={
          <Link className="btn" href="/experience#base">
            Back
          </Link>
        }
      />
      <Flash
        error={error}
        ok={
          approved === "1"
            ? "Approved. Tailored applications will start from this version."
            : undefined
        }
      />

      <Card title={base.fullName || "Your name"} sub={base.headline}>
        {base.summary.length === 0 ? null : (
          <>
            <h3>Summary</h3>
            {base.summary.map((l, i) => (
              <p key={i}>
                {l.text} <ValidationTag status={l.validation} />
              </p>
            ))}
          </>
        )}
        {base.skills.length === 0 ? null : (
          <>
            <h3>Skills</h3>
            <p>{base.skills.join(", ")}</p>
          </>
        )}
        <h3>Experience</h3>
        {base.roles.map((role, ri) => (
          <div key={ri} style={{ marginBottom: 16 }}>
            <strong>{role.title}</strong> — {role.employer}
            <div className="small muted">
              {[
                role.location,
                [role.startDate, role.current ? "Present" : role.endDate]
                  .filter(Boolean)
                  .join(" – "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {role.bullets.map((b, bi) => (
              <div key={bi} className="line">
                {editable ? (
                  <form action={editBaseLine}>
                    <input type="hidden" name="baseId" value={base.id} />
                    <input type="hidden" name="role" value={ri} />
                    <input type="hidden" name="bullet" value={bi} />
                    <textarea
                      name="text"
                      rows={2}
                      defaultValue={b.text}
                      aria-label={`Bullet ${bi + 1} for ${role.title}`}
                    />
                    <div className="row small">
                      <ValidationTag status={b.validation} />
                      <button className="btn btn-sm" type="submit">
                        Save wording
                      </button>
                      <button
                        className="btn btn-sm"
                        type="submit"
                        name="remove"
                        value="1"
                      >
                        Leave out
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    • {b.text} <ValidationTag status={b.validation} />
                  </div>
                )}
                {b.notes.length === 0 ? null : (
                  <div className="small muted">{b.notes.join(" ")}</div>
                )}
                {editable &&
                (b.validation === "needs_confirmation" ||
                  b.validation === "unsupported") ? (
                  <form action={confirmBaseLine}>
                    <input type="hidden" name="baseId" value={base.id} />
                    <input type="hidden" name="role" value={ri} />
                    <input type="hidden" name="bullet" value={bi} />
                    <button className="btn btn-sm" type="submit">
                      This is true — add it to my experience bank
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {base.education.length === 0 ? null : (
          <>
            <h3>Education</h3>
            {base.education.map((e) => (
              <p key={e.id}>
                {[e.credential, e.institution, e.year].filter(Boolean).join(" · ")}
              </p>
            ))}
          </>
        )}
        {base.certifications.length === 0 ? null : (
          <>
            <h3>Certifications and licenses</h3>
            <p>{base.certifications.join(", ")}</p>
          </>
        )}
      </Card>

      {editable ? (
        <Card title="Approve">
          {blocking.length > 0 ? (
            <Notice tone="warn">
              {blocking.length} line(s) contain something your experience bank does not
              support. Edit them, leave them out, or confirm they are true before
              approving.
            </Notice>
          ) : null}
          <form action={approveBase}>
            <input type="hidden" name="baseId" value={base.id} />
            <label className="firm" style={{ fontSize: 14, marginBottom: 10 }}>
              <input type="checkbox" name="confirm" value="yes" /> I have reviewed this
              resume and it accurately describes my experience.
            </label>
            <div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={blocking.length > 0}
              >
                Approve this version
              </button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
