import { detectGpu } from "@/lib/gpu";
import type { GpuVerdict } from "@/lib/gpu-report";
import { readinessFrom } from "@/lib/sceneflow-report";

export const dynamic = "force-dynamic";

const DOT: Record<GpuVerdict, string> = {
  yes: "#3fb950",
  no: "#6e7681",
  unknown: "#d29922",
};

export const metadata = {
  title: "SceneFlow — HL-BOS Control Center",
};

const CARD = {
  background: "#12151a",
  border: "1px solid #262c36",
  borderRadius: 12,
  padding: "18px 20px",
} as const;

export default async function SceneFlowPage() {
  // The machine is asked once. No credential is read: no image provider is
  // wired to anything, so no environment variable could change this answer,
  // and reading one would imply it could.
  const readiness = readinessFrom(await detectGpu());

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>SceneFlow</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Turn one moment into an entire story.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>

      {/* The honest headline, first and unmissable. */}
      <section
        style={{
          ...CARD,
          borderColor: "#3d2f12",
          background: "#1a1509",
          marginBottom: 14,
        }}
      >
        <strong style={{ fontSize: 14 }}>This cannot generate a picture yet.</strong>
        <p
          style={{ margin: "6px 0 0", color: "#c9d1d9", fontSize: 13, lineHeight: 1.6 }}
        >
          The story engine, the database and the safety rules are built and tested. The
          part that actually loads a model and returns an image is not written. This
          page tells you whether this machine could run one, and what is left to do.
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13 }}>
          <a href="/sceneflow/direct" style={{ color: "#58a6ff" }}>
            Direct a scene anyway
          </a>{" "}
          <span style={{ color: "#8b949e" }}>
            — build the cast and the moment, and see exactly what would be sent when a
            model is connected.
          </span>
        </p>
      </section>

      <section style={{ ...CARD, marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>Can this machine run it?</h2>
        <p style={{ margin: "0 0 4px", fontSize: 14 }}>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 9,
              height: 9,
              borderRadius: 9,
              background: DOT[readiness.verdict],
              marginRight: 8,
            }}
          />
          {readiness.headline}
        </p>
        <p
          style={{
            margin: "0 0 14px",
            color: "#8b949e",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {readiness.detail}
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8b949e" }}>
              <th style={{ padding: "6px 8px 6px 0", fontWeight: 500 }}>Model</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>Needs about</th>
              <th style={{ padding: "6px 0 6px 8px", fontWeight: 500 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {readiness.models.map((m) => (
              <tr key={m.model} style={{ borderTop: "1px solid #262c36" }}>
                <td
                  style={{
                    padding: "8px 8px 8px 0",
                    color: m.fits ? "#c9d1d9" : "#6e7681",
                  }}
                >
                  {m.fits ? "✓ " : "— "}
                  {m.model}
                </td>
                <td style={{ padding: "8px", color: "#8b949e", whiteSpace: "nowrap" }}>
                  {Math.ceil(m.needsMB / 1024)}GB
                </td>
                <td
                  style={{
                    padding: "8px 0 8px 8px",
                    color: "#8b949e",
                    lineHeight: 1.5,
                  }}
                >
                  {m.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ ...CARD, marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>What is left</h2>
        <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, lineHeight: 1.7 }}>
          {readiness.blockers.map((b) => (
            <li key={b.id} style={{ marginBottom: 8, color: "#c9d1d9" }}>
              {b.what}{" "}
              <span style={{ color: b.owner === "ceo" ? "#d29922" : "#6e7681" }}>
                ({b.owner === "ceo" ? "your call" : "my work"})
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ ...CARD }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 15 }}>What was actually run</h2>
        <p
          style={{
            margin: "0 0 8px",
            color: "#8b949e",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          So this is never a black box. These are read-only commands; every argument is
          a fixed constant.
        </p>
        <pre
          style={{
            margin: 0,
            padding: "10px 12px",
            background: "#0d1117",
            border: "1px solid #262c36",
            borderRadius: 8,
            color: "#8b949e",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {readiness.evidence.join("\n")}
        </pre>
      </section>
    </main>
  );
}
