import Link from "next/link";

import { STAGE_LABELS, type Opportunity } from "@hl-bos/ats-resume";

import { decideOpportunity } from "@/lib/career-actions.ts";

/** One opportunity in a list: facts, fit, and the shortlist decision. */
const FIT_TAG: Record<string, { label: string; cls: string }> = {
  strong: { label: "Strong match", cls: "tag tag-strong" },
  possible: { label: "Possible match", cls: "tag tag-partial" },
  blocked: { label: "Fails a must-have", cls: "tag tag-missing" },
};

export function OpportunityRow({ o, returnTo }: { o: Opportunity; returnTo: string }) {
  const fit = o.fit;
  return (
    <div className="line">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <Link href={`/opportunities/${o.id}`}>
            <strong>{o.title}</strong>
          </Link>{" "}
          — {o.employer}
          <div className="small muted">
            {o.location ?? "Location not stated"} ·{" "}
            {o.salaryText ?? "Salary not listed"} · {o.foundVia}
            {o.postedAt === undefined ? "" : ` · posted ${o.postedAt.slice(0, 10)}`} ·
            retrieved {o.retrievedAt.slice(0, 10)}
          </div>
          <div className="small" style={{ marginTop: 4 }}>
            {fit === undefined ? (
              <span className="tag tag-neutral">Not assessed</span>
            ) : (
              <span className={FIT_TAG[fit.label]?.cls}>
                {FIT_TAG[fit.label]?.label}
              </span>
            )}{" "}
            {o.expiredAt === undefined ? null : (
              <span className="tag tag-missing">No longer posted</span>
            )}{" "}
            {o.alsoSeen.length === 0 ? null : (
              <span className="tag tag-neutral">
                Also seen on {o.alsoSeen.length} other listing(s)
              </span>
            )}{" "}
            <span className="tag tag-neutral">{STAGE_LABELS[o.stage]}</span>
          </div>
          {fit === undefined ? null : (
            <details className="audit">
              <summary>Why it matches, gaps and unknowns</summary>
              <div className="audit-body small">
                {fit.reasons.length === 0 ? null : (
                  <p>
                    <strong>Matches:</strong> {fit.reasons.slice(0, 4).join(" · ")}
                  </p>
                )}
                {fit.gaps.length === 0 ? null : (
                  <p>
                    <strong>Gaps:</strong> {fit.gaps.slice(0, 4).join(" · ")}
                  </p>
                )}
                {fit.uncertain.length === 0 ? null : (
                  <p>
                    <strong>Not stated or not checked:</strong>{" "}
                    {fit.uncertain.slice(0, 4).join(" · ")}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
        {o.stage === "new_match" || o.stage === "saved" ? (
          <form action={decideOpportunity} className="row">
            <input type="hidden" name="opportunityId" value={o.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              className="btn btn-sm btn-primary"
              name="decision"
              value="pursue"
              type="submit"
            >
              Pursue
            </button>
            {o.stage === "saved" ? null : (
              <button className="btn btn-sm" name="decision" value="save" type="submit">
                Save for later
              </button>
            )}
            <button className="btn btn-sm" name="decision" value="pass" type="submit">
              Pass
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
