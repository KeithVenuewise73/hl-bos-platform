import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: `Terms of Use — ${APP_NAME}` };

export default function TermsPage() {
  return (
    <main>
      <Link className="back" href="/account/">
        ‹ Back
      </Link>
      <h1>Terms of Use</h1>
      <p className="muted">Last updated 16 September 2026</p>

      <h2>What you are agreeing to</h2>
      <p>
        {APP_NAME} is a tool for tracking participation time in a game. You may use it for your own
        teams. You are responsible for what you enter into it.
      </p>

      <h2>This is not a compliance certification</h2>
      <p>
        The minimum participation target is <strong>yours</strong>. You set it, and the app measures
        against it. {APP_NAME} does not know your league&rsquo;s rules, does not interpret them, and
        makes no claim that a game satisfied any league, association or governing body requirement.
      </p>
      <p>
        A report from this app is a record of the substitutions you entered. It is evidence of what
        you tracked, not a ruling.
      </p>

      <h2>Accuracy</h2>
      <p>
        Timing is derived from the moment you tap. The app is accurate to the second about when you
        tapped; it cannot know about a substitution you did not record. If you tap late, the record
        is late.
      </p>

      <h2>Athlete information</h2>
      <p>
        You are responsible for having a legitimate reason to record the athlete information you
        enter, and for following whatever rules your organisation has about it. Enter the minimum
        you need — a jersey number is enough for the app to work.
      </p>

      <h2>Availability</h2>
      <p>
        The app works offline by design, and your games are stored on your device. We do not
        guarantee that the backup service is available at any particular moment, and we recommend
        keeping reports you care about.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can delete your account and all of its data at any time from the{" "}
        <strong>Account</strong> screen. No notice is required and nothing is retained afterwards.
      </p>

      <h2>Liability</h2>
      <p>
        {APP_NAME} is provided as-is. To the extent the law allows, we are not liable for decisions
        made on the basis of a report, for disputes with a league or an organisation, or for data
        lost from a device.
      </p>

      <h2>Contact</h2>
      <p>
        See the <Link href="/support/">Support</Link> page.
      </p>
    </main>
  );
}
