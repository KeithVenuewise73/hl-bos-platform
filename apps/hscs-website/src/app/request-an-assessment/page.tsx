import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { WHAT_YOU_GET } from "@/lib/content";
import { intakeStatus } from "@/lib/intake";
import { AssessmentForm } from "./AssessmentForm";

export const metadata: Metadata = {
  title: "Request an Operations Assessment",
  description:
    "Request the HSCS Operations Assessment — an evidence-backed read of where your operation stands and what to fix first. A conversation, not a commitment.",
};

// This page is the site's single primary conversion (Page Specifications §4.9).
// It renders per request because whether the intake is reachable is a property
// of the deployment, not of the build.
export const dynamic = "force-dynamic";

/**
 * The honest fallback.
 *
 * If the intake is not configured on this deployment, this page shows NO form.
 * A form that cannot deliver is the "control that does not control anything"
 * the operating contract forbids — worse than absence, because it reads as a
 * working front door and quietly drops the one operator who asked for help.
 */
function IntakeNotConnected() {
  return (
    <div className="notice">
      <p className="notice__title">
        The request form isn&rsquo;t live on this deployment yet
      </p>
      <p className="notice__body">
        The assessment intake is built and tested, but it isn&rsquo;t connected here —
        so rather than show you a form that would quietly throw your request away,
        we&rsquo;re showing you nothing and saying why. What the assessment delivers is
        below, and it is accurate.
      </p>
    </div>
  );
}

export default function RequestAssessmentPage() {
  // A misconfigured deployment degrades to the same honest notice, and says so
  // in the server log rather than in a visitor's face.
  const connected = intakeStatus().connected;

  return (
    <>
      <section className="section" aria-labelledby="ra-h">
        <Container>
          <Eyebrow>Operations Assessment</Eyebrow>
          <h1 id="ra-h" className="h1">
            Request an Operations Assessment.
          </h1>
          <p className="body-l measure stack">
            The assessment is the front door to everything we do: an evidence-backed
            read of where your operation stands and what to fix first. Tell us who you
            are and what prompted this, and an operator will pick it up.
          </p>
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ra-get">
        <Container>
          <h2 id="ra-get" className="h2">
            What you get
          </h2>
          <ul className="whatyouget__list stack">
            {WHAT_YOU_GET.items.map((item) => (
              <li key={item} className="body">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section" aria-labelledby="ra-form">
        <Container>
          <h2 id="ra-form" className="h2">
            Your request
          </h2>
          <p className="body measure stack">
            Four things are required — your company, your name, your email, and the two
            confirmations at the end. Everything else is optional and helps us arrive
            prepared.
          </p>
          {connected ? <AssessmentForm /> : <IntakeNotConnected />}
        </Container>
      </section>

      <section className="section section--mist" aria-labelledby="ra-next">
        <Container>
          <h2 id="ra-next" className="h2">
            What happens next
          </h2>
          <ul className="whatyouget__list stack">
            <li className="body">
              Your request goes straight to the founder — it does not enter a
              call-centre queue and it is not passed to a salesperson.
            </li>
            <li className="body">
              You get a reference on screen as soon as it is stored, so you can quote it
              back to us.
            </li>
            <li className="body">
              The first conversation is a conversation. No deck, no pressure, and no
              obligation to buy anything.
            </li>
          </ul>
          <p className="body measure stack muted">
            We are not going to invent a response-time promise we have not committed to.
            When a service-level commitment is published, it will appear here and we
            will keep it.
          </p>
        </Container>
      </section>

      <section className="section" aria-labelledby="ra-trust">
        <Container>
          <h2 id="ra-trust" className="h2">
            How we handle what you tell us
          </h2>
          <p className="body measure stack">
            What you enter is stored so we can respond to this request, and for no other
            purpose. It is not sold, not shared, and not added to any list. Neither
            confirmation box is ticked for you.
          </p>
          <p className="body measure stack">
            If you would rather not send anything yet, read{" "}
            <Link href="/services/operations-assessment">
              what the assessment actually is
            </Link>{" "}
            first.
          </p>
        </Container>
      </section>
    </>
  );
}
