import { connectionStatus } from "@/lib/secrets";
import { Card, Dot } from "@hl-bos/ui";
import { ConnectForm } from "@/components/ConnectForm";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const status = await connectionStatus();

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/" style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none" }}>
        ← Back to the console
      </a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 22 }}>Connect your accounts</h1>
      <p
        style={{ margin: "0 0 22px", color: "#8b949e", fontSize: 13, lineHeight: 1.6 }}
      >
        This is the one thing only you can do — granting access is a decision about
        trust, not a technical task. It takes about two minutes and you never have to do
        it again.
      </p>

      <Card
        title="GitHub"
        sub="So the console can show your builds and merge your work."
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
        >
          <Dot health={status.github ? "green" : "yellow"} />
          <span style={{ fontSize: 13 }}>
            {status.github ? "Connected." : "Not connected yet."}
          </span>
        </div>
        <ol
          style={{
            margin: "0 0 14px",
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.9,
            color: "#c9d1d9",
          }}
        >
          <li>
            Open{" "}
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#58a6ff" }}
            >
              GitHub&rsquo;s token page
            </a>
          </li>
          <li>
            Repository access → <strong>Only select repositories</strong> →{" "}
            <strong>hl-bos-platform</strong>
          </li>
          <li>
            Permissions → Repository → set <strong>Contents: Read and write</strong>,{" "}
            <strong>Pull requests: Read and write</strong>,{" "}
            <strong>Checks: Read-only</strong>
          </li>
          <li>Generate it, copy it, paste it below</li>
        </ol>
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 12,
            color: "#8b949e",
            lineHeight: 1.6,
          }}
        >
          <strong>Why write access:</strong> read-only would let the console show you a
          green tick but not act on your approval — you would still have to finish the
          job on GitHub yourself. Write access is what lets <em>Approve merge</em>{" "}
          actually merge. The console never merges anything you have not clicked.
        </p>
      </Card>

      <Card
        title="Supabase"
        sub="So the console can show what is really in the database."
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
        >
          <Dot health={status.supabase ? "green" : "yellow"} />
          <span style={{ fontSize: 13 }}>
            {status.supabase
              ? `Connected${status.supabaseRef ? ` to ${status.supabaseRef}` : ""}.`
              : "Not connected yet."}
          </span>
        </div>
        <ol
          style={{
            margin: "0 0 14px",
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.9,
            color: "#c9d1d9",
          }}
        >
          <li>
            Open{" "}
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#58a6ff" }}
            >
              Supabase access tokens
            </a>
          </li>
          <li>Generate a new token, copy it, paste it below</li>
          <li>
            Paste the HL-BOS Core project reference too — it is the code in your
            project&rsquo;s web address
          </li>
        </ol>
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 12,
            color: "#8b949e",
            lineHeight: 1.6,
          }}
        >
          The console only <strong>reads</strong> from Supabase. It will never apply a
          database change as a side effect of showing you a page.
        </p>
      </Card>

      <Card
        title="Paste them here"
        sub="Stored on this machine only. Never committed, never sent anywhere else."
      >
        <ConnectForm
          hasGithub={status.github}
          hasSupabase={status.supabase}
          supabaseRef={status.supabaseRef}
        />
      </Card>
    </main>
  );
}
