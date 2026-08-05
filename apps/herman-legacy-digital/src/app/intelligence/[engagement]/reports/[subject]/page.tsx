import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalViewer } from "@/lib/session";
import {
  dossier,
  currentReportFor,
  historyFor,
  reportTruthIsUnambiguous,
} from "@/lib/btic-data";
import {
  BticShell,
  DossierNav,
  ReportStatusBadge,
  Provenance,
} from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 4b — Report detail. Makes the current-vs-historical behavior explicit:
// one clearly-marked current truth, with every prior version retained beneath it
// and each superseding relationship stated. History is read-only.
export default async function ReportDetail({
  params,
}: {
  params: Promise<{ engagement: string; subject: string }>;
}) {
  const { engagement, subject } = await params;
  const viewer = await getInternalViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  const base = `/intelligence/${engagement}`;
  if (!viewer.canBTIC) {
    return (
      <BticShell email={null} title="Report" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please{" "}
          <Link href={`/admin-login?next=${base}/reports/${subject}`}>sign in</Link>.
        </p>
      </BticShell>
    );
  }

  const lineage = historyFor(d, subject);
  if (lineage.length === 0) notFound();
  const current = currentReportFor(d, subject);
  const unambiguous = reportTruthIsUnambiguous(d, subject);
  const superseded = lineage.filter((r) => r.id !== current?.id);

  return (
    <BticShell
      email={viewer.email}
      title={current ? current.title : subject.replace(/_/g, " ")}
      lede="The current truth for this subject, with its full retained version history."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
        { label: "Reports", href: `${base}/reports` },
      ]}
    >
      <DossierNav base={base} active="reports" />

      {current ? (
        <div
          style={{
            background: "#fff",
            border: `2px solid ${colors.ACCENT}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div
            style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
          >
            <ReportStatusBadge status={current.status} />
            <span style={{ fontSize: 12, color: colors.MUTED }}>
              Version {current.version}
            </span>
          </div>
          <h2 style={{ fontSize: 19, margin: "10px 0 6px" }}>{current.title}</h2>
          <div style={{ fontSize: 13.5, color: colors.INK, lineHeight: 1.6 }}>
            {current.summary}
          </div>
          <div style={{ fontSize: 12.5, color: colors.MUTED, marginTop: 10 }}>
            Location: {current.location}
          </div>
          <Provenance>{current.provenance}</Provenance>
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: "#a3402f" }}>
          No current truth is recorded for this subject. Its history is below.
        </div>
      )}

      {!unambiguous ? (
        <div style={{ fontSize: 12.5, color: "#a3402f", marginTop: 10 }}>
          Warning: this subject has more than one accepted (current/approved) version.
          Exactly one should be current.
        </div>
      ) : null}

      <h3 style={{ fontSize: 15, margin: "24px 0 10px" }}>
        Version history ({superseded.length} prior)
      </h3>
      {superseded.length === 0 ? (
        <p style={{ fontSize: 13, color: colors.MUTED }}>
          No prior versions. This is the first and only version.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {superseded.map((h) => (
            <div
              key={h.id}
              style={{
                background: "#fbfbfc",
                border: `1px solid ${colors.LINE}`,
                borderRadius: 10,
                padding: 16,
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
                <span style={{ fontSize: 14, fontWeight: 600, color: colors.MUTED }}>
                  {h.title} · v{h.version}
                </span>
                <ReportStatusBadge status={h.status} />
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: colors.MUTED,
                  lineHeight: 1.55,
                  marginTop: 6,
                }}
              >
                {h.summary}
              </div>
              {current && current.supersedes === h.id ? (
                <div style={{ fontSize: 11.5, color: colors.ACCENT, marginTop: 6 }}>
                  Superseded by the current truth above.
                </div>
              ) : null}
              <Provenance>{h.provenance}</Provenance>
            </div>
          ))}
        </div>
      )}
    </BticShell>
  );
}
