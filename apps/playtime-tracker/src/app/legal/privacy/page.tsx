import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: `Privacy Policy — ${APP_NAME}` };

/**
 * The privacy policy.
 *
 * Written to describe what this app actually does, checked against the code
 * rather than adapted from a template. Every claim below is one the
 * implementation backs: the permissions it does not request, the analytics it
 * does not load, the schema in migration 0049 that isolates every user's rows.
 */
export default function PrivacyPage() {
  return (
    <main>
      <Link className="back" href="/account/">
        ‹ Back
      </Link>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated 16 September 2026</p>

      <h2>What this app is</h2>
      <p>
        {APP_NAME} records how long each athlete participates in a game. You create
        teams, add athletes, and tap them on and off the field. That is the whole
        product.
      </p>

      <h2>What we collect</h2>
      <p>
        Only what you type in and what you tap. Specifically: your email address if you
        create an account; the team names, athlete names, jersey numbers and positions
        you enter; the games you set up; and a timestamped record of every substitution
        you make.
      </p>
      <p>
        <strong>We do not collect anything else.</strong> There is no analytics package,
        no advertising identifier, no crash reporter, no third-party script, and no
        tracking of any kind in this app. It loads nothing it did not ship with.
      </p>

      <h2>Device permissions</h2>
      <p>
        {APP_NAME} requests no device permissions. It does not use the camera, the
        microphone, location, contacts, photos, the calendar, Bluetooth, or motion
        sensors, and it does not ask for notification permission.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Everything is stored on your device first, so the app works with no signal at
        all. If you create an account, a copy is also stored on our servers so you do
        not lose it when you change phones.
      </p>
      <p>
        Data in that copy is isolated per account at the database level: every row
        records which account owns it, and the database refuses to return a row to
        anyone else. There is no sharing between accounts and no feature that makes one
        coach&rsquo;s roster visible to another.
      </p>

      <h2>Children&rsquo;s information</h2>
      <p>
        This app is for coaches, parents and team managers — not for children — but the
        athlete names you enter will usually be children&rsquo;s. Enter only what you
        need. A jersey number alone is enough for the app to work, and it is the option
        we would choose.
      </p>
      <p>
        We do not use athlete information for anything except showing you your own
        reports. It is never sold, never shared, never used for advertising, and never
        used to build a profile of anyone.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Open <strong>Account</strong> and choose{" "}
        <strong>Delete my account permanently</strong>. That removes your account and
        every team, athlete, game and playing-time record attached to it, from our
        servers and from this device, in one step. There is no waiting period and no
        recovery afterwards.
      </p>
      <p>
        <strong>Erase everything on this device</strong> on the same screen clears the
        local copy without touching your account.
      </p>

      <h2>Sharing a report</h2>
      <p>
        When you share a playtime report, your device&rsquo;s own share sheet sends it
        wherever you choose. That transfer is between you and the app you pick; we are
        not involved in it and do not receive a copy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy go to the address on the{" "}
        <Link href="/support/">Support</Link> page.
      </p>
    </main>
  );
}
