"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Confirm } from "@/components/Confirm";
import { SyncStatus } from "@/components/SyncStatus";
import { ErrorNote, InfoNote, Loading, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  APP_VERSION,
  BUILD_NUMBER,
  LINKS,
  SUPPORT_EMAIL,
  accountsConfigured,
} from "@/lib/config";
import { useMounted, useStore } from "@/lib/hooks";
import { games, getCore, pendingCount, players, teams, wipeDevice } from "@/lib/store";

/**
 * Account and data.
 *
 * Says what this build actually is, including when it is a build with no
 * account service behind it. Account deletion lives here because both stores
 * require it to be reachable in-app, and because it should be.
 */
export default function AccountPage() {
  const mounted = useMounted();
  const router = useRouter();
  const { state, signOut, deleteAccount } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teamCount = useStore(() => teams().length);
  const gameCount = useStore(() => games().length);
  const playerCount = useStore(() => getCore().players.length);
  const pending = useStore(pendingCount);
  void players;

  if (!mounted) {
    return (
      <main>
        <TopBar back="/" />
        <Loading rows={2} />
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/" />
      <h1>Account</h1>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="card">
        {state.status === "signed-in" ? (
          <>
            <div className="muted">Signed in as</div>
            <strong>{state.email}</strong>
          </>
        ) : state.status === "unavailable" ? (
          <>
            <div className="muted">Accounts</div>
            <strong>Not available in this build</strong>
            <p className="muted" style={{ marginTop: 6 }}>
              No account service is configured, so nothing is uploaded anywhere.
              Everything you record lives on this device only. If you delete the app, it
              goes with it.
            </p>
          </>
        ) : (
          <>
            <div className="muted">Accounts</div>
            <strong>Not signed in</strong>
            <p className="muted" style={{ marginTop: 6 }}>
              Everything works without an account and is saved on this device. Sign in
              to back it up.
            </p>
            <Link className="btn btn-primary btn-block" href="/login/">
              Sign in
            </Link>
          </>
        )}
        <SyncStatus />
      </div>

      <h2>On this device</h2>
      <div className="card">
        <div className="row">
          <div className="grow">
            {teamCount} team{teamCount === 1 ? "" : "s"} · {playerCount} athlete
            {playerCount === 1 ? "" : "s"} · {gameCount} game
            {gameCount === 1 ? "" : "s"}
          </div>
        </div>
        {pending > 0 ? (
          <div className="muted" style={{ marginTop: 6 }}>
            {pending} change{pending === 1 ? "" : "s"} still waiting to upload.
          </div>
        ) : null}
      </div>

      <h2>Legal and support</h2>
      <div className="stack">
        <Link className="btn btn-block" href={LINKS.privacy}>
          Privacy Policy
        </Link>
        <Link className="btn btn-block" href={LINKS.terms}>
          Terms of Use
        </Link>
        <Link className="btn btn-block" href={LINKS.support}>
          Support
        </Link>
      </div>

      {state.status === "signed-in" ? (
        <>
          <h2>Sign out</h2>
          <p className="muted">Your games stay on this device. Nothing is deleted.</p>
          <button
            type="button"
            className="btn-block"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signOut().then(() => {
                setBusy(false);
                router.push("/");
              });
            }}
          >
            Sign out
          </button>
        </>
      ) : null}

      <h2>Delete data</h2>
      <div className="stack">
        <Confirm
          label="Erase everything on this device"
          question="Erase every team, athlete and game stored on this device?"
          confirmLabel="Erase this device"
          onConfirm={() => {
            wipeDevice();
            router.push("/");
          }}
        >
          {state.status === "signed-in"
            ? "Your account and anything already uploaded are not affected — signing in again will not restore what was only on this device."
            : "This cannot be undone. Nothing here has been backed up anywhere."}
        </Confirm>

        {state.status === "signed-in" ? (
          <Confirm
            label="Delete my account permanently"
            question="Permanently delete your account?"
            confirmLabel="Delete my account"
            onConfirm={() => {
              setBusy(true);
              void deleteAccount().then((message) => {
                setBusy(false);
                if (message) setError(message);
                else router.push("/");
              });
            }}
          >
            This deletes your account and every team, athlete, game and playing-time
            record it holds, on the server and on this device. It cannot be undone and
            there is no recovery.
          </Confirm>
        ) : null}
      </div>

      {!accountsConfigured() ? (
        <InfoNote>
          There is no account to delete in this build — &ldquo;Erase everything on this
          device&rdquo; above removes all of your data.
        </InfoNote>
      ) : null}

      <h2>About</h2>
      <div className="card">
        <div className="row">
          <div className="grow muted">Version</div>
          <strong className="tabular">
            {APP_VERSION} ({BUILD_NUMBER})
          </strong>
        </div>
        {SUPPORT_EMAIL ? (
          <div className="row" style={{ marginTop: 8 }}>
            <div className="grow muted">Support</div>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
        ) : null}
      </div>
    </main>
  );
}
