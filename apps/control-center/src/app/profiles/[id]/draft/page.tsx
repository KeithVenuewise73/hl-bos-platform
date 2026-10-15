import { notFound } from "next/navigation";

import { verified } from "@hl-bos/site-builder";

import { DemoEditor } from "@/components/DemoControls";
import { BuildInternalDraftButton } from "@/components/ProfileControls";
import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { buildTime } from "@/lib/demo";
import { draftKey } from "@/lib/profiles";
import { FileDraftRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

export default async function InternalDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await new FileProfileRepository().get(id);
  if (!p) notFound();
  const draft = await new FileDraftRepository().getByProspect(draftKey(p));
  const name = verified(p, "brandName") ?? p.id;

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href={`/profiles/${id}`}
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to the Business Profile
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>
        Internal website draft — {name}
      </h1>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        HLG-owned business. A private draft on this computer, built only from verified
        Business Profile facts. It is never published from here: publishing needs your
        explicit approval and a hosting decision first.
      </p>

      {!draft ? (
        <Card
          title="No draft yet"
          sub="Builds from the verified profile in under a second."
        >
          <BuildInternalDraftButton id={id} hasDraft={false} />
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
                {draft.status === "approved" ? "Approved (internal)" : "Draft"}
              </strong>{" "}
              · built in {buildTime(draft.buildMs)} · from the Business Profile
            </span>
            <a
              href={`/profiles/${id}/draft/preview`}
              target="_blank"
              rel="noreferrer"
              style={{ color: C.link }}
            >
              Open full-page preview
            </a>
            <a href={`/profiles/${id}/draft/download`} style={{ color: C.link }}>
              Download ZIP
            </a>
          </div>
          {draft.infoRequired?.length ? (
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: C.yellow }}>
              Information required: {draft.infoRequired.join("; ")}.
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
                title={`Internal draft preview for ${name}`}
                src={`/profiles/${id}/draft/preview`}
                sandbox=""
                style={{ width: "100%", height: 900, border: 0, display: "block" }}
              />
            </section>
            <div>
              <Card title="Phone width" sub="The same page at 390 pixels wide.">
                <iframe
                  title={`Phone-width preview for ${name}`}
                  src={`/profiles/${id}/draft/preview`}
                  sandbox=""
                  style={{
                    width: 390,
                    maxWidth: "100%",
                    height: 640,
                    border: "1px solid #262c36",
                    borderRadius: 10,
                    background: "#fff",
                    display: "block",
                  }}
                />
              </Card>
              <Card
                title="Edit the page"
                sub="Text written here is checked by the full claims check and is not marked verified. Change facts in the Business Profile instead."
              >
                <DemoEditor
                  id={draft.prospectId}
                  headline={draft.copy.heroHeadline}
                  subhead={draft.copy.heroSubhead}
                  about={draft.copy.aboutBody}
                  offerings={draft.copy.offerings
                    .map((o) => `${o.name}: ${o.description}`)
                    .join("\n")}
                  showRating={false}
                  canShowRating={false}
                  showVideoBlock={draft.options.showVideoBlock}
                  approved={draft.status === "approved"}
                  internal
                />
              </Card>
              <Card
                title="Rebuild"
                sub="Regenerates the page from the profile as it is now. Page edits are replaced."
              >
                <BuildInternalDraftButton id={id} hasDraft />
              </Card>
            </div>
          </div>

          <Card
            title="Launch readiness"
            sub="What must happen before this could become a live site. Nothing here has been done."
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

          <Card title="Version history" sub="Every build, edit and approval.">
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
