"use client";

import Link from "next/link";
import { APP_NAME, APP_VERSION, BUILD_NUMBER, SUPPORT_EMAIL } from "@/lib/config";

export default function SupportPage() {
  return (
    <main>
      <Link className="back" href="/account/">
        ‹ Back
      </Link>
      <h1>Support</h1>

      <h2>Contact</h2>
      {SUPPORT_EMAIL ? (
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Include the
          version below — it saves a round trip.
        </p>
      ) : (
        /* No address is shown rather than a placeholder one. A support page
           listing an address that bounces is worse than one that says it is
           not set yet -- and this build genuinely has not been given one. */
        <p className="muted">
          This build has no support address configured. One is required before the app
          is submitted to either store.
        </p>
      )}
      <div className="card">
        <div className="row">
          <div className="grow muted">Version</div>
          <strong className="tabular">
            {APP_VERSION} ({BUILD_NUMBER})
          </strong>
        </div>
      </div>

      <h2>Common questions</h2>

      <h3>My phone locked in the middle of a game. Did I lose time?</h3>
      <p>
        No. {APP_NAME} does not count time with a running timer — it records the instant
        of every tap and works out the durations when it needs them. Locking the phone,
        switching apps, or having the app closed by the system changes nothing about the
        totals.
      </p>

      <h3>There is no signal at the field. Will it still work?</h3>
      <p>
        Yes, completely. Every tap is saved on the device the moment you make it. If you
        have an account, changes upload on their own once you are back in coverage.
      </p>

      <h3>Why is an athlete&rsquo;s time lower than I expected?</h3>
      <p>
        Time only accrues while the clock is running. If the clock was paused, or the
        game was between periods, an athlete standing on the field is not accruing
        playing time — which is what makes the totals match the game rather than the
        wall clock.
      </p>

      <h3>Can I fix a substitution I recorded late?</h3>
      <p>
        Not in this version. The event log is append-only: it records exactly what you
        tapped and when. Editing history is on the list, and it will show corrections
        rather than hide them.
      </p>

      <h3>How do I delete everything?</h3>
      <p>
        <strong>Account → Delete my account permanently</strong> removes your account
        and every record it holds, from the server and from this device.
      </p>
    </main>
  );
}
