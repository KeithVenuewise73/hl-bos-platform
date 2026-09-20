import { SceneDirector } from "@/components/SceneDirector";

export const metadata = {
  title: "Direct a scene — SceneFlow",
};

export default function DirectPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Direct a scene</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          Choose the cast, the moment and how far it goes.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back
          </a>
        </p>
      </header>
      <SceneDirector />
    </main>
  );
}
