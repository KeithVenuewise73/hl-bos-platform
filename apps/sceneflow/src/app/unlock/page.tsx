import { Unlock } from "@/components/Unlock";
import { accessState } from "@/lib/gate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SceneFlow",
};

/**
 * What a visitor without the code sees, whatever they asked for.
 *
 * Reached by a rewrite from middleware, so the address bar still shows the
 * page they wanted and unlocking takes them straight there. Opened directly
 * once already unlocked, it says so rather than pretending to be a form that
 * does nothing.
 */
export default async function UnlockPage() {
  const access = await accessState();
  if (access.state !== "locked") {
    return (
      <main
        style={{
          maxWidth: 380,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>SceneFlow</h1>
        <p style={{ margin: "8px 0 24px", color: "#8b949e", fontSize: 13 }}>
          This device is already unlocked.
        </p>
        <a href="/" style={{ color: "#58a6ff", fontSize: 14 }}>
          Open SceneFlow
        </a>
      </main>
    );
  }
  return <Unlock reason={access.reason} />;
}
