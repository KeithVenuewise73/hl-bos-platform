import { Card } from "@/components/ui.tsx";
import { modeDescription } from "@/lib/session.ts";
import { storageDescription } from "@/lib/store.ts";
import { visionProvider } from "@/lib/pipeline-runner.ts";

export const dynamic = "force-dynamic";

/**
 * What this installation actually has switched on.
 *
 * Every line here is read from the running process, not from a list of
 * intentions. If analysis is unavailable this page says so and says what would
 * fix it, rather than describing a capability the deployment does not have.
 */
export default async function Settings() {
  const provider = visionProvider();
  const availability = await provider.availability();
  const storage = await storageDescription();

  return (
    <>
      <h1>Settings</h1>

      <Card title="Video analysis">
        <p>
          <strong>{availability.available ? "Connected" : "Not connected"}</strong> ·{" "}
          <span className="mono">{provider.label}</span>
        </p>
        <p>{availability.detail}</p>
        {availability.remedy !== null && (
          <p className="footnote mono">{availability.remedy}</p>
        )}
      </Card>

      <Card title="Where your data is">
        <p>{storage}</p>
      </Card>

      <Card title="Sign-in">
        <p>{modeDescription()}</p>
      </Card>

      <Card title="What this app will not do">
        <ul className="notes">
          <li>
            It will not tell you a track is your player when it has only matched the
            jersey colour. Colour is shared with four team-mates on the ice, so colour
            alone can reach &ldquo;likely&rdquo; and never &ldquo;confirmed&rdquo;.
          </li>
          <li>
            It will not name a goal, a save or an assist. Nothing here can see a puck,
            so events are named for the motion they actually are.
          </li>
          <li>It will not put a clip in a reel that you have not approved.</li>
          <li>
            It will not report &ldquo;nothing found&rdquo; when it could not look. A
            missing analysis service is an error, not an empty result.
          </li>
        </ul>
      </Card>
    </>
  );
}
