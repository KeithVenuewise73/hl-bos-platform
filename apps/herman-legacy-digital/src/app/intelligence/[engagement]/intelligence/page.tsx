import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientViewer } from "@/lib/session";
import { dossier } from "@/lib/btic-data";
import {
  BticShell,
  DossierNav,
  ConfidenceBadge,
  Pill,
  Provenance,
} from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// View 7 — Intelligence Records. What HLD has LEARNED from this engagement, each
// record marked with its confidence: verified (traced to repo evidence), reported
// (stated internally, unconfirmed), or unknown (an explicit gap, recorded so it is
// never mistaken for a known fact).
export default async function IntelligenceRecordsView({
  params,
}: {
  params: Promise<{ engagement: string }>;
}) {
  const { engagement } = await params;
  const viewer = await getClientViewer();
  const d = dossier(engagement);
  if (!d) notFound();

  const base = `/intelligence/${engagement}`;
  if (!viewer.authenticated) {
    return (
      <BticShell email={null} title="Intelligence" lede="Internal HLD workspace.">
        <p style={{ color: colors.MUTED }}>
          Please <Link href={`/login?next=${base}/intelligence`}>sign in</Link>.
        </p>
      </BticShell>
    );
  }

  const categoryLabel: Record<string, string> = {
    capability: "Capability",
    market: "Market",
    risk: "Risk",
    learning: "Learning",
    gap: "Gap",
  };

  const verified = d.intelligence.filter((i) => i.confidence === "verified").length;
  const gaps = d.intelligence.filter((i) => i.confidence === "unknown").length;

  return (
    <BticShell
      email={viewer.email}
      title={`${d.engagement.title} — Intelligence`}
      lede="What HLD has learned from this engagement — with each record's confidence and source stated. Gaps are recorded as gaps."
      breadcrumb={[
        { label: "Intelligence Center", href: "/intelligence" },
        { label: d.engagement.title, href: base },
      ]}
    >
      <DossierNav base={base} active="intelligence" />

      <div style={{ fontSize: 13, color: colors.MUTED, marginBottom: 14 }}>
        {d.intelligence.length} records · {verified} verified · {gaps} explicit gap
        {gaps === 1 ? "" : "s"}
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {d.intelligence.map((i) => (
          <div
            key={i.id}
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
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <Pill
                bg="#eef1f4"
                fg="#5b6672"
                label={categoryLabel[i.category] ?? i.category}
              />
              <ConfidenceBadge confidence={i.confidence} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{i.headline}</div>
            <div
              style={{
                fontSize: 13,
                color: colors.INK,
                lineHeight: 1.55,
                marginTop: 6,
              }}
            >
              {i.detail}
            </div>
            <Provenance>{i.provenance}</Provenance>
          </div>
        ))}
      </div>
    </BticShell>
  );
}
