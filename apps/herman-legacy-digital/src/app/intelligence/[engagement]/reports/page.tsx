import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientViewer } from "@/lib/session";
import {
  dossier,
  reportSubjects,
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

// View 4 — Reports. Grouped by subject (version lineage). The CURRENT truth is
// shown first and clearly; historical versions are listed beneath, retained and
// labeled — never hidden, never overwritten.
export default async function ReportsView({
  params,
}: {
  params: Promise<{ engagement: string }>;
}) {
  const { engagement } = await params;
  const viewer = await getClientViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  if (!viewer.authenticated) {
    return (
      <BticShell email={null} title="Reports" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please{" "}
          <Link href={`/login?next=/intelligence/${engagement}/reports`}>sign in</Link>.
        </p>
      </BticShell>
    );
  }

  const base = `/intelligence/${engagement}`;
  const subjects = reportSubjects(d);

  return (
    <BticShell
      email={viewer.email}
      title={`${d.engagement.title} — Reports`}
      lede="Each report subject shows its current truth first. Superseded versions are kept and labeled as history — never deleted."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
      ]}
    >
      <DossierNav base={base} active="reports" />

      <div style={{ display: "grid", gap: 16 }}>
        {subjects.map((subject) => {
          const current = currentReportFor(d, subject);
          const history = historyFor(d, subject).filter((r) => r.id !== current?.id);
          const unambiguous = reportTruthIsUnambiguous(d, subject);
          return (
            <div
              key={subject}
              style={{
                background: "#fff",
                border: `1px solid ${colors.LINE}`,
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: colors.MUTED,
                  marginBottom: 10,
                }}
              >
                {subject.replace(/_/g, " ")}
              </div>

              {current ? (
                <Link
                  href={`${base}/reports/${subject}`}
                  style={{ textDecoration: "none", color: "inherit", display: "block" }}
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
                    <span
                      style={{ fontSize: 15.5, fontWeight: 700, color: colors.ACCENT }}
                    >
                      {current.title}
                    </span>
                    <ReportStatusBadge status={current.status} />
                  </div>
                  <div style={{ fontSize: 12, color: colors.MUTED, marginTop: 2 }}>
                    Version {current.version} · {current.location}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: colors.INK,
                      lineHeight: 1.55,
                      marginTop: 8,
                    }}
                  >
                    {current.summary}
                  </div>
                </Link>
              ) : (
                <div style={{ fontSize: 13, color: "#a3402f" }}>
                  No current truth recorded for this subject.
                </div>
              )}

              {!unambiguous && current ? (
                <div style={{ fontSize: 11.5, color: "#a3402f", marginTop: 6 }}>
                  Warning: more than one accepted version exists for this subject.
                </div>
              ) : null}

              {history.length > 0 ? (
                <div
                  style={{
                    marginTop: 12,
                    borderTop: `1px solid ${colors.LINE}`,
                    paddingTop: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: colors.MUTED, marginBottom: 6 }}>
                    History ({history.length})
                  </div>
                  {history.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        padding: "4px 0",
                      }}
                    >
                      <span style={{ fontSize: 13, color: colors.MUTED }}>
                        {h.title} · v{h.version}
                      </span>
                      <ReportStatusBadge status={h.status} />
                    </div>
                  ))}
                </div>
              ) : null}

              {current ? (
                <div style={{ marginTop: 10 }}>
                  <Link
                    href={`${base}/reports/${subject}`}
                    style={{ fontSize: 13, color: colors.ACCENT }}
                  >
                    Open report & full history →
                  </Link>
                </div>
              ) : null}

              {current ? <Provenance>{current.provenance}</Provenance> : null}
            </div>
          );
        })}
      </div>
    </BticShell>
  );
}
