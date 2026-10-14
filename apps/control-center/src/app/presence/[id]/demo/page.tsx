import { notFound } from "next/navigation";

import { BuildDemoButton, DemoEditor } from "@/components/DemoControls";
import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { anthropicConnected } from "@/lib/demo-runtime";
import { FilePresenceRepository } from "@/lib/presence-store";
import { FileDraftRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lead, draft, claude] = await Promise.all([
    new FilePresenceRepository().getProspect(id),
    new FileDraftRepository().getByProspect(id),
    anthropicConnected(),
  ]);
  if (!lead) notFound();

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href={`/presence/${id}`}
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to the Lead Card
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>Demo site — {lead.name}</h1>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        A private preview on this computer. It is never published from here. Every page
        carries a demo banner and tells search engines not to list it.{" "}
        {claude
          ? "Copy is written by Claude and checked before use."
          : "Copy comes from the template writer (add an Anthropic key on the Connections page to use Claude)."}
      </p>

      {!draft ? (
        <Card
          title="No demo yet"
          sub="Builds in seconds from what the scanner found. Nothing is published."
        >
          <BuildDemoButton id={id} hasDraft={false} />
        </Card>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              fontSize: 13,
              marginBottom: 14,
              alignItems: "center",
            }}
          >
            <span>
              Version {draft.version} ·{" "}
              <strong
                style={{ color: draft.status === "approved" ? C.green : C.yellow }}
              >
                {draft.status === "approved" ? "Approved" : "Draft"}
              </strong>{" "}
              · built in {(draft.buildMs / 1000).toFixed(1)} s · copy by{" "}
              {draft.copySource === "template"
                ? "the template writer"
                : draft.copySource}
            </span>
            <a
              href={`/presence/${id}/demo/preview`}
              target="_blank"
              rel="noreferrer"
              style={{ color: C.link }}
            >
              Open full-page preview
            </a>
            <a href={`/presence/${id}/demo/download`} style={{ color: C.link }}>
              Download ZIP
            </a>
          </div>
          {draft.copyNotes.length ? (
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.yellow }}>
              {draft.copyNotes.join(" ")}
            </p>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <section
              style={{
                border: "1px solid #262c36",
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <iframe
                title={`Demo site preview for ${lead.name}`}
                src={`/presence/${id}/demo/preview`}
                sandbox=""
                style={{ width: "100%", height: 900, border: 0, display: "block" }}
              />
            </section>
            <div>
              <Card
                title="Edit the demo"
                sub="Replace sample content with the business's own as you learn it."
              >
                <DemoEditor
                  id={id}
                  headline={draft.copy.heroHeadline}
                  subhead={draft.copy.heroSubhead}
                  about={draft.copy.aboutBody}
                  offerings={draft.copy.offerings
                    .map((o) => `${o.name}: ${o.description}`)
                    .join("\n")}
                  showRating={draft.options.showRating}
                  canShowRating={draft.facts.rating !== undefined}
                  showVideoBlock={draft.options.showVideoBlock}
                  approved={draft.status === "approved"}
                />
              </Card>
              <Card
                title="Rebuild"
                sub="Regenerates the copy from the lead as it is now. Your edits are replaced."
              >
                <BuildDemoButton id={id} hasDraft />
              </Card>
            </div>
          </div>

          <Card
            title="Launch checklist"
            sub="What has to happen before this becomes the business's real website. Nothing here has been done; domain, hosting and anything paid are decisions."
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {draft.checklist.map((i) => (
                  <tr
                    key={i.id}
                    style={{ borderTop: "1px solid #1c2128", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "8px 6px", width: 130, color: C.muted }}>
                      {i.area}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      {i.task}
                      <div style={{ color: C.muted, fontSize: 12 }}>Why: {i.why}</div>
                    </td>
                    <td
                      style={{
                        padding: "8px 6px",
                        width: 130,
                        whiteSpace: "nowrap",
                        color: i.owner === "CEO decision" ? C.yellow : C.text,
                      }}
                    >
                      {i.owner}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="History" sub="Every build, edit and approval.">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
              {draft.audit.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <span style={{ color: C.muted }}>
                    {a.at.slice(0, 16).replace("T", " ")}
                  </span>{" "}
                  · {a.by} · {a.action} — {a.detail}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </main>
  );
}
