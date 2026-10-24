import { LabGpuControls } from "@/components/LabGpuControls";
import { labGpuStatus } from "@/lib/lab-gpu";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lab GPU — HL-BOS Control Center",
};

const CARD = {
  background: "#12151a",
  border: "1px solid #262c36",
  borderRadius: 12,
  padding: "18px 20px",
} as const;

export default async function LabGpuPage() {
  const status = await labGpuStatus();

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lab GPU</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          The rented graphics card behind &ldquo;Self-hosted GPU — reference
          images&rdquo; in the AI Persona X Lab.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>

      <section style={CARD}>
        <LabGpuControls initial={status} />
      </section>

      <p
        style={{
          margin: "18px 4px 0",
          fontSize: 12.5,
          color: "#8b949e",
          lineHeight: 1.7,
        }}
      >
        <strong>Turn off</strong> stops the card, not the server: the model stays saved,
        so <strong>Turn on</strong>&nbsp;takes about 2 minutes instead of a fresh
        download. Deleting the server altogether (RunPod calls it
        &ldquo;terminate&rdquo;) is not on this page on purpose — that is a decision for
        Claude to carry out, not a button.
      </p>
    </main>
  );
}
