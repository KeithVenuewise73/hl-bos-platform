import {
  PROFILE_FIELDS,
  verified,
  VERIFICATION_LABELS,
  type ProfileFieldKey,
} from "@hl-bos/site-builder";

import { SeedProfilesButton } from "@/components/ProfileControls";
import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { draftKey } from "@/lib/profiles";
import { FileDraftRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const [profiles, drafts] = await Promise.all([
    new FileProfileRepository().list(),
    new FileDraftRepository().list(),
  ]);
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/" style={{ color: C.link, fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>Business Profiles</h1>
      <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
        The verified source of facts for businesses HLG builds sites for from the inside
        — HLG&rsquo;s own companies first. Only verified fields become facts on a page.
        Everything stays on this computer; nothing is published or sent.
      </p>
      <Card
        title="HLG companies"
        sub="Creates any missing HLG company profile from approved facts. Existing profiles are never overwritten."
      >
        <SeedProfilesButton />
      </Card>
      {profiles.length === 0 ? (
        <Card title="No profiles yet">
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
            Create the HLG company profiles above to begin.
          </p>
        </Card>
      ) : (
        profiles.map((p) => {
          const counts = { verified: 0, unverified: 0, required: 0 };
          for (const k of Object.keys(PROFILE_FIELDS) as ProfileFieldKey[])
            counts[p.fields[k].status]++;
          const draft = drafts.find((d) => d.prospectId === draftKey(p));
          return (
            <Card
              key={p.id}
              title={verified(p, "brandName") ?? (p.fields.brandName.value || p.id)}
              sub={`${p.kind === "internal" ? "HLG-owned" : "Client"} · ${verified(p, "businessType") ?? "business type not verified"}`}
            >
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ color: C.green }}>
                  {counts.verified} {VERIFICATION_LABELS.verified.toLowerCase()}
                </span>
                <span style={{ color: C.yellow }}>
                  {counts.unverified} {VERIFICATION_LABELS.unverified.toLowerCase()}
                </span>
                <span style={{ color: C.muted }}>
                  {counts.required} {VERIFICATION_LABELS.required.toLowerCase()}
                </span>
                <span style={{ color: C.muted }}>
                  {p.prospectId ? "Assessed" : "Not assessed yet"} ·{" "}
                  {draft
                    ? `Draft version ${draft.version} (${draft.status === "approved" ? "approved" : "draft"})`
                    : "No draft yet"}
                </span>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 13 }}>
                <a href={`/profiles/${p.id}`} style={{ color: C.link }}>
                  Open the profile →
                </a>
                {draft ? (
                  <a href={`/profiles/${p.id}/draft`} style={{ color: C.link }}>
                    Open the internal draft →
                  </a>
                ) : null}
              </div>
            </Card>
          );
        })
      )}
    </main>
  );
}
