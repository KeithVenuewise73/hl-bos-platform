import { Card, Dot, Row } from "@/components/ui";
import { Tile, Bar } from "@/components/CatalogUI";
import {
  MODULE_REGISTRY,
  PRODUCT_COMPOSITIONS,
  assembleProduct,
  assembleAll,
  executiveReadiness,
  FACTORY_CHECKLIST,
  MATURITY_LABEL,
  compositionByKey,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default function FactoryPage() {
  const readiness = executiveReadiness();
  const salon = compositionByKey("salon_ai");
  const salonAssembly = salon ? assembleProduct(salon) : null;
  const assemblies = assembleAll();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Software Factory</h1>
          <span style={{ fontSize: 12, color: "#6e7681" }}>· Atlas Phase IV</span>
        </div>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Assemble products from registered modules.{" "}
          <a href="/catalog" style={{ color: "#58a6ff" }}>
            ← Enterprise Catalog
          </a>
        </p>
      </header>

      {/* ---- Executive readiness dashboard ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Tile
          label="Platform completion"
          value={`${readiness.platformCompletionPct}%`}
          accent="#3fb950"
        />
        <Tile
          label="Factory completion"
          value={`${readiness.factoryCompletionPct}%`}
          accent="#d29922"
        />
        <Tile
          label="Commercial readiness"
          value={`${readiness.commercialReadinessPct}%`}
          accent="#f85149"
          hint="gated on pricing/licensing"
        />
        <Tile label="Registered modules" value={readiness.moduleCounts.total} />
        <Tile
          label="Products assemblable"
          value={`${readiness.productsAssemblable}/${PRODUCT_COMPOSITIONS.length}`}
          accent="#3fb950"
        />
        <Tile label="Ready to launch" value={readiness.productsReadyForLaunch.length} />
      </div>
      <p
        style={{
          fontSize: 11.5,
          color: "#6e7681",
          margin: "0 0 18px",
          lineHeight: 1.6,
        }}
      >
        Modules: {readiness.moduleCounts.live} live ·{" "}
        {readiness.moduleCounts.builtUndeployed} built (not deployed) ·{" "}
        {readiness.moduleCounts.other} other. Commercial readiness is 0% on purpose — no
        product has pricing/licensing/ownership set yet (all pending your decision), so
        it is not inflated.
      </p>

      {/* ---- SalonAI reference assembly ---- */}
      {salonAssembly && (
        <Card
          title="Reference assembly — SalonAI"
          sub="Demonstrates a product assembled entirely from registered modules. No new foundational module is required."
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
          >
            <Dot health={salonAssembly.assemblable ? "green" : "red"} />
            <strong style={{ fontSize: 14 }}>
              {salonAssembly.assemblable
                ? "Assemblable from registered modules"
                : "Blocked — missing modules"}
            </strong>
            <span style={{ fontSize: 12, color: "#8b949e" }}>
              foundation {salonAssembly.foundationReadinessPct}% ·{" "}
              {salonAssembly.builtCount}/{salonAssembly.requiredCount} modules built ·{" "}
              {salonAssembly.sharedSpineCount} from the shared spine
            </span>
          </div>
          <Bar
            label="Foundation readiness"
            pct={salonAssembly.foundationReadinessPct}
            sub={`${salonAssembly.builtCount}/${salonAssembly.requiredCount}`}
          />
          <div style={{ margin: "10px 0 6px", fontSize: 12.5, color: "#8b949e" }}>
            Factory assembly blueprint:
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "#c9d1d9",
            }}
          >
            {salonAssembly.blueprint.map((step, i) => (
              <li key={i} style={{ listStyle: "none", marginLeft: -18 }}>
                {step}
              </li>
            ))}
          </ol>
          <div
            style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "4px 8px" }}
          >
            {salonAssembly.resolved.map((m) => (
              <span
                key={m.key}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${m.built ? "#238636" : "#da3633"}`,
                  color: "#c9d1d9",
                  background: "#0d1117",
                }}
              >
                {m.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Product compositions / assembly status ---- */}
      <Card
        title="Product composition & assembly"
        sub="Every product, its module count, and whether it can be assembled from what's built."
      >
        {assemblies.map((a) => {
          const c = compositionByKey(a.productKey)!;
          return (
            <div
              key={a.productKey}
              style={{ padding: "10px 0", borderBottom: "1px solid #1c2128" }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  <Dot health={a.assemblable ? "green" : "yellow"} />
                  {a.name}
                </span>
                <span style={{ fontSize: 12, color: "#8b949e" }}>
                  {a.builtCount}/{a.requiredCount} modules · {a.foundationReadinessPct}%
                  · edition {c.edition} ·{" "}
                  {c.commercial.commercialAvailability.replace(/_/g, " ")}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#6e7681",
                  marginLeft: 17,
                  marginTop: 3,
                }}
              >
                AI: {c.aiServices.join(", ") || "none"} · deploy:{" "}
                {c.deploymentRequirements.join("; ")}
              </div>
            </div>
          );
        })}
      </Card>

      {/* ---- Module registry ---- */}
      <Card
        title="Engineering module registry"
        sub="The reusable modules the Factory assembles from — the version-controlled source of truth for hlvs.modules (0 rows in the live DB)."
      >
        {MODULE_REGISTRY.map((m) => (
          <Row
            key={m.key}
            k={m.name}
            v={
              <span style={{ fontSize: 12 }}>
                {m.schema} · {MATURITY_LABEL[m.maturity]}
                {m.provides.length ? ` · provides ${m.provides.join(", ")}` : ""}
              </span>
            }
          />
        ))}
      </Card>

      {/* ---- Commercial metadata ---- */}
      <Card
        title="Commercial metadata"
        sub="Version, edition, subscription model, availability — and the terms that are yours to set."
      >
        {PRODUCT_COMPOSITIONS.map((c) => (
          <div
            key={c.productKey}
            style={{ padding: "8px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: "#8b949e", marginTop: 2 }}>
              edition {c.edition} · {c.commercial.subscriptionModel.replace(/_/g, " ")}{" "}
              · {c.commercial.commercialAvailability.replace(/_/g, " ")} · version{" "}
              {c.commercial.version ?? "—"} ·{" "}
              <span style={{ color: "#d29922" }}>
                pricing/licensing/ownership: pending your decision
              </span>
            </div>
          </div>
        ))}
      </Card>

      {/* ---- Factory checklist + remaining work ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card
          title="Factory capability checklist"
          sub="What the Software Factory needs to operate."
        >
          {FACTORY_CHECKLIST.map((item) => (
            <Row
              key={item.capability}
              k={item.capability}
              v={
                <span
                  style={{ display: "inline-flex", alignItems: "center", fontSize: 12 }}
                >
                  <Dot
                    health={
                      item.score === 1 ? "green" : item.score === 0.5 ? "yellow" : "red"
                    }
                  />
                  {item.score === 1
                    ? "In place"
                    : item.score === 0.5
                      ? "Code done / gated"
                      : "Not yet"}
                </span>
              }
            />
          ))}
        </Card>

        <Card
          title="Remaining critical work"
          sub="What stands between here and commercial production."
        >
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "#c9d1d9",
            }}
          >
            {readiness.remainingCriticalWork.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
