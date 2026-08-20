import { notFound } from "next/navigation";
import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Empty, Badge, colors } from "@/hlvs/components/ui";
import {
  ScorePair,
  SelectionProvenance,
  NotYetResearched,
} from "@/hlvs/components/sections";
import { getPortfolio, painSignals } from "@/hlvs/lib/intelligence";
import {
  NOT_YET_RESEARCHED_AT_LEVEL_1,
  NOT_YET_RESEARCHED_FOR_PAIN,
} from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

const KEYS = ["logistics", "transformation", "sports", "outside-core", "pain"] as const;

/**
 * One Top-100 portfolio.
 *
 * Reads the CURRENT stored snapshot rather than ranking on page load, so the
 * order the CEO sees is the order that was computed, recorded and can be
 * explained afterwards.
 */
export default async function Top100({
  params,
}: {
  params: Promise<{ portfolio: string }>;
}) {
  const { portfolio: key } = await params;
  if (!(KEYS as readonly string[]).includes(key)) notFound();

  const view = await getPortfolio(key);
  const path = `/HLVS/top100/${key}`;

  // The pain portfolio ranks clusters of public complaints, not repositories.
  // Its evidence is the complaints themselves, so they are fetched with it.
  const signalsByCluster = new Map<string, Awaited<ReturnType<typeof painSignals>>>();
  if (key === "pain") {
    for (const m of view.members) {
      if (m.pain_cluster_id) {
        signalsByCluster.set(
          m.pain_cluster_id,
          await painSignals(m.pain_cluster_id, 6),
        );
      }
    }
  }

  return (
    <StudioShell view="portfolio" path={path}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{view.portfolio?.label ?? key}</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        {view.portfolio?.description ?? ""}
      </p>

      {view.error ? (
        <Card
          title="This ranking could not be read"
          sub="Showing the error rather than an empty list"
        >
          <div style={{ fontSize: 12, color: colors.warn }}>{view.error}</div>
        </Card>
      ) : null}

      {view.snapshot ? (
        <SelectionProvenance
          members={view.snapshot.member_count}
          eligible={view.snapshot.eligible_count}
          corpus={view.snapshot.corpus_size}
          target={view.portfolio?.target_size ?? 100}
          computedAt={view.snapshot.computed_at}
          method={view.snapshot.method}
        />
      ) : !view.error ? (
        <Card
          title="Not built yet"
          sub="No ranking has been computed for this portfolio"
        >
          <Empty>
            This portfolio has no current snapshot. That is a missing computation, not
            an empty result — nothing has been ranked and nothing is being hidden.
          </Empty>
        </Card>
      ) : null}

      {view.members.map((m) => {
        if (key === "pain" && m.pain_cluster_id) {
          const c = view.clusters.get(m.pain_cluster_id);
          if (!c) return null;
          const sigs = signalsByCluster.get(m.pain_cluster_id) ?? [];
          return (
            <Card
              key={m.rank}
              title={`${m.rank}. ${c.title}`}
              sub={`${c.signal_count} public complaints · ${c.source_count} source type(s)`}
            >
              <p style={{ fontSize: 13, marginTop: 0 }}>{c.problem_statement}</p>
              <div
                style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}
              >
                <Badge tone={c.human_review_required ? "warn" : "good"}>
                  {c.human_review_required ? "Human review required" : "Reviewed"}
                </Badge>
                <Badge tone="neutral">
                  Momentum:{" "}
                  {c.momentum_status === "unknown"
                    ? "NOT YET MEASURED"
                    : c.momentum_score}
                </Badge>
                <Badge tone="neutral">
                  HLG relevance:{" "}
                  {c.hlg_relevance_status === "unknown"
                    ? "NOT YET RESEARCHED"
                    : c.hlg_relevance}
                </Badge>
                <Badge tone="neutral">
                  Response: {c.suggested_response ?? "NOT YET ASSESSED"}
                </Badge>
              </div>
              <div style={{ fontSize: 11, color: colors.dim, marginBottom: 8 }}>
                Clustered by: {c.method}
              </div>
              <div style={{ fontSize: 12, color: colors.dim, marginBottom: 4 }}>
                Representative evidence — every one is a public page you can open:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sigs.map((s) => (
                  <li key={s.id} style={{ marginBottom: 5, fontSize: 12 }}>
                    <a
                      href={s.source_url}
                      style={{ color: colors.accent }}
                      rel="noreferrer noopener"
                    >
                      {s.title || s.source_url}
                    </a>
                    <span style={{ color: colors.dim }}>
                      {" "}
                      · {s.reactions ?? 0} reactions · {s.comments ?? 0} comments
                      {s.created_at_source
                        ? ` · ${s.created_at_source.slice(0, 10)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <NotYetResearched fields={NOT_YET_RESEARCHED_FOR_PAIN} />
            </Card>
          );
        }

        const o = m.opportunity_id
          ? view.opportunities.get(m.opportunity_id)
          : undefined;
        if (!o) return null;
        const qual = m.qualification as { basis?: string; matched_terms?: unknown };
        return (
          <Card
            key={m.rank}
            title={`${m.rank}. ${o.title}`}
            sub={[o.category, o.language, o.license, o.archived ? "archived" : null]
              .filter(Boolean)
              .join(" · ")}
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
              risingStatus={m.rising_score === null ? "unknown" : "measured"}
            />
            <div style={{ fontSize: 12, color: colors.dim, marginTop: 10 }}>
              Measured evidence: {o.stars?.toLocaleString() ?? "—"} stars ·{" "}
              {o.forks?.toLocaleString() ?? "—"} forks ·{" "}
              {o.open_issues?.toLocaleString() ?? "—"} open issues · last push{" "}
              {o.pushed_at ? o.pushed_at.slice(0, 10) : "—"} · found by{" "}
              {o.search_pattern ?? "—"}
            </div>
            <div style={{ fontSize: 12, color: colors.dim, marginTop: 4 }}>
              Qualified because: {qual?.basis ?? "—"}
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
                {" · "}
                <a
                  href={`/HLVS/opportunities/${o.id}`}
                  style={{ color: colors.accent, fontSize: 12 }}
                >
                  Full record
                </a>
              </div>
            ) : null}
            <NotYetResearched fields={NOT_YET_RESEARCHED_AT_LEVEL_1} />
          </Card>
        );
      })}
    </StudioShell>
  );
}
