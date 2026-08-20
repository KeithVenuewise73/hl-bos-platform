import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Grid, Empty, Badge, colors } from "@/hlvs/components/ui";
import { ProvisioningBanner } from "@/hlvs/components/sections";
import { statusCounts } from "@/hlvs/lib/data";
import { executiveOverview } from "@/hlvs/lib/intelligence";
import { OPPORTUNITY_STATUSES } from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

/** Analysis levels, in the CEO's own staging. */
const LEVELS: { level: number; label: string; note: string }[] = [
  { level: 0, label: "Discovery", note: "Everything captured. Nothing ever leaves." },
  {
    level: 1,
    label: "Machine triage",
    note: "Deterministic scoring across the whole corpus.",
  },
  {
    level: 2,
    label: "Portfolio analysis",
    note: "Qualified into a Top-100 or Rising.",
  },
  {
    level: 3,
    label: "Deep research",
    note: "Externally researched beyond discovery metadata.",
  },
  { level: 4, label: "Executive diligence", note: "Under serious consideration." },
];

function Stat({
  value,
  label,
  note,
  href,
}: {
  value: string;
  label: string;
  note?: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: 12,
        height: "100%",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.dim }}>{label}</div>
      {note ? (
        <div style={{ fontSize: 11, color: colors.dim, marginTop: 4 }}>{note}</div>
      ) : null}
    </div>
  );
  return href ? (
    <a href={href} style={{ textDecoration: "none", color: colors.text }}>
      {inner}
    </a>
  ) : (
    inner
  );
}

/**
 * The front page.
 *
 * Every number here is counted by the database. The design intent is that the
 * relationship between the ranked lists and the corpus underneath is visible
 * at a glance: the Discovery Universe figure leads, and each Top-100 is shown
 * as a selection FROM it, so a hundred rows can never read as though they were
 * all there is.
 */
export default async function Overview() {
  const [summary, intel] = await Promise.all([
    statusCounts(OPPORTUNITY_STATUSES),
    executiveOverview(),
  ]);
  const counts = new Map<string, number>(Object.entries(summary.counts));
  const n = (v: number) => v.toLocaleString();

  return (
    <StudioShell view="overview" path="/">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Executive Overview</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        Ranked intelligence layered above the complete discovery corpus. The Top-100
        lists are saved, ranked selections — the whole universe stays browsable
        underneath them.
      </p>
      <ProvisioningBanner detail={{ provisioning: intel.provisioning }} />

      {intel.error ? (
        <Card
          title="These figures could not be read"
          sub="Reporting the failure rather than showing zeros"
        >
          <div style={{ fontSize: 12, color: colors.warn }}>{intel.error}</div>
        </Card>
      ) : null}

      <Card
        title="Discovery universe"
        sub="The complete corpus. Every ranking below is a selection from this, never a replacement for it."
      >
        <Grid min={170}>
          <Stat
            value={n(intel.corpus)}
            label="Opportunities held"
            note="Nothing is deleted by ranking"
            href="/HLVS/opportunities"
          />
          <Stat
            value={n(intel.observations)}
            label="Metric observations"
            note="Readings recorded over time"
          />
          <Stat
            value={n(intel.painSignals)}
            label="Public pain signals"
            note="Each with a public URL"
          />
          <Stat
            value={n(intel.painPresented)}
            label="Pain points presented"
            note={`of ${n(intel.painClusters)} themes tracked`}
            href="/HLVS/top100/pain"
          />
        </Grid>
      </Card>

      <Card title="Analysis depth" sub="How far each record has actually been taken">
        <Grid min={170}>
          {LEVELS.map((l) => (
            <Stat
              key={l.level}
              value={n(intel.byLevel[l.level] ?? 0)}
              label={`Level ${l.level} — ${l.label}`}
              note={l.note}
            />
          ))}
        </Grid>
        <div style={{ fontSize: 11, color: colors.dim, marginTop: 10 }}>
          Levels 3 and 4 read zero because no external research or executive diligence
          has been performed yet. That is a true zero, not a missing number.
        </div>
      </Card>

      <Card
        title="Portfolios"
        sub="Current rankings, each with the size of the pool it was drawn from"
      >
        {intel.portfolios.length === 0 ? (
          <Empty>
            No portfolio has been built yet. Nothing is being hidden — no ranking has
            been computed.
          </Empty>
        ) : (
          <Grid min={230}>
            {intel.portfolios.map((p) => (
              <Stat
                key={p.key}
                value={n(p.members)}
                label={p.label}
                note={`selected from ${n(p.eligible)} eligible`}
                href={p.key === "rising" ? "/HLVS/rising" : `/HLVS/top100/${p.key}`}
              />
            ))}
          </Grid>
        )}
      </Card>

      <Card
        title="Rising opportunities"
        sub="Growth is measured between two observations, never inferred from one"
      >
        {intel.risingScored === 0 ? (
          <Empty>
            <Badge tone="neutral">baseline only</Badge> — {n(intel.observations)}{" "}
            observations recorded, all of them first readings. A rising score needs a
            second observation of the same repository; until then every rising score
            stays unknown rather than being shown as flat.
          </Empty>
        ) : (
          <Grid min={170}>
            <Stat
              value={n(intel.risingScored)}
              label="With a measured rising score"
              href="/HLVS/rising"
            />
          </Grid>
        )}
      </Card>

      <Card title="Pipeline" sub="Opportunities by status">
        {summary.total === 0 ? (
          <Empty>
            {summary.provisioning === "ready"
              ? "No opportunities captured yet."
              : "No live data in this environment — see the notice above."}
          </Empty>
        ) : (
          <Grid min={140}>
            {OPPORTUNITY_STATUSES.map((s) => (
              <div
                key={s}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {counts.get(s) ?? 0}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.dim,
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </div>
              </div>
            ))}
          </Grid>
        )}
      </Card>
    </StudioShell>
  );
}
