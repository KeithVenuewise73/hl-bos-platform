import { notFound } from "next/navigation";

import {
  PREMIUM_PAGES,
  premiumTheme,
  SITE_PRODUCTS,
  verified,
} from "@hl-bos/site-builder";

import {
  ApprovePremiumButton,
  BuildPremiumButton,
  PremiumPreview,
} from "@/components/PremiumControls";
import { C } from "@/components/presence-style";
import { Card } from "@/components/ui";
import { premiumReview } from "@/lib/premium";
import { themeFontBytes } from "@/lib/premium-runtime";
import { FilePremiumRepository, FileProfileRepository } from "@/lib/site-store";

export const dynamic = "force-dynamic";

const PAGE_LABEL: Record<string, string> = {
  "index.html": "Home",
  "services.html": "Services",
  "solutions.html": "Industries & solutions",
  "about.html": "About",
  "assessment.html": "Assessment",
  "privacy.html": "Privacy",
};

function Checks({
  rows,
}: {
  rows: { id: string; label: string; ok: boolean; detail: string }[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            style={{ borderTop: "1px solid #1c2128", verticalAlign: "top" }}
          >
            <td
              style={{
                padding: "7px 6px",
                width: 70,
                fontWeight: 700,
                color: r.ok ? C.green : C.red,
              }}
            >
              {r.ok ? "Pass" : "Fail"}
            </td>
            <td style={{ padding: "7px 6px" }}>
              {r.label}
              <div style={{ color: C.muted, fontSize: 12 }}>{r.detail}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PremiumReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await new FileProfileRepository().get(id);
  if (!p) notFound();
  const d = await new FilePremiumRepository().getByProfile(id);
  const name = verified(p, "brandName") ?? p.id;
  const base = `/profiles/${id}/premium/site`;
  const r = d ? premiumReview(d, await themeFontBytes(d.theme)) : undefined;
  const allPass = r ? [...r.accessibility, ...r.performance].every((x) => x.ok) : false;

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a
        href={`/profiles/${id}`}
        style={{ color: C.link, fontSize: 13, textDecoration: "none" }}
      >
        ← Back to the Business Profile
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>
        Premium Business Site — {name}
      </h1>
      <p
        style={{
          margin: "0 0 18px",
          color: C.muted,
          fontSize: 13,
          lineHeight: 1.6,
          maxWidth: 980,
        }}
      >
        <strong style={{ color: C.text }}>{SITE_PRODUCTS.premium_site.label}:</strong>{" "}
        {SITE_PRODUCTS.premium_site.summary} The one-page{" "}
        <strong style={{ color: C.text }}>{SITE_PRODUCTS.express_demo.label}</strong>{" "}
        stays as it is for prospects. Private to this computer; never published from
        here.
      </p>

      {!d || !r ? (
        <Card
          title="No premium site yet"
          sub="Builds six pages from the verified profile in under a second."
        >
          <BuildPremiumButton id={id} hasDraft={false} />
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
              Version {d.version} ·{" "}
              <strong style={{ color: d.status === "approved" ? C.green : C.yellow }}>
                {d.status === "approved"
                  ? "Design approved (internal)"
                  : "Awaiting design review"}
              </strong>{" "}
              · theme {premiumTheme(d.theme).label} · {PREMIUM_PAGES.length} pages
            </span>
            {d.content.plannedDomain ? (
              <span style={{ color: C.muted }}>
                Planned address: {d.content.plannedDomain} (not configured)
              </span>
            ) : null}
            <a href={`/profiles/${id}/premium/download`} style={{ color: C.link }}>
              Download ZIP
            </a>
          </div>

          <Card
            title="Preview"
            sub="Switch device width and page. The preview runs no scripts."
          >
            <PremiumPreview
              base={base}
              pages={PREMIUM_PAGES.map((pg) => ({
                file: pg.file,
                label: PAGE_LABEL[pg.file] ?? pg.file,
              }))}
            />
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: 16,
            }}
          >
            <Card title="Approval" sub="Approving the design does not publish it.">
              <ApprovePremiumButton id={id} approved={d.status === "approved"} />
              <div style={{ marginTop: 14 }}>
                <BuildPremiumButton id={id} hasDraft />
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: C.muted }}>
                Rebuilding takes the profile as it is now; a rebuilt draft needs
                approving again.
              </p>
            </Card>
            <Card
              title="Missing information"
              sub="Shown on the pages as Information required."
            >
              {d.content.missing.length ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    lineHeight: 1.8,
                  }}
                >
                  {d.content.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: C.green, fontSize: 13 }}>
                  Nothing missing.
                </p>
              )}
            </Card>
          </div>

          <Card
            title="Content completeness"
            sub="Per page: confirmed content, drafted content marked To confirm, and what is missing."
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Page</th>
                  <th style={{ padding: 6 }}>Confirmed</th>
                  <th style={{ padding: 6 }}>To confirm</th>
                  <th style={{ padding: 6 }}>Missing</th>
                </tr>
              </thead>
              <tbody>
                {r.completeness.map((row) => (
                  <tr key={row.page} style={{ borderTop: "1px solid #1c2128" }}>
                    <td style={{ padding: 6 }}>{PAGE_LABEL[row.page] ?? row.page}</td>
                    <td style={{ padding: 6, color: C.green }}>{row.confirmed}</td>
                    <td
                      style={{
                        padding: 6,
                        color: row.toConfirm ? C.yellow : C.muted,
                      }}
                    >
                      {row.toConfirm}
                    </td>
                    <td
                      style={{
                        padding: 6,
                        color: row.missing.length ? C.yellow : C.muted,
                      }}
                    >
                      {row.missing.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 16,
            }}
          >
            <Card
              title={`Accessibility checklist — ${r.accessibility.filter((x) => x.ok).length} of ${r.accessibility.length} pass`}
              sub="Checked on the pages that would ship. WCAG 2.2 AA contrast is computed, not eyeballed."
            >
              <Checks rows={r.accessibility} />
            </Card>
            <Card
              title={`Performance checklist — ${r.performance.filter((x) => x.ok).length} of ${r.performance.length} pass`}
              sub="What a visitor's browser would download, and from where."
            >
              <Checks rows={r.performance} />
            </Card>
          </div>

          <Card
            title="Launch readiness"
            sub={`Nothing here has been done. ${allPass ? "Accessibility and performance checks pass." : "Some checks fail."}`}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {d.checklist.map((i) => (
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

          <Card title="Version history" sub="Every build and approval.">
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12.5,
                lineHeight: 1.8,
              }}
            >
              {d.audit.map((a, i) => (
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
