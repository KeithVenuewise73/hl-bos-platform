import { configuredCode } from "@/lib/gate";

export const dynamic = "force-dynamic";

const CARD = {
  display: "block",
  background: "#12151a",
  border: "1px solid #262c36",
  borderRadius: 12,
  padding: "18px 20px",
  marginBottom: 12,
  color: "inherit",
  textDecoration: "none",
} as const;

export default async function Home() {
  // Shown, not assumed: if this copy has no code set it is reachable by
  // anything the operating system let through, and saying so is the only
  // honest thing to put on the front page of an app that holds photographs.
  const guarded = (await configuredCode()) !== "";

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 64px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>SceneFlow</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Turn one moment into the next one, or into a whole evening.
        </p>
      </header>

      <a href="/direct" style={CARD}>
        <strong style={{ fontSize: 15 }}>Direct a scene</strong>
        <p
          style={{ margin: "6px 0 0", color: "#8b949e", fontSize: 13, lineHeight: 1.6 }}
        >
          Build the cast and the moment, choose how far it goes, and see exactly what
          would be sent to a model.
        </p>
      </a>

      <a href="/story" style={CARD}>
        <strong style={{ fontSize: 15 }}>Plan a story</strong>
        <p
          style={{ margin: "6px 0 0", color: "#8b949e", fontSize: 13, lineHeight: 1.6 }}
        >
          One moment becomes three or six panels, each continuing from the last.
        </p>
      </a>

      <section
        style={{
          ...CARD,
          background: guarded ? "#12151a" : "#1a1509",
          borderColor: guarded ? "#262c36" : "#3d2f12",
          marginTop: 22,
        }}
      >
        <strong style={{ fontSize: 13 }}>
          {guarded ? "This copy asks for an access code." : "No access code is set."}
        </strong>
        <p
          style={{
            margin: "6px 0 0",
            color: "#8b949e",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          {guarded
            ? "Anyone opening SceneFlow — including on this machine — has to type it first. Change it by editing .sceneflow/access-code.txt, or clear the file to turn the code off."
            : "SceneFlow is only as private as whatever the operating system lets reach it. Started normally, that is this machine alone. Before opening it to the home network, set a code."}
        </p>
      </section>

      <p
        style={{
          margin: "18px 0 0",
          color: "#6e7681",
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        Photographs stay on this machine, under <code>.sceneflow/</code>. Nothing is
        uploaded anywhere. The part that actually loads a model and returns an image is
        not written yet — the console&apos;s SceneFlow page reports whether this machine
        could run one.
      </p>
    </main>
  );
}
