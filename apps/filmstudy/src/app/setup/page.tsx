import { supabaseConfigured } from "@/lib/supabase";
import { Card, Notice } from "@/components/ui";

/**
 * What the app says when it is not connected to a project.
 *
 * It states plainly that there is no data rather than rendering a dashboard of
 * zeroes. Every number on a FilmStudy screen is supposed to come from confirmed
 * film; with no database there is no confirmed film, and the honest screen is
 * this one.
 */
export default function SetupPage() {
  const configured = supabaseConfigured();

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Football FilmStudy AI</h1>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        Upload the film. Understand the game. Coach the next rep.
      </p>

      {configured ? (
        <Notice tone="accent">
          <strong>This project is connected.</strong> Sign in to continue.
        </Notice>
      ) : (
        <Card title="Not connected yet" sub="There is no database behind this app.">
          <p className="dim">
            FilmStudy is running, but it has no Supabase project to read film from. It
            is showing you this instead of a dashboard, because a dashboard with no data
            behind it would be a screen full of zeroes that look like measurements.
          </p>
          <p className="dim">Nothing is broken. Two environment values are missing:</p>
          <ul className="dim small mono" style={{ paddingLeft: 18 }}>
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
          </ul>
          <Notice>
            Both are <strong>publishable</strong> values, safe in a browser bundle.
            FilmStudy never holds a service-role key: every read is filtered by
            row-level security as the signed-in user, and a service-role key would
            bypass all of it.
          </Notice>
        </Card>
      )}
    </>
  );
}
