import { PortalShell } from "@/components/PortalShell";
import { Card } from "@/components/ui";
import { PRODUCT_COMPOSITIONS } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default function CommercialPage() {
  return (
    <PortalShell view="commercial">
      <Card
        title="Commercial Readiness"
        sub="Sensitive — visible to Platform Owner and Executive only."
      >
        {PRODUCT_COMPOSITIONS.map((c) => (
          <div
            key={c.productKey}
            style={{ padding: "8px 0", borderBottom: "1px solid #1c2128" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: "#8b949e", marginTop: 2 }}>
              edition {c.edition} · {c.commercial.subscriptionModel.replace(/_/g, " ")}{" "}
              · {c.commercial.commercialAvailability.replace(/_/g, " ")} ·{" "}
              <span style={{ color: "#d29922" }}>
                pricing / licensing / ownership: pending CEO decision
              </span>
            </div>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: "#6e7681", marginTop: 10 }}>
          No commercial terms are invented. Provide them via the CEO Commercial Decision
          Package; the engineer applies your values.
        </p>
      </Card>
    </PortalShell>
  );
}
