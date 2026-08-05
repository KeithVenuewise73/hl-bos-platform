import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalViewer } from "@/lib/session";
import { dossier } from "@/lib/btic-data";
import { BticShell, DossierNav, Pill, Provenance } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 5 — Executive Decisions. What the owner/CEO must decide, why each blocks
// progress, and exactly what is verified vs. what must be confirmed. Read-only in
// V1: BTIC records the decisions that are owed; it does not resolve them here.
export default async function DecisionsView({
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
      <BticShell email={null} title="Decisions" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please <Link href={`/admin-login?next=${base}/decisions`}>sign in</Link>.
        </p>
      </BticShell>
    );
  }

  const pending = d.decisions.filter((x) => x.status === "pending");
  const resolved = d.decisions.filter((x) => x.status === "resolved");

  return (
    <BticShell
      email={viewer.email}
      title={`${d.engagement.title} — Decisions`}
      lede="Decisions owed by the owner/CEO before the engagement can proceed. Nothing here is invented in their place."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
      ]}
    >
      <DossierNav base={base} active="decisions" />

      <div style={{ fontSize: 13, color: colors.MUTED, marginBottom: 14 }}>
        {pending.length} pending · {resolved.length} resolved
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {d.decisions.map((x) => (
          <div
            key={x.id}
            style={{
              background: "#fff",
              border: `1px solid ${colors.LINE}`,
              borderLeft: `4px solid ${x.status === "pending" ? "#c98a1a" : "#1a7f43"}`,
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
              <span style={{ fontSize: 15, fontWeight: 600 }}>{x.question}</span>
              <Pill
                bg={x.status === "pending" ? "#f7efdd" : "#e7f4ec"}
                fg={x.status === "pending" ? "#8a5a00" : "#1a7f43"}
                label={x.status === "pending" ? "Pending" : "Resolved"}
              />
            </div>
            <div
              style={{
                fontSize: 13,
                color: colors.INK,
                lineHeight: 1.55,
                marginTop: 8,
              }}
            >
              {x.detail}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: colors.MUTED,
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              Blocks: {x.blocks}
            </div>
            <Provenance>{x.provenance}</Provenance>
          </div>
        ))}
      </div>
    </BticShell>
  );
}
