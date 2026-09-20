import { StoryBoard } from "@/components/StoryBoard";

export const metadata = {
  title: "Plan a story — SceneFlow",
};

export default function StoryPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Plan a story</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          One moment becomes three or six, each continuing from the last.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back
          </a>
        </p>
      </header>
      <StoryBoard />
    </main>
  );
}
