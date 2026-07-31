import { PortalShell } from "@/components/PortalShell";
import { Card, Dot, Empty } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { canView } from "@/lib/authz";
import { buildCatalog, search, APPLICATIONS, KIND_LABEL } from "@/lib/portal-data";
import { sampleGovAssessments, sampleIntelligence } from "@/lib/intelligence-data";

export const dynamic = "force-dynamic";

function matches(hay: string, terms: string[]): boolean {
  const h = hay.toLowerCase();
  return terms.every((t) => h.includes(t));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params["q"];
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  const viewer = await getViewer();
  const canIntel = canView(viewer.role, "intelligence");
  const canGov = canView(viewer.role, "government");

  // Applications
  const appHits = terms.length
    ? APPLICATIONS.filter((a) =>
        matches(
          `${a.name} ${a.description} ${a.repository} ${a.category} ${a.executiveOwner} ${a.hosting}`,
          terms,
        ),
      )
    : [];

  // Catalog assets (reuse the catalog search engine)
  const assetHits = terms.length ? search(buildCatalog(), q, 40) : [];

  // Government opportunities (sample, sensitive)
  const govHits =
    terms.length && canGov
      ? sampleGovAssessments().filter((g) =>
          matches(
            `${g.opportunity.title} ${g.opportunity.agency ?? ""} ${g.opportunity.requiredCapabilities.join(" ")}`,
            terms,
          ),
        )
      : [];

  // Transformation recommendations (sample, sensitive)
  const recHits =
    terms.length && canIntel
      ? sampleIntelligence().recommendations.filter((r) =>
          matches(`${r.label} ${r.problem} ${r.solution} ${r.domain}`, terms),
        )
      : [];

  const totalHits = appHits.length + assetHits.length + govHits.length + recHits.length;

  return (
    <PortalShell view="search">
      <form method="get" action="/search" style={{ marginBottom: 18 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search applications, assets, modules, opportunities, recommendations…"
          aria-label="Global search"
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 10,
            color: "#e8eaed",
          }}
        />
      </form>

      {!q ? (
        <Empty>
          Enter a query to search across applications, Enterprise Catalog assets,
          software modules, government opportunities and transformation recommendations.
          Sensitive sources appear only for authorized roles.
        </Empty>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "#8b949e", marginTop: 0 }}>
            {totalHits} result(s) for “{q}”.
          </p>

          <Card
            title={`Applications · ${appHits.length}`}
            sub="Enterprise Application Registry"
          >
            {appHits.length ? (
              appHits.map((a) => (
                <div
                  key={a.key}
                  style={{
                    padding: "7px 0",
                    borderBottom: "1px solid #1c2128",
                    fontSize: 12.5,
                  }}
                >
                  <a
                    href="/applications"
                    style={{ color: "#e8eaed", textDecoration: "none" }}
                  >
                    <strong>{a.name}</strong>
                  </a>
                  <span style={{ color: "#6e7681" }}>
                    {" "}
                    · {a.category} · {a.repository}
                  </span>
                </div>
              ))
            ) : (
              <Empty>No application matches.</Empty>
            )}
          </Card>

          <Card
            title={`Enterprise Catalog · ${assetHits.length}`}
            sub="Assets, modules, services, capabilities"
          >
            {assetHits.length ? (
              assetHits.map((h) => (
                <div
                  key={h.asset.id}
                  style={{
                    padding: "7px 0",
                    borderBottom: "1px solid #1c2128",
                    fontSize: 12.5,
                  }}
                >
                  <a
                    href="/catalog"
                    style={{ color: "#e8eaed", textDecoration: "none" }}
                  >
                    <strong>{h.asset.name}</strong>
                  </a>
                  <span style={{ color: "#6e7681" }}>
                    {" "}
                    · {KIND_LABEL[h.asset.kind].one}
                    {h.related.length ? ` · ${h.related.length} related` : ""}
                  </span>
                </div>
              ))
            ) : (
              <Empty>No catalog matches.</Empty>
            )}
          </Card>

          {canGov ? (
            <Card
              title={`Government Opportunities · ${govHits.length}`}
              sub="Illustrative sample solicitations"
            >
              {govHits.length ? (
                govHits.map((g) => (
                  <div
                    key={g.opportunity.id}
                    style={{
                      padding: "7px 0",
                      borderBottom: "1px solid #1c2128",
                      fontSize: 12.5,
                    }}
                  >
                    <Dot
                      health={
                        g.ceoRecommendation.verdict === "pursue" ? "green" : "yellow"
                      }
                    />
                    <strong>{g.opportunity.title}</strong>
                    <span style={{ color: "#6e7681" }}>
                      {" "}
                      · {g.ceoRecommendation.verdict.replace(/_/g, " ")}
                    </span>
                  </div>
                ))
              ) : (
                <Empty>No opportunity matches.</Empty>
              )}
            </Card>
          ) : null}

          {canIntel ? (
            <Card
              title={`Transformation Recommendations · ${recHits.length}`}
              sub="Illustrative sample assessment"
            >
              {recHits.length ? (
                recHits.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: "7px 0",
                      borderBottom: "1px solid #1c2128",
                      fontSize: 12.5,
                    }}
                  >
                    <strong>{r.label}</strong>
                    <span style={{ color: "#6e7681" }}>
                      {" "}
                      · {r.priority} · {r.solution}
                    </span>
                  </div>
                ))
              ) : (
                <Empty>No recommendation matches.</Empty>
              )}
            </Card>
          ) : null}
        </>
      )}

      <p style={{ fontSize: 11.5, color: "#6e7681", lineHeight: 1.6 }}>
        Search is read-only and role-aware. Businesses, organizations and customers are
        not shown because no live customer data is connected — the portal will not
        fabricate records it does not have.
      </p>
    </PortalShell>
  );
}
