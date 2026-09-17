import { describeMode } from "@/lib/deployment.ts";

export const dynamic = "force-dynamic";

/**
 * The refusal page.
 *
 * Reached only when the app is deployed somewhere reachable by other people and
 * no identity provider is configured. It explains itself rather than showing a
 * generic error, because the person who sees it is the person who can fix it,
 * and the fix is two environment variables.
 */
export default function Unavailable() {
  return (
    <div style={{ maxWidth: 620, margin: "12vh auto" }}>
      <h1>This app is not serving</h1>
      <p className="muted">{describeMode("refuse")}</p>

      <div className="card">
        <h2>What is missing</h2>
        <p className="small">
          Two build variables, both browser-safe and neither of them a secret:
        </p>
        <ul className="small mono" style={{ paddingLeft: 18 }}>
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
        </ul>
        <p className="small muted">
          Set both, redeploy, and this page is replaced by a sign-in screen. The app
          deliberately will not start without them: serving a career database — a
          resume, employment history, and a record of every application and rejection —
          to anyone who finds the address is worse than not serving at all.
        </p>
      </div>
    </div>
  );
}
