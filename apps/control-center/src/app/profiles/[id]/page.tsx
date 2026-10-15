import { notFound } from "next/navigation";

import {
  profileMissing,
  PROFILE_FIELDS,
  PROFILE_LISTS,
  verified,
  type ProfileFieldKey,
  type ProfileListKey,
} from "@hl-bos/site-builder";

import {
  AssessProfileForm,
  BuildInternalDraftButton,
  ProfileEditor,
} from "@/components/ProfileControls";
import { C, scoreColour } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { draftKey, itemsToText } from "@/lib/profiles";
import { FilePresenceRepository } from "@/lib/presence-store";
import { FileDraftRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

const MULTILINE: ProfileFieldKey[] = ["description"];

const HINTS: Record<ProfileListKey, string> = {
  services: "one per line, “Name: description”",
  challenges: "one per line, “Name: description”",
  process: "one step per line, “Step: what happens”",
  industries: "one per line, “Name: description”",
  experience: "one approved claim per line",
  statistics: "one approved statistic per line, with its source in the Source box",
  caseStudies: "one per line; only with the client's permission",
  products: "one per line, “Name: description [planned | in_development | live]”",
  socialLinks: "one per line, “Label: https://…”",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await new FileProfileRepository().get(id);
  if (!p) notFound();
  const [lead, draft] = await Promise.all([
    p.prospectId ? new FilePresenceRepository().getProspect(p.prospectId) : undefined,
    new FileDraftRepository().getByProspect(draftKey(p)),
  ]);
  const name = verified(p, "brandName") ?? (p.fields.brandName.value || p.id);
  const missing = profileMissing(p);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href="/profiles"
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to Business Profiles
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>{name}</h1>
      <p style={{ margin: "0 0 18px", color: C.muted, fontSize: 13 }}>
        {p.kind === "internal" ? "HLG-owned business" : "Client"} · Business Profile ·
        updated {p.updatedAt.slice(0, 16).replace("T", " ")} UTC
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        <Card
          title="1. Presence assessment"
          sub="Runs this business through the Presence Scanner (pasted-list mode). Never contacts anyone."
        >
          {lead ? (
            <p style={{ margin: "0 0 12px", fontSize: 13 }}>
              Score{" "}
              <strong style={{ color: scoreColour(lead.score.total) }}>
                {lead.score.total}
              </strong>{" "}
              of {lead.score.checkedMax} checked points ·{" "}
              <a href={`/presence/${lead.id}`} style={{ color: C.link }}>
                Open the audit (Lead Card) →
              </a>
            </p>
          ) : (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: C.muted }}>
              Not assessed yet.
            </p>
          )}
          <AssessProfileForm id={p.id} hasWebsite={Boolean(verified(p, "website"))} />
        </Card>
        <Card
          title="2. Internal website draft"
          sub="Built from verified fields only. Private to this computer; never published from here."
        >
          {draft ? (
            <p style={{ margin: "0 0 12px", fontSize: 13 }}>
              Version {draft.version} ·{" "}
              {draft.status === "approved" ? "approved" : "draft"} ·{" "}
              <a href={`/profiles/${p.id}/draft`} style={{ color: C.link }}>
                Open the draft →
              </a>
            </p>
          ) : null}
          <BuildInternalDraftButton id={p.id} hasDraft={Boolean(draft)} />
        </Card>
      </div>

      <Card
        title="Information required"
        sub="What this business still needs before its site could launch."
      >
        {missing.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: C.green }}>
            Nothing outstanding.
          </p>
        )}
      </Card>

      <Card title="Business Profile editor" sub="Verified facts, with their sources.">
        <ProfileEditor
          id={p.id}
          notes={p.internalNotes}
          fields={(Object.keys(PROFILE_FIELDS) as ProfileFieldKey[]).map((k) => ({
            key: k,
            label: PROFILE_FIELDS[k],
            ...p.fields[k],
            ...(MULTILINE.includes(k) ? { multiline: true } : {}),
          }))}
          lists={(Object.keys(PROFILE_LISTS) as ProfileListKey[]).map((k) => ({
            key: k,
            label: PROFILE_LISTS[k],
            text: itemsToText(p.lists[k].items),
            status: p.lists[k].status,
            source: p.lists[k].source,
            hint: HINTS[k],
          }))}
        />
      </Card>

      <Card title="History" sub="Every change to this profile.">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
          {p.audit.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <span style={{ color: C.muted }}>
                {a.at.slice(0, 16).replace("T", " ")}
              </span>{" "}
              · {a.by} · {a.detail}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
