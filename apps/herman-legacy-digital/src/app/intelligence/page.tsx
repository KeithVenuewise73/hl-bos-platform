import Link from "next/link";
import { getInternalViewer } from "@/lib/session";
import { engagements, dossier } from "@/lib/btic-data";
import { deriveExecutive, type ExecSection } from "@/lib/executive-view";
import { BticShell, Panel, StatBox, Pill, Provenance } from "@/components/btic";
import { colors } from "@/components/ui";

export const dynamic = "force-dynamic";

// The Executive Command Center — the FIRST page an internal user sees after
// signing into BTIC. A 12-section executive summary DERIVED from the existing
// dossier (no new data, no engine change, no persistence). Every section traces
// to a real record; gaps are shown as gaps. Defense in depth: middleware +
// layout + this server component all re-check the viewer.

const CONFIDENCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  verified: { bg: "#e7f4ec", fg: "#1a7f43", label: "Verified" },
  reported: { bg: "#f3f0e6", fg: "#7a5c00", label: "Reported" },
  derived: { bg: "#e6f0f6", fg: "#1f5f8b", label: "Derived" },
  unknown: { bg: "#fbecec", fg: "#a3402f", label: "Gap — unknown" },
};

function SectionCard({ s }: { s: ExecSection }) {
  const cs = CONFIDENCE_STYLE[s.confidence] ?? CONFIDENCE_STYLE["derived"]!;
  return (
    <Panel title={s.title}>
      <div
        style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: s.hasData ? colors.INK : "#a3402f",
          }}
        >
          {s.headline}
        </span>
        <Pill bg={cs.bg} fg={cs.fg} label={cs.label} />
      </div>
      {s.detail ? (
        <p style={{ fontSize: 13, color: colors.INK, lineHeight: 1.55, marginTop: 8 }}>
          {s.detail}
        </p>
      ) : null}
      {s.items && s.items.length ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {s.items.map((it, i) => (
            <li
              key={i}
              style={{
                fontSize: 13,
                color: colors.INK,
                marginBottom: 3,
                lineHeight: 1.5,
              }}
            >
              {it.text}
              {it.meta ? (
                <span style={{ color: colors.MUTED, fontSize: 11.5 }}>
                  {" "}
                  · {it.meta}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <Provenance>{s.basis}</Provenance>
      </div>
    </Panel>
  );
}

export default async function ExecutiveCommandCenter() {
  const viewer = await getInternalViewer();
  if (!viewer.canBTIC) {
    return (
      <BticShell
        email={null}
        title="Business Transformation Intelligence Center"
        lede="Internal HLD workspace."
      >
        <p style={{ color: colors.MUTED }}>
          Please <Link href="/admin-login?next=/intelligence">sign in</Link> to
          continue.
        </p>
      </BticShell>
    );
  }

  const all = engagements();
  const primary = all[0] ? dossier(all[0].id) : null;

  if (!primary) {
    return (
      <BticShell
        email={viewer.email}
        title="Executive Command Center"
        lede="No transformation engagements are recorded yet."
      >
        <p style={{ color: colors.MUTED, fontSize: 13 }}>
          When an engagement is captured, its executive summary appears here.
        </p>
      </BticShell>
    );
  }

  const view = deriveExecutive(primary);

  return (
    <BticShell
      email={viewer.email}
      title="Executive Command Center"
      lede={`${view.engagementTitle} — the executive summary of where this transformation stands, derived from the engagement's own evidence. Every line traces to its source.`}
    >
      {/* Headline strip */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox
          label="Transformation Score"
          value={view.overallScore !== null ? `${view.overallScore}/100` : "—"}
        />
        <StatBox
          label="Stage"
          value={view.sections[0]!.headline.split(" ").slice(0, 2).join(" ")}
        />
        <StatBox
          label="Decisions owed"
          value={String(
            view.sections.find((s) => s.key === "decisions")?.items?.length ?? 0,
          )}
        />
        <StatBox label="Engagement" value={view.status} />
      </div>

      {/* The 12 executive sections */}
      <div style={{ display: "grid", gap: 14 }}>
        {view.sections.map((s) => (
          <SectionCard key={s.key} s={s} />
        ))}
      </div>

      {/* Secondary navigation — the workspace behind the summary */}
      <div style={{ marginTop: 20, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <Link
          href={`/intelligence/${view.engagementId}`}
          style={{ fontSize: 13, color: colors.ACCENT, fontWeight: 600 }}
        >
          Open the full {view.engagementTitle} dossier →
        </Link>
        <Link
          href="/intelligence/pipeline"
          style={{ fontSize: 13, color: colors.ACCENT, fontWeight: 600 }}
        >
          BTE Pipeline — engine output →
        </Link>
      </div>

      {all.length > 1 ? (
        <div style={{ marginTop: 18 }}>
          <Panel title="All engagements">
            <div style={{ display: "grid", gap: 6 }}>
              {all.map((e) => (
                <Link
                  key={e.id}
                  href={`/intelligence/${e.id}`}
                  style={{ fontSize: 13.5, color: colors.ACCENT }}
                >
                  {e.title} — {e.client}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      <p style={{ fontSize: 12, color: "#98a2b0", marginTop: 18, lineHeight: 1.6 }}>
        This summary is derived, read-only, from the seeded Venuewise dossier — no data
        is stored and nothing is invented. Sections without a captured metric are shown
        as gaps.
      </p>
    </BticShell>
  );
}
