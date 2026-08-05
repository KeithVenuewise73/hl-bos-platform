import Link from "next/link";
import { getClientViewer } from "@/lib/session";
import { engagements, dossier, currentPhase, pendingDecisions } from "@/lib/btic-data";
import { BticShell, Panel, StatBox, Pill } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 1 — Executive Home. Answers, at a glance: which engagements exist, where
// each stands, and what is owed. Defense in depth: middleware gates /intelligence
// and this server component re-checks the viewer.
export default async function IntelligenceHome() {
  const viewer = await getClientViewer();
  if (!viewer.authenticated) {
    return (
      <BticShell
        email={null}
        title="Business Transformation Intelligence Center"
        lede="Internal HLD workspace."
      >
        <p style={{ color: colors.MUTED }}>
          Please <Link href="/login?next=/intelligence">sign in</Link> to continue.
        </p>
      </BticShell>
    );
  }

  const list = engagements();

  return (
    <BticShell
      email={viewer.email}
      title="Business Transformation Intelligence Center"
      lede="HLD's institutional memory for every transformation engagement — where it stands, what is complete, which report is current truth, and what decisions are owed."
    >
      <div style={{ display: "grid", gap: 14 }}>
        {list.map((e) => {
          const d = dossier(e.id)!;
          const phase = currentPhase(d);
          const pending = pendingDecisions(d);
          const done = d.phases.filter((p) => p.status === "complete").length;
          return (
            <Panel key={e.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <Link
                    href={`/intelligence/${e.id}`}
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: colors.INK,
                      textDecoration: "none",
                    }}
                  >
                    {e.title}
                  </Link>
                  <div style={{ fontSize: 12.5, color: colors.MUTED, marginTop: 2 }}>
                    {e.client}
                  </div>
                </div>
                <Pill
                  bg={e.status === "active" ? "#e6f0f6" : "#f2f3f5"}
                  fg={e.status === "active" ? "#1f5f8b" : "#5b6672"}
                  label={e.status === "active" ? "Active" : e.status}
                />
              </div>

              <p
                style={{
                  fontSize: 13.5,
                  color: colors.INK,
                  lineHeight: 1.55,
                  marginTop: 12,
                }}
              >
                {e.summary}
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                <StatBox
                  label="Transformation Score"
                  value={
                    e.transformationScore ? `${e.transformationScore.overall}/100` : "—"
                  }
                />
                <StatBox label="Phases complete" value={`${done}/${d.phases.length}`} />
                <StatBox
                  label="Current phase"
                  value={phase ? phase.name.split(" ").slice(0, 2).join(" ") : "—"}
                />
                <StatBox label="Decisions owed" value={String(pending.length)} />
              </div>

              <div style={{ marginTop: 14 }}>
                <Link
                  href={`/intelligence/${e.id}`}
                  style={{ fontSize: 13, color: colors.ACCENT }}
                >
                  Open dossier →
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#98a2b0", marginTop: 20, lineHeight: 1.6 }}>
        V1 holds one seeded dossier (Venuewise) built only from verified internal
        materials. Every record links to its source. This is a read/review workspace; it
        does not yet capture new records from the UI.
      </p>
    </BticShell>
  );
}
