import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalViewer } from "@/lib/session";
import { dossier, currentPhase, pendingDecisions } from "@/lib/btic-data";
import { searchDossier } from "@/lib/btic-search";
import { BticShell, DossierNav, Panel, StatBox, Pill } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 2 — Engagement Overview (Venuewise). The executive summary of one dossier
// plus a bounded keyword search across its six entities.
export default async function EngagementOverview({
  params,
  searchParams,
}: {
  params: Promise<{ engagement: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { engagement } = await params;
  const { q } = await searchParams;
  const viewer = await getInternalViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  if (!viewer.canBTIC) {
    return (
      <BticShell
        email={null}
        title="Intelligence Center"
        lede="Internal HLD workspace."
      >
        <p style={{ color: colors.MUTED }}>
          Please{" "}
          <Link href={`/admin-login?next=/intelligence/${engagement}`}>sign in</Link> to
          view this dossier.
        </p>
      </BticShell>
    );
  }

  const e = d.engagement;
  const base = `/intelligence/${engagement}`;
  const phase = currentPhase(d);
  const pending = pendingDecisions(d);
  const done = d.phases.filter((p) => p.status === "complete").length;
  const query = (q ?? "").trim();
  const hits = query ? searchDossier(d, query) : [];

  return (
    <BticShell
      email={viewer.email}
      title={e.title}
      lede={e.summary}
      breadcrumb={[{ label: "Intelligence Center", href: "/intelligence" }]}
    >
      <DossierNav base={base} active="overview" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StatBox
          label="Transformation Score"
          value={e.transformationScore ? `${e.transformationScore.overall}/100` : "—"}
        />
        <StatBox label="Phases complete" value={`${done}/${d.phases.length}`} />
        <StatBox label="Reports on file" value={String(d.reports.length)} />
        <StatBox label="Decisions owed" value={String(pending.length)} />
        <StatBox label="Intelligence records" value={String(d.intelligence.length)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <Panel title="Where the engagement stands">
          <div style={{ fontSize: 13.5, color: colors.INK, lineHeight: 1.55 }}>
            {phase ? (
              <>
                Current phase: <strong>{phase.name}</strong>. {phase.summary}
              </>
            ) : (
              "No phase currently in progress."
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link
              href={`${base}/timeline`}
              style={{ fontSize: 13, color: colors.ACCENT }}
            >
              View full timeline →
            </Link>
          </div>
        </Panel>

        <Panel title="What is owed">
          {pending.length === 0 ? (
            <div style={{ fontSize: 13.5, color: colors.MUTED }}>
              No pending decisions.
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
              {pending.map((x) => (
                <li key={x.id}>{x.question}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 10 }}>
            <Link
              href={`${base}/decisions`}
              style={{ fontSize: 13, color: colors.ACCENT }}
            >
              Review decisions →
            </Link>
          </div>
        </Panel>

        {e.transformationScore ? (
          <Panel title="Assessment (analysis only)">
            <div style={{ display: "grid", gap: 6 }}>
              {e.transformationScore.domains.map((dm) => (
                <div
                  key={dm.label}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ fontSize: 12.5, width: 92, color: colors.MUTED }}>
                    {dm.label}
                  </span>
                  <span
                    style={{
                      height: 8,
                      flex: 1,
                      background: colors.LINE,
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${dm.score}%`,
                        background: colors.ACCENT,
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 12, width: 34, textAlign: "right" }}>
                    {dm.score}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#98a2b0", marginTop: 8 }}>
              Deterministic HL-BTI assessment — recommendations for discussion only.
            </div>
          </Panel>
        ) : null}
      </div>

      {/* Bounded search across the dossier */}
      <h2 style={{ fontSize: 17, margin: "26px 0 8px" }}>Find in this dossier</h2>
      <form method="GET" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="search"
          name="q"
          defaultValue={query}
          maxLength={120}
          placeholder="Search reports, decisions, phases, artifacts, intelligence…"
          aria-label="Search this dossier"
          style={{
            flex: 1,
            minWidth: 240,
            fontSize: 14,
            padding: "9px 12px",
            border: `1px solid ${colors.LINE}`,
            borderRadius: 9,
            background: "#fff",
            color: colors.INK,
          }}
        />
        <button
          type="submit"
          style={{
            fontSize: 14,
            padding: "9px 18px",
            border: "none",
            borderRadius: 9,
            background: colors.ACCENT,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      {query ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: colors.MUTED, marginBottom: 8 }}>
            {hits.length} result{hits.length === 1 ? "" : "s"} for “{query}”.
            {hits.length === 0
              ? " Nothing in this dossier matches — the search covers only its seeded records."
              : ""}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {hits.map((h) => (
              <div
                key={`${h.entity}-${h.id}`}
                style={{
                  background: "#fff",
                  border: `1px solid ${colors.LINE}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Pill bg="#eef1f4" fg="#5b6672" label={h.entity} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{h.title}</span>
                  <Pill bg="#f2f3f5" fg="#5b6672" label={h.facet} />
                </div>
                <div style={{ fontSize: 12.5, color: colors.MUTED, marginTop: 4 }}>
                  {h.snippet}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </BticShell>
  );
}
