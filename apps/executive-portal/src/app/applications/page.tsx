import { PortalShell } from "@/components/PortalShell";
import { Card, Row, Dot, Tile, Grid } from "@/components/ui";
import { APPLICATIONS, applicationsByCategory } from "@/lib/portal-data";
import type { AppCategory, ApplicationRecord } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER: { key: AppCategory; label: string }[] = [
  { key: "platform", label: "Platform" },
  { key: "executive_tooling", label: "Executive Tooling" },
  { key: "vertical_product", label: "Vertical Products" },
  { key: "government", label: "Government" },
  { key: "web_property", label: "Web Properties" },
  { key: "legacy", label: "Legacy" },
];

const HEALTH = {
  green: "green",
  yellow: "yellow",
  red: "red",
  unknown: "unknown",
} as const;

function link(url: string | null) {
  if (!url) return <span style={{ color: "#6e7681" }}>—</span>;
  return (
    <a
      href={url}
      style={{ color: "#58a6ff" }}
      rel="noreferrer noopener"
      target="_blank"
    >
      {url.replace(/^https?:\/\//, "")}
    </a>
  );
}

function AppCard({ a }: { a: ApplicationRecord }) {
  return (
    <Card title={a.name} sub={a.description}>
      <Row
        k="Status"
        v={
          <span>
            <Dot health={HEALTH[a.health]} />
            {a.developmentStatus} · {a.deploymentStatus.replace(/_/g, " ")}
          </span>
        }
      />
      <Row k="Repository" v={a.repository} />
      <Row k="Branch" v={a.currentBranch} />
      <Row k="Environment" v={a.environment} />
      <Row k="Production URL" v={link(a.productionUrl)} />
      <Row k="Staging URL" v={link(a.stagingUrl)} />
      <Row
        k="Local URL"
        v={a.localUrl ?? <span style={{ color: "#6e7681" }}>—</span>}
      />
      <Row k="Supabase project" v={a.supabaseProject ?? "—"} />
      <Row k="Version" v={a.version ?? "—"} />
      <Row k="Hosting" v={a.hosting} />
      <Row k="Executive owner" v={a.executiveOwner} />
      <Row
        k="Reusable modules"
        v={a.reusableModules.length ? a.reusableModules.join(", ") : "—"}
      />
      <Row k="Software Factory" v={a.softwareFactoryIntegration} />
      {a.notes ? (
        <div
          style={{ fontSize: 11.5, color: "#6e7681", marginTop: 8, lineHeight: 1.5 }}
        >
          {a.notes}
        </div>
      ) : null}
    </Card>
  );
}

export default function ApplicationsPage() {
  return (
    <PortalShell view="applications">
      <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
        The Enterprise Application Registry — every Herman Legacy application, governed.
        No application exists outside this registry. URLs and deployment status are
        recorded from verified evidence; anything unverifiable is shown as{" "}
        <em>unknown</em> or blank, never invented.
      </p>

      <Grid min={150}>
        <Tile label="Applications" value={APPLICATIONS.length} />
        <Tile
          label="Externally hosted"
          value={
            APPLICATIONS.filter(
              (a) =>
                a.deploymentStatus === "external_hosted" ||
                a.deploymentStatus === "deployed",
            ).length
          }
          accent="#3fb950"
        />
        <Tile
          label="Built, not deployed"
          value={
            APPLICATIONS.filter((a) => a.deploymentStatus === "not_deployed").length
          }
          accent="#d29922"
        />
        <Tile
          label="Unknown / legacy"
          value={APPLICATIONS.filter((a) => a.deploymentStatus === "unknown").length}
          accent="#6e7681"
        />
      </Grid>

      {CATEGORY_ORDER.map((c) => {
        const apps = applicationsByCategory(c.key);
        if (apps.length === 0) return null;
        return (
          <section key={c.key} style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 13, color: "#8b949e", margin: "18px 0 8px" }}>
              {c.label} · {apps.length}
            </h2>
            {apps.map((a) => (
              <AppCard key={a.key} a={a} />
            ))}
          </section>
        );
      })}
    </PortalShell>
  );
}
