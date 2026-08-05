import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalViewer } from "@/lib/session";
import { dossier } from "@/lib/btic-data";
import { BticShell, DossierNav, Pill, Provenance } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 6 — Artifact References. The concrete deliverables the engagement produced
// (PRs, repository documents, previews) — each pointing to where it actually lives.
// No fabricated external URLs; references are repo paths / PR numbers only.
export default async function ArtifactsView({
  params,
}: {
  params: Promise<{ engagement: string }>;
}) {
  const { engagement } = await params;
  const viewer = await getInternalViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  const base = `/intelligence/${engagement}`;
  if (!viewer.canBTIC) {
    return (
      <BticShell email={null} title="Artifacts" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please <Link href={`/admin-login?next=${base}/artifacts`}>sign in</Link>.
        </p>
      </BticShell>
    );
  }

  const kindLabel: Record<string, string> = {
    pull_request: "Pull request",
    document: "Document",
    preview: "Preview",
  };

  return (
    <BticShell
      email={viewer.email}
      title={`${d.engagement.title} — Artifacts`}
      lede="The engagement's concrete deliverables, each linked to where it actually lives in the repository."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
      ]}
    >
      <DossierNav base={base} active="artifacts" />

      <div style={{ display: "grid", gap: 14 }}>
        {d.artifacts.map((a) => (
          <div
            key={a.id}
            style={{
              background: "#fff",
              border: `1px solid ${colors.LINE}`,
              borderRadius: 12,
              padding: 18,
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
              <span style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</span>
              <Pill bg="#eef1f4" fg="#5b6672" label={kindLabel[a.kind] ?? a.kind} />
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: colors.ACCENT,
                marginTop: 4,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                wordBreak: "break-word",
              }}
            >
              {a.reference}
            </div>
            <div
              style={{
                fontSize: 13,
                color: colors.INK,
                lineHeight: 1.55,
                marginTop: 8,
              }}
            >
              {a.summary}
            </div>
            <div style={{ fontSize: 12, color: colors.MUTED, marginTop: 8 }}>
              Status: {a.status}
            </div>
            <Provenance>{a.provenance}</Provenance>
          </div>
        ))}
      </div>
    </BticShell>
  );
}
