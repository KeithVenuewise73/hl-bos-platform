import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalViewer } from "@/lib/session";
import { dossier, orderedPhases } from "@/lib/btic-data";
import { BticShell, DossierNav, PhaseStatusBadge, Provenance } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 3 — Timeline. The ordered phase history: what has been done, what is in
// progress, in provenance-backed sequence.
export default async function TimelineView({
  params,
}: {
  params: Promise<{ engagement: string }>;
}) {
  const { engagement } = await params;
  const viewer = await getInternalViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  if (!viewer.canBTIC) {
    return (
      <BticShell email={null} title="Timeline" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please{" "}
          <Link href={`/admin-login?next=/intelligence/${engagement}/timeline`}>
            sign in
          </Link>
          .
        </p>
      </BticShell>
    );
  }

  const base = `/intelligence/${engagement}`;
  const phases = orderedPhases(d);

  return (
    <BticShell
      email={viewer.email}
      title={`${d.engagement.title} — Timeline`}
      lede="Every phase of the engagement in order, with its verified source."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
      ]}
    >
      <DossierNav base={base} active="timeline" />

      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {phases.map((p, i) => (
          <li
            key={p.id}
            style={{
              display: "flex",
              gap: 14,
              paddingBottom: i === phases.length - 1 ? 0 : 4,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 24,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background:
                    p.status === "complete"
                      ? "#1a7f43"
                      : p.status === "in_progress"
                        ? colors.ACCENT
                        : colors.LINE,
                  marginTop: 4,
                }}
              />
              {i < phases.length - 1 ? (
                <span
                  style={{ width: 2, flex: 1, background: colors.LINE, marginTop: 2 }}
                />
              ) : null}
            </div>
            <div
              style={{
                flex: 1,
                background: "#fff",
                border: `1px solid ${colors.LINE}`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  <span style={{ color: colors.MUTED, fontWeight: 400 }}>
                    {String(p.order).padStart(2, "0")}
                  </span>{" "}
                  {p.name}
                </div>
                <PhaseStatusBadge status={p.status} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: colors.INK,
                  lineHeight: 1.55,
                  marginTop: 6,
                }}
              >
                {p.summary}
              </div>
              <Provenance>{p.provenance}</Provenance>
            </div>
          </li>
        ))}
      </ol>
    </BticShell>
  );
}
