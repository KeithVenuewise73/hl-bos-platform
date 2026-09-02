import { listProviders } from "@hl-bos/video-studio";

import { VideoStudio } from "@/components/VideoStudio";
import { detectGpu } from "@/lib/gpu";
import type { GpuVerdict } from "@/lib/gpu-report";

export const dynamic = "force-dynamic";

const VERDICT_DOT: Record<GpuVerdict, string> = {
  yes: "#3fb950",
  no: "#6e7681",
  unknown: "#d29922",
};

export const metadata = {
  title: "Video Studio — HL-BOS Control Center",
};

export default async function VideoPage() {
  // No credential is read, deliberately. No generative provider is wired to a
  // network call yet, so no environment variable can change this answer -- and
  // reading one would imply it could.
  const providers = listProviders();
  const gpu = await detectGpu();
  const ready = providers.filter((p) => p.status === "ready");
  const notBuilt = providers.filter((p) => p.status !== "ready");

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Video Studio</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Turn a picture into a video.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>

      <VideoStudio />

      <section
        style={{
          background: "#12151a",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: "18px 20px",
          marginTop: 8,
        }}
      >
        <h2 style={{ margin: "0 0 2px", fontSize: 15 }}>What this can and cannot do</h2>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8b949e" }}>
          There are two different things people mean by &ldquo;make a video from this
          picture&rdquo;. Only one of them is built. The routes to the other one are
          listed cheapest first, because the free ones are the easy ones to miss.
        </p>

        {ready.map((provider) => (
          <div key={provider.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, marginBottom: 2 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: "#3fb950",
                  marginRight: 8,
                }}
              />
              <strong>{provider.name}</strong> — working now
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "#8b949e", paddingLeft: 17 }}>
              {provider.whatItDoes} {provider.cost}
            </p>
          </div>
        ))}

        {notBuilt.map((provider) => (
          <div key={provider.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, marginBottom: 2 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: "#6e7681",
                  marginRight: 8,
                }}
              />
              <strong>{provider.name}</strong> — not built
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "#8b949e", paddingLeft: 17 }}>
              {provider.whatItDoes}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12.5,
                color: "#c9a227",
                paddingLeft: 17,
              }}
            >
              {provider.cost}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12.5,
                color: "#6e7681",
                paddingLeft: 17,
              }}
            >
              {provider.toEnable}
            </p>
          </div>
        ))}

        {/*
          Emphasis lives on whole paragraphs here, never on an inline tag inside
          flowing text. This toolchain drops the space that follows a closing
          inline element when the sentence wraps to the next source line, which
          silently produced "notautomatically" in the shipped HTML.
        */}
        <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "#8b949e" }}>
          There is no button for the routes marked not built, because pressing it would
          do nothing.
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12.5,
            color: "#e8eaed",
            fontWeight: 600,
          }}
        >
          Generated motion is not automatically a paid thing.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#8b949e" }}>
          The first route runs a freely licensed model on hardware we own and costs
          nothing per clip, and Google&rsquo;s own web tools give every Google account a
          small free monthly allowance with no card. What is missing in every case is
          the connection code, not the money. Say which route you want and it becomes
          the next piece of work.
        </p>
      </section>

      {/* Whether the free route is even open to us is a fact about THIS machine.
          The console answers it rather than asking anyone to open Device Manager. */}
      <section
        style={{
          background: "#12151a",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: "18px 20px",
          marginTop: 16,
        }}
      >
        <h2 style={{ margin: "0 0 2px", fontSize: 15 }}>
          Can this machine run one itself?
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8b949e" }}>
          The free route needs an NVIDIA card. Checked on this machine, just now.
        </p>

        <div style={{ fontSize: 13.5, marginBottom: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 9,
              height: 9,
              borderRadius: 999,
              background: VERDICT_DOT[gpu.verdict],
              marginRight: 8,
            }}
          />
          <strong>{gpu.headline}</strong>
        </div>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12.5,
            color: "#8b949e",
            paddingLeft: 17,
          }}
        >
          {gpu.detail}
        </p>

        {gpu.nvidia ? (
          <div style={{ paddingLeft: 17, display: "grid", gap: 5 }}>
            {gpu.canRun.map((fit) => (
              <div key={fit.model} style={{ fontSize: 12.5 }}>
                <span
                  style={{ color: fit.fits ? "#3fb950" : "#6e7681", marginRight: 8 }}
                >
                  {fit.fits ? "yes" : "no"}
                </span>
                <span style={{ color: fit.fits ? "#e8eaed" : "#6e7681" }}>
                  {fit.model} — needs about {Math.round(fit.needsMB / 1024)}GB.{" "}
                  {fit.note}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "#6e7681" }}>
          How this was worked out: {gpu.evidence.join("; ")}.
        </p>
      </section>
    </main>
  );
}
