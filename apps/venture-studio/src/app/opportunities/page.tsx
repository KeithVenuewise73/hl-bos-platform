import { StudioShell } from "@/components/StudioShell";
import { Card, Empty, Badge, colors } from "@/components/ui";
import { ProvisioningBanner } from "@/components/sections";
import { listOpportunities } from "@/lib/data";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  inbox: "neutral",
  researching: "accent",
  evaluated: "warn",
  watch: "warn",
  approved: "good",
  rejected: "bad",
  archived: "neutral",
};

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const list = await listOpportunities();
  const status = sp["status"];
  const q = (sp["q"] ?? "").toLowerCase();
  const items = list.items.filter(
    (o) =>
      (!status || o.status === status) &&
      (!q || `${o.title} ${o.industry} ${o.tags.join(" ")}`.toLowerCase().includes(q)),
  );

  return (
    <StudioShell view="opportunities">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <h1 style={{ fontSize: 20 }}>Opportunity Catalog</h1>
        <a href="/opportunities/new" style={{ color: colors.accent, fontSize: 13 }}>
          + New opportunity
        </a>
      </div>
      <ProvisioningBanner detail={list} />
      <Card>
        <form style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            name="q"
            defaultValue={sp["q"] ?? ""}
            placeholder="Search title / industry / tag"
            style={{
              flex: 1,
              minWidth: 180,
              background: "#0d1117",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.text,
              padding: "8px 10px",
              fontSize: 13,
            }}
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            style={{
              background: "#0d1117",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.text,
              padding: "8px 10px",
              fontSize: 13,
            }}
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            style={{
              background: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Filter
          </button>
        </form>
        {items.length === 0 ? (
          <Empty>
            No opportunities match.{" "}
            {list.provisioning !== "ready" ? "(No live data in this environment.)" : ""}
          </Empty>
        ) : (
          items.map((o) => (
            <a
              key={o.id}
              href={`/opportunities/${o.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: colors.text,
                borderBottom: `1px solid ${colors.border}`,
                padding: "10px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{o.title}</strong>
                <span style={{ display: "flex", gap: 6 }}>
                  {o.is_demonstration ? (
                    <Badge tone="warn">DEMO / NOT LIVE</Badge>
                  ) : null}
                  <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Badge>
                </span>
              </div>
              <div style={{ fontSize: 12, color: colors.dim }}>
                {o.industry || "—"} · {o.tags.join(", ")}
              </div>
            </a>
          ))
        )}
      </Card>
    </StudioShell>
  );
}
