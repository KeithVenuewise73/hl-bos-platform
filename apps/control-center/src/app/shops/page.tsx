import { connect, listShops, type ShopRow } from "@/lib/shop-audit";
import { Card, Empty } from "@/components/ui";
import { ShopActions, ImportList } from "@/components/ShopActions";
import { readEnvFile } from "@/lib/secrets";
import {
  defaultSiteBase,
  describeServing,
  probeUrl,
  type ProbeResult,
} from "@/lib/site-serving";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop Analysis — HL-BOS Control Center",
};

const CAMPAIGN = "wny_barbers_50";

/**
 * What a score means, in words, and never a colour without one.
 *
 * `null` is a real answer with two different causes, and they are shown
 * differently: a shop nobody has looked at yet, and a shop we looked for and
 * could not read. Neither is a zero.
 */
function scoreCell(s: ShopRow) {
  if (s.status === "not_analysed") {
    return { text: "—", note: "not looked at yet", colour: "#6e7681" };
  }
  if (s.score === null) {
    // Two different reasons for the same blank, and they are different sales
    // situations. Saying "could not be read" about a shop nobody tried to open
    // would be false, and would send the CEO into the call with the wrong story.
    return s.unreachable
      ? { text: "—", note: "site did not answer", colour: "#d29922" }
      : { text: "—", note: "from the list only — site not opened", colour: "#8b949e" };
  }
  const colour = s.score >= 80 ? "#3fb950" : s.score >= 40 ? "#d29922" : "#f85149";
  return { text: String(s.score), note: s.confidence ?? "", colour };
}

export default async function ShopsPage() {
  const state = await connect();

  if (!state.connected) {
    return (
      <Shell>
        <Card title="Not connected to the database">
          <Empty>
            {state.reason}{" "}
            <a href="/connect" style={{ color: "#58a6ff" }}>
              Connect accounts
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let campaign, shops;
  try {
    ({ campaign, shops } = await listShops(state.conn, CAMPAIGN));
  } catch (e) {
    // Say what actually went wrong. A page that shows an empty table on a
    // failed query is indistinguishable from a page that shows no shops.
    return (
      <Shell>
        <Card title="Could not read the shop list">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  if (campaign === null) {
    return (
      <Shell>
        <Card
          title="No prospect list yet"
          sub="Nothing has been imported into this project."
        >
          <ImportList />
        </Card>
      </Shell>
    );
  }

  const worstFirst = [...shops].sort((a, b) => {
    // Analysed shops first, worst score at the top; unanalysed at the bottom,
    // because they are work to do rather than results to read.
    const rank = (s: ShopRow) =>
      s.status === "not_analysed" ? 2 : s.score === null ? 1 : 0;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.score ?? 0) - (b.score ?? 0);
  });

  const caps = new Map<string, number>();
  for (const s of shops) {
    for (const c of s.capabilities) caps.set(c, (caps.get(c) ?? 0) + 1);
  }

  return (
    <Shell>
      <Card
        title={campaign.name}
        sub={`${campaign.shops} shops · ${campaign.analysed} analysed · ${campaign.awaiting} not looked at yet`}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Tile n={campaign.shops} label="shops in the list" />
          <Tile n={campaign.analysed} label="have an analysis" />
          <Tile n={campaign.completed} label="fully assessed" />
          <Tile
            n={campaign.partial}
            label="partly assessed"
            hint="Something the analysis needed could not be reached, so it carries no score."
          />
          <Tile
            n={campaign.fetchable}
            label="websites to look at"
            hint="Shops with a website nobody has opened yet."
          />
        </div>

        <ShopActions fetchable={campaign.fetchable} />

        <ServingStatus />

        {caps.size > 0 && (
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "#8b949e" }}>
            What the analyses point at:{" "}
            {[...caps.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => `${k} (${n} shop${n === 1 ? "" : "s"})`)
              .join(" · ")}
            . None of these modules is built yet — BarberOS lists them as planned.
          </p>
        )}
      </Card>

      <Card title="Every shop" sub="Worst first. Shops nobody has looked at are last.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#8b949e", textAlign: "left" }}>
                <Th>Shop</Th>
                <Th>Town</Th>
                <Th right>Score</Th>
                <Th>What we know</Th>
                <Th>Points at</Th>
              </tr>
            </thead>
            <tbody>
              {worstFirst.map((s) => {
                const c = scoreCell(s);
                return (
                  <tr key={s.prospectId} style={{ borderTop: "1px solid #1c2128" }}>
                    <Td>
                      <a
                        href={`/shops/${s.prospectId}`}
                        style={{ color: "#58a6ff", textDecoration: "none" }}
                      >
                        {s.name}
                      </a>
                      {s.websiteUrl === null && (
                        <span style={{ color: "#6e7681", marginLeft: 8, fontSize: 12 }}>
                          no website
                        </span>
                      )}
                    </Td>
                    <Td>{s.locality ?? "—"}</Td>
                    <Td right>
                      <strong style={{ color: c.colour, fontSize: 14 }}>
                        {c.text}
                      </strong>
                    </Td>
                    <Td>
                      <span style={{ color: "#8b949e" }}>{c.note}</span>
                    </Td>
                    <Td>
                      {s.capabilities.length === 0 ? (
                        <span style={{ color: "#6e7681" }}>—</span>
                      ) : (
                        s.capabilities.join(", ")
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Add to the list">
        <ImportList />
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Shop Analysis</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          What each shop is missing, and which software would fix it.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>
      {children}
    </main>
  );
}

function Tile({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div
      title={hint}
      style={{
        background: "#0d1117",
        border: "1px solid #262c36",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600 }}>{n}</div>
      <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        padding: "6px 10px 8px",
        fontWeight: 500,
        fontSize: 12,
        textAlign: right ? "right" : "left",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td style={{ padding: "9px 10px", textAlign: right ? "right" : "left" }}>
      {children}
    </td>
  );
}

/**
 * Whether a customer could actually read a shop's page today.
 *
 * Asked of the live address every time this page renders, because "deployed"
 * and "readable by a customer" turned out to be different things and only a
 * real request tells them apart. It probes a slug nothing is published at, so
 * it works before any shop has a page -- which is the situation now.
 */
async function ServingStatus() {
  const env = await readEnvFile();
  const base =
    env["HLBOS_SITE_PUBLIC_BASE"] ??
    defaultSiteBase(env["HLBOS_SUPABASE_PROJECT_REF"] ?? null);

  if (base === null) {
    return (
      <p style={{ margin: "14px 0 0", fontSize: 13, color: "#8b949e" }}>
        Where shop pages are served is not configured, so this cannot be checked.
      </p>
    );
  }

  let result: ProbeResult;
  try {
    const res = await fetch(probeUrl(base), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    result = { status: res.status, contentType: res.headers.get("content-type") };
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }

  const v = describeServing(result);
  return (
    <div
      style={{
        margin: "16px 0 0",
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${v.servedAsWebPage ? "#238636" : "#9e6a03"}`,
        background: v.servedAsWebPage ? "#0d2818" : "#211a02",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
        {v.servedAsWebPage ? "\u2713 " : "\u26a0 "}
        {v.headline}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8b949e" }}>{v.detail}</p>
      {v.remedy !== "" && (
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8b949e" }}>{v.remedy}</p>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6e7681" }}>
        Checked just now, from this machine: {base}
      </p>
    </div>
  );
}
