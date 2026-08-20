import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Empty, colors } from "@/hlvs/components/ui";
import { ScorePair, SelectionProvenance } from "@/hlvs/components/sections";
import {
  getPortfolio,
  executiveOverview,
  type RisingEvidence,
} from "@/hlvs/lib/intelligence";

export const dynamic = "force-dynamic";

/**
 * Rising Opportunities — what is accelerating, measured rather than assumed.
 *
 * Membership does not require Top-100 standing: the point is to catch things
 * before they are obvious, and something already obvious has already been
 * caught.
 *
 * When there is nothing here, this page says WHY. An empty Rising list can
 * mean two very different things — "we measured and nothing is growing" or
 * "we have only measured once" — and the CEO cannot act on the difference
 * unless the page states which one it is.
 */
export default async function Rising() {
  const [view, overview] = await Promise.all([
    getPortfolio("rising"),
    executiveOverview(),
  ]);
  const hasMembers = view.members.length > 0;

  return (
    <StudioShell view="rising" path="/HLVS/rising">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Rising Opportunities</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        Growth measured between two observations of the same repository. Nothing here is
        inferred from a single reading.
      </p>

      {view.error ? (
        <Card
          title="This ranking could not be read"
          sub="Showing the error rather than an empty list"
        >
          <div style={{ fontSize: 12, color: colors.warn }}>{view.error}</div>
        </Card>
      ) : null}

      {view.snapshot && hasMembers ? (
        <SelectionProvenance
          members={view.snapshot.member_count}
          eligible={view.snapshot.eligible_count}
          corpus={view.snapshot.corpus_size}
          target={view.portfolio?.target_size ?? 100}
          computedAt={view.snapshot.computed_at}
          method={view.snapshot.method}
        />
      ) : null}

      {!hasMembers && !view.error ? (
        <Card title="No growth measured yet" sub="Why this list is empty">
          <Empty>
            <p style={{ marginTop: 0 }}>
              {overview.observations.toLocaleString()} observations are recorded, and{" "}
              {overview.risingScored.toLocaleString()} opportunities currently carry a
              measured rising score.
            </p>
            {overview.risingScored === 0 ? (
              <p>
                A rising score needs TWO readings of the same repository, taken far
                enough apart to tell growth from noise. The discovery capture is reading
                number one and is flagged as a baseline. Until a second observation pass
                completes, every rising score stays <strong>unknown</strong> —
                deliberately, rather than being shown as flat, which would be a claim
                the evidence does not support.
              </p>
            ) : (
              <p>
                Those scores were measured, so this is not a missing-data problem: the
                measurement ran and none of the repositories it could compare showed
                growth above zero. Only measured growth earns a place here. Everything
                else keeps an <strong>unknown</strong> rising score rather than a flat
                one, because not moving during one window is not the same as being known
                not to grow.
              </p>
            )}
          </Empty>
        </Card>
      ) : null}

      {view.members.map((m) => {
        const o = m.opportunity_id
          ? view.opportunities.get(m.opportunity_id)
          : undefined;
        if (!o) return null;
        const q = m.qualification as { rising?: RisingEvidence };
        const r: RisingEvidence = q?.rising ?? {};
        const num = (v: number | null | undefined): string =>
          v === null || v === undefined ? "—" : v.toLocaleString();
        return (
          <Card
            key={m.rank}
            title={`${m.rank}. ${o.title}`}
            sub={[o.category, o.language].filter(Boolean).join(" · ")}
          >
            <p style={{ fontSize: 13, marginTop: 0 }}>
              {o.summary || "No description provided."}
            </p>
            <ScorePair
              popularity={m.popularity_score}
              popularityStatus={m.popularity_status}
              suitability={m.suitability_score}
              suitabilityStatus={m.suitability_status}
              rising={m.rising_score}
              risingStatus="measured"
            />
            <div style={{ fontSize: 12, color: colors.dim, marginTop: 10 }}>
              Measured over {num(r.window_days)} days: stars {num(r.stars_from)} →{" "}
              {num(r.stars_to)} ({num(r.star_delta)}), forks +{num(r.fork_delta)}, open
              issues +{num(r.issue_delta)}
            </div>
            {o.repository_url ? (
              <div style={{ marginTop: 8 }}>
                <a
                  href={o.repository_url}
                  style={{ color: colors.accent, fontSize: 12 }}
                  rel="noreferrer noopener"
                >
                  {o.repository_url}
                </a>
              </div>
            ) : null}
          </Card>
        );
      })}
    </StudioShell>
  );
}
