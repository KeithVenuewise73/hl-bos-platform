import { PortalShell } from "@/components/PortalShell";
import { Card, Dot } from "@/components/ui";
import { assembleAll, compositionByKey } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function CompositionsPage() {
  const assemblies = assembleAll();
  return (
    <PortalShell view="compositions">
      <Card
        title="Product Compositions"
        sub="How each product is assembled from registered modules."
      >
        {assemblies.map((a) => {
          const c = compositionByKey(a.productKey)!;
          return (
            <div
              key={a.productKey}
              style={{ padding: "10px 0", borderBottom: "1px solid #1c2128" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                }}
              >
                <span>
                  <Dot health={a.assemblable ? "green" : "yellow"} />
                  {a.name}
                </span>
                <span style={{ fontSize: 12, color: "#8b949e" }}>
                  {a.builtCount}/{a.requiredCount} modules · {a.foundationReadinessPct}%
                  · edition {c.edition}
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
    </PortalShell>
  );
}
