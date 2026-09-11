import { connect, shopReport } from "@/lib/shop-audit";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { colour: string; label: string }> = {
  critical: { colour: "#f85149", label: "Critical" },
  high: { colour: "#db6d28", label: "High" },
  medium: { colour: "#d29922", label: "Medium" },
  info: { colour: "#3fb950", label: "Fine" },
};

export default async function ShopReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await connect();
  if (!state.connected) {
    return (
      <Shell name="Shop">
        <Card title="Not connected to the database">
          <Empty>{state.reason}</Empty>
        </Card>
      </Shell>
    );
  }

  let report;
  try {
    report = await shopReport(state.conn, id);
  } catch (e) {
    return (
      <Shell name="Shop">
        <Card title="Could not read this shop">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }
  if (report === null) {
    return (
      <Shell name="Shop">
        <Card title="No such shop">
          <Empty>Nothing in this project matches that shop.</Empty>
        </Card>
      </Shell>
    );
  }

  const problems = report.findings.filter((f) => f.severity !== "info");
  const fine = report.findings.filter((f) => f.severity === "info");
  const structural = report.recommendations.filter((r) => r.priority === "structural");
  const quick = report.recommendations.filter((r) => r.priority === "quick_win");

  return (
    <Shell name={report.name}>
      {/* The audit is half the picture. The other half only the owner can give
          us, so the way to it lives right beside the findings. */}
      <p style={{ margin: "0 0 16px", fontSize: 14 }}>
        <a
          href={`/shops/${id}/call`}
          style={{
            display: "inline-block",
            padding: "9px 16px",
            borderRadius: 6,
            border: "1px solid #2f3742",
            color: "#58a6ff",
            textDecoration: "none",
          }}
        >
          Discovery call →
        </a>
        <span style={{ marginLeft: 12, color: "#6e7681", fontSize: 13 }}>
          What they already run, and what we can do about it.
        </span>
      </p>
      <Card
        title="Where this shop stands"
        sub={[report.address, report.locality, report.postalCode]
          .filter(Boolean)
          .join(", ")}
      >
        {report.runId === null ? (
          // Not an error and not a zero. Nobody has looked yet, and saying so
          // is the whole point.
          <Empty>
            This shop has not been analysed yet.
            {report.websiteUrl
              ? " It has a website, so it is waiting for the next run of Look at the websites."
              : " It has no website recorded and no analysis, which should not happen — the list-only analysis does not need a visit."}
          </Empty>
        ) : (
          <>
            <div
              style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 6 }}
            >
              <Big
                value={report.score === null ? "—" : String(report.score)}
                label={report.score === null ? "no score" : "out of 100"}
              />
              <Big value={String(report.status ?? "—")} label="run status" small />
              <Big
                value={`${report.scored ?? 0} of ${report.possible ?? 0}`}
                label="parts of the audit that produced a score"
                small
              />
            </div>
            {report.scorecard.map((d) => (
              <p
                key={d.dimension}
                style={{ margin: "10px 0 0", fontSize: 13, color: "#c9d1d9" }}
              >
                <strong>{d.dimension}</strong> — {d.confidence}
                {d.score !== null ? `, scored ${d.score}` : ", no score"}.{" "}
                <span style={{ color: "#8b949e" }}>{d.note}</span>
              </p>
            ))}
          </>
        )}
      </Card>

      {report.hook && (
        <Card title="The opening line" sub="Taken from the strongest thing we found.">
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>“{report.hook}”</p>
        </Card>
      )}

      {report.runId !== null && (
        <Card title="Areas for improvement" sub="What was observed. Worst first.">
          {problems.length === 0 ? (
            <Empty>Nothing failed. This shop is doing the basics right.</Empty>
          ) : (
            problems.map((f, i) => {
              const s = SEVERITY[f.severity] ?? SEVERITY["medium"]!;
              return (
                <div
                  key={i}
                  style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 62,
                      fontSize: 11,
                      color: s.colour,
                      fontWeight: 600,
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{f.statement}</span>
                  <div style={{ marginLeft: 62, fontSize: 12, color: "#6e7681" }}>
                    {f.confidence === "verified" && f.evidence_url ? (
                      <>
                        seen on{" "}
                        <a
                          href={f.evidence_url}
                          style={{ color: "#58a6ff" }}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          the page
                        </a>
                      </>
                    ) : (
                      `${f.confidence} — not confirmed by opening the page`
                    )}
                  </div>
                </div>
              );
            })
          )}
          {fine.length > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8b949e" }}>
              {fine.length} other check{fine.length === 1 ? "" : "s"} passed and{" "}
              {fine.length === 1 ? "is" : "are"} not listed as a problem.
            </p>
          )}
        </Card>
      )}

      {report.recommendations.length > 0 && (
        <Card
          title="Recommended changes"
          sub="Our judgment, kept separate from what was observed."
        >
          {structural.length > 0 && <GroupLabel>Structural</GroupLabel>}
          {structural.map((r, i) => (
            <Rec key={`s${i}`} r={r} />
          ))}
          {quick.length > 0 && <GroupLabel>Quick wins</GroupLabel>}
          {quick.map((r, i) => (
            <Rec key={`q${i}`} r={r} />
          ))}
        </Card>
      )}

      {report.bundle.length > 0 && (
        <Card
          title="Which software would fit"
          sub="And whether it exists yet. It mostly does not."
        >
          {report.bundle.map((b) => (
            <div
              key={b.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid #1c2128",
                fontSize: 13.5,
              }}
            >
              <span>{b.name}</span>
              <span
                style={{ color: b.shipped ? "#3fb950" : "#d29922", fontSize: 12.5 }}
              >
                {b.shipped ? "Built and available" : `Not built yet — ${b.status}`}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card title="Where this came from">
        <p style={{ margin: 0, fontSize: 12.5, color: "#8b949e", lineHeight: 1.7 }}>
          {report.sourceFile ? (
            <>
              Row {report.sourceRow} of <code>{report.sourceFile}</code>.
            </>
          ) : (
            "Source row not recorded."
          )}
          {report.phone ? ` · ${report.phone}` : ""}
          {report.websiteUrl ? (
            <>
              {" · "}
              <a
                href={report.websiteUrl}
                style={{ color: "#58a6ff" }}
                rel="noreferrer noopener"
                target="_blank"
              >
                {report.websiteUrl}
              </a>
            </>
          ) : (
            " · no website recorded"
          )}
        </p>
      </Card>
    </Shell>
  );
}

/** One headline number, with the words that make it mean something. */
function Big({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: small ? 17 : 34, fontWeight: 600, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Rec({
  r,
}: {
  r: { title: string; detail: string; capability_key: string | null };
}) {
  return (
    <div style={{ padding: "9px 0", borderBottom: "1px solid #1c2128" }}>
      <strong style={{ fontSize: 13.5 }}>{r.title}</strong>
      {r.capability_key && (
        <span style={{ fontSize: 12, color: "#8b949e", marginLeft: 8 }}>
          → {r.capability_key}
        </span>
      )}
      {r.detail && (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#c9d1d9",
            lineHeight: 1.55,
          }}
        >
          {r.detail}
        </p>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "12px 0 2px",
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: "#6e7681",
      }}
    >
      {children}
    </p>
  );
}

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{name}</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          <a href="/shops" style={{ color: "#58a6ff" }}>
            All shops
          </a>{" "}
          ·{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>
      {children}
    </main>
  );
}
